import { MonochromeButton, SectionCard, StatusPill } from "@agent-marketplace/ui";
import { integrations } from "../../../lib/demo-data";

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
            </tr>
          </thead>
          <tbody>
            {integrations.map((integration) => (
              <tr key={integration.id}>
                <td>{integration.displayName}</td>
                <td>{integration.providerKey}</td>
                <td>
                  <StatusPill>{integration.status}</StatusPill>
                </td>
                <td>{integration.scopes.join(", ")}</td>
              </tr>
            ))}
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
        <SectionCard title="Custom installs" eyebrow="Flexible">
          <ul className="bullet-list">
            <li>Generic API connectors using API keys.</li>
            <li>Inbound webhooks for event-triggered runs.</li>
            <li>Future support for provider-specific grant templates.</li>
          </ul>
        </SectionCard>
      </section>
    </div>
  );
}
