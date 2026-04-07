"use client";

import { useEffect, useMemo, useState } from "react";
import type { AgentSpec, ApprovalRequest, AuditEvent, Run, RunStep } from "@agent-marketplace/contracts";
import { SectionCard, StatusPill } from "@agent-marketplace/ui";
import { apiFetch } from "../../../lib/api-client";

type RunListItem = Run & {
  agent: AgentSpec | null;
  approvalRequest: ApprovalRequest | null;
};

type RunDetail = {
  run: Run;
  steps: RunStep[];
  approvalRequest: ApprovalRequest | null;
};

const formatTimestamp = (value: string) => value.replace("T", " ").replace(".000Z", " UTC");

export default function RunsPage() {
  const [runs, setRuns] = useState<RunListItem[]>([]);
  const [agents, setAgents] = useState<AgentSpec[]>([]);
  const [runDetails, setRunDetails] = useState<Record<string, RunDetail>>({});
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const [loadedRuns, loadedAuditEvents] = await Promise.all([
          apiFetch<RunListItem[]>("/runs"),
          apiFetch<AuditEvent[]>("/audit-events"),
        ]);
        const [loadedAgents, loadedDetails] = await Promise.all([
          apiFetch<AgentSpec[]>("/agents"),
          Promise.all(
            loadedRuns.map((run) => apiFetch<RunDetail>(`/runs/${run.id}`)),
          ),
        ]);
        if (!cancelled) {
          setRuns(loadedRuns);
          setAgents(loadedAgents);
          setRunDetails(
            Object.fromEntries(loadedDetails.map((detail) => [detail.run.id, detail])),
          );
          setAuditEvents(loadedAuditEvents);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load runs.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const recentAuditEvents = useMemo(
    () => [...auditEvents].sort((left, right) => right.createdAt.localeCompare(left.createdAt)).slice(0, 10),
    [auditEvents],
  );

  const agentNameById = useMemo(
    () => new Map(agents.map((agent) => [agent.id, agent.displayName])),
    [agents],
  );

  return (
    <div className="stack">
      <div>
        <p className="eyebrow">Execution ledger</p>
        <h1>Runs and step history</h1>
      </div>

      <SectionCard title="Recent runs" eyebrow="Durable state">
        {loading ? (
          <p className="muted-copy">Loading runs...</p>
        ) : error ? (
          <p className="form-status">{error}</p>
        ) : !runs.length ? (
          <p className="muted-copy">No runs have been created for this workspace yet.</p>
        ) : (
          <table className="table-block">
            <thead>
              <tr>
                <th>Agent</th>
                <th>Status</th>
                <th>Temporal</th>
                <th>Trigger</th>
                <th>Summary</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id}>
                  <td>{run.agent?.displayName ?? run.agentId}</td>
                  <td>
                    <StatusPill>{run.status}</StatusPill>
                  </td>
                  <td>{run.orchestration.workflowId ?? "not scheduled"}</td>
                  <td>{run.triggerType}</td>
                  <td>
                    <div className="stack">
                      <span>{run.summary}</span>
                      {(() => {
                        const detail = runDetails[run.id];
                        const currentStep =
                          detail?.steps.find((step) => step.status === "running") ??
                          detail?.steps.find((step) => step.status === "failed") ??
                          detail?.steps.find((step) => step.status === "queued") ??
                          null;

                        if (!currentStep) {
                          return <span className="muted-copy">No pending step.</span>;
                        }

                        return (
                          <>
                            <span className="muted-copy">
                              Step: {currentStep.title}
                              {currentStep.assignedAgentId
                                ? ` · ${agentNameById.get(currentStep.assignedAgentId) ?? currentStep.assignedAgentId}`
                                : ""}
                            </span>
                            {typeof currentStep.metadata.handoffSummary === "string" ? (
                              <span className="muted-copy">{currentStep.metadata.handoffSummary}</span>
                            ) : null}
                            {currentStep.receipt ? (
                              <span className="muted-copy">{currentStep.receipt.summary}</span>
                            ) : currentStep.output ? (
                              <span className="muted-copy">{currentStep.output}</span>
                            ) : null}
                          </>
                        );
                      })()}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>

      <SectionCard title="What a run stores" eyebrow="Audit completeness">
        <ul className="bullet-list">
          <li>Supervisor-owned run summary plus specialist-assigned steps.</li>
          <li>Per-step approval previews for external writes.</li>
          <li>Temporal workflow metadata, receipts, and failure details.</li>
        </ul>
      </SectionCard>

      <SectionCard title="Recent audit trail" eyebrow="Immutable">
        {loading ? (
          <p className="muted-copy">Loading audit events...</p>
        ) : error ? (
          <p className="form-status">{error}</p>
        ) : !recentAuditEvents.length ? (
          <p className="muted-copy">No audit events have been recorded yet.</p>
        ) : (
          <div className="audit-list">
            {recentAuditEvents.map((event) => (
              <div key={event.id} className="audit-list__item">
                <div className="row-between">
                  <strong>{event.eventType}</strong>
                  <span className="muted-copy">{formatTimestamp(event.createdAt)}</span>
                </div>
                <p className="muted-copy">
                  {event.entityType} · {event.entityId}
                </p>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
