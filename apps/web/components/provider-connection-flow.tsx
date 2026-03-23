"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { IntegrationProvider, IntegrationToolDefinition } from "@agent-marketplace/integrations";
import type { OrganizationIntegration } from "@agent-marketplace/contracts";
import { MonochromeButton, SectionCard, StatusPill } from "@agent-marketplace/ui";
import { API_BASE_URL, apiFetch } from "../lib/api-client";

type ProviderConnectionFlowProps = {
  provider: IntegrationProvider;
  toolDefinitions: IntegrationToolDefinition[];
};

const modelProviderKeys = new Set(["openai", "anthropic", "grok", "gemini", "ollama"]);

const buildInitialSelectedTools = (provider: IntegrationProvider) =>
  Object.fromEntries(provider.tools.map((tool) => [tool, true])) as Record<string, boolean>;

export function ProviderConnectionFlow({
  provider,
  toolDefinitions,
}: ProviderConnectionFlowProps) {
  const [integrations, setIntegrations] = useState<OrganizationIntegration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState(provider.name);
  const [selectedTools, setSelectedTools] = useState<Record<string, boolean>>(
    buildInitialSelectedTools(provider),
  );
  const [apiKey, setApiKey] = useState("");
  const [defaultModel, setDefaultModel] = useState(provider.key === "ollama" ? "qwen2.5:0.5b" : "");
  const [defaultForPlanning, setDefaultForPlanning] = useState(modelProviderKeys.has(provider.key));
  const [baseUrl, setBaseUrl] = useState(provider.key === "ollama" ? "http://ollama:11434" : "");
  const [authHeader, setAuthHeader] = useState("Authorization");
  const [walletAddress, setWalletAddress] = useState("");
  const [network, setNetwork] = useState(provider.key === "base" ? "base-mainnet" : "arweave-mainnet");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const loadedIntegrations = await apiFetch<OrganizationIntegration[]>("/organization-integrations");
        if (!cancelled) {
          setIntegrations(loadedIntegrations);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load provider state.");
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

  const existingInstall = useMemo(
    () =>
      integrations.find(
        (integration) =>
          integration.providerKey === provider.key &&
          (integration.status === "connected" || integration.status === "pending"),
      ) ?? null,
    [integrations, provider.key],
  );
  const isConnected = existingInstall?.status === "connected";

  useEffect(() => {
    if (existingInstall?.displayName) {
      setDisplayName(existingInstall.displayName);
    }
  }, [existingInstall?.displayName]);

  const selectedScopes = useMemo(
    () => provider.tools.filter((tool) => selectedTools[tool]),
    [provider.tools, selectedTools],
  );

  const webhookUrl = `${API_BASE_URL}/events/webhooks/${provider.key}`;

  const refreshIntegrations = async () => {
    const loadedIntegrations = await apiFetch<OrganizationIntegration[]>("/organization-integrations");
    setIntegrations(loadedIntegrations);
    return loadedIntegrations;
  };

  const handleInstall = async () => {
    setSubmitting(true);
    setError(null);
    setStatusMessage(null);

    try {
      const metadata: Record<string, unknown> = {};

      if (provider.setupMode === "api_key") {
        if (provider.key !== "ollama" && apiKey.trim()) {
          metadata.apiKey = apiKey.trim();
        }
        if (defaultModel.trim()) {
          metadata.defaultModel = defaultModel.trim();
        }
        if (modelProviderKeys.has(provider.key)) {
          metadata.defaultForPlanning = defaultForPlanning;
        }
        if (provider.key === "generic-api" || provider.key === "ollama") {
          metadata.baseUrl = baseUrl.trim();
          if (provider.key === "generic-api") {
            metadata.authHeader = authHeader.trim() || "Authorization";
          }
        }
      }

      if (provider.setupMode === "wallet") {
        metadata.walletAddress = walletAddress.trim();
        metadata.network = network.trim();
        if (notes.trim()) {
          metadata.notes = notes.trim();
        }
      }

      if (provider.setupMode === "webhook" && notes.trim()) {
        metadata.notes = notes.trim();
      }

      const created = await apiFetch<OrganizationIntegration>(
        `/organization-integrations/${provider.key}/install`,
        {
          method: "POST",
          body: JSON.stringify({
            displayName: displayName.trim() || provider.name,
            scopes: selectedScopes.length ? selectedScopes : provider.tools,
            metadata,
          }),
        },
      );

      await refreshIntegrations();
      setStatusMessage(
        provider.setupMode === "oauth"
          ? "Install created. Complete the provider authorization step next."
          : provider.setupMode === "webhook"
            ? "Webhook install created. Use the endpoint shown below to send events."
            : "Install created. Validate it before granting tools to teams.",
      );

      if (provider.setupMode === "api_key" || provider.setupMode === "wallet") {
        setTesting(true);
        const tested = await apiFetch<{ integration: OrganizationIntegration; healthy: boolean }>(
          `/organization-integrations/${created.id}/test`,
          {
            method: "POST",
            body: JSON.stringify({}),
          },
        );
        await refreshIntegrations();
        setStatusMessage(
          tested.healthy ? "Connection validated successfully." : "Connection saved but validation failed.",
        );
      }
    } catch (installError) {
      setError(installError instanceof Error ? installError.message : "Unable to create install.");
    } finally {
      setSubmitting(false);
      setTesting(false);
    }
  };

  const handleOauthComplete = async () => {
    if (!existingInstall) {
      return;
    }

    setSubmitting(true);
    setError(null);
    setStatusMessage(null);

    try {
      await apiFetch<OrganizationIntegration>(`/organization-integrations/${existingInstall.id}/oauth/callback`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      await refreshIntegrations();
      setStatusMessage(`${provider.name} is now connected.`);
    } catch (callbackError) {
      setError(callbackError instanceof Error ? callbackError.message : "Unable to complete OAuth flow.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRetest = async () => {
    if (!existingInstall) {
      return;
    }

    setTesting(true);
    setError(null);
    setStatusMessage(null);

    try {
      const tested = await apiFetch<{ integration: OrganizationIntegration; healthy: boolean }>(
        `/organization-integrations/${existingInstall.id}/test`,
        {
          method: "POST",
          body: JSON.stringify({}),
        },
      );
      await refreshIntegrations();
      setStatusMessage(
        tested.healthy ? "Connection validated successfully." : "Validation failed for this install.",
      );
    } catch (testError) {
      setError(testError instanceof Error ? testError.message : "Unable to validate install.");
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="stack">
      <div className="row-between">
        <div>
          <p className="eyebrow">{provider.category}</p>
          <h1>{provider.name} connection flow</h1>
        </div>
        <Link href="/integrations/connect" className="mono-button mono-button--secondary">
          Back to catalog
        </Link>
      </div>

      <section className="provider-flow-grid">
        <SectionCard title="Setup" eyebrow="Provider-specific flow">
          <div className="stack">
            <p className="muted-copy">{provider.description}</p>

            <label className="provider-flow__field">
              <span>Display name</span>
              <input
                className="mono-input"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder={provider.name}
              />
            </label>

            <div className="stack">
              <strong>Tools to enable</strong>
              <div className="provider-flow__checkbox-grid">
                {toolDefinitions.map((tool) => (
                  <label key={tool.key} className="provider-flow__checkbox-card">
                    <input
                      type="checkbox"
                      checked={selectedTools[tool.key] ?? false}
                      onChange={(event) =>
                        setSelectedTools((current) => ({
                          ...current,
                          [tool.key]: event.target.checked,
                        }))
                      }
                    />
                    <div>
                      <strong>{tool.name}</strong>
                      <p className="muted-copy">{tool.description}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {provider.setupMode === "api_key" ? (
              <>
                {provider.key !== "ollama" ? (
                  <label className="provider-flow__field">
                    <span>API key</span>
                    <input
                      type="password"
                      className="mono-input"
                      value={apiKey}
                      onChange={(event) => setApiKey(event.target.value)}
                      placeholder="Paste provider key"
                    />
                  </label>
                ) : (
                  <div className="provider-flow__field">
                    <span>Local model access</span>
                    <p className="muted-copy">
                      Ollama can run free in Docker. This connection uses the local endpoint instead of a paid API key.
                    </p>
                  </div>
                )}

                {modelProviderKeys.has(provider.key) ? (
                  <>
                    <label className="provider-flow__field">
                      <span>Default model</span>
                      <input
                        className="mono-input"
                        value={defaultModel}
                        onChange={(event) => setDefaultModel(event.target.value)}
                        placeholder={
                          provider.key === "openai"
                            ? "gpt-5.4-mini"
                            : provider.key === "anthropic"
                              ? "claude-sonnet-4-5"
                              : provider.key === "grok"
                                ? "grok-3-mini"
                                : provider.key === "gemini"
                                  ? "gemini-2.5-flash-lite"
                                  : "qwen2.5:0.5b"
                        }
                      />
                    </label>
                    <label className="provider-flow__checkbox-card">
                      <input
                        type="checkbox"
                        checked={defaultForPlanning}
                        onChange={(event) => setDefaultForPlanning(event.target.checked)}
                      />
                      <div>
                        <strong>Use this model for planning by default</strong>
                        <p className="muted-copy">
                          Only one model provider is required. Set the primary planner here.
                        </p>
                      </div>
                    </label>
                  </>
                ) : null}

                {(provider.key === "generic-api" || provider.key === "ollama") ? (
                  <>
                    <label className="provider-flow__field">
                      <span>Base URL</span>
                      <input
                        className="mono-input"
                        value={baseUrl}
                        onChange={(event) => setBaseUrl(event.target.value)}
                        placeholder={provider.key === "ollama" ? "http://ollama:11434" : "https://api.example.com"}
                      />
                    </label>
                    {provider.key === "generic-api" ? (
                      <label className="provider-flow__field">
                        <span>Auth header</span>
                        <input
                          className="mono-input"
                          value={authHeader}
                          onChange={(event) => setAuthHeader(event.target.value)}
                          placeholder="Authorization"
                        />
                      </label>
                    ) : null}
                  </>
                ) : null}
              </>
            ) : null}

            {provider.setupMode === "wallet" ? (
              <>
                <label className="provider-flow__field">
                  <span>Wallet address</span>
                  <input
                    className="mono-input"
                    value={walletAddress}
                    onChange={(event) => setWalletAddress(event.target.value)}
                    placeholder="0x... or arweave wallet id"
                  />
                </label>
                <label className="provider-flow__field">
                  <span>Network</span>
                  <input
                    className="mono-input"
                    value={network}
                    onChange={(event) => setNetwork(event.target.value)}
                  />
                </label>
              </>
            ) : null}

            {provider.setupMode === "webhook" ? (
              <div className="stack">
                <strong>Inbound endpoint</strong>
                <pre className="integration-details__metadata">{webhookUrl}</pre>
              </div>
            ) : null}

            {provider.setupMode === "webhook" || provider.setupMode === "wallet" ? (
              <label className="provider-flow__field">
                <span>Operator notes</span>
                <textarea
                  className="mono-textarea provider-flow__notes"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Add any environment or handoff notes for this connection."
                />
              </label>
            ) : null}

            {error ? <p className="form-status">{error}</p> : null}
            {statusMessage ? <p className="form-status">{statusMessage}</p> : null}

            <div className="info-window__actions">
              {!existingInstall ? (
                <MonochromeButton type="button" disabled={submitting || testing} onClick={handleInstall}>
                  {submitting ? "Connecting..." : "Connect"}
                </MonochromeButton>
              ) : (
                <>
                  {isConnected ? (
                    <MonochromeButton type="button" className="mono-button--success" disabled>
                      Connected
                    </MonochromeButton>
                  ) : null}
                  {!isConnected ? (
                    <MonochromeButton type="button" variant="secondary" disabled>
                      Install created
                    </MonochromeButton>
                  ) : null}
                  {provider.setupMode === "oauth" && !isConnected ? (
                    <MonochromeButton type="button" disabled={submitting} onClick={handleOauthComplete}>
                      {submitting ? "Authorizing..." : `Complete ${provider.name} OAuth`}
                    </MonochromeButton>
                  ) : null}
                  {(provider.setupMode === "api_key" || provider.setupMode === "wallet") ? (
                    <MonochromeButton type="button" disabled={testing} onClick={handleRetest}>
                      {testing ? "Validating..." : "Validate connection"}
                    </MonochromeButton>
                  ) : null}
                </>
              )}
            </div>
          </div>
        </SectionCard>

        <div className="stack">
          <SectionCard title="Status" eyebrow="Current install">
            {loading ? (
              <p className="muted-copy">Loading provider state...</p>
            ) : existingInstall ? (
              <div className="stack">
                <div className="provider-flow__status-row">
                  <strong>{existingInstall.displayName}</strong>
                  <StatusPill>{existingInstall.status}</StatusPill>
                </div>
                <p className="muted-copy">Auth type: {existingInstall.authType}</p>
                <p className="muted-copy">
                  Last validated: {existingInstall.lastValidatedAt ?? "Not yet validated"}
                </p>
                <pre className="integration-details__metadata">
                  {JSON.stringify(existingInstall.metadata, null, 2)}
                </pre>
              </div>
            ) : (
              <p className="muted-copy">No install exists for this provider yet.</p>
            )}
          </SectionCard>

          <SectionCard title="Flow notes" eyebrow="What this provider needs">
            <ul className="bullet-list">
              {provider.setupMode === "oauth" ? (
                <>
                  <li>Create the install record with the scopes you want exposed to teams.</li>
                  <li>Complete the OAuth callback step to mark the provider connected.</li>
                  <li>Grant only the connected tools individual teams actually need.</li>
                </>
              ) : null}

              {provider.setupMode === "api_key" ? (
                <>
                  <li>
                    {provider.key === "ollama"
                      ? "Point this install at the local Ollama endpoint and choose a default model."
                      : "Store the customer-owned API key in the install metadata."}
                  </li>
                  <li>
                    {provider.key === "ollama"
                      ? "Validate the local model endpoint before using it in planning or drafting."
                      : "Validate the key before using the provider in planning or execution."}
                  </li>
                  <li>Model providers should usually have only one default planner at a time.</li>
                </>
              ) : null}

              {provider.setupMode === "webhook" ? (
                <>
                  <li>Create the install so the organization owns the inbound event endpoint.</li>
                  <li>Send events to the webhook URL shown on this page.</li>
                  <li>Use webhook-driven teams for ingestion, triage, and event-triggered work.</li>
                </>
              ) : null}

              {provider.setupMode === "wallet" ? (
                <>
                  <li>Capture the wallet or signer identity the organization wants to use.</li>
                  <li>Validate the publishing target before assigning it to program files.</li>
                  <li>Use these installs for survivability and registry publishing, not day-to-day ops.</li>
                </>
              ) : null}
            </ul>
          </SectionCard>

          <SectionCard title="Tool examples" eyebrow="What teams can do">
            <ul className="bullet-list">
              {toolDefinitions.map((tool) => (
                <li key={tool.key}>
                  <strong>{tool.name}:</strong> {tool.examples?.join(", ") ?? tool.description}
                </li>
              ))}
            </ul>
          </SectionCard>
        </div>
      </section>
    </div>
  );
}
