import { MonochromeButton, SectionCard, StatusPill } from "@agent-marketplace/ui";
import { agents, integrations, toolGrants } from "../../../lib/demo-data";

export default function IntegrationsPage() {
  return (
    <div className="stack">
      <div className="row-between">
        <div>
          <p className="eyebrow">Marketplace installs</p>
          <h1>Organization integrations</h1>
        </div>
        <MonochromeButton>Install provider</MonochromeButton>
      </div>

      <SectionCard title="Connected systems" eyebrow="Per-organization installs">
        <table className="table-block">
          <thead>
            <tr>
              <th>Display name</th>
              <th>Provider</th>
              <th>Status</th>
              <th>Scopes</th>
              <th>Granted to agents</th>
            </tr>
          </thead>
          <tbody>
            {integrations.map((integration) => {
              const grants = toolGrants.filter(
                (grant) => grant.organizationIntegrationId === integration.id,
              );

              return (
                <tr key={integration.id}>
                  <td>{integration.displayName}</td>
                  <td>{integration.providerKey}</td>
                  <td>
                    <StatusPill>{integration.status}</StatusPill>
                  </td>
                  <td>{integration.scopes.join(", ")}</td>
                  <td>
                    {grants.length
                      ? grants
                          .map((grant) => {
                            const agent = agents.find((candidate) => candidate.id === grant.agentId);
                            return `${agent?.displayName ?? grant.agentId}: ${grant.tools.join(", ")}`;
                          })
                          .join(" · ")
                      : "No agent grants yet"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </SectionCard>

      <section className="two-up-grid">
        <SectionCard title="OAuth installs" eyebrow="High-trust">
          <ul className="bullet-list">
            <li>Google Workspace for mail and calendar.</li>
            <li>Microsoft 365 for enterprise inboxes and scheduling.</li>
            <li>Slack for approvals, escalations, and delivery backchannels.</li>
            <li>Base and Arweave wallet installs for program publication.</li>
          </ul>
        </SectionCard>
        <SectionCard title="Slack delivery model" eyebrow="Least privilege">
          <ul className="bullet-list">
            <li>Slack is connected at the organization level and granted to agents per workspace.</li>
            <li>The support agent can currently post to Slack after approval using the `slack.post` tool.</li>
            <li>Additional Slack tools such as `slack.read` and `slack.thread` stay available on the install but ungranted until assigned.</li>
          </ul>
        </SectionCard>
      </section>
    </div>
  );
}
