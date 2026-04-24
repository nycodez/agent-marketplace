"use client";

import { useEffect, useState } from "react";
import type { CreateWebsiteCredentialInput, UpdateWebsiteCredentialInput, WebsiteCredential } from "@agent-marketplace/contracts";
import { MonochromeButton, SectionCard, StatusPill } from "@agent-marketplace/ui";
import { apiFetch } from "../../../lib/api-client";

const emptyForm = {
  label: "",
  origin: "",
  loginUrl: "",
  username: "",
  password: "",
  usernameSelector: "",
  passwordSelector: "",
  submitSelector: "",
  successSelector: "",
  notes: "",
};

type CredentialFormState = typeof emptyForm;

const toCreatePayload = (form: CredentialFormState): CreateWebsiteCredentialInput => ({
  label: form.label.trim(),
  origin: form.origin.trim(),
  loginUrl: form.loginUrl.trim(),
  username: form.username.trim(),
  password: form.password,
  usernameSelector: form.usernameSelector.trim(),
  passwordSelector: form.passwordSelector.trim(),
  submitSelector: form.submitSelector.trim() || null,
  successSelector: form.successSelector.trim() || null,
  notes: form.notes.trim() || null,
});

const toUpdatePayload = (form: CredentialFormState): UpdateWebsiteCredentialInput => ({
  label: form.label.trim(),
  origin: form.origin.trim(),
  loginUrl: form.loginUrl.trim(),
  username: form.username.trim(),
  ...(form.password ? { password: form.password } : {}),
  usernameSelector: form.usernameSelector.trim(),
  passwordSelector: form.passwordSelector.trim(),
  submitSelector: form.submitSelector.trim() || null,
  successSelector: form.successSelector.trim() || null,
  notes: form.notes.trim() || null,
});

