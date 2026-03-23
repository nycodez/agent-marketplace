import Link from "next/link";
import { MonochromeButton, SectionCard, StatTile, StatusPill } from "@agent-marketplace/ui";
import { draftPreview, overviewStats } from "../../lib/demo-data";
import { ThemeToggle } from "../../components/theme-toggle";
import { TypedTeamDraftExplainer } from "../../components/typed-team-draft-explainer";

const highlightedIntegrations = [
  {
    id: "marketing_google",
    displayName: "Google Workspace",
    providerKey: "google-workspace",
    status: "connected" as const,
  },
  {
    id: "marketing_microsoft",
    displayName: "Microsoft 365",
    providerKey: "microsoft-365",
    status: "connected" as const,
  },
  {
    id: "marketing_slack",
    displayName: "Slack",
    providerKey: "slack",
    status: "connected" as const,
  },
  {
    id: "marketing_hubspot",
    displayName: "HubSpot",
    providerKey: "hubspot",
    status: "connected" as const,
  },
  {
    id: "marketing_salesforce",
    displayName: "Salesforce",
    providerKey: "salesforce",
    status: "connected" as const,
  },
];

export default function MarketingPage() {
  return (
    <div className="page-frame stack">
      <section className="hero-grid">
        <div className="hero-panel stack">
          <p className="eyebrow">Standalone agent operating system</p>
          <h1 className="hero-title">Build agent teams outside the CRM frame.</h1>
          <TypedTeamDraftExplainer />
          <div className="row-between">
            <Link href="/login">
              <MonochromeButton>Build agents now</MonochromeButton>
            </Link>
            <ThemeToggle />
          </div>
        </div>
        <div className="mono-panel stack">
          <p className="eyebrow">Generated brief preview</p>
          <h2>{draftPreview.title}</h2>
          <p className="muted-copy">{draftPreview.brief}</p>
          <div className="stack">
            {draftPreview.generatedAgents.map((agent) => (
              <div key={agent.id} className="agent-list__item">
                <div className="agent-list__header">
                  <strong>{agent.roleName}</strong>
                  <StatusPill>{agent.approvalPolicy}</StatusPill>
                </div>
                <p className="agent-list__meta">{agent.mission}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="stats-grid">
        {overviewStats.map((stat) => (
          <StatTile key={stat.label} label={stat.label} value={stat.value} hint={stat.hint} />
        ))}
      </section>

      <section className="two-up-grid">
        <SectionCard title="Why we exist" eyebrow="Product boundary">
          <ul className="bullet-list">
            <li>Separate auth, tenancy, and routing from the CRM.</li>
            <li>Provision agents from briefs, not rigid admin forms.</li>
            <li>Own integrations, grants, runs, approvals, and audit state in one system.</li>
            <li>Publish agent settings to the blockchain for long term survivability.</li>
          </ul>
        </SectionCard>
        <SectionCard title="" eyebrow="Marketplace installs">
          <div className="stack">
            {highlightedIntegrations.map((integration) => (
              <div key={integration.id} className="row-between">
                <div>
                  <strong>{integration.displayName}</strong>
                </div>
                <StatusPill>{integration.status}</StatusPill>
              </div>
            ))}
          </div>
        </SectionCard>
      </section>
    </div>
  );
}
