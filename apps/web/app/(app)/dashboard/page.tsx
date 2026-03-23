import { SectionCard, StatTile, StatusPill } from "@agent-marketplace/ui";
import {
  approvals,
  auditEvents,
  draftPreview,
  getToolGrantsForAgent,
  integrations,
  overviewStats,
  publicationRecords,
} from "../../../lib/demo-data";

export default function DashboardPage() {
  return (
    <div className="stack">
      <div className="row-between">
        <div>
          <p className="eyebrow">Workspace dashboard</p>
          <h1>Agent Marketplace Control Room</h1>
        </div>
        <StatusPill>Dark-first monochrome</StatusPill>
      </div>

      <section className="stats-grid">
        {overviewStats.map((stat) => (
          <StatTile key={stat.label} label={stat.label} value={stat.value} hint={stat.hint} />
        ))}
      </section>

      <section className="two-up-grid">
        <SectionCard title="Active draft" eyebrow="Provisioning">
          <div className="stack">
            <strong>{draftPreview.title}</strong>
            <p className="muted-copy">{draftPreview.brief}</p>
            {draftPreview.generatedAgents.map((agent) => (
              <div key={agent.id} className="agent-list__item">
                <div className="agent-list__header">
                  <strong>{agent.roleName}</strong>
                  <StatusPill>{agent.approvalPolicy}</StatusPill>
                </div>
                <p className="agent-list__meta">{agent.allowedTools.join(", ")}</p>
              </div>
            ))}
            <p className="muted-copy">
              Slack is connected as{" "}
              {integrations.find((integration) => integration.providerKey === "slack")?.displayName ??
                "the workspace Slack install"}
              {" "}and granted to{" "}
              {getToolGrantsForAgent("agent_support").length ? "the Customer Support Agent" : "no agents yet"}.
            </p>
          </div>
        </SectionCard>
        <SectionCard title="Approval queue" eyebrow="Operators">
          <div className="approval-list">
            {approvals.map((approval) => (
              <div key={approval.id} className="approval-list__item">
                <div className="approval-list__header">
                  <strong>{approval.summary}</strong>
                  <StatusPill>{approval.status}</StatusPill>
                </div>
                <ul className="bullet-list">
                  {approval.requestedActions.map((action) => (
                    <li key={action}>{action}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </SectionCard>
      </section>

      <SectionCard title="Publishing ledger" eyebrow="Base and Arweave">
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
            {publicationRecords.map((publication) => (
              <tr key={publication.id}>
                <td>{publication.target}</td>
                <td>{publication.status}</td>
                <td>{publication.transactionId ?? "queued"}</td>
                <td>{publication.summary} · {publication.orchestration.workflowId ?? "no temporal id"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </SectionCard>

      <SectionCard title="Recent audit trail" eyebrow="Immutable">
        <div className="audit-list">
          {auditEvents.map((event) => (
            <div key={event.id} className="audit-list__item">
              <div className="row-between">
                <strong>{event.eventType}</strong>
                <span className="muted-copy">{new Date(event.createdAt).toLocaleString()}</span>
              </div>
              <p className="muted-copy">
                {event.entityType} · {event.entityId}
              </p>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
