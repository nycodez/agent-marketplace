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

type IntegrationTestResult = {
  integration: OrganizationIntegration;
  healthy: boolean;
  planner?: {
    providerKey: string | null;
    modelName: string | null;
    error: string | null;
  };
};

type OauthStartResult = {
  integration: OrganizationIntegration;
  authorizationUrl: string;
};

const modelProviderKeys = new Set(["openai", "anthropic", "grok", "gemini", "ollama"]);
const hasLiveConnection = (integration: OrganizationIntegration) =>
  integration.status === "connected" &&
  (integration.providerKey !== "microsoft-365" || typeof integration.metadata.refreshToken === "string");

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
  const [baseUrl, setBaseUrl] = useState(provider.key === "ollama" ? "http://ollama:11434/v1" : "");
  const [authHeader, setAuthHeader] = useState("Authorization");
  const [accessToken, setAccessToken] = useState("");
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [businessAccountId, setBusinessAccountId] = useState("");
  const [appId, setAppId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [verifyToken, setVerifyToken] = useState("");
  const [graphApiVersion, setGraphApiVersion] = useState("v23.0");
  const [walletAddress, setWalletAddress] = useState("");
  const [network, setNetwork] = useState(provider.key === "base" ? "base-mainnet" : "arweave-mainnet");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

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
      [...integrations]
        .filter(
          (integration) =>
            integration.providerKey === provider.key && integration.status !== "revoked",
        )
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null,
    [integrations, provider.key],
  );
  const isConnected = existingInstall ? hasLiveConnection(existingInstall) : false;

  useEffect(() => {
    if (existingInstall?.displayName) {
      setDisplayName(existingInstall.displayName);
    }
  }, [existingInstall?.displayName]);

  useEffect(() => {
    if (!existingInstall) {
      return;
    }

    if (typeof existingInstall.metadata.defaultModel === "string") {
      setDefaultModel(existingInstall.metadata.defaultModel);
    }
    if (typeof existingInstall.metadata.defaultForPlanning === "boolean") {
      setDefaultForPlanning(existingInstall.metadata.defaultForPlanning);
    }
    if (typeof existingInstall.metadata.baseUrl === "string") {
      setBaseUrl(existingInstall.metadata.baseUrl);
    }
    if (typeof existingInstall.metadata.authHeader === "string") {
      setAuthHeader(existingInstall.metadata.authHeader);
    }
    if (typeof existingInstall.metadata.walletAddress === "string") {
      setWalletAddress(existingInstall.metadata.walletAddress);
    }
    if (typeof existingInstall.metadata.network === "string") {
      setNetwork(existingInstall.metadata.network);
    }
    if (typeof existingInstall.metadata.notes === "string") {
      setNotes(existingInstall.metadata.notes);
    }
    if (provider.key === "whatsapp") {
      if (typeof existingInstall.metadata.phoneNumberId === "string") {
        setPhoneNumberId(existingInstall.metadata.phoneNumberId);
      }
      if (typeof existingInstall.metadata.businessAccountId === "string") {
        setBusinessAccountId(existingInstall.metadata.businessAccountId);
      } else if (typeof existingInstall.metadata.wabaId === "string") {
        setBusinessAccountId(existingInstall.metadata.wabaId);
      }
      if (typeof existingInstall.metadata.appId === "string") {
        setAppId(existingInstall.metadata.appId);
      }
      if (typeof existingInstall.metadata.graphApiVersion === "string") {
        setGraphApiVersion(existingInstall.metadata.graphApiVersion);
      }
    }
  }, [existingInstall, provider.key]);

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

  const buildIntegrationMetadata = () => {
    const metadata: Record<string, unknown> = {};

    if (provider.setupMode === "api_key") {
      if (provider.key === "whatsapp") {
        if (accessToken.trim()) {
          metadata.accessToken = accessToken.trim();
          metadata.apiKey = accessToken.trim();
        }
        if (phoneNumberId.trim()) {
          metadata.phoneNumberId = phoneNumberId.trim();
        }
        if (businessAccountId.trim()) {
          metadata.businessAccountId = businessAccountId.trim();
          metadata.wabaId = businessAccountId.trim();
        }
        if (appId.trim()) {
          metadata.appId = appId.trim();
        }
        if (appSecret.trim()) {
          metadata.appSecret = appSecret.trim();
        }
        if (verifyToken.trim()) {
          metadata.verifyToken = verifyToken.trim();
        }
        if (graphApiVersion.trim()) {
          metadata.graphApiVersion = graphApiVersion.trim();
        }
      } else {
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

    return metadata;
  };

  const startOauthPopup = async (integrationId: string) => {
    if (typeof window === "undefined") {
      throw new Error("OAuth can only be started in a browser.");
    }

    const popup = window.open("", `oauth-${provider.key}`, "popup=yes,width=560,height=720");
    if (!popup) {
      throw new Error(`Allow pop-ups for this site to connect ${provider.name}.`);
    }

    popup.document.write(`<p style='font-family: monospace;'>Opening ${provider.name} sign-in…</p>`);

    try {
      const started = await apiFetch<OauthStartResult>(`/organization-integrations/${integrationId}/oauth/start`, {
        method: "POST",
        body: JSON.stringify({}),
      });

      popup.location.href = started.authorizationUrl;

      await new Promise<void>((resolve, reject) => {
        const expectedOrigin = new URL(API_BASE_URL).origin;
        const closeWatcher = window.setInterval(() => {
          if (popup.closed) {
            cleanup();
            reject(new Error(`OAuth window was closed before ${provider.name} finished.`));
          }
        }, 500);

        const cleanup = () => {
          window.clearInterval(closeWatcher);
          window.removeEventListener("message", handleMessage);
        };

        const handleMessage = (event: MessageEvent) => {
          if (event.origin !== expectedOrigin) {
            return;
          }

          const payload = event.data as {
            source?: string;
            status?: "success" | "error";
            message?: string;
            providerKey?: string;
          };

          if (payload?.source !== "agent-marketplace-oauth" || payload.providerKey !== provider.key) {
            return;
          }

          cleanup();
          if (payload.status === "success") {
            resolve();
            return;
          }

          reject(new Error(payload.message ?? "OAuth connection failed."));
        };

        window.addEventListener("message", handleMessage);
      });
    } catch (error) {
      popup.close();
      throw error;
    }
  };

  const handleInstall = async () => {
    setSubmitting(true);
    setError(null);
    setStatusMessage(null);

    try {
      const metadata = buildIntegrationMetadata();

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
          : provider.key === "whatsapp"
            ? "Install created. Validate it, then register the webhook callback in Meta using the verify token shown here."
          : provider.setupMode === "webhook"
            ? "Webhook install created. Use the endpoint shown below to send events."
            : "Install created. Validate it before granting tools to teams.",
      );

      if (provider.setupMode === "oauth" && (provider.key === "microsoft-365" || provider.key === "slack")) {
        await startOauthPopup(created.id);
        await refreshIntegrations();
        setStatusMessage(`${provider.name} connected successfully.`);
      }

      if (provider.setupMode === "api_key" || provider.setupMode === "wallet") {
        setTesting(true);
        const tested = await apiFetch<IntegrationTestResult>(
          `/organization-integrations/${created.id}/test`,
          {
            method: "POST",
            body: JSON.stringify({}),
          },
        );
        await refreshIntegrations();
        setStatusMessage(
          tested.healthy
            ? "Connection validated successfully."
            : tested.planner?.error
              ? `Connection saved but validation failed: ${tested.planner.error}`
              : "Connection saved but validation failed.",
        );
      }
    } catch (installError) {
      setError(installError instanceof Error ? installError.message : "Unable to create install.");
    } finally {
      setSubmitting(false);
      setTesting(false);
    }
  };

  const handleUpdateInstall = async () => {
    if (!existingInstall) {
      return;
    }

    setSubmitting(true);
    setError(null);
    setStatusMessage(null);

    try {
      await apiFetch<OrganizationIntegration>(`/organization-integrations/${existingInstall.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          displayName: displayName.trim() || provider.name,
          scopes: selectedScopes.length ? selectedScopes : provider.tools,
          metadata: buildIntegrationMetadata(),
        }),
      });
      await refreshIntegrations();
      setStatusMessage("Connection settings saved.");
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Unable to update install.");
    } finally {
      setSubmitting(false);
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
      if (provider.key === "microsoft-365" || provider.key === "slack") {
        await startOauthPopup(existingInstall.id);
        await refreshIntegrations();
        setStatusMessage(`${provider.name} connected successfully.`);
        return;
      }

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
      const tested = await apiFetch<IntegrationTestResult>(
        `/organization-integrations/${existingInstall.id}/test`,
        {
          method: "POST",
          body: JSON.stringify({}),
        },
      );
      await refreshIntegrations();
      setStatusMessage(
        tested.healthy
          ? "Connection validated successfully."
          : tested.planner?.error
            ? `Validation failed: ${tested.planner.error}`
            : "Validation failed for this install.",
      );
    } catch (testError) {
      setError(testError instanceof Error ? testError.message : "Unable to validate install.");
    } finally {
      setTesting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!existingInstall) {
      return;
    }

    setDisconnecting(true);
    setError(null);
    setStatusMessage(null);

    try {
      await apiFetch<{ integration: OrganizationIntegration; removedGrantCount: number }>(
        `/organization-integrations/${existingInstall.id}/disconnect`,
        {
          method: "POST",
          body: JSON.stringify({}),
        },
      );
      await refreshIntegrations();
      setStatusMessage(`${provider.name} disconnected.`);
    } catch (disconnectError) {
      setError(
        disconnectError instanceof Error ? disconnectError.message : "Unable to disconnect integration.",
      );
    } finally {
      setDisconnecting(false);
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
                {provider.key === "whatsapp" ? (
                  <>
                    <label className="provider-flow__field">
                      <span>Permanent access token</span>
                      <input
                        type="password"
                        className="mono-input"
                        value={accessToken}
                        onChange={(event) => setAccessToken(event.target.value)}
                        placeholder="Paste Meta system user access token"
                      />
                    </label>
                    <label className="provider-flow__field">
                      <span>Phone number ID</span>
                      <input
                        className="mono-input"
                        value={phoneNumberId}
                        onChange={(event) => setPhoneNumberId(event.target.value)}
                        placeholder="WhatsApp Cloud API phone_number_id"
                      />
                    </label>
                    <label className="provider-flow__field">
                      <span>Business account ID</span>
                      <input
                        className="mono-input"
                        value={businessAccountId}
                        onChange={(event) => setBusinessAccountId(event.target.value)}
                        placeholder="WhatsApp Business account ID"
                      />
                    </label>
                    <label className="provider-flow__field">
                      <span>Meta app ID</span>
                      <input
                        className="mono-input"
                        value={appId}
                        onChange={(event) => setAppId(event.target.value)}
                        placeholder="Meta app ID"
                      />
                    </label>
                    <label className="provider-flow__field">
                      <span>Meta app secret</span>
                      <input
                        type="password"
                        className="mono-input"
                        value={appSecret}
                        onChange={(event) => setAppSecret(event.target.value)}
                        placeholder="Meta app secret for webhook verification"
                      />
                    </label>
                    <label className="provider-flow__field">
                      <span>Webhook verify token</span>
                      <input
                        type="password"
                        className="mono-input"
                        value={verifyToken}
                        onChange={(event) => setVerifyToken(event.target.value)}
                        placeholder="Custom verify token used in Meta webhook setup"
                      />
                    </label>
                    <label className="provider-flow__field">
                      <span>Graph API version</span>
                      <input
                        className="mono-input"
                        value={graphApiVersion}
                        onChange={(event) => setGraphApiVersion(event.target.value)}
                        placeholder="v23.0"
                      />
                    </label>
                    <div className="stack">
                      <strong>Webhook callback URL</strong>
                      <pre className="integration-details__metadata">{webhookUrl}</pre>
                    </div>
                  </>
                ) : provider.key !== "ollama" ? (
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
                        placeholder={provider.key === "ollama" ? "http://ollama:11434/v1" : "https://api.example.com"}
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
                  {(provider.setupMode === "api_key" || provider.setupMode === "wallet" || provider.key === "whatsapp") ? (
                    <MonochromeButton type="button" disabled={submitting} onClick={handleUpdateInstall}>
                      {submitting ? "Saving..." : "Save changes"}
                    </MonochromeButton>
                  ) : null}
                  {provider.setupMode === "oauth" && !isConnected ? (
                    <MonochromeButton type="button" disabled={submitting} onClick={handleOauthComplete}>
                      {submitting
                        ? "Authorizing..."
                        : provider.key === "microsoft-365"
                          ? `Connect ${provider.name}`
                          : `Complete ${provider.name} OAuth`}
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
                  <li>
                    {provider.key === "microsoft-365" || provider.key === "slack"
                      ? `Open the real ${provider.name} sign-in popup and finish the consent screen.`
                      : "Complete the OAuth callback step to mark the provider connected."}
                  </li>
                  <li>Grant only the connected tools individual teams actually need.</li>
                </>
              ) : null}

              {provider.setupMode === "api_key" ? (
                <>
                  <li>
                    {provider.key === "whatsapp"
                      ? "Add the Meta access token, phone number ID, business account ID, app secret, and webhook verify token."
                      : provider.key === "ollama"
                      ? "Point this install at the local Ollama endpoint and choose a default model."
                      : "Store the customer-owned API key in the install metadata."}
                  </li>
                  <li>
                    {provider.key === "whatsapp"
                      ? "Validate the phone number and business account against the WhatsApp Cloud API before granting tools."
                      : provider.key === "ollama"
                      ? "Validate the local model endpoint before using it in planning or drafting."
                      : "Validate the key before using the provider in planning or execution."}
                  </li>
                  <li>
                    {provider.key === "whatsapp"
                      ? "Register the webhook callback URL in Meta and use the same verify token there."
                      : "Model providers should usually have only one default planner at a time."}
                  </li>
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
                  <li>Validate the durability target before assigning it to ledger artifacts or recovery records.</li>
                  <li>Use these installs for survivability, registry anchors, and verification records, not day-to-day ops.</li>
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

          {existingInstall ? (
            <SectionCard title="Connection control" eyebrow="Danger zone">
              <div className="stack">
                <p className="muted-copy">
                  Disconnecting this provider revokes the install for this organization and removes any team tool grants tied to it.
                </p>
                <div className="info-window__actions">
                  <MonochromeButton
                    type="button"
                    className="mono-button--danger"
                    disabled={disconnecting}
                    onClick={handleDisconnect}
                  >
                    {disconnecting ? "Disconnecting..." : "Disconnect"}
                  </MonochromeButton>
                </div>
              </div>
            </SectionCard>
          ) : null}
        </div>
      </section>
    </div>
  );
}
