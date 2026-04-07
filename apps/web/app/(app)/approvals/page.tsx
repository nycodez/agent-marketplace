"use client";

import { useEffect, useMemo, useState } from "react";
import type { AgentSpec, ApprovalRequest, Run } from "@agent-marketplace/contracts";
import { MonochromeButton, SectionCard, StatusPill } from "@agent-marketplace/ui";
import { apiFetch } from "../../../lib/api-client";

type RunListItem = Run & {
  agent: AgentSpec | null;
  approvalRequest: ApprovalRequest | null;
};

export default function ApprovalsPage() {
  const [runs, setRuns] = useState<RunListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyRunId, setBusyRunId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);

    try {
      const loadedRuns = await apiFetch<RunListItem[]>("/runs");
      setRuns(loadedRuns);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load approvals.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const pendingRuns = useMemo(
    () => runs.filter((run) => run.status === "awaiting_approval" && run.approvalRequest),
    [runs],
  );

  const handleApprove = async (runId: string) => {
    setBusyRunId(runId);
    setError(null);
    try {
      await apiFetch(`/runs/${runId}/approve`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      await load();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Unable to approve run.");
    } finally {
      setBusyRunId(null);
    }
  };

  const handleReject = async (runId: string) => {
    setBusyRunId(runId);
    setError(null);
    try {
      await apiFetch(`/runs/${runId}/cancel`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      await load();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Unable to reject run.");
    } finally {
      setBusyRunId(null);
    }
  };

  return (
    <div className="stack">
      <div>
        <p className="eyebrow">Human-in-the-loop</p>
        <h1>Approval queue</h1>
      </div>

      <SectionCard title="Pending requests" eyebrow="External writes">
        {loading ? (
          <p className="muted-copy">Loading approval requests...</p>
        ) : error ? (
          <p className="form-status">{error}</p>
        ) : !pendingRuns.length ? (
          <p className="muted-copy">No approval requests are waiting right now.</p>
        ) : (
          <div className="approval-list">
            {pendingRuns.map((run) => (
              <div key={run.id} className="approval-list__item">
                <div className="approval-list__header">
                  <strong>{run.approvalRequest?.summary ?? run.summary}</strong>
                  <StatusPill>{run.approvalRequest?.status ?? "pending"}</StatusPill>
                </div>
                <p className="muted-copy">
                  Agent: {run.agent?.displayName ?? run.agentId}
                </p>
                {run.approvalRequest?.tool ? (
                  <p className="muted-copy">
                    Tool: {run.approvalRequest.tool}
                    {run.approvalRequest.targetLabel ? ` · Target: ${run.approvalRequest.targetLabel}` : ""}
                  </p>
                ) : null}
                <ul className="bullet-list">
                  {(run.approvalRequest?.requestedActions ?? run.plannedActions).map((action) => (
                    <li key={action}>{action}</li>
                  ))}
                </ul>
                {run.approvalRequest?.payload &&
                Object.keys(run.approvalRequest.payload).length ? (
                  <pre className="integration-details__metadata">
                    {JSON.stringify(run.approvalRequest.payload, null, 2)}
                  </pre>
                ) : null}
                <div className="row-between">
                  <MonochromeButton
                    type="button"
                    disabled={busyRunId === run.id}
                    onClick={() => void handleApprove(run.id)}
                  >
                    {busyRunId === run.id ? "Working..." : "Approve"}
                  </MonochromeButton>
                  <MonochromeButton
                    type="button"
                    variant="secondary"
                    disabled={busyRunId === run.id}
                    onClick={() => void handleReject(run.id)}
                  >
                    Reject
                  </MonochromeButton>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
