"use client";

import { useEffect, useMemo, useState } from "react";
import type { AgentSpec, OrganizationIntegration, ToolGrant } from "@agent-marketplace/contracts";
import { SectionCard, StatusPill } from "@agent-marketplace/ui";
import { apiFetch } from "../../../lib/api-client";

type GrantWithIntegration = ToolGrant & {
  integration: OrganizationIntegration | null;
};

export default function AgentsPage() {
  const [agents, setAgents] = useState<AgentSpec[]>([]);
  const [grants, setGrants] = useState<GrantWithIntegration[]>([]);
  const [integrations, setIntegrations] = useState<OrganizationIntegration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const [loadedAgents, loadedIntegrations] = await Promise.all([
          apiFetch<AgentSpec[]>("/agents"),
          apiFetch<OrganizationIntegration[]>("/organization-integrations"),
        ]);

        const grantLists = await Promise.all(
          loadedAgents.map((agent) => apiFetch<GrantWithIntegration[]>(`/agents/${agent.id}/tool-grants`)),
        );

        if (cancelled) {
          return;
        }

        setAgents(loadedAgents);
        setIntegrations(loadedIntegrations);
        setGrants(grantLists.flat());
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load agents.");
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

  const activeAgents = useMemo(
    () => agents.filter((agent) => agent.status !== "archived"),
    [agents],
  );

  return (
    <div className="stack">
      <div>
        <p className="eyebrow">Provisioning</p>
        <h1>Agents</h1>
      </div>

      <SectionCard title="Created agents" eyebrow="Organization-owned specs">
        {loading ? (
          <p className="muted-copy">Loading created agents...</p>
        ) : error ? (
          <p className="form-status">{error}</p>
        ) : !activeAgents.length ? (
          <p className="muted-copy">No agents have been created for this organization yet.</p>
        ) : (
          <table className="table-block">
            <thead>
              <tr>
                <th>Agent</th>
                <th>Status</th>
                <th>Triggers</th>
                <th>Allowed tools</th>
                <th>Integration grants</th>
              </tr>
            </thead>
            <tbody>
              {activeAgents.map((agent) => {
                const agentGrants = grants.filter((grant) => grant.agentId === agent.id);
                const grantedTools = Array.from(new Set(agentGrants.flatMap((grant) => grant.tools)));
                const missingTools = agent.allowedTools.filter((tool) => !grantedTools.includes(tool));

                return (
                  <tr key={agent.id}>
                    <td>
                      <div className="stack">
                        <strong>{agent.displayName}</strong>
                        <span className="muted-copy">{agent.mission}</span>
                      </div>
                    </td>
                    <td>
                      <StatusPill>{agent.status}</StatusPill>
                    </td>
                    <td>{agent.triggerModes.join(", ")}</td>
                    <td>
                      <div className="stack">
                        <span>{agent.allowedTools.join(", ") || "No allowed tools configured"}</span>
                        <span className="muted-copy">
                          {missingTools.length
                            ? `Missing grants: ${missingTools.join(", ")}`
                            : "All allowed tools are granted"}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="stack">
                        {agentGrants.length ? (
                          agentGrants.map((grant) => {
                            const integration =
                              integrations.find(
                                (candidate) => candidate.id === grant.organizationIntegrationId,
                              ) ?? grant.integration;
                            return (
                              <span key={grant.id}>
                                {(integration?.displayName ?? grant.providerKey) + ": "}
                                {grant.tools.join(", ")}
                              </span>
                            );
                          })
                        ) : (
                          <span className="muted-copy">No integration grants yet</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </SectionCard>
    </div>
  );
}
