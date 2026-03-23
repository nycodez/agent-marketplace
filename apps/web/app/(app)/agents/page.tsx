import { MonochromeButton, SectionCard, StatusPill } from "@agent-marketplace/ui";
import {
  agents,
  draftPreview,
  getGrantedToolsForAgent,
  getMissingToolsForAgent,
  getToolGrantsForAgent,
  integrations,
} from "../../../lib/demo-data";

export default function AgentsPage() {
  return (
    <div className="stack">
      <div className="row-between">
        <div>
          <p className="eyebrow">Provisioning</p>
          <h1>Agent team builder</h1>
        </div>
        <MonochromeButton>Create draft</MonochromeButton>
      </div>

      <section className="two-up-grid">
        <SectionCard title="Business brief" eyebrow="Prompt into spec">
          <div className="stack">
            <input className="mono-input" defaultValue={draftPreview.title} />
            <textarea className="mono-textarea" defaultValue={draftPreview.brief} />
            <div className="row-between">
              <MonochromeButton>Generate team</MonochromeButton>
              <MonochromeButton variant="secondary">Publish selected agents</MonochromeButton>
            </div>
          </div>
        </SectionCard>
        <SectionCard title="Generated roles" eyebrow="Typed output">
          <div className="agent-list">
            {draftPreview.generatedAgents.map((agent) => (
              <div key={agent.id} className="agent-list__item">
                <div className="agent-list__header">
                  <strong>{agent.roleName}</strong>
                  <StatusPill>{agent.approvalPolicy}</StatusPill>
                </div>
                <p className="muted-copy">{agent.mission}</p>
                <p className="agent-list__meta">{agent.allowedTools.join(", ")}</p>
              </div>
            ))}
          </div>
        </SectionCard>
      </section>

      <SectionCard title="Published agents" eyebrow="Versioned specs">
        <table className="table-block">
          <thead>
            <tr>
              <th>Agent</th>
              <th>Status</th>
              <th>Triggers</th>
              <th>Granted tools</th>
              <th>Integration grants</th>
            </tr>
          </thead>
          <tbody>
            {agents.map((agent) => {
              const grants = getToolGrantsForAgent(agent.id);
              const grantedTools = getGrantedToolsForAgent(agent);
              const missingTools = getMissingToolsForAgent(agent);

              return (
                <tr key={agent.id}>
                  <td>
                    <div className="stack">
                      <strong>{agent.displayName}</strong>
                      <span className="muted-copy">{agent.mission}</span>
                    </div>
                  </td>
                  <td>{agent.status}</td>
                  <td>{agent.triggerModes.join(", ")}</td>
                  <td>
                    <div className="stack">
                      <span>{grantedTools.join(", ") || "No granted tools yet"}</span>
                      <span className="muted-copy">
                        {missingTools.length
                          ? `Missing grants: ${missingTools.join(", ")}`
                          : "All allowed tools are granted"}
                      </span>
                    </div>
                  </td>
                  <td>
                    <div className="stack">
                      {grants.map((grant) => {
                        const integration = integrations.find(
                          (candidate) => candidate.id === grant.organizationIntegrationId,
                        );
                        return (
                          <span key={grant.id}>
                            {(integration?.displayName ?? grant.providerKey) + ": "}
                            {grant.tools.join(", ")}
                          </span>
                        );
                      })}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </SectionCard>
    </div>
  );
}
