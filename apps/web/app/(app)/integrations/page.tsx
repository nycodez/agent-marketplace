"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { AgentSpec, OrganizationIntegration, ToolGrant } from "@agent-marketplace/contracts";
import { SectionCard, StatusPill } from "@agent-marketplace/ui";
import { apiFetch } from "../../../lib/api-client";

type GrantWithIntegration = ToolGrant & {
  integration: OrganizationIntegration | null;
};

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<OrganizationIntegration[]>([]);
  const [agents, setAgents] = useState<AgentSpec[]>([]);
  const [grants, setGrants] = useState<GrantWithIntegration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const [loadedIntegrations, loadedAgents] = await Promise.all([
          apiFetch<OrganizationIntegration[]>("/organization-integrations"),
          apiFetch<AgentSpec[]>("/agents"),
        ]);

        const grantLists = await Promise.all(
          loadedAgents.map((agent) => apiFetch<GrantWithIntegration[]>(`/agents/${agent.id}/tool-grants`)),
        );

        if (cancelled) {
          return;
        }

        setIntegrations(loadedIntegrations);
        setAgents(loadedAgents);
        setGrants(grantLists.flat());
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load integrations.");
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

  const connectedIntegrations = useMemo(
    () => integrations.filter((integration) => integration.status === "connected"),
    [integrations],
  );

  return (
    <div className="stack">
      <div className="row-between">
        <div>
          <p className="eyebrow">Marketplace installs</p>
          <h1>Organization integrations</h1>
        </div>
        <Link href="/integrations/connect" className="mono-button">
          Connect integration
        </Link>
      </div>

      <SectionCard title="Connected systems" eyebrow="Per-organization installs">
        {loading ? (
          <p className="muted-copy">Loading organization integrations...</p>
        ) : error ? (
          <p className="form-status">{error}</p>
        ) : !connectedIntegrations.length ? (
          <p className="muted-copy">No integrations are connected for this organization yet.</p>
        ) : (
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
              {connectedIntegrations.map((integration) => {
                const integrationGrants = grants.filter(
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
                      {integrationGrants.length
                        ? integrationGrants
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
        )}
      </SectionCard>

      <section className="two-up-grid">
        <SectionCard title="OAuth installs" eyebrow="High-trust">
          <ul className="bullet-list">
            <li>Google Workspace for mail and calendar.</li>
            <li>Microsoft 365 for enterprise inboxes and scheduling.</li>
            <li>Slack for approvals, escalations, and delivery backchannels.</li>
            <li>OpenAI, Claude, or Grok as the planner behind draft generation and run coordination.</li>
            <li>Base and Arweave wallet installs for program publication.</li>
          </ul>
        </SectionCard>
        <SectionCard title="Planner model" eyebrow="Customer-provided keys">
          <ul className="bullet-list">
            <li>The workspace can connect its own OpenAI, Claude, or Grok API key without relying on a platform-owned model account.</li>
            <li>The planner uses the connected default model to generate typed team drafts and structured run plans.</li>
            <li>Operational tools still stay least-privilege and approval-gated even when the planner itself is LLM-first.</li>
          </ul>
        </SectionCard>
      </section>
    </div>
  );
}
