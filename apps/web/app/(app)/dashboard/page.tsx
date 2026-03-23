"use client";

import { useEffect, useMemo, useState } from "react";
import { SectionCard, StatTile, StatusPill } from "@agent-marketplace/ui";
import type {
  AgentSpec,
  AgentTeamDraft,
  ApprovalRequest,
  OrganizationIntegration,
  ProgramFile,
  PublicationRecord,
  Run,
} from "@agent-marketplace/contracts";
import { apiFetch } from "../../../lib/api-client";

type RunListItem = Run & {
  agent: AgentSpec | null;
  approvalRequest: ApprovalRequest | null;
};

const hasLiveConnection = (integration: OrganizationIntegration) =>
  integration.status === "connected" &&
  (integration.providerKey !== "microsoft-365" || typeof integration.metadata.refreshToken === "string");

export default function DashboardPage() {
  const [agents, setAgents] = useState<AgentSpec[]>([]);
  const [organizationIntegrations, setOrganizationIntegrations] = useState<OrganizationIntegration[]>([]);
  const [runs, setRuns] = useState<RunListItem[]>([]);
  const [drafts, setDrafts] = useState<AgentTeamDraft[]>([]);
  const [publications, setPublications] = useState<PublicationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const [
          loadedAgents,
          loadedIntegrations,
          loadedRuns,
          loadedDrafts,
          loadedProgramFiles,
        ] = await Promise.all([
          apiFetch<AgentSpec[]>("/agents"),
          apiFetch<OrganizationIntegration[]>("/organization-integrations"),
          apiFetch<RunListItem[]>("/runs"),
          apiFetch<AgentTeamDraft[]>("/agent-team-drafts"),
          apiFetch<ProgramFile[]>("/program-files"),
        ]);

        const publicationLists = await Promise.all(
          loadedProgramFiles.map((programFile) =>
            apiFetch<PublicationRecord[]>(`/program-files/${programFile.id}/publications`),
          ),
        );

        if (cancelled) {
          return;
        }

        setAgents(loadedAgents);
        setOrganizationIntegrations(loadedIntegrations);
        setRuns(loadedRuns);
        setDrafts(loadedDrafts);
        setPublications(publicationLists.flat());
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load dashboard.");
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

  const latestDraft = useMemo(
    () =>
      [...drafts]
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0] ?? null,
    [drafts],
  );

  const pendingApprovals = useMemo(
    () => runs.filter((run) => run.status === "awaiting_approval" && run.approvalRequest),
    [runs],
  );

  const recentPublications = useMemo(
    () => [...publications].sort((left, right) => right.createdAt.localeCompare(left.createdAt)).slice(0, 6),
    [publications],
  );

  const stats = useMemo(() => {
    const activeAgentCount = agents.filter((agent) => agent.status === "active").length;
    const connectedInstallCount = organizationIntegrations.filter(hasLiveConnection).length;
    const awaitingApprovalCount = pendingApprovals.length;
    const todayPrefix = new Date().toISOString().slice(0, 10);
    const runsToday = runs.filter((run) => run.createdAt.startsWith(todayPrefix));
    const completedRunsToday = runsToday.filter((run) => run.status === "completed").length;
    const pendingRunsToday = runsToday.filter((run) =>
      ["queued", "planning", "awaiting_approval", "running"].includes(run.status),
    ).length;

    return [
      {
        label: "Live agents",
        value: activeAgentCount,
        hint: activeAgentCount === 1 ? "1 active agent" : `${activeAgentCount} active agents`,
      },
      {
        label: "Pending approvals",
        value: awaitingApprovalCount,
        hint:
          awaitingApprovalCount === 1
            ? "1 run awaiting approval"
            : `${awaitingApprovalCount} runs awaiting approval`,
      },
      {
        label: "Integrations",
        value: connectedInstallCount,
        hint:
          connectedInstallCount === 1
            ? "1 connected install"
            : `${connectedInstallCount} connected installs`,
      },
      {
        label: "Runs today",
        value: runsToday.length,
        hint: `${completedRunsToday} completed, ${pendingRunsToday} pending`,
      },
    ];
  }, [agents, organizationIntegrations, pendingApprovals.length, runs]);

  return (
    <div className="stack">
      <div className="row-between">
        <div>
          <p className="eyebrow">Workspace dashboard</p>
          <h1>Team Command Center</h1>
        </div>
      </div>

      <section className="stats-grid">
        {stats.map((stat) => (
          <StatTile key={stat.label} label={stat.label} value={stat.value} hint={stat.hint} />
        ))}
      </section>

      {error ? <p className="form-status">{error}</p> : null}

      <section className="two-up-grid">
        <SectionCard title="Active draft" eyebrow="Provisioning">
          {loading ? (
            <p className="muted-copy">Loading drafts...</p>
          ) : latestDraft ? (
            <div className="stack">
              <strong>{latestDraft.title}</strong>
              <p className="muted-copy">{latestDraft.brief}</p>
              {latestDraft.generatedAgents.length ? (
                latestDraft.generatedAgents.map((agent) => (
                  <div key={agent.id} className="agent-list__item">
                    <div className="agent-list__header">
                      <strong>{agent.roleName}</strong>
                      <StatusPill>{agent.approvalPolicy}</StatusPill>
                    </div>
                    <p className="agent-list__meta">{agent.allowedTools.join(", ")}</p>
                  </div>
                ))
              ) : (
                <p className="muted-copy">This draft has no generated roles yet.</p>
              )}
            </div>
          ) : (
            <p className="muted-copy">No draft has been created for this workspace yet.</p>
          )}
        </SectionCard>

        <SectionCard title="Approval queue" eyebrow="Operators">
          {loading ? (
            <p className="muted-copy">Loading approvals...</p>
          ) : pendingApprovals.length ? (
            <div className="approval-list">
              {pendingApprovals.map((run) => (
                <div key={run.id} className="approval-list__item">
                  <div className="approval-list__header">
                    <strong>{run.approvalRequest?.summary ?? run.summary}</strong>
                    <StatusPill>{run.approvalRequest?.status ?? "pending"}</StatusPill>
                  </div>
                  <ul className="bullet-list">
                    {(run.approvalRequest?.requestedActions ?? run.plannedActions).map((action) => (
                      <li key={action}>{action}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted-copy">No approvals are waiting right now.</p>
          )}
        </SectionCard>
      </section>

      <SectionCard title="Durability ledger" eyebrow="Base and Arweave">
        {loading ? (
          <p className="muted-copy">Loading publication records...</p>
        ) : recentPublications.length ? (
          <table className="table-block">
            <thead>
              <tr>
                <th>Target</th>
                <th>Status</th>
                <th>Transaction</th>
                <th>Summary</th>
              </tr>
            </thead>
            <tbody>
              {recentPublications.map((publication) => (
                <tr key={publication.id}>
                  <td>{publication.target}</td>
                  <td>{publication.status}</td>
                  <td>{publication.transactionId ?? "queued"}</td>
                  <td>{publication.summary} · {publication.orchestration.workflowId ?? "no temporal id"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted-copy">No durability artifacts have been anchored yet.</p>
        )}
      </SectionCard>
    </div>
  );
}
