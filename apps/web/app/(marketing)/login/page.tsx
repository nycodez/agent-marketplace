"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import type { AgentTeamDraft } from "@agent-marketplace/contracts";
import { MonochromeButton, SectionCard } from "@agent-marketplace/ui";
import { SESSION_CONTEXT_KEY, SESSION_TOKEN_KEY, getSessionToken } from "../../../lib/session";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_WEB_API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://localhost:4001";

type AuthPayload = {
  token: string;
  user: {
    id: string;
    email: string;
    name: string;
    createdAt: string;
  };
  organization?: {
    id: string;
    name: string;
    slug: string;
  };
  workspace?: {
    id: string;
    name: string;
    slug: string;
  };
  organizationId?: string;
  workspaceId?: string;
};

const persistSession = (payload: AuthPayload) => {
  localStorage.setItem(SESSION_TOKEN_KEY, payload.token);
  localStorage.setItem(
    SESSION_CONTEXT_KEY,
    JSON.stringify({
      token: payload.token,
      user: payload.user,
      organization: payload.organization ?? null,
      workspace: payload.workspace ?? null,
      organizationId: payload.organization?.id ?? payload.organizationId ?? null,
      workspaceId: payload.workspace?.id ?? payload.workspaceId ?? null,
    }),
  );
};

const parseResponse = async <T,>(response: Response): Promise<T> => {
  const payload = (await response.json()) as
    | { success?: boolean; data?: T; errors?: Array<{ message?: string }> }
    | undefined;

  if (!response.ok || !payload?.success || payload.data === undefined) {
    const message = payload?.errors?.[0]?.message ?? "Request failed.";
    throw new Error(message);
  }

  return payload.data;
};

