"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  AgentSpec,
  OrganizationIntegration,
  ProgramFile,
  ProgramFileSourceType,
  PublicationRecord,
} from "@agent-marketplace/contracts";
import { MonochromeButton, SectionCard, StatusPill } from "@agent-marketplace/ui";
import { apiFetch } from "../../../lib/api-client";

type PublicationTarget = "base" | "arweave";

const hasLiveConnection = (integration: OrganizationIntegration) =>
  integration.status === "connected" &&
  (integration.providerKey !== "microsoft-365" || typeof integration.metadata.refreshToken === "string");

export default function PublishingPage() {
  const [programFiles, setProgramFiles] = useState<ProgramFile[]>([]);
  const [publications, setPublications] = useState<PublicationRecord[]>([]);
  const [agents, setAgents] = useState<AgentSpec[]>([]);
  const [integrations, setIntegrations] = useState<OrganizationIntegration[]>([]);
  const [selectedProgramFileId, setSelectedProgramFileId] = useState<string | null | undefined>(undefined);
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [sourceType, setSourceType] = useState<ProgramFileSourceType>("json");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState<PublicationTarget | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);

    try {
      const [loadedProgramFiles, loadedAgents, loadedIntegrations] = await Promise.all([
        apiFetch<ProgramFile[]>("/program-files"),
        apiFetch<AgentSpec[]>("/agents"),
        apiFetch<OrganizationIntegration[]>("/organization-integrations"),
      ]);

      const publicationLists = await Promise.all(
        loadedProgramFiles.map((programFile) =>
          apiFetch<PublicationRecord[]>(`/program-files/${programFile.id}/publications`),
        ),
      );

      setProgramFiles(loadedProgramFiles);
      setAgents(loadedAgents);
      setIntegrations(loadedIntegrations);
      setPublications(publicationLists.flat());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load publishing state.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const selectedProgramFile = useMemo(
    () => {
      if (selectedProgramFileId === null) {
        return null;
      }

      if (typeof selectedProgramFileId === "string") {
        return programFiles.find((programFile) => programFile.id === selectedProgramFileId) ?? null;
      }

      return programFiles[0] ?? null;
    },
    [programFiles, selectedProgramFileId],
  );

  const connectedBaseInstall = useMemo(
    () => integrations.find((integration) => integration.providerKey === "base" && hasLiveConnection(integration)) ?? null,
    [integrations],
  );
  const connectedArweaveInstall = useMemo(
    () =>
      integrations.find((integration) => integration.providerKey === "arweave" && hasLiveConnection(integration)) ??
      null,
    [integrations],
  );

  useEffect(() => {
    if (!selectedProgramFile) {
      setName("");
      setContent("");
      setSourceType("json");
      return;
    }

    setSelectedProgramFileId(selectedProgramFile.id);
    setName(selectedProgramFile.name);
    setContent(selectedProgramFile.content);
    setSourceType(selectedProgramFile.sourceType);
  }, [selectedProgramFile?.id]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setStatusMessage(null);

    try {
      if (selectedProgramFile) {
        await apiFetch<ProgramFile>(`/program-files/${selectedProgramFile.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            name,
            content,
            sourceType,
          }),
        });
        setStatusMessage("Artifact record updated.");
      } else {
        const created = await apiFetch<ProgramFile>("/program-files", {
          method: "POST",
          body: JSON.stringify({
            name,
            content,
            sourceType,
            tags: [],
          }),
        });
        setSelectedProgramFileId(created.id);
        setStatusMessage("Artifact record created.");
      }

      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save artifact record.");
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async (target: PublicationTarget) => {
    const programFileId = selectedProgramFile?.id;
    if (!programFileId) {
      setError("Save the artifact record before anchoring it.");
      return;
    }

    setPublishing(target);
    setError(null);
    setStatusMessage(null);

    try {
      const integration =
        target === "base" ? connectedBaseInstall : connectedArweaveInstall;

      await apiFetch<PublicationRecord>(`/program-files/${programFileId}/publish/${target}`, {
        method: "POST",
        body: JSON.stringify({
          organizationIntegrationId: integration?.id ?? null,
          metadata: {},
        }),
      });
      await load();
      setStatusMessage(`Durability record queued for ${target}.`);
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : `Unable to anchor to ${target}.`);
    } finally {
      setPublishing(null);
    }
  };

  return (
    <div className="stack">
      <div className="row-between">
        <div>
          <p className="eyebrow">Durability infrastructure</p>
          <h1>Ledger artifacts and durability keys</h1>
        </div>
        <MonochromeButton
          type="button"
          onClick={() => {
            setSelectedProgramFileId(null);
            setName("");
            setContent("");
            setSourceType("json");
            setStatusMessage(null);
            setError(null);
          }}
        >
          Create artifact record
        </MonochromeButton>
      </div>

      <section className="two-up-grid">
        <SectionCard title="Artifact editor" eyebrow="Source of truth">
          <div className="stack">
            <label className="provider-flow__field">
              <span>Artifact record</span>
              <select
                className="mono-input"
                value={selectedProgramFileId ?? ""}
                onChange={(event) => setSelectedProgramFileId(event.target.value || null)}
              >
                <option value="">New artifact record</option>
                {programFiles.map((programFile) => (
                  <option key={programFile.id} value={programFile.id}>
                    {programFile.name}
                  </option>
                ))}
              </select>
            </label>
            <input
              className="mono-input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              aria-label="Artifact record name"
              placeholder="Artifact record name"
            />
            <label className="provider-flow__field">
              <span>Source type</span>
              <select
                className="mono-input"
                value={sourceType}
                onChange={(event) => setSourceType(event.target.value as ProgramFileSourceType)}
              >
                <option value="json">json</option>
                <option value="typescript">typescript</option>
                <option value="javascript">javascript</option>
                <option value="markdown">markdown</option>
                <option value="solidity">solidity</option>
                <option value="text">text</option>
              </select>
            </label>
            <textarea
              className="mono-textarea"
              value={content}
              onChange={(event) => setContent(event.target.value)}
              aria-label="Artifact payload"
              placeholder="Artifact payload"
            />
            {error ? <p className="form-status">{error}</p> : null}
            {statusMessage ? <p className="form-status">{statusMessage}</p> : null}
            <div className="row-between">
              <MonochromeButton type="button" disabled={saving || !name.trim() || !content.trim()} onClick={() => void handleSave()}>
                {saving ? "Saving..." : "Save artifact record"}
              </MonochromeButton>
              <div className="row-between">
                <MonochromeButton
                  type="button"
                  disabled={publishing !== null || !selectedProgramFile}
                  onClick={() => void handlePublish("base")}
                >
                  {publishing === "base" ? "Anchoring..." : "Anchor to Base"}
                </MonochromeButton>
                <MonochromeButton
                  type="button"
                  variant="secondary"
                  disabled={publishing !== null || !selectedProgramFile}
                  onClick={() => void handlePublish("arweave")}
                >
                  {publishing === "arweave" ? "Anchoring..." : "Anchor to Arweave"}
                </MonochromeButton>
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Durability rules" eyebrow="Operational defaults">
          <ul className="bullet-list">
            <li>Artifact records stay workspace-scoped and audit-logged.</li>
            <li>Base is used for ledger anchors, manifests, and registry references.</li>
            <li>Arweave is used for durable retrieval records and immutable artifact storage.</li>
            <li>
              Connected durability installs:
              {" "}
              {connectedBaseInstall ? "Base ready" : "Base not connected"} ·{" "}
              {connectedArweaveInstall ? "Arweave ready" : "Arweave not connected"}
            </li>
          </ul>
        </SectionCard>
      </section>

      <SectionCard title="Stored artifact records" eyebrow="Durability inputs">
        {loading ? (
          <p className="muted-copy">Loading artifact records...</p>
        ) : !programFiles.length ? (
          <p className="muted-copy">No durability artifact records exist for this workspace yet.</p>
        ) : (
          <table className="table-block">
            <thead>
              <tr>
                <th>Name</th>
                <th>Source type</th>
                <th>Tags</th>
                <th>Agent</th>
              </tr>
            </thead>
            <tbody>
              {programFiles.map((programFile) => (
                <tr key={programFile.id}>
                  <td>{programFile.name}</td>
                  <td>{programFile.sourceType}</td>
                  <td>{programFile.tags.join(", ") || "No tags"}</td>
                  <td>{agents.find((agent) => agent.id === programFile.agentId)?.displayName ?? "unassigned"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>

      <SectionCard title="Durability history" eyebrow="Ledger + permanent storage">
        {loading ? (
          <p className="muted-copy">Loading durability history...</p>
        ) : !publications.length ? (
          <p className="muted-copy">No durability records exist yet.</p>
        ) : (
          <div className="approval-list">
            {[...publications]
              .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
              .map((publication) => (
                <div key={publication.id} className="approval-list__item">
                  <div className="approval-list__header">
                    <strong>
                      {publication.target} · {publication.summary}
                    </strong>
                    <StatusPill>{publication.status}</StatusPill>
                  </div>
                  <p className="muted-copy">
                    Transaction: {publication.transactionId ?? "pending"} · Gateway:{" "}
                    {publication.gatewayUrl ?? "not available"}
                  </p>
                  <p className="muted-copy">
                    Temporal workflow: {publication.orchestration.workflowId ?? "not scheduled"}
                  </p>
                </div>
              ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
