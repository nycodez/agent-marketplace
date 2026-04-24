"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AgentSpec, OrganizationIntegration, ToolGrant } from "@agent-marketplace/contracts";
import { MonochromeButton, SectionCard, StatusPill } from "@agent-marketplace/ui";
import { apiFetch } from "../../../lib/api-client";

type GrantWithIntegration = ToolGrant & {
  integration: OrganizationIntegration | null;
};

const triggerOptions: AgentSpec["triggerModes"] = ["manual", "scheduled", "webhook", "integration_event"];

const toList = (value: string) =>
  value
    .split("\n")
    .map((entry) => entry.trim())
    .filter(Boolean);

export default function AgentsPage() {
  const [agents, setAgents] = useState<AgentSpec[]>([]);
  const [grants, setGrants] = useState<GrantWithIntegration[]>([]);
  const [integrations, setIntegrations] = useState<OrganizationIntegration[]>([]);
  const [displayName, setDisplayName] = useState("");
  const [mission, setMission] = useState("");
  const [responsibilities, setResponsibilities] = useState("");
  const [successMetrics, setSuccessMetrics] = useState("");
  const [constraints, setConstraints] = useState("");
  const [approvalPolicy, setApprovalPolicy] = useState<AgentSpec["approvalPolicy"]>("required");
  const [triggerModes, setTriggerModes] = useState<AgentSpec["triggerModes"]>(["manual"]);
  const [selectedToolsByIntegration, setSelectedToolsByIntegration] = useState<Record<string, string[]>>({});
  const [customAllowedTools, setCustomAllowedTools] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
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

      setAgents(loadedAgents);
      setIntegrations(loadedIntegrations);
      setGrants(grantLists.flat());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load agents.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const activeAgents = useMemo(
    () => agents.filter((agent) => agent.status !== "archived"),
    [agents],
  );
  const connectedIntegrations = useMemo(
    () => integrations.filter((integration) => integration.status === "connected"),
    [integrations],
  );
  const selectedGrantedTools = useMemo(
    () => Object.values(selectedToolsByIntegration).flat(),
    [selectedToolsByIntegration],
  );
  const selectedAllowedTools = useMemo(
    () =>
      Array.from(
        new Set([
          ...selectedGrantedTools,
          ...customAllowedTools
            .split(",")
            .map((tool) => tool.trim())
            .filter(Boolean),
        ]),
      ).sort(),
    [customAllowedTools, selectedGrantedTools],
  );

  const toggleTrigger = (triggerMode: AgentSpec["triggerModes"][number]) => {
    setTriggerModes((current) => {
      if (current.includes(triggerMode)) {
        const next = current.filter((entry) => entry !== triggerMode);
        return next.length ? next : ["manual"];
      }

      return [...current, triggerMode];
    });
  };

  const toggleIntegrationTool = (integrationId: string, tool: string) => {
    setSelectedToolsByIntegration((current) => {
      const existing = current[integrationId] ?? [];
      const nextTools = existing.includes(tool)
        ? existing.filter((entry) => entry !== tool)
        : [...existing, tool].sort();
      const next = { ...current };
      if (nextTools.length) {
        next[integrationId] = nextTools;
      } else {
        delete next[integrationId];
      }

      return next;
    });
  };

  const handleCreateAgent = async () => {
    setCreating(true);
    setError(null);
    setStatusMessage(null);

    try {
      const agent = await apiFetch<AgentSpec>("/agents", {
        method: "POST",
        body: JSON.stringify({
          displayName,
          mission,
          responsibilities: toList(responsibilities),
          allowedTools: selectedAllowedTools,
          knowledgeSources: ["learning library", "workspace artifacts", "approved run history"],
          triggerModes,
          approvalPolicy,
          successMetrics: toList(successMetrics),
          constraints: toList(constraints),
        }),
      });

      const grantRequests = Object.entries(selectedToolsByIntegration).filter(([, tools]) => tools.length);
      await Promise.all(
        grantRequests.map(([organizationIntegrationId, tools]) =>
          apiFetch<GrantWithIntegration>(`/agents/${agent.id}/tool-grants`, {
            method: "POST",
            body: JSON.stringify({
              organizationIntegrationId,
              tools,
            }),
          }),
        ),
      );

      setDisplayName("");
      setMission("");
      setResponsibilities("");
      setSuccessMetrics("");
      setConstraints("");
      setApprovalPolicy("required");
      setTriggerModes(["manual"]);
      setSelectedToolsByIntegration({});
      setCustomAllowedTools("");
      setStatusMessage(`Created ${agent.displayName} with ${selectedAllowedTools.length} allowed tool${selectedAllowedTools.length === 1 ? "" : "s"}.`);
      await load();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Unable to create agent.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="stack">
      <div className="row-between">
        <div>
          <p className="eyebrow">Provisioning</p>
          <h1>Agents</h1>
          <p className="muted-copy">Create governed agents, assign capabilities, and grant connected integration tools.</p>
        </div>
        <MonochromeButton type="button" variant="secondary" disabled={loading} onClick={() => void load()}>
          {loading ? "Refreshing..." : "Refresh"}
        </MonochromeButton>
      </div>

      {error ? <p className="form-status">{error}</p> : null}
      {statusMessage ? <p className="form-status">{statusMessage}</p> : null}

      <SectionCard title="Create agent" eyebrow="Capabilities and grants">
        <div className="two-up-grid">
          <div className="stack">
            <input
              className="mono-input"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              aria-label="Agent name"
              placeholder="Agent name"
            />
            <textarea
              className="mono-textarea"
              value={mission}
              onChange={(event) => setMission(event.target.value)}
              aria-label="Agent mission"
              placeholder="Mission this agent should own"
            />
            <textarea
              className="mono-textarea"
              value={responsibilities}
              onChange={(event) => setResponsibilities(event.target.value)}
              aria-label="Responsibilities"
              placeholder="Responsibilities, one per line"
            />
            <textarea
              className="mono-textarea"
              value={successMetrics}
              onChange={(event) => setSuccessMetrics(event.target.value)}
              aria-label="Success metrics"
              placeholder="Success metrics, one per line"
            />
            <textarea
              className="mono-textarea"
              value={constraints}
              onChange={(event) => setConstraints(event.target.value)}
              aria-label="Constraints"
              placeholder="Constraints, one per line"
            />
          </div>

          <div className="stack">
            <label className="provider-flow__field">
              <span>Approval policy</span>
              <select
                className="mono-input"
                value={approvalPolicy}
                onChange={(event) => setApprovalPolicy(event.target.value as AgentSpec["approvalPolicy"])}
              >
                <option value="required">Require approval for writes</option>
                <option value="not_required">No approval required</option>
              </select>
            </label>

            <div className="provider-flow__field">
              <span>Trigger modes</span>
              <div className="stack">
                {triggerOptions.map((triggerMode) => (
                  <label key={triggerMode}>
                    <input
                      type="checkbox"
                      checked={triggerModes.includes(triggerMode)}
                      onChange={() => toggleTrigger(triggerMode)}
                    />{" "}
                    {triggerMode}
                  </label>
                ))}
              </div>
            </div>

            <label className="provider-flow__field">
              <span>Additional allowed tools</span>
              <input
                className="mono-input"
                value={customAllowedTools}
                onChange={(event) => setCustomAllowedTools(event.target.value)}
                aria-label="Additional allowed tools"
                placeholder="Optional comma-separated tool keys"
              />
            </label>

            <div className="provider-flow__field">
              <span>Grant connected tools</span>
              {connectedIntegrations.length ? (
                <div className="stack">
                  {connectedIntegrations.map((integration) => (
                    <div key={integration.id} className="audit-list__item">
                      <div className="row-between">
                        <strong>{integration.displayName}</strong>
                        <StatusPill>{integration.providerKey}</StatusPill>
                      </div>
                      <div className="stack">
                        {integration.scopes.length ? (
                          integration.scopes.map((tool) => (
                            <label key={`${integration.id}:${tool}`}>
                              <input
                                type="checkbox"
                                checked={(selectedToolsByIntegration[integration.id] ?? []).includes(tool)}
                                onChange={() => toggleIntegrationTool(integration.id, tool)}
                              />{" "}
                              {tool}
                            </label>
                          ))
                        ) : (
                          <span className="muted-copy">No grantable tools selected on this integration.</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted-copy">Connect integrations before granting live capabilities.</p>
              )}
            </div>

            <div className="stack">
              <span className="muted-copy">
                Allowed tools: {selectedAllowedTools.join(", ") || "none selected"}
              </span>
              <MonochromeButton
                type="button"
                disabled={creating || !displayName.trim() || !mission.trim()}
                onClick={() => void handleCreateAgent()}
              >
                {creating ? "Creating..." : "Create agent"}
              </MonochromeButton>
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Created agents" eyebrow="Organization-owned specs">
        {loading ? (
          <p className="muted-copy">Loading created agents...</p>
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