export default function CredentialsPage() {
  const [credentials, setCredentials] = useState<WebsiteCredential[]>([]);
  const [form, setForm] = useState<CredentialFormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const loaded = await apiFetch<WebsiteCredential[]>("/website-credentials");
      setCredentials(loaded);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load website credentials.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    setStatusMessage(null);

    try {
      if (editingId) {
        await apiFetch<WebsiteCredential>(`/website-credentials/${editingId}`, {
          method: "PATCH",
          body: JSON.stringify(toUpdatePayload(form)),
        });
        setStatusMessage("Website credential updated.");
      } else {
        await apiFetch<WebsiteCredential>("/website-credentials", {
          method: "POST",
          body: JSON.stringify(toCreatePayload(form)),
        });
        setStatusMessage("Website credential saved.");
      }

      await load();
      resetForm();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to save website credential.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (credentialId: string) => {
    setDeletingId(credentialId);
    setError(null);
    setStatusMessage(null);

    try {
      await apiFetch<WebsiteCredential>(`/website-credentials/${credentialId}`, {
        method: "DELETE",
      });
      if (editingId === credentialId) {
        resetForm();
      }
      await load();
      setStatusMessage("Website credential removed.");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete website credential.");
    } finally {
      setDeletingId(null);
    }
  };

  const handleEdit = (credential: WebsiteCredential) => {
    setEditingId(credential.id);
    setForm({
      label: credential.label,
      origin: credential.origin,
      loginUrl: credential.loginUrl,
      username: credential.username,
      password: "",
      usernameSelector: credential.usernameSelector,
      passwordSelector: credential.passwordSelector,
      submitSelector: credential.submitSelector ?? "",
      successSelector: credential.successSelector ?? "",
      notes: credential.notes ?? "",
    });
    setError(null);
    setStatusMessage(null);
  };

  return (
    <div className="stack">
      <div>
        <p className="eyebrow">Browser auth vault</p>
        <h1>Saved website credentials</h1>
      </div>

      <section className="provider-flow-grid">
        <SectionCard title={editingId ? "Edit credential" : "New credential"} eyebrow="Encrypted at rest">
          <div className="stack">
            <p className="muted-copy">
              Store site-specific usernames, passwords, and login selectors here. Agents reference the credential by ID or use it as the Playwright browser default.
            </p>

            <label className="provider-flow__field">
              <span>Label</span>
              <input
                className="mono-input"
                value={form.label}
                onChange={(event) => setForm((current) => ({ ...current, label: event.target.value }))}
                placeholder="Utility billing portal"
              />
            </label>
            <label className="provider-flow__field">
              <span>Origin</span>
              <input
                className="mono-input"
                value={form.origin}
                onChange={(event) => setForm((current) => ({ ...current, origin: event.target.value }))}
                placeholder="https://billing.example.com"
              />
            </label>
            <label className="provider-flow__field">
              <span>Login URL</span>
              <input
                className="mono-input"
                value={form.loginUrl}
                onChange={(event) => setForm((current) => ({ ...current, loginUrl: event.target.value }))}
                placeholder="https://billing.example.com/login"
              />
            </label>
            <label className="provider-flow__field">
              <span>Username</span>
              <input
                className="mono-input"
                value={form.username}
                onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))}
                placeholder="user@example.com"
              />
            </label>
            <label className="provider-flow__field">
              <span>{editingId ? "Replace password" : "Password"}</span>
              <input
                type="password"
                className="mono-input"
                value={form.password}
                onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                placeholder={editingId ? "Leave blank to keep current secret" : "Password"}
              />
            </label>
            <label className="provider-flow__field">
              <span>Username selector</span>
              <input
                className="mono-input"
                value={form.usernameSelector}
                onChange={(event) => setForm((current) => ({ ...current, usernameSelector: event.target.value }))}
                placeholder="#email"
              />
            </label>
            <label className="provider-flow__field">
              <span>Password selector</span>
              <input
                className="mono-input"
                value={form.passwordSelector}
                onChange={(event) => setForm((current) => ({ ...current, passwordSelector: event.target.value }))}
                placeholder="#password"
              />
            </label>
            <label className="provider-flow__field">
              <span>Submit selector</span>
              <input
                className="mono-input"
                value={form.submitSelector}
                onChange={(event) => setForm((current) => ({ ...current, submitSelector: event.target.value }))}
                placeholder="button[type='submit']"
              />
            </label>
            <label className="provider-flow__field">
              <span>Success selector</span>
              <input
                className="mono-input"
                value={form.successSelector}
                onChange={(event) => setForm((current) => ({ ...current, successSelector: event.target.value }))}
                placeholder="[data-testid='dashboard']"
              />
            </label>
            <label className="provider-flow__field">
              <span>Notes</span>
              <textarea
                className="mono-textarea provider-flow__notes"
                value={form.notes}
                onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                placeholder="Optional hints for operators."
              />
            </label>

            {error ? <p className="form-status">{error}</p> : null}
            {statusMessage ? <p className="form-status">{statusMessage}</p> : null}

            <div className="info-window__actions">
              <MonochromeButton type="button" disabled={saving} onClick={() => void handleSubmit()}>
                {saving ? "Saving..." : editingId ? "Save changes" : "Save credential"}
              </MonochromeButton>
              {editingId ? (
                <MonochromeButton type="button" variant="secondary" disabled={saving} onClick={resetForm}>
                  Cancel edit
                </MonochromeButton>
              ) : null}
            </div>
          </div>
        </SectionCard>

        <div className="stack">
          <SectionCard title="Available credentials" eyebrow="Workspace scoped">
            {loading ? (
              <p className="muted-copy">Loading website credentials...</p>
            ) : !credentials.length ? (
              <p className="muted-copy">No website credentials are stored yet.</p>
            ) : (
              <div className="approval-list">
                {credentials.map((credential) => (
                  <div key={credential.id} className="approval-list__item">
                    <div className="approval-list__header">
                      <strong>{credential.label}</strong>
                      <StatusPill>{credential.hasSecret ? "stored" : "missing secret"}</StatusPill>
                    </div>
                    <p className="muted-copy">
                      {credential.origin} · {credential.username}
                    </p>
                    <p className="muted-copy">Login URL: {credential.loginUrl}</p>
                    <p className="muted-copy">
                      Selectors: {credential.usernameSelector} · {credential.passwordSelector}
                    </p>
                    {credential.submitSelector ? (
                      <p className="muted-copy">Submit: {credential.submitSelector}</p>
                    ) : null}
                    {credential.successSelector ? (
                      <p className="muted-copy">Success: {credential.successSelector}</p>
                    ) : null}
                    {credential.notes ? <p className="muted-copy">{credential.notes}</p> : null}
                    <div className="row-between">
                      <MonochromeButton type="button" onClick={() => handleEdit(credential)}>
                        Edit
                      </MonochromeButton>
                      <MonochromeButton
                        type="button"
                        variant="secondary"
                        disabled={deletingId === credential.id}
                        onClick={() => void handleDelete(credential.id)}
                      >
                        {deletingId === credential.id ? "Removing..." : "Delete"}
                      </MonochromeButton>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard title="How agents use this" eyebrow="Execution path">
            <ul className="bullet-list">
              <li>Grant the Playwright browser integration to an agent so the planner can emit `browser.visit` steps.</li>
              <li>Reference a saved credential by `credentialId` in the step arguments, or set one as the integration default.</li>
              <li>Browser steps can authenticate and read pages now; external website writes should stay approval-gated when we add them.</li>
            </ul>
          </SectionCard>
        </div>
      </section>
    </div>
  );
}
