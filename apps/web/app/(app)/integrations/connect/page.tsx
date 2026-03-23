"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { OrganizationIntegration } from "@agent-marketplace/contracts";
import { MonochromeButton, SectionCard } from "@agent-marketplace/ui";
import { integrationProviders } from "@agent-marketplace/integrations";
import { apiFetch } from "../../../../lib/api-client";

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

  const connectedProviderKeys = new Set(
    integrations
      .filter((integration) => integration.status === "connected")
      .map((integration) => integration.providerKey),
  );

  const selectedIntegration = useMemo(
    () => integrations.find((integration) => integration.id === selectedIntegrationId) ?? null,
    [integrations, selectedIntegrationId],
  );

  return (
    <>
      <div className="stack">
        <div className="row-between">
          <div>
            <p className="eyebrow">System catalog</p>
            <h1>Connect integration</h1>
          </div>
          <Link href="/integrations" className="mono-button mono-button--secondary">
            Back to integrations
          </Link>
        </div>

        <SectionCard title="Available integrations" eyebrow="All supported providers">
          {loading ? (
            <p className="muted-copy">Loading integration catalog...</p>
          ) : error ? (
            <p className="form-status">{error}</p>
          ) : (
            <table className="table-block">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Category</th>
                  <th>Setup</th>
                  <th>Tools</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {integrationProviders.map((provider) => {
                  const connected = connectedProviderKeys.has(provider.key);
                  const connectedIntegration = integrations.find(
                    (integration) =>
                      integration.providerKey === provider.key && integration.status === "connected",
                  );

                  return (
                    <tr key={provider.key}>
                      <td>
                        <div className="stack">
                          <strong>{provider.name}</strong>
                          <span className="muted-copy">{provider.description}</span>
                        </div>
                      </td>
                      <td>{provider.category}</td>
                      <td>{provider.setupMode}</td>
                      <td>{provider.tools.join(", ")}</td>
                      <td>
                        {connected ? (
                          <MonochromeButton
                            variant="secondary"
                            type="button"
                            onClick={() => setSelectedIntegrationId(connectedIntegration?.id ?? null)}
                          >
                            Details
                          </MonochromeButton>
                        ) : (
                          <MonochromeButton variant="secondary" className="mono-button--success">
                            Connect
                          </MonochromeButton>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </SectionCard>

        <section className="two-up-grid">
          <SectionCard title="What this page means" eyebrow="Operator view">
            <ul className="bullet-list">
              <li>Connected systems stay on the previous screen because they are already installed for this organization.</li>
              <li>This catalog shows the full set of integrations the product can support.</li>
              <li>OAuth, API-key, webhook, and wallet integrations all live in the same system catalog.</li>
              <li>Model providers such as OpenAI, Claude, and Grok can be connected here for planning and drafting.</li>
            </ul>
          </SectionCard>
          <SectionCard title="Next step" eyebrow="Connection flow">
            <ul className="bullet-list">
              <li>Pick a provider from the catalog.</li>
              <li>Complete the provider-specific setup flow.</li>
              <li>Grant only the tools each agent actually needs.</li>
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
