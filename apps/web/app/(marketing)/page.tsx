import Link from "next/link";
import { MonochromeButton, SectionCard, StatTile, StatusPill } from "@agent-marketplace/ui";
import { draftPreview, integrations, overviewStats } from "../../lib/demo-data";

export default function MarketingPage() {
  return (
    <div className="page-frame stack">
      <section className="hero-grid">
        <div className="hero-panel stack">
          <p className="eyebrow">Standalone agent operating system</p>
          <h1 className="hero-title">Build agent teams outside the CRM frame.</h1>
          <p className="hero-copy">
            Agent Marketplace turns a business brief into a typed team draft, connects
            integrations with least-privilege grants, supports first-class publication to Base
            and Arweave, and keeps every external write behind an approval queue.
          </p>
          <div className="row-between">
            <Link href="/login">
              <MonochromeButton>Enter the product</MonochromeButton>
            </Link>
            <StatusPill>Black on white. White on black.</StatusPill>
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
        <SectionCard title="Why this repo exists" eyebrow="Product boundary">
          <ul className="bullet-list">
            <li>Separate auth, tenancy, and routing from the CRM.</li>
            <li>Provision agents from briefs, not rigid admin forms.</li>
            <li>Own integrations, grants, runs, approvals, and audit state in one system.</li>
            <li>Publish agent program files directly to Base and Arweave.</li>
          </ul>
        </SectionCard>
        <SectionCard title="First integrations" eyebrow="Marketplace installs">
          <div className="stack">
            {integrations.map((integration) => (
              <div key={integration.id} className="row-between">
                <div>
                  <strong>{integration.displayName}</strong>
                  <p className="muted-copy">{integration.providerKey}</p>
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
