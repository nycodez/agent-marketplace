"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { OrganizationIntegration } from "@agent-marketplace/contracts";
import { MonochromeButton, SectionCard } from "@agent-marketplace/ui";
import { integrationProviders } from "@agent-marketplace/integrations";
import { apiFetch } from "../../../../lib/api-client";

const hasLiveConnection = (integration: OrganizationIntegration) =>
  integration.status === "connected" &&
  (integration.providerKey !== "microsoft-365" || typeof integration.metadata.refreshToken === "string");

const categoryOrder = [
  "productivity",
  "communication",
  "crm",
  "revenue",
  "custom",
] as const;

const categoryTitles: Record<string, string> = {
  productivity: "Productivity systems",
  communication: "Communication systems",
  crm: "CRM systems",
  revenue: "Revenue systems",
  custom: "Custom connections",
  durability: "Durability targets",
};

export default function ConnectIntegrationPage() {
  const [selectedIntegrationId, setSelectedIntegrationId] = useState<string | null>(null);
  const [integrations, setIntegrations] = useState<OrganizationIntegration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const modelProviders = useMemo(
    () => integrationProviders.filter((provider) => provider.category === "model"),
    [],
  );

  const groupedProviders = useMemo(
    () =>
      categoryOrder
        .map((category) => ({
          category,
          providers: integrationProviders.filter((provider) => provider.category === category),
        }))
        .filter((group) => group.providers.length),
    [],
  );

  const durabilityProviders = useMemo(
    () => integrationProviders.filter((provider) => provider.key === "base" || provider.key === "arweave"),
    [],
  );

  const selectedIntegration = useMemo(
    () => integrations.find((integration) => integration.id === selectedIntegrationId) ?? null,
    [integrations, selectedIntegrationId],
  );

  const connectedInstallations = new Map(
    integrations
      .filter(hasLiveConnection)
      .map((integration) => [integration.providerKey, integration]),
  );

  const renderProviderCard = (providerKey: string) => {
    const provider = integrationProviders.find((candidate) => candidate.key === providerKey);
    if (!provider) {
      return null;
    }

    const connectedIntegration = connectedInstallations.get(provider.key) ?? null;

    return (
      <article key={provider.key} className="integration-provider-card">
        <div className="integration-provider-card__header">
          <div>
            <p className="eyebrow">{provider.setupMode}</p>
            <h2>{provider.name}</h2>
          </div>
          {connectedIntegration ? <span className="status-pill">connected</span> : null}
        </div>

        <p className="muted-copy">{provider.description}</p>

        <div className="stack">
          <strong>Tools</strong>
          <p className="muted-copy">{provider.tools.join(", ")}</p>
        </div>

        <div className="integration-provider-card__actions">
          <Link
            href={`/integrations/connect/${provider.key}`}
            className={`mono-button${connectedIntegration ? " mono-button--success" : ""}`}
          >
            {connectedIntegration ? "Connected" : "Connect"}
          </Link>
          {connectedIntegration ? (
            <MonochromeButton
              variant="secondary"
              type="button"
              onClick={() => setSelectedIntegrationId(connectedIntegration.id)}
            >
              Details
            </MonochromeButton>
          ) : null}
        </div>
      </article>
    );
  };

  return (
    <>
      <div className="stack">
        <div className="row-between">
          <div>
            <p className="eyebrow">System catalog</p>
            <h1>Connect integrations</h1>
          </div>
          <Link href="/integrations" className="mono-button mono-button--secondary">
            Back to integrations
          </Link>
        </div>

        <SectionCard title="Model provider" eyebrow="Choose at least one">
          <div className="stack">
            <p className="muted-copy">
              Pick one planner model first. Only one model provider is required, but your teams still
              need operational systems from the sections below to do real work.
            </p>
            {loading ? (
              <p className="muted-copy">Loading integration catalog...</p>
            ) : error ? (
              <p className="form-status">{error}</p>
            ) : (
              <div className="integration-provider-grid">
                {modelProviders.map((provider) => renderProviderCard(provider.key))}
              </div>
            )}
          </div>
        </SectionCard>

        {groupedProviders.map((group) => (
          <SectionCard
            key={group.category}
            title={categoryTitles[group.category] ?? group.category}
            eyebrow="Operational systems"
          >
            {loading ? (
              <p className="muted-copy">Loading integration catalog...</p>
            ) : error ? (
              <p className="form-status">{error}</p>
            ) : (
              <div className="integration-provider-grid">
                {group.providers.map((provider) => renderProviderCard(provider.key))}
              </div>
            )}
          </SectionCard>
        ))}

        <SectionCard title={categoryTitles.durability} eyebrow="Survivability and registry">
          {loading ? (
            <p className="muted-copy">Loading integration catalog...</p>
          ) : error ? (
            <p className="form-status">{error}</p>
          ) : (
            <div className="integration-provider-grid">
              {durabilityProviders.map((provider) => renderProviderCard(provider.key))}
            </div>
          )}
        </SectionCard>

        <section className="two-up-grid">
          <SectionCard title="How to use this" eyebrow="Connection flow">
            <ul className="bullet-list">
              <li>Choose one model provider first so the planner can draft teams and structure runs.</li>
              <li>Add productivity, communication, revenue, or custom systems based on the work you want done.</li>
              <li>Each provider now has its own connection page with provider-specific steps.</li>
            </ul>
          </SectionCard>
          <SectionCard title="What happens next" eyebrow="After install">
            <ul className="bullet-list">
              <li>Connected installs appear on the integrations screen for this organization.</li>
              <li>Agents still need explicit tool grants before they can use a connected system.</li>
              <li>External writes remain approval-gated even after a provider is connected.</li>
            </ul>
          </SectionCard>
        </section>
      </div>

      {selectedIntegration ? (
        <div className="info-window-backdrop" role="presentation" onClick={() => setSelectedIntegrationId(null)}>
          <div
            className="info-window"
            role="dialog"
            aria-modal="true"
            aria-labelledby="integration-details-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="info-window__titlebar">
              <div>
                <p className="eyebrow">Connection details</p>
                <strong id="integration-details-title">{selectedIntegration.displayName}</strong>
              </div>
              <button
                type="button"
                className="info-window__close"
                aria-label="Close integration details"
                onClick={() => setSelectedIntegrationId(null)}
              >
                X
              </button>
            </div>

            <div className="info-window__body">
              <div className="stack">
                <p className="muted-copy">Provider: {selectedIntegration.providerKey}</p>
                <p className="muted-copy">Auth type: {selectedIntegration.authType}</p>
                <p className="muted-copy">Status: {selectedIntegration.status}</p>
                <p className="muted-copy">
                  Last validated: {selectedIntegration.lastValidatedAt ?? "Not yet validated"}
                </p>
              </div>

              <div className="stack">
                <strong>Granted scopes</strong>
                <p className="muted-copy">{selectedIntegration.scopes.join(", ")}</p>
              </div>

              <div className="stack">
                <strong>Connection metadata</strong>
                <pre className="integration-details__metadata">
                  {JSON.stringify(selectedIntegration.metadata, null, 2)}
                </pre>
              </div>

              <div className="info-window__actions">
                <Link href={`/integrations/connect/${selectedIntegration.providerKey}`} className="mono-button">
                  Open flow
                </Link>
                <MonochromeButton type="button" onClick={() => setSelectedIntegrationId(null)}>
                  Close window
                </MonochromeButton>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