export default function LoginPage() {
  const router = useRouter();
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginPending, setLoginPending] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [positionsDescription, setPositionsDescription] = useState("");
  const [createPending, setCreatePending] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createdDraft, setCreatedDraft] = useState<AgentTeamDraft | null>(null);
  const [createdAccountName, setCreatedAccountName] = useState<string | null>(null);

  useEffect(() => {
    if (getSessionToken()) {
      router.replace("/dashboard");
    }
  }, [router]);

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoginPending(true);
    setLoginError(null);

    try {
      const data = await parseResponse<AuthPayload>(
        await fetch(`${API_BASE_URL}/auth/login`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            email: loginEmail,
            password: loginPassword,
          }),
        }),
      );

      persistSession(data);
      router.push("/dashboard");
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "Unable to login.");
    } finally {
      setLoginPending(false);
    }
  };

  const handleMagicLink = async () => {
    setLoginPending(true);
    setLoginError(null);

    try {
      await parseResponse<{ token: string; sent: boolean }>(
        await fetch(`${API_BASE_URL}/auth/magic-link`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            email: loginEmail,
          }),
        }),
      );
      setLoginError("Magic link flow is scaffolded. Use password login or account creation for now.");
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "Unable to send magic link.");
    } finally {
      setLoginPending(false);
    }
  };

  const handleCreateAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreatePending(true);
    setCreateError(null);

    try {
      const authData = await parseResponse<AuthPayload>(
        await fetch(`${API_BASE_URL}/auth/register`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            email,
            name,
            password,
            organizationName,
          }),
        }),
      );

      persistSession(authData);
      setCreatedAccountName(authData.organization?.name ?? organizationName);

      if (positionsDescription.trim()) {
        const authHeader = {
          "content-type": "application/json",
          authorization: `Bearer ${authData.token}`,
        };

        const draft = await parseResponse<AgentTeamDraft>(
          await fetch(`${API_BASE_URL}/agent-team-drafts`, {
            method: "POST",
            headers: authHeader,
            body: JSON.stringify({
              title: `${organizationName.trim()} Team`,
              brief: positionsDescription.trim(),
            }),
          }),
        );

        const generatedDraft = await parseResponse<AgentTeamDraft>(
          await fetch(`${API_BASE_URL}/agent-team-drafts/${draft.id}/generate`, {
            method: "POST",
            headers: {
              authorization: `Bearer ${authData.token}`,
            },
          }),
        );

        setCreatedDraft(generatedDraft);
        return;
      }

      router.push("/dashboard");
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "Unable to create account.");
    } finally {
      setCreatePending(false);
    }
  };

  return (
    <div className="page-frame">
      <div className="two-up-grid">
        <SectionCard title="Sign in" eyebrow="Auth">
          <form className="stack" onSubmit={handleLogin}>
            <input
              className="mono-input"
              placeholder="Email"
              type="email"
              value={loginEmail}
              onChange={(event) => setLoginEmail(event.target.value)}
            />
            <input
              className="mono-input"
              type="password"
              placeholder="Password"
              value={loginPassword}
              onChange={(event) => setLoginPassword(event.target.value)}
            />
            {loginError ? <p className="form-status">{loginError}</p> : null}
            <div className="row-between">
              <MonochromeButton type="submit" disabled={loginPending}>
                {loginPending ? "Logging in..." : "Login"}
              </MonochromeButton>
              <MonochromeButton
                type="button"
                variant="secondary"
                disabled={loginPending || !loginEmail.trim()}
                onClick={handleMagicLink}
              >
                Magic link
              </MonochromeButton>
            </div>
          </form>
        </SectionCard>

        <SectionCard title="New organization setup" eyebrow="First run">
          <form className="stack" onSubmit={handleCreateAccount}>
            <input
              className="mono-input"
              placeholder="Your name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <input
              className="mono-input"
              placeholder="Email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <input
              className="mono-input"
              placeholder="Organization"
              value={organizationName}
              onChange={(event) => setOrganizationName(event.target.value)}
            />
            <input
              className="mono-input"
              type="password"
              placeholder="Choose password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <textarea
              className="mono-textarea"
              placeholder="Describe the positions you want filled and the tasks they should own."
              value={positionsDescription}
              onChange={(event) => setPositionsDescription(event.target.value)}
            />
            <p className="muted-copy">
              If you fill in the positions box, the system will create the account and immediately generate a role draft.
            </p>
            {createError ? <p className="form-status">{createError}</p> : null}
            <div className="row-between">
              <MonochromeButton type="submit" disabled={createPending}>
                {createPending ? "Creating..." : "Create account"}
              </MonochromeButton>
            </div>
          </form>
        </SectionCard>
      </div>

      {createdDraft ? (
        <div className="info-window-backdrop" role="presentation">
          <div className="info-window" role="dialog" aria-modal="true" aria-labelledby="generated-draft-title">
            <div className="info-window__titlebar">
              <div>
                <p className="eyebrow">Account created</p>
                <strong id="generated-draft-title">
                  {createdAccountName ?? "New organization"} team draft ready
                </strong>
              </div>
              <button
                type="button"
                className="info-window__close"
                aria-label="Close generated draft"
                onClick={() => router.push("/dashboard")}
              >
                X
              </button>
            </div>

            <div className="info-window__body">
              <div className="stack">
                <strong>Generated roles</strong>
                <ul className="bullet-list">
                  {createdDraft.generatedAgents.map((agent) => (
                    <li key={agent.id}>
                      {agent.roleName}: {agent.mission}
                    </li>
                  ))}
                </ul>
              </div>

              {createdDraft.clarifications.length ? (
                <div className="stack">
                  <strong>Follow-up questions</strong>
                  <ul className="bullet-list">
                    {createdDraft.clarifications.map((clarification) => (
                      <li key={clarification}>{clarification}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="info-window__actions">
                <MonochromeButton type="button" onClick={() => router.push("/agents")}>
                  Open team builder
                </MonochromeButton>
                <MonochromeButton type="button" variant="secondary" onClick={() => router.push("/dashboard")}>
                  Go to dashboard
                </MonochromeButton>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
