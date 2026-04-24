import crypto from "node:crypto";
import {
  agentChatThreadStatusSchema,
  createAgentChatMessageInputSchema,
  createAgentChatThreadInputSchema,
  createWebsiteCredentialInputSchema,
  createLearningLibrarySourceInputSchema,
  createToolGrantInputSchema,
  createProgramFileInputSchema,
  createDraftInputSchema,
  installIntegrationInputSchema,
  learningLibrarySourceTypeSchema,
  learningLibraryStatusSchema,
  learningLibraryQueryInputSchema,
  loginInputSchema,
  magicLinkInputSchema,
  publishProgramFileInputSchema,
  reindexLearningLibraryInputSchema,
  registerInputSchema,
  runCreateInputSchema,
  updateLearningLibrarySourceInputSchema,
  updateWebsiteCredentialInputSchema,
  type ProgramFile,
  type PublicationRecord,
  updateIntegrationInputSchema,
  updateDraftInputSchema,
  updateProgramFileInputSchema,
  type AgentSpec,
  type AgentSpecVersion,
  type AgentTeamDraft,
  type ApprovalRequest,
  type OrganizationIntegration,
  type Run,
  type RunStep,
  type WebsiteCredential,
} from "@agent-marketplace/contracts";
import {
  generateChatReply,
  generateAgentDraftsFromBrief,
  planPublication,
  planRun,
  publishAgentsFromDraft,
  testPlannerModelIntegration,
} from "@agent-marketplace/agent-runtime";
import { appConfig } from "@agent-marketplace/config";
import {
  approveCurrentRunApproval,
  archiveAgentChatThread,
  cancelRunExecution,
  createAgentChatThread,
  deleteLearningLibrarySource,
  createWebsiteCredential,
  deleteWebsiteCredential,
  deleteSession,
  getAgentChatDetail,
  getCurrentPendingApprovalForRun,
  getProgramFileById,
  getRunDetail,
  indexLearningLibraryContent,
  insertAuditEvent,
  insertAgentChatMessage,
  insertPublicationRecord,
  insertRunGraph,
  listAgentChatThreads,
  listLearningLibrarySources,
  listWebsiteCredentialsByWorkspace,
  listAuditEventsByWorkspace,
  listPublicationsByProgramFile,
  listRunsByWorkspace,
  purgeLearningLibrary,
  queryLearningLibrary,
  resumeAgentChatThread,
  reindexLearningLibraryWorkspace,
  updateLearningLibrarySource,
  updateWebsiteCredential,
  updatePublicationWorkflowStart,
  updateRunWorkflowStart,
} from "@agent-marketplace/database";
import { findIntegrationProvider, integrationProviders } from "@agent-marketplace/integrations";
import type { FastifyInstance } from "fastify";
import { createSession, hashPassword, requireSession, verifyPassword } from "../lib/auth.js";
import {
  cancelTemporalRunWorkflow,
  signalTemporalRunApproval,
  startTemporalPublicationWorkflow,
  startTemporalRunWorkflow,
} from "../lib/temporal.js";
import {
  createId,
  createMembership,
  getStore,
  nowIso,
  persistStore,
  recordAuditEvent,
} from "../services/store.js";

const ok = <T>(data: T, meta?: Record<string, unknown>) => ({
  success: true,
  data,
  meta,
});

const fail = (
  field: string,
  message: string,
  rule = "validation",
) => ({
  success: false,
  errors: [{ rule, field, message }],
});

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const titleFromMessage = (message: string) => {
  const title = message.trim().replace(/\s+/g, " ").slice(0, 72);
  return title || "New chat";
};

const modelProviderKeys = new Set(["openai", "anthropic", "grok", "gemini", "ollama"]);
const GOOGLE_WORKSPACE_PROVIDER_KEY = "google-workspace";
const MICROSOFT_365_PROVIDER_KEY = "microsoft-365";
const SLACK_PROVIDER_KEY = "slack";
const PLAYWRIGHT_BROWSER_PROVIDER_KEY = "playwright-browser";
const WHATSAPP_PROVIDER_KEY = "whatsapp";
const MICROSOFT_365_SCOPES = [
  "openid",
  "profile",
  "offline_access",
  "User.Read",
  "Mail.Read",
  "Mail.Send",
  "Calendars.Read",
  "Calendars.ReadWrite",
  "Files.Read.All",
];
const DEFAULT_WHATSAPP_GRAPH_VERSION = "v23.0";
const SLACK_SCOPES = [
  "channels:history",
  "channels:read",
  "groups:history",
  "groups:read",
  "im:history",
  "im:read",
  "mpim:history",
  "mpim:read",
  "chat:write",
];
const GOOGLE_WORKSPACE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/drive.metadata.readonly",
];

const maskSecretValue = (value: string) => {
  const lastFour = value.slice(-4);
  return lastFour ? `••••${lastFour}` : "••••";
};

const withStoredIntegrationMetadata = (metadata: Record<string, unknown>) => {
  const next = { ...metadata };
  const apiKey = typeof next.apiKey === "string" ? next.apiKey.trim() : "";
  if (apiKey && typeof next.apiKeyLastFour !== "string") {
    next.apiKeyLastFour = apiKey.slice(-4);
  }
  return next;
};

const sanitizeIntegrationMetadata = (metadata: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => {
      if (typeof value === "string" && /(api[_-]?key|token|secret)/i.test(key)) {
        return [key, maskSecretValue(value)];
      }
      return [key, value];
    }),
  );

const sanitizeIntegration = (integration: OrganizationIntegration) => ({
  ...integration,
  metadata: sanitizeIntegrationMetadata(integration.metadata),
});

const hasConnectedOauthTokens = (integration: OrganizationIntegration) => {
  if (integration.providerKey === MICROSOFT_365_PROVIDER_KEY || integration.providerKey === GOOGLE_WORKSPACE_PROVIDER_KEY) {
    return typeof integration.metadata.refreshToken === "string";
  }

  return true;
};

const toRecord = (value: unknown) =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const microsoftOauthConfigured = () =>
  !!appConfig.microsoftClientId && !!appConfig.microsoftClientSecret && !!appConfig.microsoftRedirectUri;

const slackOauthConfigured = () =>
  !!appConfig.slackClientId && !!appConfig.slackClientSecret && !!appConfig.slackRedirectUri;

const googleOauthConfigured = () =>
  !!appConfig.googleClientId && !!appConfig.googleClientSecret && !!appConfig.googleRedirectUri;

const createOauthState = (payload: Record<string, string>) => {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", appConfig.sessionSecret)
    .update(encodedPayload)
    .digest("base64url");
  return `${encodedPayload}.${signature}`;
};

const parseOauthState = (value: string) => {
  const [encodedPayload, signature] = value.split(".");
  if (!encodedPayload || !signature) {
    throw new Error("Invalid OAuth state.");
  }

  const expectedSignature = crypto
    .createHmac("sha256", appConfig.sessionSecret)
    .update(encodedPayload)
    .digest("base64url");

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
    throw new Error("Invalid OAuth state signature.");
  }

  return JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as Record<string, string>;
};

const encodePopupResultHtml = ({
  status,
  message,
  integrationId,
  providerKey,
}: {
  status: "success" | "error";
  message: string;
  integrationId: string | null;
  providerKey: string;
}) => `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${status === "success" ? "Connection complete" : "Connection failed"}</title>
  </head>
  <body style="font-family: monospace; background: #111; color: #f5f5f5; padding: 24px;">
    <p>${message}</p>
    <script>
      (function () {
        const payload = ${JSON.stringify({
          source: "agent-marketplace-oauth",
          status,
          message,
          integrationId,
          providerKey,
        })};
        if (window.opener && !window.opener.closed) {
          window.opener.postMessage(payload, ${JSON.stringify(new URL(appConfig.appUrl).origin)});
          window.close();
        }
      })();
    </script>
  </body>
</html>`;

const getMicrosoftAuthorizationUrl = ({
  integration,
  userEmail,
}: {
  integration: OrganizationIntegration;
  userEmail?: string;
}) => {
  if (!microsoftOauthConfigured()) {
    throw new Error("Microsoft OAuth is not configured on this environment.");
  }

  const nonce = crypto.randomUUID();
  integration.metadata = {
    ...integration.metadata,
    oauthNonce: nonce,
    oauthRequestedAt: nowIso(),
  };
  integration.updatedAt = nowIso();

  const state = createOauthState({
    integrationId: integration.id,
    organizationId: integration.organizationId,
    providerKey: integration.providerKey,
    nonce,
  });

  const query = new URLSearchParams({
    client_id: appConfig.microsoftClientId!,
    redirect_uri: appConfig.microsoftRedirectUri!,
    response_type: "code",
    response_mode: "query",
    scope: MICROSOFT_365_SCOPES.join(" "),
    prompt: "select_account",
    state,
  });

  if (userEmail) {
    query.set("login_hint", userEmail);
  }

  return `https://login.microsoftonline.com/${appConfig.microsoftTenantId}/oauth2/v2.0/authorize?${query.toString()}`;
};

const getSlackAuthorizationUrl = ({
  integration,
}: {
  integration: OrganizationIntegration;
}) => {
  if (!slackOauthConfigured()) {
    throw new Error("Slack OAuth is not configured on this environment.");
  }

  const nonce = crypto.randomUUID();
  integration.metadata = {
    ...integration.metadata,
    oauthNonce: nonce,
    oauthRequestedAt: nowIso(),
  };
  integration.updatedAt = nowIso();

  const state = createOauthState({
    integrationId: integration.id,
    organizationId: integration.organizationId,
    providerKey: integration.providerKey,
    nonce,
  });

  const query = new URLSearchParams({
    client_id: appConfig.slackClientId!,
    redirect_uri: appConfig.slackRedirectUri!,
    scope: SLACK_SCOPES.join(","),
    state,
    user_scope: "",
  });

  return `https://slack.com/oauth/v2/authorize?${query.toString()}`;
};

const getGoogleAuthorizationUrl = ({
  integration,
  userEmail,
}: {
  integration: OrganizationIntegration;
  userEmail?: string;
}) => {
  if (!googleOauthConfigured()) {
    throw new Error("Google OAuth is not configured on this environment.");
  }

  const nonce = crypto.randomUUID();
  integration.metadata = {
    ...integration.metadata,
    oauthNonce: nonce,
    oauthRequestedAt: nowIso(),
  };
  integration.updatedAt = nowIso();

  const state = createOauthState({
    integrationId: integration.id,
    organizationId: integration.organizationId,
    providerKey: integration.providerKey,
    nonce,
  });

  const query = new URLSearchParams({
    client_id: appConfig.googleClientId!,
    redirect_uri: appConfig.googleRedirectUri!,
    response_type: "code",
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
    scope: GOOGLE_WORKSPACE_SCOPES.join(" "),
    state,
  });

  if (userEmail) {
    query.set("login_hint", userEmail);
  }

  return `https://accounts.google.com/o/oauth2/v2/auth?${query.toString()}`;
};

const getWhatsAppConfig = (integration: OrganizationIntegration) => {
  const accessToken =
    typeof integration.metadata.accessToken === "string"
      ? integration.metadata.accessToken.trim()
      : typeof integration.metadata.apiKey === "string"
        ? integration.metadata.apiKey.trim()
        : "";
  const phoneNumberId =
    typeof integration.metadata.phoneNumberId === "string" ? integration.metadata.phoneNumberId.trim() : "";
  const businessAccountId =
    typeof integration.metadata.businessAccountId === "string"
      ? integration.metadata.businessAccountId.trim()
      : typeof integration.metadata.wabaId === "string"
        ? integration.metadata.wabaId.trim()
        : "";
  const appId = typeof integration.metadata.appId === "string" ? integration.metadata.appId.trim() : "";
  const appSecret = typeof integration.metadata.appSecret === "string" ? integration.metadata.appSecret.trim() : "";
  const verifyToken =
    typeof integration.metadata.verifyToken === "string" ? integration.metadata.verifyToken.trim() : "";
  const graphApiVersion =
    typeof integration.metadata.graphApiVersion === "string" && integration.metadata.graphApiVersion.trim()
      ? integration.metadata.graphApiVersion.trim()
      : DEFAULT_WHATSAPP_GRAPH_VERSION;

  return {
    accessToken,
    phoneNumberId,
    businessAccountId,
    appId,
    appSecret,
    verifyToken,
    graphApiVersion,
  };
};

const exchangeSlackAuthorizationCode = async (code: string) => {
  if (!slackOauthConfigured()) {
    throw new Error("Slack OAuth is not configured on this environment.");
  }

  const response = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: appConfig.slackClientId!,
      client_secret: appConfig.slackClientSecret!,
      code,
      redirect_uri: appConfig.slackRedirectUri!,
    }),
  });

  const payload = (await response.json()) as Record<string, unknown>;
  if (!response.ok || payload.ok !== true) {
    throw new Error(typeof payload.error === "string" ? payload.error : "Slack OAuth exchange failed.");
  }

  return payload;
};

const exchangeGoogleAuthorizationCode = async (code: string) => {
  if (!googleOauthConfigured()) {
    throw new Error("Google OAuth is not configured on this environment.");
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: appConfig.googleClientId!,
      client_secret: appConfig.googleClientSecret!,
      redirect_uri: appConfig.googleRedirectUri!,
      grant_type: "authorization_code",
      code,
    }),
  });

  if (!response.ok) {
    throw new Error(`Google token exchange failed: ${await response.text()}`);
  }

  return (await response.json()) as Record<string, unknown>;
};

const refreshGoogleAccessToken = async (refreshToken: string) => {
  if (!googleOauthConfigured()) {
    throw new Error("Google OAuth is not configured on this environment.");
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: appConfig.googleClientId!,
      client_secret: appConfig.googleClientSecret!,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    throw new Error(`Google token refresh failed: ${await response.text()}`);
  }

  return (await response.json()) as Record<string, unknown>;
};

const getGoogleProfile = async (accessToken: string) => {
  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Google profile lookup failed: ${await response.text()}`);
  }

  return (await response.json()) as Record<string, unknown>;
};

const slackApi = async ({
  token,
  path,
}: {
  token: string;
  path: string;
}) => {
  const response = await fetch(`https://slack.com/api/${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({}),
  });

  const payload = (await response.json()) as Record<string, unknown>;
  if (!response.ok || payload.ok !== true) {
    throw new Error(typeof payload.error === "string" ? payload.error : `Slack ${path} failed.`);
  }

  return payload;
};

const assertWhatsAppConfig = (integration: OrganizationIntegration) => {
  const config = getWhatsAppConfig(integration);
  if (!config.accessToken) {
    throw new Error("WhatsApp access token is required.");
  }
  if (!config.phoneNumberId) {
    throw new Error("WhatsApp phone number ID is required.");
  }
  if (!config.businessAccountId) {
    throw new Error("WhatsApp Business account ID is required.");
  }
  if (!config.appSecret) {
    throw new Error("Meta app secret is required for webhook verification.");
  }
  if (!config.verifyToken) {
    throw new Error("Webhook verify token is required.");
  }
  return config;
};

const createWhatsAppGraphUrl = (
  graphApiVersion: string,
  path: string,
  params?: Record<string, string>,
) => {
  const baseUrl = new URL(`https://graph.facebook.com/${graphApiVersion}/${path.replace(/^\/+/, "")}`);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value) {
        baseUrl.searchParams.set(key, value);
      }
    });
  }
  return baseUrl;
};

const fetchWhatsAppGraph = async (
  integration: OrganizationIntegration,
  path: string,
  init?: RequestInit & { params?: Record<string, string> },
) => {
  const config = assertWhatsAppConfig(integration);
  const response = await fetch(
    createWhatsAppGraphUrl(config.graphApiVersion, path, init?.params),
    {
      method: init?.method ?? "GET",
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
      body: init?.body,
    },
  );

  const bodyText = await response.text();
  const body = bodyText
    ? (() => {
        try {
          return JSON.parse(bodyText) as Record<string, unknown>;
        } catch {
          return null;
        }
      })()
    : null;

  if (!response.ok) {
    const message =
      typeof body?.error === "object" && body?.error && "message" in body.error
        ? String((body.error as { message?: unknown }).message ?? "WhatsApp request failed.")
        : `WhatsApp request failed with status ${response.status}.`;
    throw new Error(message);
  }

  return body;
};

const verifyWhatsAppWebhookSignature = ({
  rawBody,
  signatureHeader,
  appSecret,
}: {
  rawBody: string;
  signatureHeader: string | undefined;
  appSecret: string;
}) => {
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) {
    return false;
  }

  const expected = crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const provided = signatureHeader.slice("sha256=".length);
  if (provided.length !== expected.length) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
};

const getWhatsAppIntegrationForWebhook = (
  payload: Record<string, unknown> | null,
) => {
  let phoneNumberId: string | null = null;
  const entries = Array.isArray(payload?.entry) ? payload.entry : [];

  for (const entry of entries) {
    const changes =
      typeof entry === "object" && entry && Array.isArray((entry as { changes?: unknown[] }).changes)
        ? (entry as { changes: unknown[] }).changes
        : [];

    for (const change of changes) {
      const metadata =
        typeof change === "object" &&
        change &&
        typeof (change as { value?: unknown }).value === "object" &&
        (change as { value: { metadata?: { phone_number_id?: unknown } } }).value
          ? (change as { value: { metadata?: { phone_number_id?: unknown } } }).value.metadata
          : undefined;

      if (typeof metadata?.phone_number_id === "string" && metadata.phone_number_id) {
        phoneNumberId = metadata.phone_number_id;
        break;
      }
    }

    if (phoneNumberId) {
      break;
    }
  }

  if (!phoneNumberId) {
    return null;
  }

  return (
    getStore().organizationIntegrations.find((candidate) => {
      if (candidate.providerKey !== WHATSAPP_PROVIDER_KEY || candidate.status !== "connected") {
        return false;
      }
      return getWhatsAppConfig(candidate).phoneNumberId === phoneNumberId;
    }) ?? null
  );
};

const exchangeMicrosoftAuthorizationCode = async (code: string) => {
  if (!microsoftOauthConfigured()) {
    throw new Error("Microsoft OAuth is not configured on this environment.");
  }

  const response = await fetch(
    `https://login.microsoftonline.com/${appConfig.microsoftTenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: appConfig.microsoftClientId!,
        client_secret: appConfig.microsoftClientSecret!,
        redirect_uri: appConfig.microsoftRedirectUri!,
        grant_type: "authorization_code",
        code,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Microsoft token exchange failed: ${await response.text()}`);
  }

  return (await response.json()) as Record<string, unknown>;
};

const refreshMicrosoftAccessToken = async (refreshToken: string) => {
  if (!microsoftOauthConfigured()) {
    throw new Error("Microsoft OAuth is not configured on this environment.");
  }

  const response = await fetch(
    `https://login.microsoftonline.com/${appConfig.microsoftTenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: appConfig.microsoftClientId!,
        client_secret: appConfig.microsoftClientSecret!,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        scope: MICROSOFT_365_SCOPES.join(" "),
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Microsoft token refresh failed: ${await response.text()}`);
  }

  return (await response.json()) as Record<string, unknown>;
};

const getMicrosoftGraphProfile = async (accessToken: string) => {
  const response = await fetch("https://graph.microsoft.com/v1.0/me", {
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Microsoft Graph profile lookup failed: ${await response.text()}`);
  }

  return (await response.json()) as Record<string, unknown>;
};

const buildAgentVersion = ({
  agentId,
  workspaceId,
  createdByUserId,
  generatedAgent,
  version,
}: {
  agentId: string;
  workspaceId: string;
  createdByUserId: string;
  generatedAgent: AgentTeamDraft["generatedAgents"][number];
  version: number;
}): AgentSpecVersion => ({
  id: createId("agent_version"),
  agentId,
  workspaceId,
  version,
  spec: generatedAgent,
  createdByUserId,
  createdAt: nowIso(),
});

const createPendingOrchestration = ({
  workflowType,
  taskQueue,
}: {
  workflowType: string;
  taskQueue: string;
}) => ({
  engine: "temporal" as const,
  workflowId: null,
  workflowRunId: null,
  workflowType,
  taskQueue,
  namespace: appConfig.temporalNamespace,
  status: "scheduled" as const,
  lastError: null,
});

const createProgramFilePublication = ({
  programFile,
  target,
  organizationIntegrationId,
  userId,
}: {
  programFile: ProgramFile;
  target: "base" | "arweave";
  organizationIntegrationId?: string | null;
  userId: string;
}): PublicationRecord => {
  const integration =
    (organizationIntegrationId
      ? getStore().organizationIntegrations.find(
          (candidate) =>
            candidate.id === organizationIntegrationId &&
            candidate.organizationId === programFile.organizationId &&
            candidate.providerKey === target,
        )
      : getStore().organizationIntegrations.find(
          (candidate) =>
            candidate.organizationId === programFile.organizationId &&
            candidate.providerKey === target &&
            candidate.status === "connected",
        )) ?? null;

  const publication = planPublication({
    programFile,
    target,
    integration,
    userId,
  });

  return {
    id: createId("publication"),
    createdAt: nowIso(),
    updatedAt: nowIso(),
    orchestration: createPendingOrchestration({
      workflowType: "programPublicationWorkflow",
      taskQueue: appConfig.temporalPublicationTaskQueue,
    }),
    ...publication,
  };
};

export const registerRoutes = async (app: FastifyInstance) => {
  app.addHook("onSend", async (request, reply, payload) => {
    if (
      request.method === "GET" ||
      request.method === "HEAD" ||
      request.method === "OPTIONS" ||
      reply.statusCode >= 400
    ) {
      return payload;
    }

    await persistStore();
    return payload;
  });

  app.get("/health", async () => ok({ status: "ok", service: "agent-marketplace-api" }));

  app.post("/auth/register", async (request, reply) => {
    const parsed = registerInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(422).send(fail("body", parsed.error.issues[0]?.message ?? "Invalid payload"));
    }

    const store = getStore();
    const existingUser = store.users.find((user) => user.email === parsed.data.email);
    if (existingUser) {
      return reply.code(409).send(fail("email", "An account with this email already exists.", "unique"));
    }

    const user = {
      id: createId("user"),
      email: parsed.data.email,
      name: parsed.data.name,
      passwordHash: hashPassword(parsed.data.password),
      createdAt: nowIso(),
    };
    const organization = {
      id: createId("org"),
      name: parsed.data.organizationName,
      slug: slugify(parsed.data.organizationName),
      createdByUserId: user.id,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    const workspace = {
      id: createId("workspace"),
      organizationId: organization.id,
      name: parsed.data.workspaceName ?? `${parsed.data.organizationName} Workspace`,
      slug: slugify(parsed.data.workspaceName ?? `${parsed.data.organizationName} Workspace`),
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };

    store.users.push(user);
    store.organizations.push(organization);
    store.workspaces.push(workspace);
    createMembership({
      userId: user.id,
      organizationId: organization.id,
      workspaceId: workspace.id,
      role: "owner",
    });
    const session = createSession({
      user,
      organizationId: organization.id,
      workspaceId: workspace.id,
    });

    recordAuditEvent({
      organizationId: organization.id,
      workspaceId: workspace.id,
      userId: user.id,
      eventType: "auth.registered",
      entityType: "user",
      entityId: user.id,
      payload: {
        email: user.email,
      },
    });

    return reply.code(201).send(
      ok({
        token: session.token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          createdAt: user.createdAt,
        },
        organization,
        workspace,
      }),
    );
  });

  app.post("/auth/login", async (request, reply) => {
    const parsed = loginInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(422).send(fail("body", parsed.error.issues[0]?.message ?? "Invalid payload"));
    }

    const store = getStore();
    const user = store.users.find((candidate) => candidate.email === parsed.data.email) ?? null;

    if (!user || !verifyPassword(parsed.data.password, user.passwordHash)) {
      return reply.code(401).send(fail("password", "Invalid email or password.", "auth"));
    }

    const membership = store.memberships.find((candidate) => candidate.userId === user.id) ?? null;
    if (!membership) {
      return reply.code(403).send(fail("membership", "No workspace membership found.", "auth"));
    }

    const session = createSession({
      user,
      organizationId: membership.organizationId,
      workspaceId: membership.workspaceId,
    });

    return reply.send(
      ok({
        token: session.token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          createdAt: user.createdAt,
        },
        organizationId: membership.organizationId,
        workspaceId: membership.workspaceId,
      }),
    );
  });

  app.post("/auth/magic-link", async (request, reply) => {
    const parsed = magicLinkInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(422).send(fail("body", parsed.error.issues[0]?.message ?? "Invalid payload"));
    }

    const store = getStore();
    let user = store.users.find((candidate) => candidate.email === parsed.data.email) ?? null;

    if (!user) {
      if (!parsed.data.name || !parsed.data.organizationName) {
        return reply.code(422).send(
          fail("email", "New magic-link signups require name and organizationName."),
        );
      }

      user = {
        id: createId("user"),
        email: parsed.data.email,
        name: parsed.data.name,
        passwordHash: hashPassword(createId("magic")),
        createdAt: nowIso(),
      };
      const organization = {
        id: createId("org"),
        name: parsed.data.organizationName,
        slug: slugify(parsed.data.organizationName),
        createdByUserId: user.id,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      const workspace = {
        id: createId("workspace"),
        organizationId: organization.id,
        name: `${parsed.data.organizationName} Workspace`,
        slug: slugify(`${parsed.data.organizationName} Workspace`),
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      store.users.push(user);
      store.organizations.push(organization);
      store.workspaces.push(workspace);
      createMembership({
        userId: user.id,
        organizationId: organization.id,
        workspaceId: workspace.id,
        role: "owner",
      });
    }

    const membership = store.memberships.find((candidate) => candidate.userId === user.id);
    if (!membership) {
      return reply.code(403).send(fail("membership", "No workspace membership found.", "auth"));
    }

    const session = createSession({
      user,
      organizationId: membership.organizationId,
      workspaceId: membership.workspaceId,
    });

    return reply.send(
      ok({
        token: session.token,
        sent: true,
      }),
    );
  });

  app.post("/auth/logout", async (request, reply) => {
    const authContext = await requireSession(request, reply);
    if (!authContext) {
      return;
    }

    const store = getStore();
    store.sessions = store.sessions.filter((session) => session.token !== authContext.session.token);
    await deleteSession(authContext.session.token);
    return reply.send(ok({ loggedOut: true }));
  });

  app.get("/me", async (request, reply) => {
    const authContext = await requireSession(request, reply);
    if (!authContext) {
      return;
    }

    const membership = getStore().memberships.find(
      (candidate) =>
        candidate.userId === authContext.user.id &&
        candidate.organizationId === authContext.organization.id &&
        candidate.workspaceId === authContext.workspace.id,
    );

    return reply.send(
      ok({
        user: {
          id: authContext.user.id,
          email: authContext.user.email,
          name: authContext.user.name,
          createdAt: authContext.user.createdAt,
        },
        organization: authContext.organization,
        workspace: authContext.workspace,
        membership,
      }),
    );
  });

  app.get("/organizations", async (request, reply) => {
    const authContext = await requireSession(request, reply);
    if (!authContext) {
      return;
    }

    const organizations = getStore().memberships
      .filter((membership) => membership.userId === authContext.user.id)
      .map((membership) =>
        getStore().organizations.find((organization) => organization.id === membership.organizationId),
      )
      .filter(Boolean);

    return reply.send(ok(organizations));
  });

  app.post("/organizations", async (request, reply) => {
    const authContext = await requireSession(request, reply);
    if (!authContext) {
      return;
    }

    const payload = request.body as Partial<{ name: string; workspaceName: string }>;
    if (!payload?.name?.trim()) {
      return reply.code(422).send(fail("name", "Organization name is required."));
    }

    const organization = {
      id: createId("org"),
      name: payload.name.trim(),
      slug: slugify(payload.name),
      createdByUserId: authContext.user.id,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    const workspace = {
      id: createId("workspace"),
      organizationId: organization.id,
      name: payload.workspaceName?.trim() || `${payload.name.trim()} Workspace`,
      slug: slugify(payload.workspaceName?.trim() || `${payload.name.trim()} Workspace`),
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };

    getStore().organizations.push(organization);
    getStore().workspaces.push(workspace);
    createMembership({
      userId: authContext.user.id,
      organizationId: organization.id,
      workspaceId: workspace.id,
      role: "owner",
    });

    recordAuditEvent({
      organizationId: organization.id,
      workspaceId: workspace.id,
      userId: authContext.user.id,
      eventType: "organization.created",
      entityType: "organization",
      entityId: organization.id,
      payload: {
        workspaceId: workspace.id,
      },
    });

    return reply.code(201).send(ok({ organization, workspace }));
  });

  app.patch("/organizations", async (request, reply) => {
    const authContext = await requireSession(request, reply);
    if (!authContext) {
      return;
    }

    const payload = request.body as Partial<{ name: string }>;
    if (!payload?.name?.trim()) {
      return reply.code(422).send(fail("name", "Organization name is required."));
    }

    authContext.organization.name = payload.name.trim();
    authContext.organization.slug = slugify(payload.name);
    authContext.organization.updatedAt = nowIso();

    recordAuditEvent({
      organizationId: authContext.organization.id,
      workspaceId: authContext.workspace.id,
      userId: authContext.user.id,
      eventType: "organization.updated",
      entityType: "organization",
      entityId: authContext.organization.id,
      payload: {
        name: authContext.organization.name,
      },
    });

    return reply.send(ok(authContext.organization));
  });

  app.get("/workspaces", async (request, reply) => {
    const authContext = await requireSession(request, reply);
    if (!authContext) {
      return;
    }

    const workspaces = getStore().workspaces.filter(
      (workspace) => workspace.organizationId === authContext.organization.id,
    );

    return reply.send(ok(workspaces));
  });

  app.post("/workspaces", async (request, reply) => {
    const authContext = await requireSession(request, reply);
    if (!authContext) {
      return;
    }

    const payload = request.body as Partial<{ name: string }>;
    if (!payload?.name?.trim()) {
      return reply.code(422).send(fail("name", "Workspace name is required."));
    }

    const workspace = {
      id: createId("workspace"),
      organizationId: authContext.organization.id,
      name: payload.name.trim(),
      slug: slugify(payload.name),
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };

    getStore().workspaces.push(workspace);
    createMembership({
      userId: authContext.user.id,
      organizationId: authContext.organization.id,
      workspaceId: workspace.id,
      role: "owner",
    });
    recordAuditEvent({
      organizationId: authContext.organization.id,
      workspaceId: workspace.id,
      userId: authContext.user.id,
      eventType: "workspace.created",
      entityType: "workspace",
      entityId: workspace.id,
      payload: workspace,
    });

    return reply.code(201).send(ok(workspace));
  });

  app.patch("/workspaces", async (request, reply) => {
    const authContext = await requireSession(request, reply);
    if (!authContext) {
      return;
    }

    const payload = request.body as Partial<{ name: string }>;
    if (!payload?.name?.trim()) {
      return reply.code(422).send(fail("name", "Workspace name is required."));
    }

    authContext.workspace.name = payload.name.trim();
    authContext.workspace.slug = slugify(payload.name);
    authContext.workspace.updatedAt = nowIso();

    recordAuditEvent({
      organizationId: authContext.organization.id,
      workspaceId: authContext.workspace.id,
      userId: authContext.user.id,
      eventType: "workspace.updated",
      entityType: "workspace",
      entityId: authContext.workspace.id,
      payload: {
        name: authContext.workspace.name,
      },
    });

    return reply.send(ok(authContext.workspace));
  });

  app.get("/members", async (request, reply) => {
    const authContext = await requireSession(request, reply);
    if (!authContext) {
      return;
    }

    const members = getStore().memberships
      .filter((membership) => membership.workspaceId === authContext.workspace.id)
      .map((membership) => ({
        ...membership,
        user: getStore().users.find((user) => user.id === membership.userId),
      }));

    return reply.send(ok(members));
  });

  app.post("/members", async (request, reply) => {
    const authContext = await requireSession(request, reply);
    if (!authContext) {
      return;
    }

    const payload = request.body as Partial<{ email: string; name: string; role: "admin" | "builder" | "operator" | "viewer" }>;
    if (!payload?.email?.trim() || !payload?.name?.trim() || !payload.role) {
      return reply.code(422).send(fail("member", "email, name, and role are required."));
    }

    const email = payload.email.trim();
    const name = payload.name.trim();
    const store = getStore();
    let user = store.users.find((candidate) => candidate.email === email) ?? null;
    if (!user) {
      user = {
        id: createId("user"),
        email,
        name,
        passwordHash: hashPassword(createId("invite")),
        createdAt: nowIso(),
      };
      store.users.push(user);
    }

    const membership = createMembership({
      userId: user.id,
      organizationId: authContext.organization.id,
      workspaceId: authContext.workspace.id,
      role: payload.role,
    });

    recordAuditEvent({
      organizationId: authContext.organization.id,
      workspaceId: authContext.workspace.id,
      userId: authContext.user.id,
      eventType: "member.invited",
      entityType: "membership",
      entityId: membership.id,
      payload: {
        invitedUserId: user.id,
        role: membership.role,
      },
    });

    return reply.code(201).send(ok({ ...membership, user }));
  });

  app.patch("/members", async (request, reply) => {
    const authContext = await requireSession(request, reply);
    if (!authContext) {
      return;
    }

    const payload = request.body as Partial<{ membershipId: string; role: "admin" | "builder" | "operator" | "viewer" }>;
    if (!payload?.membershipId || !payload.role) {
      return reply.code(422).send(fail("membershipId", "membershipId and role are required."));
    }

    const membership = getStore().memberships.find(
      (candidate) =>
        candidate.id === payload.membershipId && candidate.workspaceId === authContext.workspace.id,
    );

    if (!membership) {
      return reply.code(404).send(fail("membershipId", "Membership not found.", "exists"));
    }

    membership.role = payload.role;
    recordAuditEvent({
      organizationId: authContext.organization.id,
      workspaceId: authContext.workspace.id,
      userId: authContext.user.id,
      eventType: "member.updated",
      entityType: "membership",
      entityId: membership.id,
      payload: {
        role: membership.role,
      },
    });

    return reply.send(ok(membership));
  });

  app.get("/integration-providers", async () => ok(integrationProviders));

  app.get("/organization-integrations", async (request, reply) => {
    const authContext = await requireSession(request, reply);
    if (!authContext) {
      return;
    }

    const installations = getStore().organizationIntegrations.filter(
      (candidate) => candidate.organizationId === authContext.organization.id,
    );

    return reply.send(ok(installations.map(sanitizeIntegration)));
  });

  app.get("/website-credentials", async (request, reply) => {
    const authContext = await requireSession(request, reply);
    if (!authContext) {
      return;
    }

    const credentials = await listWebsiteCredentialsByWorkspace({
      organizationId: authContext.organization.id,
      workspaceId: authContext.workspace.id,
    });

    return reply.send(ok(credentials));
  });

  app.post("/website-credentials", async (request, reply) => {
    const authContext = await requireSession(request, reply);
    if (!authContext) {
      return;
    }

    const parsed = createWebsiteCredentialInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(422).send(fail("body", parsed.error.issues[0]?.message ?? "Invalid payload"));
    }

    const credential = await createWebsiteCredential({
      organizationId: authContext.organization.id,
      workspaceId: authContext.workspace.id,
      createdByUserId: authContext.user.id,
      input: parsed.data,
    });

    await insertAuditEvent({
      organizationId: authContext.organization.id,
      workspaceId: authContext.workspace.id,
      userId: authContext.user.id,
      eventType: "website_credential.created",
      entityType: "website_credential",
      entityId: credential.id,
      payload: {
        origin: credential.origin,
        label: credential.label,
      },
    });

    return reply.code(201).send(ok(credential));
  });

  app.patch("/website-credentials/:id", async (request, reply) => {
    const authContext = await requireSession(request, reply);
    if (!authContext) {
      return;
    }

    const parsed = updateWebsiteCredentialInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(422).send(fail("body", parsed.error.issues[0]?.message ?? "Invalid payload"));
    }

    const credential = await updateWebsiteCredential({
      credentialId: (request.params as { id: string }).id,
      organizationId: authContext.organization.id,
      workspaceId: authContext.workspace.id,
      input: parsed.data,
    });

    if (!credential) {
      return reply.code(404).send(fail("id", "Website credential not found.", "exists"));
    }

    await insertAuditEvent({
      organizationId: authContext.organization.id,
      workspaceId: authContext.workspace.id,
      userId: authContext.user.id,
      eventType: "website_credential.updated",
      entityType: "website_credential",
      entityId: credential.id,
      payload: {
        origin: credential.origin,
        label: credential.label,
      },
    });

    return reply.send(ok(credential));
  });

  app.delete("/website-credentials/:id", async (request, reply) => {
    const authContext = await requireSession(request, reply);
    if (!authContext) {
      return;
    }

    const credential = await deleteWebsiteCredential({
      credentialId: (request.params as { id: string }).id,
      organizationId: authContext.organization.id,
      workspaceId: authContext.workspace.id,
    });

    if (!credential) {
      return reply.code(404).send(fail("id", "Website credential not found.", "exists"));
    }

    await insertAuditEvent({
      organizationId: authContext.organization.id,
      workspaceId: authContext.workspace.id,
      userId: authContext.user.id,
      eventType: "website_credential.deleted",
      entityType: "website_credential",
      entityId: credential.id,
      payload: {
        origin: credential.origin,
        label: credential.label,
      },
    });

    return reply.send(ok(credential));
  });

  app.post("/organization-integrations/:provider/install", async (request, reply) => {
    const authContext = await requireSession(request, reply);
    if (!authContext) {
      return;
    }

    const provider = findIntegrationProvider((request.params as { provider: string }).provider);
    if (!provider) {
      return reply.code(404).send(fail("provider", "Integration provider not found.", "exists"));
    }

    const parsed = installIntegrationInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(422).send(fail("body", parsed.error.issues[0]?.message ?? "Invalid payload"));
    }

    const installation: OrganizationIntegration = {
      id: createId("integration"),
      organizationId: authContext.organization.id,
      providerKey: provider.key,
      displayName: parsed.data.displayName,
      status: provider.authType === "webhook" ? "connected" : "pending",
      authType: provider.authType,
      scopes: parsed.data.scopes.length ? parsed.data.scopes : provider.tools,
      metadata: withStoredIntegrationMetadata(parsed.data.metadata),
      createdByUserId: authContext.user.id,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      lastValidatedAt: null,
    };

    getStore().organizationIntegrations.push(installation);
    recordAuditEvent({
      organizationId: authContext.organization.id,
      workspaceId: authContext.workspace.id,
      userId: authContext.user.id,
      eventType: "integration.installed",
      entityType: "organization_integration",
      entityId: installation.id,
      payload: {
        providerKey: provider.key,
        scopes: installation.scopes,
      },
    });

    await persistStore();

    return reply.code(201).send(
      ok(sanitizeIntegration(installation), {
        nextAction:
          provider.setupMode === "oauth"
            ? "Complete the OAuth callback to finish setup."
            : provider.setupMode === "api_key"
              ? provider.key === WHATSAPP_PROVIDER_KEY
                ? "Store the Meta access token, phone number ID, business account ID, app secret, and verify token, then run a test."
                : provider.key === "ollama"
                ? "Set metadata.baseUrl if needed, optionally set metadata.defaultModel and metadata.defaultForPlanning, then run a test."
                : modelProviderKeys.has(provider.key)
                  ? "Store the provider API key in metadata.apiKey, optionally set metadata.defaultModel and metadata.defaultForPlanning, then run a test."
                : "Store and verify the API key out of band."
              : provider.setupMode === "wallet"
              ? "Connect a publishing wallet or signer, then verify the install."
              : provider.setupMode === "credentials"
                ? "Select a default saved credential if you want one, then validate the browser runtime."
                : "Send events to the webhook endpoint to activate runs.",
      }),
    );
  });

  app.patch("/organization-integrations/:id", async (request, reply) => {
    const authContext = await requireSession(request, reply);
    if (!authContext) {
      return;
    }

    const integration = getStore().organizationIntegrations.find(
      (candidate) =>
        candidate.id === (request.params as { id: string }).id &&
        candidate.organizationId === authContext.organization.id,
    );
    if (!integration) {
      return reply.code(404).send(fail("id", "Integration installation not found.", "exists"));
    }

    const parsed = updateIntegrationInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(422).send(fail("body", parsed.error.issues[0]?.message ?? "Invalid payload"));
    }

    if (parsed.data.displayName) {
      integration.displayName = parsed.data.displayName;
    }
    if (parsed.data.scopes) {
      integration.scopes = parsed.data.scopes.length ? parsed.data.scopes : integration.scopes;
    }
    if (parsed.data.metadata) {
      integration.metadata = withStoredIntegrationMetadata({
        ...integration.metadata,
        ...parsed.data.metadata,
      });
    }
    integration.updatedAt = nowIso();

    recordAuditEvent({
      organizationId: authContext.organization.id,
      workspaceId: authContext.workspace.id,
      userId: authContext.user.id,
      eventType: "integration.updated",
      entityType: "organization_integration",
      entityId: integration.id,
      payload: {
        providerKey: integration.providerKey,
      },
    });

    await persistStore();

    return reply.send(ok(sanitizeIntegration(integration)));
  });

  app.post("/organization-integrations/:id/disconnect", async (request, reply) => {
    const authContext = await requireSession(request, reply);
    if (!authContext) {
      return;
    }

    const integration = getStore().organizationIntegrations.find(
      (candidate) =>
        candidate.id === (request.params as { id: string }).id &&
        candidate.organizationId === authContext.organization.id,
    );
    if (!integration) {
      return reply.code(404).send(fail("id", "Integration installation not found.", "exists"));
    }

    integration.status = "revoked";
    integration.updatedAt = nowIso();

    const affectedGrants = getStore().toolGrants.filter(
      (grant) => grant.organizationIntegrationId === integration.id,
    );
    getStore().toolGrants = getStore().toolGrants.filter(
      (grant) => grant.organizationIntegrationId !== integration.id,
    );

    recordAuditEvent({
      organizationId: authContext.organization.id,
      workspaceId: authContext.workspace.id,
      userId: authContext.user.id,
      eventType: "integration.disconnected",
      entityType: "organization_integration",
      entityId: integration.id,
      payload: {
        providerKey: integration.providerKey,
        removedGrantCount: affectedGrants.length,
      },
    });

    await persistStore();

    return reply.send(
      ok({
        integration: sanitizeIntegration(integration),
        removedGrantCount: affectedGrants.length,
      }),
    );
  });

  app.post("/organization-integrations/:id/oauth/start", async (request, reply) => {
    const authContext = await requireSession(request, reply);
    if (!authContext) {
      return;
    }

    const integration = getStore().organizationIntegrations.find(
      (candidate) =>
        candidate.id === (request.params as { id: string }).id &&
        candidate.organizationId === authContext.organization.id,
    );

    if (!integration) {
      return reply.code(404).send(fail("id", "Integration installation not found.", "exists"));
    }

    if (
      integration.providerKey !== GOOGLE_WORKSPACE_PROVIDER_KEY &&
      integration.providerKey !== MICROSOFT_365_PROVIDER_KEY &&
      integration.providerKey !== SLACK_PROVIDER_KEY
    ) {
      return reply.code(501).send(
        fail("provider", "Real OAuth start is not implemented for this provider yet.", "not_supported"),
      );
    }

    if (
      (integration.providerKey === GOOGLE_WORKSPACE_PROVIDER_KEY && !googleOauthConfigured()) ||
      (integration.providerKey === MICROSOFT_365_PROVIDER_KEY && !microsoftOauthConfigured()) ||
      (integration.providerKey === SLACK_PROVIDER_KEY && !slackOauthConfigured())
    ) {
      return reply.code(503).send(
        fail("provider", `${integration.providerKey} OAuth environment variables are not configured.`, "config"),
      );
    }

    const authorizationUrl =
      integration.providerKey === GOOGLE_WORKSPACE_PROVIDER_KEY
        ? getGoogleAuthorizationUrl({
            integration,
            userEmail: authContext.user.email,
          })
        : integration.providerKey === MICROSOFT_365_PROVIDER_KEY
        ? getMicrosoftAuthorizationUrl({
            integration,
            userEmail: authContext.user.email,
          })
        : getSlackAuthorizationUrl({
            integration,
          });

    recordAuditEvent({
      organizationId: authContext.organization.id,
      workspaceId: authContext.workspace.id,
      userId: authContext.user.id,
      eventType: "integration.oauth_started",
      entityType: "organization_integration",
      entityId: integration.id,
      payload: {
        providerKey: integration.providerKey,
      },
    });

    return reply.send(
      ok({
        integration: sanitizeIntegration(integration),
        authorizationUrl,
      }),
    );
  });

  app.get("/organization-integrations/oauth/microsoft-365/callback", async (request, reply) => {
    const query = request.query as {
      code?: string;
      state?: string;
      error?: string;
      error_description?: string;
    };

    if (query.error) {
      return reply
        .type("text/html")
        .send(
          encodePopupResultHtml({
            status: "error",
            message: query.error_description ?? query.error,
            integrationId: null,
            providerKey: MICROSOFT_365_PROVIDER_KEY,
          }),
        );
    }

    if (!query.code || !query.state) {
      return reply
        .type("text/html")
        .send(
          encodePopupResultHtml({
            status: "error",
            message: "Microsoft did not return a valid authorization code.",
            integrationId: null,
            providerKey: MICROSOFT_365_PROVIDER_KEY,
          }),
        );
    }

    try {
      const state = parseOauthState(query.state);
      const integration = getStore().organizationIntegrations.find(
        (candidate) =>
          candidate.id === state.integrationId &&
          candidate.organizationId === state.organizationId &&
          candidate.providerKey === MICROSOFT_365_PROVIDER_KEY,
      );

      if (!integration) {
        throw new Error("Integration installation not found.");
      }

      const oauthNonce = typeof integration.metadata.oauthNonce === "string" ? integration.metadata.oauthNonce : null;
      if (!oauthNonce || oauthNonce !== state.nonce) {
        throw new Error("OAuth state validation failed.");
      }

      const tokenPayload = await exchangeMicrosoftAuthorizationCode(query.code);
      const accessToken =
        typeof tokenPayload.access_token === "string" ? tokenPayload.access_token : null;
      const refreshToken =
        typeof tokenPayload.refresh_token === "string" ? tokenPayload.refresh_token : null;

      if (!accessToken || !refreshToken) {
        throw new Error("Microsoft OAuth did not return the required tokens.");
      }

      const profile = await getMicrosoftGraphProfile(accessToken);
      const providerAccountId = typeof profile.id === "string" ? profile.id : null;
      const email =
        typeof profile.mail === "string" && profile.mail
          ? profile.mail
          : typeof profile.userPrincipalName === "string"
            ? profile.userPrincipalName
            : null;
      const displayName = typeof profile.displayName === "string" ? profile.displayName : null;

      integration.metadata = withStoredIntegrationMetadata({
        ...integration.metadata,
        refreshToken,
        scope: typeof tokenPayload.scope === "string" ? tokenPayload.scope : MICROSOFT_365_SCOPES.join(" "),
        tokenType: typeof tokenPayload.token_type === "string" ? tokenPayload.token_type : "Bearer",
        providerAccountId,
        accountEmail: email,
        accountDisplayName: displayName,
        oauthConnectedAt: nowIso(),
      });
      delete integration.metadata.oauthNonce;
      delete integration.metadata.oauthRequestedAt;
      integration.status = "connected";
      integration.lastValidatedAt = nowIso();
      integration.updatedAt = nowIso();

      recordAuditEvent({
        organizationId: integration.organizationId,
        workspaceId: null,
        userId: integration.createdByUserId,
        eventType: "integration.oauth_completed",
        entityType: "organization_integration",
        entityId: integration.id,
        payload: {
          providerKey: integration.providerKey,
          providerAccountId,
          accountEmail: email,
        },
      });

      await persistStore();

      return reply.type("text/html").send(
        encodePopupResultHtml({
          status: "success",
          message: `${integration.displayName} connected successfully.`,
          integrationId: integration.id,
          providerKey: integration.providerKey,
        }),
      );
    } catch (error) {
      return reply.type("text/html").send(
        encodePopupResultHtml({
          status: "error",
          message: error instanceof Error ? error.message : "Microsoft OAuth failed.",
          integrationId: null,
          providerKey: MICROSOFT_365_PROVIDER_KEY,
        }),
      );
    }
  });

  app.get("/organization-integrations/oauth/google-workspace/callback", async (request, reply) => {
    const query = request.query as {
      code?: string;
      state?: string;
      error?: string;
      error_description?: string;
    };

    if (query.error) {
      return reply.type("text/html").send(
        encodePopupResultHtml({
          status: "error",
          message: query.error_description ?? query.error,
          integrationId: null,
          providerKey: GOOGLE_WORKSPACE_PROVIDER_KEY,
        }),
      );
    }

    if (!query.code || !query.state) {
      return reply.type("text/html").send(
        encodePopupResultHtml({
          status: "error",
          message: "Google did not return a valid authorization code.",
          integrationId: null,
          providerKey: GOOGLE_WORKSPACE_PROVIDER_KEY,
        }),
      );
    }

    try {
      const state = parseOauthState(query.state);
      const integration = getStore().organizationIntegrations.find(
        (candidate) =>
          candidate.id === state.integrationId &&
          candidate.organizationId === state.organizationId &&
          candidate.providerKey === GOOGLE_WORKSPACE_PROVIDER_KEY,
      );

      if (!integration) {
        throw new Error("Integration installation not found.");
      }

      const oauthNonce = typeof integration.metadata.oauthNonce === "string" ? integration.metadata.oauthNonce : null;
      if (!oauthNonce || oauthNonce !== state.nonce) {
        throw new Error("OAuth state validation failed.");
      }

      const tokenPayload = await exchangeGoogleAuthorizationCode(query.code);
      const accessToken = typeof tokenPayload.access_token === "string" ? tokenPayload.access_token : null;
      const refreshToken = typeof tokenPayload.refresh_token === "string" ? tokenPayload.refresh_token : null;
      if (!accessToken || !refreshToken) {
        throw new Error("Google OAuth did not return the required tokens.");
      }

      const profile = await getGoogleProfile(accessToken);
      const email =
        typeof profile.emailAddress === "string" && profile.emailAddress
          ? profile.emailAddress
          : null;

      integration.metadata = withStoredIntegrationMetadata({
        ...integration.metadata,
        refreshToken,
        scope: typeof tokenPayload.scope === "string" ? tokenPayload.scope : GOOGLE_WORKSPACE_SCOPES.join(" "),
        tokenType: typeof tokenPayload.token_type === "string" ? tokenPayload.token_type : "Bearer",
        providerAccountId: typeof profile.historyId === "string" ? profile.historyId : null,
        accountEmail: email,
        oauthConnectedAt: nowIso(),
      });
      delete integration.metadata.oauthNonce;
      delete integration.metadata.oauthRequestedAt;
      integration.status = "connected";
      integration.lastValidatedAt = nowIso();
      integration.updatedAt = nowIso();

      recordAuditEvent({
        organizationId: integration.organizationId,
        workspaceId: null,
        userId: integration.createdByUserId,
        eventType: "integration.oauth_completed",
        entityType: "organization_integration",
        entityId: integration.id,
        payload: {
          providerKey: integration.providerKey,
          accountEmail: email,
        },
      });

      await persistStore();

      return reply.type("text/html").send(
        encodePopupResultHtml({
          status: "success",
          message: `${integration.displayName} connected successfully.`,
          integrationId: integration.id,
          providerKey: integration.providerKey,
        }),
      );
    } catch (error) {
      return reply.type("text/html").send(
        encodePopupResultHtml({
          status: "error",
          message: error instanceof Error ? error.message : "Google OAuth failed.",
          integrationId: null,
          providerKey: GOOGLE_WORKSPACE_PROVIDER_KEY,
        }),
      );
    }
  });

  app.get("/organization-integrations/oauth/slack/callback", async (request, reply) => {
    const query = request.query as {
      code?: string;
      state?: string;
      error?: string;
      error_description?: string;
    };

    if (query.error) {
      return reply.type("text/html").send(
        encodePopupResultHtml({
          status: "error",
          message: query.error_description ?? query.error,
          integrationId: null,
          providerKey: SLACK_PROVIDER_KEY,
        }),
      );
    }

    if (!query.code || !query.state) {
      return reply.type("text/html").send(
        encodePopupResultHtml({
          status: "error",
          message: "Slack did not return a valid authorization code.",
          integrationId: null,
          providerKey: SLACK_PROVIDER_KEY,
        }),
      );
    }

    try {
      const state = parseOauthState(query.state);
      const integration = getStore().organizationIntegrations.find(
        (candidate) =>
          candidate.id === state.integrationId &&
          candidate.organizationId === state.organizationId &&
          candidate.providerKey === SLACK_PROVIDER_KEY,
      );

      if (!integration) {
        throw new Error("Integration installation not found.");
      }

      const oauthNonce = typeof integration.metadata.oauthNonce === "string" ? integration.metadata.oauthNonce : null;
      if (!oauthNonce || oauthNonce !== state.nonce) {
        throw new Error("OAuth state validation failed.");
      }

      const tokenPayload = await exchangeSlackAuthorizationCode(query.code);
      const botToken = typeof tokenPayload.access_token === "string" ? tokenPayload.access_token : null;
      if (!botToken) {
        throw new Error("Slack OAuth did not return a bot token.");
      }

      const authTest = await slackApi({
        token: botToken,
        path: "auth.test",
      });

      const incomingWebhook = toRecord(tokenPayload.incoming_webhook);
      const team = toRecord(tokenPayload.team);

      integration.metadata = withStoredIntegrationMetadata({
        ...integration.metadata,
        botToken,
        teamId: typeof team.id === "string" ? team.id : authTest.team_id,
        teamName: typeof team.name === "string" ? team.name : authTest.team,
        botUserId: typeof tokenPayload.bot_user_id === "string" ? tokenPayload.bot_user_id : null,
        scope: typeof tokenPayload.scope === "string" ? tokenPayload.scope : SLACK_SCOPES.join(","),
        defaultChannelId:
          typeof incomingWebhook.channel_id === "string" && incomingWebhook.channel_id
            ? incomingWebhook.channel_id
            : typeof integration.metadata.defaultChannelId === "string"
              ? integration.metadata.defaultChannelId
              : null,
        oauthConnectedAt: nowIso(),
      });
      delete integration.metadata.oauthNonce;
      delete integration.metadata.oauthRequestedAt;
      integration.status = "connected";
      integration.lastValidatedAt = nowIso();
      integration.updatedAt = nowIso();

      recordAuditEvent({
        organizationId: integration.organizationId,
        workspaceId: null,
        userId: integration.createdByUserId,
        eventType: "integration.oauth_completed",
        entityType: "organization_integration",
        entityId: integration.id,
        payload: {
          providerKey: integration.providerKey,
          teamId: integration.metadata.teamId,
          teamName: integration.metadata.teamName,
        },
      });

      await persistStore();

      return reply.type("text/html").send(
        encodePopupResultHtml({
          status: "success",
          message: `${integration.displayName} connected successfully.`,
          integrationId: integration.id,
          providerKey: integration.providerKey,
        }),
      );
    } catch (error) {
      return reply.type("text/html").send(
        encodePopupResultHtml({
          status: "error",
          message: error instanceof Error ? error.message : "Slack OAuth failed.",
          integrationId: null,
          providerKey: SLACK_PROVIDER_KEY,
        }),
      );
    }
  });

  app.post("/organization-integrations/:id/oauth/callback", async (request, reply) => {
    const authContext = await requireSession(request, reply);
    if (!authContext) {
      return;
    }

    const integration = getStore().organizationIntegrations.find(
      (candidate) =>
        candidate.id === (request.params as { id: string }).id &&
        candidate.organizationId === authContext.organization.id,
    );

    if (!integration) {
      return reply.code(404).send(fail("id", "Integration installation not found.", "exists"));
    }

    integration.status = "connected";
    integration.lastValidatedAt = nowIso();
    integration.updatedAt = nowIso();

    recordAuditEvent({
      organizationId: authContext.organization.id,
      workspaceId: authContext.workspace.id,
      userId: authContext.user.id,
      eventType: "integration.oauth_completed",
      entityType: "organization_integration",
      entityId: integration.id,
      payload: {
        providerKey: integration.providerKey,
      },
    });

    return reply.send(ok(sanitizeIntegration(integration)));
  });

  app.post("/organization-integrations/:id/test", async (request, reply) => {
    const authContext = await requireSession(request, reply);
    if (!authContext) {
      return;
    }

    const integration = getStore().organizationIntegrations.find(
      (candidate) =>
        candidate.id === (request.params as { id: string }).id &&
        candidate.organizationId === authContext.organization.id,
    );
    if (!integration) {
      return reply.code(404).send(fail("id", "Integration installation not found.", "exists"));
    }

    if (integration.providerKey === MICROSOFT_365_PROVIDER_KEY) {
      const refreshToken =
        typeof integration.metadata.refreshToken === "string" ? integration.metadata.refreshToken : null;

      if (!refreshToken) {
        integration.status = "failed";
        integration.updatedAt = nowIso();

        return reply.send(
          ok({
            integration: sanitizeIntegration(integration),
            healthy: false,
            planner: {
              providerKey: integration.providerKey,
              modelName: null,
              error: "Microsoft 365 is not authorized yet. Complete the OAuth popup first.",
            },
          }),
        );
      }

      try {
        const tokenPayload = await refreshMicrosoftAccessToken(refreshToken);
        const accessToken =
          typeof tokenPayload.access_token === "string" ? tokenPayload.access_token : null;
        if (!accessToken) {
          throw new Error("Microsoft did not return an access token.");
        }

        const profile = await getMicrosoftGraphProfile(accessToken);
        const nextRefreshToken =
          typeof tokenPayload.refresh_token === "string" ? tokenPayload.refresh_token : refreshToken;
        const providerAccountId = typeof profile.id === "string" ? profile.id : null;
        const email =
          typeof profile.mail === "string" && profile.mail
            ? profile.mail
            : typeof profile.userPrincipalName === "string"
              ? profile.userPrincipalName
              : null;
        const displayName = typeof profile.displayName === "string" ? profile.displayName : null;

        integration.metadata = withStoredIntegrationMetadata({
          ...integration.metadata,
          refreshToken: nextRefreshToken,
          scope:
            typeof tokenPayload.scope === "string" ? tokenPayload.scope : integration.metadata.scope,
          tokenType:
            typeof tokenPayload.token_type === "string"
              ? tokenPayload.token_type
              : integration.metadata.tokenType,
          providerAccountId,
          accountEmail: email,
          accountDisplayName: displayName,
          oauthValidatedAt: nowIso(),
        });
        integration.status = "connected";
        integration.lastValidatedAt = nowIso();
        integration.updatedAt = nowIso();

        return reply.send(
          ok({
            integration: sanitizeIntegration(integration),
            healthy: true,
            planner: {
              providerKey: integration.providerKey,
              modelName: null,
              error: null,
            },
          }),
        );
      } catch (error) {
        integration.status = "failed";
        integration.updatedAt = nowIso();

        return reply.send(
          ok({
            integration: sanitizeIntegration(integration),
            healthy: false,
            planner: {
              providerKey: integration.providerKey,
              modelName: null,
              error: error instanceof Error ? error.message : "Microsoft 365 validation failed.",
            },
          }),
        );
      }
    }

    if (integration.providerKey === GOOGLE_WORKSPACE_PROVIDER_KEY) {
      const refreshToken =
        typeof integration.metadata.refreshToken === "string" ? integration.metadata.refreshToken : null;

      if (!refreshToken) {
        integration.status = "failed";
        integration.updatedAt = nowIso();
        await persistStore();

        return reply.send(
          ok({
            integration: sanitizeIntegration(integration),
            healthy: false,
            planner: {
              providerKey: integration.providerKey,
              modelName: null,
              error: "Google Workspace is not authorized yet. Complete the OAuth popup first.",
            },
          }),
        );
      }

      try {
        const tokenPayload = await refreshGoogleAccessToken(refreshToken);
        const accessToken =
          typeof tokenPayload.access_token === "string" ? tokenPayload.access_token : null;
        if (!accessToken) {
          throw new Error("Google did not return an access token.");
        }

        const profile = await getGoogleProfile(accessToken);
        const nextRefreshToken =
          typeof tokenPayload.refresh_token === "string" ? tokenPayload.refresh_token : refreshToken;
        const email =
          typeof profile.emailAddress === "string" && profile.emailAddress
            ? profile.emailAddress
            : typeof integration.metadata.accountEmail === "string"
              ? integration.metadata.accountEmail
              : null;

        integration.metadata = withStoredIntegrationMetadata({
          ...integration.metadata,
          refreshToken: nextRefreshToken,
          scope:
            typeof tokenPayload.scope === "string" ? tokenPayload.scope : integration.metadata.scope,
          tokenType:
            typeof tokenPayload.token_type === "string"
              ? tokenPayload.token_type
              : integration.metadata.tokenType,
          providerAccountId:
            typeof profile.historyId === "string" ? profile.historyId : integration.metadata.providerAccountId,
          accountEmail: email,
          oauthValidatedAt: nowIso(),
        });
        integration.status = "connected";
        integration.lastValidatedAt = nowIso();
        integration.updatedAt = nowIso();
        await persistStore();

        return reply.send(
          ok({
            integration: sanitizeIntegration(integration),
            healthy: true,
            planner: {
              providerKey: integration.providerKey,
              modelName: null,
              error: null,
            },
          }),
        );
      } catch (error) {
        integration.status = "failed";
        integration.updatedAt = nowIso();
        await persistStore();

        return reply.send(
          ok({
            integration: sanitizeIntegration(integration),
            healthy: false,
            planner: {
              providerKey: integration.providerKey,
              modelName: null,
              error: error instanceof Error ? error.message : "Google Workspace validation failed.",
            },
          }),
        );
      }
    }

    if (integration.providerKey === WHATSAPP_PROVIDER_KEY) {
      try {
        const config = assertWhatsAppConfig(integration);
        const phoneNumber = await fetchWhatsAppGraph(
          integration,
          config.phoneNumberId,
          {
            params: {
              fields: "id,display_phone_number,verified_name,quality_rating",
            },
          },
        );

        const businessAccount = await fetchWhatsAppGraph(
          integration,
          config.businessAccountId,
          {
            params: {
              fields: "id,name,message_template_namespace",
            },
          },
        );

        integration.metadata = withStoredIntegrationMetadata({
          ...integration.metadata,
          phoneNumberId: config.phoneNumberId,
          businessAccountId: config.businessAccountId,
          appId: config.appId,
          appSecret: config.appSecret,
          verifyToken: config.verifyToken,
          graphApiVersion: config.graphApiVersion,
          displayPhoneNumber:
            typeof phoneNumber?.display_phone_number === "string"
              ? phoneNumber.display_phone_number
              : integration.metadata.displayPhoneNumber,
          verifiedName:
            typeof phoneNumber?.verified_name === "string"
              ? phoneNumber.verified_name
              : integration.metadata.verifiedName,
          qualityRating:
            typeof phoneNumber?.quality_rating === "string"
              ? phoneNumber.quality_rating
              : integration.metadata.qualityRating,
          businessName:
            typeof businessAccount?.name === "string"
              ? businessAccount.name
              : integration.metadata.businessName,
          messageTemplateNamespace:
            typeof businessAccount?.message_template_namespace === "string"
              ? businessAccount.message_template_namespace
              : integration.metadata.messageTemplateNamespace,
        });
        integration.status = "connected";
        integration.lastValidatedAt = nowIso();
        integration.updatedAt = nowIso();

        return reply.send(
          ok({
            integration: sanitizeIntegration(integration),
            healthy: true,
            planner: {
              providerKey: integration.providerKey,
              modelName: null,
              error: null,
            },
          }),
        );
      } catch (error) {
        integration.status = "failed";
        integration.updatedAt = nowIso();

        return reply.send(
          ok({
            integration: sanitizeIntegration(integration),
            healthy: false,
            planner: {
              providerKey: integration.providerKey,
              modelName: null,
              error: error instanceof Error ? error.message : "WhatsApp validation failed.",
            },
          }),
        );
      }
    }

    if (integration.providerKey === SLACK_PROVIDER_KEY) {
      const botToken =
        typeof integration.metadata.botToken === "string" ? integration.metadata.botToken.trim() : "";

      if (!botToken) {
        integration.status = "failed";
        integration.updatedAt = nowIso();

        return reply.send(
          ok({
            integration: sanitizeIntegration(integration),
            healthy: false,
            planner: {
              providerKey: integration.providerKey,
              modelName: null,
              error: "Slack is not authorized yet. Complete the OAuth popup first.",
            },
          }),
        );
      }

      try {
        const authTest = await slackApi({
          token: botToken,
          path: "auth.test",
        });

        integration.metadata = withStoredIntegrationMetadata({
          ...integration.metadata,
          teamId:
            typeof authTest.team_id === "string" ? authTest.team_id : integration.metadata.teamId,
          teamName: typeof authTest.team === "string" ? authTest.team : integration.metadata.teamName,
          oauthValidatedAt: nowIso(),
        });
        integration.status = "connected";
        integration.lastValidatedAt = nowIso();
        integration.updatedAt = nowIso();

        return reply.send(
          ok({
            integration: sanitizeIntegration(integration),
            healthy: true,
            planner: {
              providerKey: integration.providerKey,
              modelName: null,
              error: null,
            },
          }),
        );
      } catch (error) {
        integration.status = "failed";
        integration.updatedAt = nowIso();

        return reply.send(
          ok({
            integration: sanitizeIntegration(integration),
            healthy: false,
            planner: {
              providerKey: integration.providerKey,
              modelName: null,
              error: error instanceof Error ? error.message : "Slack validation failed.",
            },
          }),
        );
      }
    }

    if (integration.providerKey === PLAYWRIGHT_BROWSER_PROVIDER_KEY) {
      const defaultCredentialId =
        typeof integration.metadata.defaultCredentialId === "string"
          ? integration.metadata.defaultCredentialId.trim()
          : "";
      const availableCredentials = await listWebsiteCredentialsByWorkspace({
        organizationId: authContext.organization.id,
        workspaceId: authContext.workspace.id,
      });
      const defaultCredential =
        defaultCredentialId
          ? availableCredentials.find((credential: WebsiteCredential) => credential.id === defaultCredentialId) ?? null
          : null;

      if (defaultCredentialId && !defaultCredential) {
        integration.status = "failed";
        integration.updatedAt = nowIso();
        await persistStore();

        return reply.send(
          ok({
            integration: sanitizeIntegration(integration),
            healthy: false,
            planner: {
              providerKey: integration.providerKey,
              modelName: null,
              error: `Default website credential ${defaultCredentialId} was not found in this workspace.`,
            },
          }),
        );
      }

      integration.status = "connected";
      integration.lastValidatedAt = nowIso();
      integration.updatedAt = nowIso();
      await persistStore();

      return reply.send(
        ok({
          integration: sanitizeIntegration(integration),
          healthy: true,
          planner: {
            providerKey: integration.providerKey,
            modelName: null,
            error: null,
          },
          defaultCredential,
        }),
      );
    }

    if (modelProviderKeys.has(integration.providerKey)) {
      const probe = await testPlannerModelIntegration(integration);
      integration.status = probe.healthy ? "connected" : "failed";
      integration.lastValidatedAt = probe.healthy ? nowIso() : integration.lastValidatedAt;
      integration.updatedAt = nowIso();

      return reply.send(
        ok({
          integration: sanitizeIntegration(integration),
          healthy: probe.healthy,
          planner: {
            providerKey: probe.modelProviderKey,
            modelName: probe.modelName,
            error: probe.error,
          },
        }),
      );
    }

    integration.status = "connected";
    integration.lastValidatedAt = nowIso();
    integration.updatedAt = nowIso();
    await persistStore();

    return reply.send(
      ok({
        integration: sanitizeIntegration(integration),
        healthy: true,
      }),
    );
  });

  app.get("/agents/:id/tool-grants", async (request, reply) => {
    const authContext = await requireSession(request, reply);
    if (!authContext) {
      return;
    }

    const agent = getStore().agents.find(
      (candidate) =>
        candidate.id === (request.params as { id: string }).id &&
        candidate.workspaceId === authContext.workspace.id,
    );
    if (!agent) {
      return reply.code(404).send(fail("id", "Agent not found.", "exists"));
    }

    const grants = getStore().toolGrants
      .filter((grant) => grant.agentId === agent.id && grant.workspaceId === authContext.workspace.id)
      .map((grant) => {
        const integration =
          getStore().organizationIntegrations.find(
            (candidate) => candidate.id === grant.organizationIntegrationId,
          ) ?? null;

        return {
          ...grant,
          integration: integration ? sanitizeIntegration(integration) : null,
        };
      });

    return reply.send(ok(grants));
  });

  app.post("/agents/:id/tool-grants", async (request, reply) => {
    const authContext = await requireSession(request, reply);
    if (!authContext) {
      return;
    }

    const agent = getStore().agents.find(
      (candidate) =>
        candidate.id === (request.params as { id: string }).id &&
        candidate.workspaceId === authContext.workspace.id,
    );
    if (!agent) {
      return reply.code(404).send(fail("id", "Agent not found.", "exists"));
    }

    const parsed = createToolGrantInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(422).send(fail("body", parsed.error.issues[0]?.message ?? "Invalid payload"));
    }

    const integration = getStore().organizationIntegrations.find(
      (candidate) =>
        candidate.id === parsed.data.organizationIntegrationId &&
        candidate.organizationId === authContext.organization.id,
    );
    if (!integration) {
      return reply
        .code(404)
        .send(fail("organizationIntegrationId", "Integration installation not found.", "exists"));
    }
    if (integration.status !== "connected") {
      return reply
        .code(422)
        .send(fail("organizationIntegrationId", "Integration must be connected before granting tools."));
    }

    const invalidTools = parsed.data.tools.filter(
      (tool) => !integration.scopes.includes(tool) || !agent.allowedTools.includes(tool),
    );
    if (invalidTools.length) {
      return reply.code(422).send(
        fail(
          "tools",
          `These tools cannot be granted for this agent and integration: ${invalidTools.join(", ")}`,
        ),
      );
    }

    const existingGrant = getStore().toolGrants.find(
      (grant) =>
        grant.agentId === agent.id &&
        grant.organizationIntegrationId === integration.id &&
        grant.workspaceId === authContext.workspace.id,
    );

    const grant =
      existingGrant ??
      (() => {
        const createdGrant = {
          id: createId("tool_grant"),
          workspaceId: authContext.workspace.id,
          agentId: agent.id,
          organizationIntegrationId: integration.id,
          providerKey: integration.providerKey,
          tools: [] as string[],
          createdByUserId: authContext.user.id,
          createdAt: nowIso(),
        };
        getStore().toolGrants.unshift(createdGrant);
        return createdGrant;
      })();

    grant.tools = Array.from(new Set([...grant.tools, ...parsed.data.tools])).sort();

    recordAuditEvent({
      organizationId: authContext.organization.id,
      workspaceId: authContext.workspace.id,
      userId: authContext.user.id,
      eventType: "agent.tool_grant.updated",
      entityType: "tool_grant",
      entityId: grant.id,
      payload: {
        agentId: agent.id,
        providerKey: grant.providerKey,
        tools: grant.tools,
      },
    });

    return reply.code(201).send(ok({ ...grant, integration }));
  });

  app.delete("/agents/:id/tool-grants/:grantId", async (request, reply) => {
    const authContext = await requireSession(request, reply);
    if (!authContext) {
      return;
    }

    const params = request.params as { id: string; grantId: string };
    const grantIndex = getStore().toolGrants.findIndex(
      (grant) =>
        grant.id === params.grantId &&
        grant.agentId === params.id &&
        grant.workspaceId === authContext.workspace.id,
    );
    if (grantIndex === -1) {
      return reply.code(404).send(fail("grantId", "Tool grant not found.", "exists"));
    }

    const [removedGrant] = getStore().toolGrants.splice(grantIndex, 1);

    recordAuditEvent({
      organizationId: authContext.organization.id,
      workspaceId: authContext.workspace.id,
      userId: authContext.user.id,
      eventType: "agent.tool_grant.deleted",
      entityType: "tool_grant",
      entityId: removedGrant.id,
      payload: {
        agentId: removedGrant.agentId,
        providerKey: removedGrant.providerKey,
      },
    });

    return reply.send(ok({ deleted: true }));
  });

  app.get("/program-files", async (request, reply) => {
    const authContext = await requireSession(request, reply);
    if (!authContext) {
      return;
    }

    const programFiles = getStore().programFiles.filter(
      (candidate) => candidate.workspaceId === authContext.workspace.id,
    );

    return reply.send(ok(programFiles));
  });

  app.get("/agent-chats", async (request, reply) => {
    const authContext = await requireSession(request, reply);
    if (!authContext) {
      return;
    }

    const query = request.query as { status?: string };
    const parsedStatus = query.status ? agentChatThreadStatusSchema.safeParse(query.status) : null;
    if (parsedStatus && !parsedStatus.success) {
      return reply.code(422).send(fail("status", "Invalid chat thread status."));
    }

    const threads = await listAgentChatThreads({
      organizationId: authContext.organization.id,
      workspaceId: authContext.workspace.id,
      status: parsedStatus?.success ? parsedStatus.data : undefined,
    });

    return reply.send(ok(threads));
  });

  app.post("/agent-chats", async (request, reply) => {
    const authContext = await requireSession(request, reply);
    if (!authContext) {
      return;
    }

    const parsed = createAgentChatThreadInputSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(422).send(fail("body", parsed.error.issues[0]?.message ?? "Invalid payload"));
    }

    const thread = await createAgentChatThread({
      organizationId: authContext.organization.id,
      workspaceId: authContext.workspace.id,
      createdByUserId: authContext.user.id,
      title: parsed.data.title?.trim() || titleFromMessage(parsed.data.message ?? "New chat"),
    });

    let detail = await getAgentChatDetail({
      threadId: thread.id,
      organizationId: authContext.organization.id,
      workspaceId: authContext.workspace.id,
    });

    if (parsed.data.message?.trim()) {
      const learningContext = await queryLearningLibrary({
        organizationId: authContext.organization.id,
        workspaceId: authContext.workspace.id,
        query: parsed.data.message,
        limit: 8,
      });
      const userMessage = await insertAgentChatMessage({
        threadId: thread.id,
        organizationId: authContext.organization.id,
        workspaceId: authContext.workspace.id,
        role: "user",
        content: parsed.data.message,
        memoryContext: learningContext,
      });
      await indexLearningLibraryContent({
        organizationId: authContext.organization.id,
        workspaceId: authContext.workspace.id,
        sourceType: "chat_message",
        sourceId: userMessage.id,
        title: `Chat: ${thread.title}`,
        summary: userMessage.content.slice(0, 180),
        content: userMessage.content,
        metadata: {
          threadId: thread.id,
          role: userMessage.role,
        },
        createdByUserId: authContext.user.id,
      });

      const integrations = getStore().organizationIntegrations.filter(
        (integration) =>
          integration.organizationId === authContext.organization.id &&
          integration.status === "connected",
      );
      const replyResult = await generateChatReply({
        message: parsed.data.message,
        history: [],
        learningContext,
        integrations,
      });
      const assistantMessage = await insertAgentChatMessage({
        threadId: thread.id,
        organizationId: authContext.organization.id,
        workspaceId: authContext.workspace.id,
        role: "assistant",
        content: replyResult.answer,
        memoryContext: learningContext,
        metadata: {
          citations: replyResult.citations,
          plannerMode: replyResult.plannerMode,
          modelProviderKey: replyResult.modelProviderKey,
          modelName: replyResult.modelName,
        },
      });
      await indexLearningLibraryContent({
        organizationId: authContext.organization.id,
        workspaceId: authContext.workspace.id,
        sourceType: "chat_message",
        sourceId: assistantMessage.id,
        title: `Chat: ${thread.title}`,
        summary: assistantMessage.content.slice(0, 180),
        content: assistantMessage.content,
        metadata: {
          threadId: thread.id,
          role: assistantMessage.role,
          citations: replyResult.citations,
        },
        createdByUserId: authContext.user.id,
      });

      detail = await getAgentChatDetail({
        threadId: thread.id,
        organizationId: authContext.organization.id,
        workspaceId: authContext.workspace.id,
      });
    }

    await insertAuditEvent({
      organizationId: authContext.organization.id,
      workspaceId: authContext.workspace.id,
      userId: authContext.user.id,
      eventType: "agent_chat.created",
      entityType: "agent_chat_thread",
      entityId: thread.id,
      payload: {
        title: thread.title,
        seededWithMessage: Boolean(parsed.data.message?.trim()),
      },
    });

    return reply.code(201).send(ok(detail ?? { thread, messages: [] }));
  });

  app.get("/agent-chats/:id", async (request, reply) => {
    const authContext = await requireSession(request, reply);
    if (!authContext) {
      return;
    }

    const detail = await getAgentChatDetail({
      threadId: (request.params as { id: string }).id,
      organizationId: authContext.organization.id,
      workspaceId: authContext.workspace.id,
    });
    if (!detail) {
      return reply.code(404).send(fail("id", "Chat thread not found.", "exists"));
    }

    return reply.send(ok(detail));
  });

  app.post("/agent-chats/:id/messages", async (request, reply) => {
    const authContext = await requireSession(request, reply);
    if (!authContext) {
      return;
    }

    const parsed = createAgentChatMessageInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(422).send(fail("body", parsed.error.issues[0]?.message ?? "Invalid payload"));
    }

    const params = request.params as { id: string };
    const detail = await getAgentChatDetail({
      threadId: params.id,
      organizationId: authContext.organization.id,
      workspaceId: authContext.workspace.id,
    });
    if (!detail) {
      return reply.code(404).send(fail("id", "Chat thread not found.", "exists"));
    }

    const learningContext = await queryLearningLibrary({
      organizationId: authContext.organization.id,
      workspaceId: authContext.workspace.id,
      query: parsed.data.message,
      limit: 8,
    });
    const userMessage = await insertAgentChatMessage({
      threadId: detail.thread.id,
      organizationId: authContext.organization.id,
      workspaceId: authContext.workspace.id,
      role: "user",
      content: parsed.data.message,
      memoryContext: learningContext,
    });
    await indexLearningLibraryContent({
      organizationId: authContext.organization.id,
      workspaceId: authContext.workspace.id,
      sourceType: "chat_message",
      sourceId: userMessage.id,
      title: `Chat: ${detail.thread.title}`,
      summary: userMessage.content.slice(0, 180),
      content: userMessage.content,
      metadata: {
        threadId: detail.thread.id,
        role: userMessage.role,
      },
      createdByUserId: authContext.user.id,
    });

    const integrations = getStore().organizationIntegrations.filter(
      (integration) =>
        integration.organizationId === authContext.organization.id &&
        integration.status === "connected",
    );
    const replyResult = await generateChatReply({
      message: parsed.data.message,
      history: detail.messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
      learningContext,
      integrations,
    });
    const assistantMessage = await insertAgentChatMessage({
      threadId: detail.thread.id,
      organizationId: authContext.organization.id,
      workspaceId: authContext.workspace.id,
      role: "assistant",
      content: replyResult.answer,
      memoryContext: learningContext,
      metadata: {
        citations: replyResult.citations,
        plannerMode: replyResult.plannerMode,
        modelProviderKey: replyResult.modelProviderKey,
        modelName: replyResult.modelName,
      },
    });
    await indexLearningLibraryContent({
      organizationId: authContext.organization.id,
      workspaceId: authContext.workspace.id,
      sourceType: "chat_message",
      sourceId: assistantMessage.id,
      title: `Chat: ${detail.thread.title}`,
      summary: assistantMessage.content.slice(0, 180),
      content: assistantMessage.content,
      metadata: {
        threadId: detail.thread.id,
        role: assistantMessage.role,
        citations: replyResult.citations,
      },
      createdByUserId: authContext.user.id,
    });

    return reply.send(ok({ messages: [userMessage, assistantMessage] }));
  });

  app.post("/agent-chats/:id/archive", async (request, reply) => {
    const authContext = await requireSession(request, reply);
    if (!authContext) {
      return;
    }

    const thread = await archiveAgentChatThread({
      threadId: (request.params as { id: string }).id,
      organizationId: authContext.organization.id,
      workspaceId: authContext.workspace.id,
    });
    if (!thread) {
      return reply.code(404).send(fail("id", "Chat thread not found.", "exists"));
    }

    return reply.send(ok(thread));
  });

  app.post("/agent-chats/:id/resume", async (request, reply) => {
    const authContext = await requireSession(request, reply);
    if (!authContext) {
      return;
    }

    const thread = await resumeAgentChatThread({
      threadId: (request.params as { id: string }).id,
      organizationId: authContext.organization.id,
      workspaceId: authContext.workspace.id,
    });
    if (!thread) {
      return reply.code(404).send(fail("id", "Chat thread not found.", "exists"));
    }

    return reply.send(ok(thread));
  });

  app.get("/learning-library/sources", async (request, reply) => {
    const authContext = await requireSession(request, reply);
    if (!authContext) {
      return;
    }

    const query = request.query as {
      sourceType?: string;
      status?: string;
      search?: string;
      limit?: string;
      offset?: string;
    };
    const parsedSourceType = query.sourceType ? learningLibrarySourceTypeSchema.safeParse(query.sourceType) : null;
    if (parsedSourceType && !parsedSourceType.success) {
      return reply.code(422).send(fail("sourceType", "Invalid learning library source type."));
    }
    const parsedStatus = query.status ? learningLibraryStatusSchema.safeParse(query.status) : null;
    if (parsedStatus && !parsedStatus.success) {
      return reply.code(422).send(fail("status", "Invalid learning library status."));
    }

    const sources = await listLearningLibrarySources({
      organizationId: authContext.organization.id,
      workspaceId: authContext.workspace.id,
      sourceType: parsedSourceType?.success ? parsedSourceType.data : undefined,
      status: parsedStatus?.success ? parsedStatus.data : undefined,
      search: query.search,
      limit: query.limit ? Number(query.limit) : undefined,
      offset: query.offset ? Number(query.offset) : undefined,
    });

    return reply.send(ok(sources));
  });

  app.post("/learning-library/sources", async (request, reply) => {
    const authContext = await requireSession(request, reply);
    if (!authContext) {
      return;
    }

    const parsed = createLearningLibrarySourceInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(422).send(fail("body", parsed.error.issues[0]?.message ?? "Invalid payload"));
    }

    const source = await indexLearningLibraryContent({
      organizationId: authContext.organization.id,
      workspaceId: authContext.workspace.id,
      sourceType: parsed.data.sourceType,
      sourceId: parsed.data.sourceId,
      title: parsed.data.title,
      summary: parsed.data.summary ?? null,
      content: parsed.data.content,
      visibility: parsed.data.visibility,
      metadata: parsed.data.metadata,
      createdByUserId: authContext.user.id,
    });

    await insertAuditEvent({
      organizationId: authContext.organization.id,
      workspaceId: authContext.workspace.id,
      userId: authContext.user.id,
      eventType: "learning_library.source_indexed",
      entityType: "learning_library_source",
      entityId: source.id,
      payload: {
        sourceType: source.sourceType,
        sourceId: source.sourceId,
        status: source.status,
      },
    });

    return reply.code(201).send(ok(source));
  });

  app.patch("/learning-library/sources/:id", async (request, reply) => {
    const authContext = await requireSession(request, reply);
    if (!authContext) {
      return;
    }

    const parsed = updateLearningLibrarySourceInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(422).send(fail("body", parsed.error.issues[0]?.message ?? "Invalid payload"));
    }

    const source = await updateLearningLibrarySource({
      sourceId: (request.params as { id: string }).id,
      organizationId: authContext.organization.id,
      workspaceId: authContext.workspace.id,
      title: parsed.data.title,
      summary: parsed.data.summary,
      visibility: parsed.data.visibility,
      metadata: parsed.data.metadata,
    });
    if (!source) {
      return reply.code(404).send(fail("id", "Learning library source not found.", "exists"));
    }

    return reply.send(ok(source));
  });

  app.delete("/learning-library/sources/:id", async (request, reply) => {
    const authContext = await requireSession(request, reply);
    if (!authContext) {
      return;
    }

    const source = await deleteLearningLibrarySource({
      sourceId: (request.params as { id: string }).id,
      organizationId: authContext.organization.id,
      workspaceId: authContext.workspace.id,
    });
    if (!source) {
      return reply.code(404).send(fail("id", "Learning library source not found.", "exists"));
    }

    await insertAuditEvent({
      organizationId: authContext.organization.id,
      workspaceId: authContext.workspace.id,
      userId: authContext.user.id,
      eventType: "learning_library.source_deleted",
      entityType: "learning_library_source",
      entityId: source.id,
      payload: {
        sourceType: source.sourceType,
        sourceId: source.sourceId,
      },
    });

    return reply.send(ok({ deleted: true }));
  });

  app.post("/learning-library/query", async (request, reply) => {
    const authContext = await requireSession(request, reply);
    if (!authContext) {
      return;
    }

    const parsed = learningLibraryQueryInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(422).send(fail("body", parsed.error.issues[0]?.message ?? "Invalid payload"));
    }

    const results = await queryLearningLibrary({
      organizationId: authContext.organization.id,
      workspaceId: authContext.workspace.id,
      query: parsed.data.query,
      sourceTypes: parsed.data.sourceTypes,
      limit: parsed.data.limit,
    });

    return reply.send(ok(results));
  });

  app.post("/learning-library/reindex", async (request, reply) => {
    const authContext = await requireSession(request, reply);
    if (!authContext) {
      return;
    }

    const parsed = reindexLearningLibraryInputSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(422).send(fail("body", parsed.error.issues[0]?.message ?? "Invalid payload"));
    }

    const result = await reindexLearningLibraryWorkspace({
      organizationId: authContext.organization.id,
      workspaceId: authContext.workspace.id,
      sourceType: parsed.data.sourceType,
      sourceId: parsed.data.sourceId,
      limit: parsed.data.limit,
      createdByUserId: authContext.user.id,
    });

    await insertAuditEvent({
      organizationId: authContext.organization.id,
      workspaceId: authContext.workspace.id,
      userId: authContext.user.id,
      eventType: "learning_library.reindexed",
      entityType: "learning_library",
      entityId: authContext.workspace.id,
      payload: result,
    });

    return reply.send(ok(result));
  });

  app.post("/learning-library/purge", async (request, reply) => {
    const authContext = await requireSession(request, reply);
    if (!authContext) {
      return;
    }

    const parsed = reindexLearningLibraryInputSchema.partial().safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(422).send(fail("body", parsed.error.issues[0]?.message ?? "Invalid payload"));
    }

    const result = await purgeLearningLibrary({
      organizationId: authContext.organization.id,
      workspaceId: authContext.workspace.id,
      sourceType: parsed.data.sourceType,
      sourceId: parsed.data.sourceId,
    });

    await insertAuditEvent({
      organizationId: authContext.organization.id,
      workspaceId: authContext.workspace.id,
      userId: authContext.user.id,
      eventType: "learning_library.purged",
      entityType: "learning_library",
      entityId: authContext.workspace.id,
      payload: result,
    });

    return reply.send(ok(result));
  });

  app.post("/program-files", async (request, reply) => {
    const authContext = await requireSession(request, reply);
    if (!authContext) {
      return;
    }

    const parsed = createProgramFileInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(422).send(fail("body", parsed.error.issues[0]?.message ?? "Invalid payload"));
    }

    const programFile: ProgramFile = {
      id: createId("program_file"),
      organizationId: authContext.organization.id,
      workspaceId: authContext.workspace.id,
      agentId: parsed.data.agentId ?? null,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      sourceType: parsed.data.sourceType,
      content: parsed.data.content,
      tags: parsed.data.tags,
      createdByUserId: authContext.user.id,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };

    getStore().programFiles.unshift(programFile);
    await indexLearningLibraryContent({
      organizationId: authContext.organization.id,
      workspaceId: authContext.workspace.id,
      sourceType: "program_file",
      sourceId: programFile.id,
      title: programFile.name,
      summary: programFile.description,
      content: [
        programFile.name,
        programFile.description ?? "",
        `Source type: ${programFile.sourceType}`,
        programFile.tags.length ? `Tags: ${programFile.tags.join(", ")}` : "",
        programFile.content,
      ].filter(Boolean).join("\n\n"),
      metadata: {
        agentId: programFile.agentId,
        sourceType: programFile.sourceType,
        tags: programFile.tags,
      },
      createdByUserId: authContext.user.id,
    });
    recordAuditEvent({
      organizationId: authContext.organization.id,
      workspaceId: authContext.workspace.id,
      userId: authContext.user.id,
      eventType: "program_file.created",
      entityType: "program_file",
      entityId: programFile.id,
      payload: {
        sourceType: programFile.sourceType,
        agentId: programFile.agentId,
      },
    });

    return reply.code(201).send(ok(programFile));
  });

  app.get("/program-files/:id", async (request, reply) => {
    const authContext = await requireSession(request, reply);
    if (!authContext) {
      return;
    }

    const programFile = getStore().programFiles.find(
      (candidate) =>
        candidate.id === (request.params as { id: string }).id &&
        candidate.workspaceId === authContext.workspace.id,
    );
    if (!programFile) {
      return reply.code(404).send(fail("id", "Program file not found.", "exists"));
    }

    return reply.send(ok({ programFile, publications: await listPublicationsByProgramFile(programFile.id) }));
  });

  app.patch("/program-files/:id", async (request, reply) => {
    const authContext = await requireSession(request, reply);
    if (!authContext) {
      return;
    }

    const parsed = updateProgramFileInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(422).send(fail("body", parsed.error.issues[0]?.message ?? "Invalid payload"));
    }

    const programFile = getStore().programFiles.find(
      (candidate) =>
        candidate.id === (request.params as { id: string }).id &&
        candidate.workspaceId === authContext.workspace.id,
    );
    if (!programFile) {
      return reply.code(404).send(fail("id", "Program file not found.", "exists"));
    }

    if (parsed.data.name !== undefined) {
      programFile.name = parsed.data.name;
    }
    if (parsed.data.description !== undefined) {
      programFile.description = parsed.data.description ?? null;
    }
    if (parsed.data.agentId !== undefined) {
      programFile.agentId = parsed.data.agentId ?? null;
    }
    if (parsed.data.sourceType !== undefined) {
      programFile.sourceType = parsed.data.sourceType;
    }
    if (parsed.data.content !== undefined) {
      programFile.content = parsed.data.content;
    }
    if (parsed.data.tags !== undefined) {
      programFile.tags = parsed.data.tags;
    }
    programFile.updatedAt = nowIso();
    await indexLearningLibraryContent({
      organizationId: authContext.organization.id,
      workspaceId: authContext.workspace.id,
      sourceType: "program_file",
      sourceId: programFile.id,
      title: programFile.name,
      summary: programFile.description,
      content: [
        programFile.name,
        programFile.description ?? "",
        `Source type: ${programFile.sourceType}`,
        programFile.tags.length ? `Tags: ${programFile.tags.join(", ")}` : "",
        programFile.content,
      ].filter(Boolean).join("\n\n"),
      metadata: {
        agentId: programFile.agentId,
        sourceType: programFile.sourceType,
        tags: programFile.tags,
      },
      createdByUserId: authContext.user.id,
    });

    recordAuditEvent({
      organizationId: authContext.organization.id,
      workspaceId: authContext.workspace.id,
      userId: authContext.user.id,
      eventType: "program_file.updated",
      entityType: "program_file",
      entityId: programFile.id,
      payload: {
        sourceType: programFile.sourceType,
      },
    });

    return reply.send(ok(programFile));
  });

  app.get("/program-files/:id/publications", async (request, reply) => {
    const authContext = await requireSession(request, reply);
    if (!authContext) {
      return;
    }

    const programFile = getStore().programFiles.find(
      (candidate) =>
        candidate.id === (request.params as { id: string }).id &&
        candidate.workspaceId === authContext.workspace.id,
    );
    if (!programFile) {
      return reply.code(404).send(fail("id", "Program file not found.", "exists"));
    }

    return reply.send(ok(await listPublicationsByProgramFile(programFile.id)));
  });

  app.post("/program-files/:id/publish/:target", async (request, reply) => {
    const authContext = await requireSession(request, reply);
    if (!authContext) {
      return;
    }

    const params = request.params as { id: string; target: string };
    if (params.target !== "base" && params.target !== "arweave") {
      return reply.code(422).send(fail("target", "Publishing target must be base or arweave."));
    }

    const parsed = publishProgramFileInputSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(422).send(fail("body", parsed.error.issues[0]?.message ?? "Invalid payload"));
    }

    const programFile = await getProgramFileById({
      programFileId: params.id,
      workspaceId: authContext.workspace.id,
    });
    if (!programFile) {
      return reply.code(404).send(fail("id", "Program file not found.", "exists"));
    }

    const publication = createProgramFilePublication({
      programFile,
      target: params.target,
      organizationIntegrationId: parsed.data.organizationIntegrationId ?? null,
      userId: authContext.user.id,
    });

    if (Object.keys(parsed.data.metadata).length) {
      publication.metadata = {
        ...publication.metadata,
        ...parsed.data.metadata,
      };
    }

    const createdPublication = await insertPublicationRecord(publication);
    const orchestration = await startTemporalPublicationWorkflow({
      publicationId: createdPublication.id,
    });
    const persistedPublication =
      (await updatePublicationWorkflowStart({
        publicationId: createdPublication.id,
        orchestration,
        status:
          orchestration.status === "started"
            ? "processing"
            : orchestration.status === "unavailable"
              ? "queued"
              : createdPublication.status,
      })) ?? {
        ...createdPublication,
        orchestration,
      };

    await insertAuditEvent({
      organizationId: authContext.organization.id,
      workspaceId: authContext.workspace.id,
      userId: authContext.user.id,
      eventType: `program_file.published.${params.target}`,
      entityType: "publication_record",
      entityId: persistedPublication.id,
      payload: {
        programFileId: programFile.id,
        status: persistedPublication.status,
        transactionId: persistedPublication.transactionId,
        orchestration: persistedPublication.orchestration,
      },
    });

    return reply.code(201).send(ok(persistedPublication));
  });

  app.get("/agent-team-drafts", async (request, reply) => {
    const authContext = await requireSession(request, reply);
    if (!authContext) {
      return;
    }

    const drafts = getStore().drafts.filter((draft) => draft.workspaceId === authContext.workspace.id);
    return reply.send(ok(drafts));
  });

  app.post("/agent-team-drafts", async (request, reply) => {
    const authContext = await requireSession(request, reply);
    if (!authContext) {
      return;
    }

    const parsed = createDraftInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(422).send(fail("body", parsed.error.issues[0]?.message ?? "Invalid payload"));
    }

    const draft: AgentTeamDraft = {
      id: createId("draft"),
      organizationId: authContext.organization.id,
      workspaceId: authContext.workspace.id,
      title: parsed.data.title,
      brief: parsed.data.brief,
      status: "draft",
      clarifications: [],
      generatedAgents: [],
      createdByUserId: authContext.user.id,
      updatedByUserId: authContext.user.id,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };

    getStore().drafts.unshift(draft);
    recordAuditEvent({
      organizationId: authContext.organization.id,
      workspaceId: authContext.workspace.id,
      userId: authContext.user.id,
      eventType: "draft.created",
      entityType: "agent_team_draft",
      entityId: draft.id,
      payload: {
        title: draft.title,
      },
    });

    return reply.code(201).send(ok(draft));
  });

  app.patch("/agent-team-drafts", async (request, reply) => {
    const authContext = await requireSession(request, reply);
    if (!authContext) {
      return;
    }

    const payload = request.body as { draftId?: string } & Record<string, unknown>;
    if (!payload.draftId) {
      return reply.code(422).send(fail("draftId", "draftId is required."));
    }

    const parsed = updateDraftInputSchema.safeParse(payload);
    if (!parsed.success) {
      return reply.code(422).send(fail("body", parsed.error.issues[0]?.message ?? "Invalid payload"));
    }

    const draft = getStore().drafts.find(
      (candidate) => candidate.id === payload.draftId && candidate.workspaceId === authContext.workspace.id,
    );
    if (!draft) {
      return reply.code(404).send(fail("draftId", "Draft not found.", "exists"));
    }

    if (parsed.data.title) {
      draft.title = parsed.data.title;
    }
    if (parsed.data.brief) {
      draft.brief = parsed.data.brief;
    }
    if (parsed.data.generatedAgents) {
      draft.generatedAgents = parsed.data.generatedAgents;
    }
    draft.updatedByUserId = authContext.user.id;
    draft.updatedAt = nowIso();

    recordAuditEvent({
      organizationId: authContext.organization.id,
      workspaceId: authContext.workspace.id,
      userId: authContext.user.id,
      eventType: "draft.updated",
      entityType: "agent_team_draft",
      entityId: draft.id,
      payload: {
        title: draft.title,
      },
    });

    return reply.send(ok(draft));
  });

  app.post("/agent-team-drafts/:id/generate", async (request, reply) => {
    const authContext = await requireSession(request, reply);
    if (!authContext) {
      return;
    }

    const draft = getStore().drafts.find(
      (candidate) =>
        candidate.id === (request.params as { id: string }).id &&
        candidate.workspaceId === authContext.workspace.id,
    );
    if (!draft) {
      return reply.code(404).send(fail("id", "Draft not found.", "exists"));
    }

    const connectedIntegrations = getStore().organizationIntegrations.filter(
      (candidate) =>
        candidate.organizationId === authContext.organization.id &&
        candidate.status === "connected",
    );

    const generated = await generateAgentDraftsFromBrief({
      brief: draft.brief,
      integrations: connectedIntegrations,
    });
    draft.generatedAgents = generated.generatedAgents;
    draft.clarifications = generated.clarifications;
    draft.status = "generated";
    draft.updatedByUserId = authContext.user.id;
    draft.updatedAt = nowIso();

    recordAuditEvent({
      organizationId: authContext.organization.id,
      workspaceId: authContext.workspace.id,
      userId: authContext.user.id,
      eventType: "draft.generated",
      entityType: "agent_team_draft",
      entityId: draft.id,
      payload: {
        generatedAgentCount: draft.generatedAgents.length,
      },
    });

    return reply.send(
      ok(draft, {
        planner: {
          mode: generated.plannerMode,
          providerKey: generated.modelProviderKey,
          modelName: generated.modelName,
        },
      }),
    );
  });

  app.post("/agent-team-drafts/:id/publish", async (request, reply) => {
    const authContext = await requireSession(request, reply);
    if (!authContext) {
      return;
    }

    const draft = getStore().drafts.find(
      (candidate) =>
        candidate.id === (request.params as { id: string }).id &&
        candidate.workspaceId === authContext.workspace.id,
    );
    if (!draft) {
      return reply.code(404).send(fail("id", "Draft not found.", "exists"));
    }
    if (!draft.generatedAgents.length) {
      return reply.code(422).send(fail("generatedAgents", "Generate the draft before publishing."));
    }

    const publishedSpecs = publishAgentsFromDraft(draft);
    const agents: AgentSpec[] = publishedSpecs.map((spec, index) => {
      const agentId = createId("agent");
      const version = buildAgentVersion({
        agentId,
        workspaceId: draft.workspaceId,
        createdByUserId: authContext.user.id,
        generatedAgent: draft.generatedAgents[index],
        version: 1,
      });
      getStore().agentVersions.push(version);

      return {
        id: agentId,
        currentVersionId: version.id,
        createdAt: nowIso(),
        updatedAt: nowIso(),
        ...spec,
      };
    });

    getStore().agents.unshift(...agents);
    draft.status = "published";
    draft.updatedByUserId = authContext.user.id;
    draft.updatedAt = nowIso();

    recordAuditEvent({
      organizationId: authContext.organization.id,
      workspaceId: authContext.workspace.id,
      userId: authContext.user.id,
      eventType: "draft.published",
      entityType: "agent_team_draft",
      entityId: draft.id,
      payload: {
        agentIds: agents.map((agent) => agent.id),
      },
    });

    return reply.send(ok(agents));
  });

  app.get("/agents", async (request, reply) => {
    const authContext = await requireSession(request, reply);
    if (!authContext) {
      return;
    }

    const agents = getStore().agents.filter((agent) => agent.workspaceId === authContext.workspace.id);
    return reply.send(ok(agents));
  });

  app.post("/agents", async (request, reply) => {
    const authContext = await requireSession(request, reply);
    if (!authContext) {
      return;
    }

    const payload = request.body as Partial<{
      displayName: string;
      mission: string;
      responsibilities: string[];
      allowedTools: string[];
      knowledgeSources: string[];
      triggerModes: Array<"manual" | "scheduled" | "webhook" | "integration_event">;
      approvalPolicy: "required" | "not_required";
      successMetrics: string[];
      constraints: string[];
    }>;
    if (!payload.displayName?.trim() || !payload.mission?.trim()) {
      return reply.code(422).send(fail("displayName", "displayName and mission are required."));
    }

    const draftAgent = {
      id: createId("draft_agent"),
      roleName: payload.displayName.trim(),
      mission: payload.mission.trim(),
      responsibilities: payload.responsibilities ?? [],
      allowedTools: payload.allowedTools ?? [],
      knowledgeSources: payload.knowledgeSources ?? ["workspace brief"],
      triggerModes: payload.triggerModes ?? ["manual"],
      approvalPolicy: payload.approvalPolicy ?? "required",
      successMetrics: payload.successMetrics ?? [],
      constraints: payload.constraints ?? [],
    };
    const agentId = createId("agent");
    const version = buildAgentVersion({
      agentId,
      workspaceId: authContext.workspace.id,
      createdByUserId: authContext.user.id,
      generatedAgent: draftAgent,
      version: 1,
    });
    const agent: AgentSpec = {
      id: agentId,
      organizationId: authContext.organization.id,
      workspaceId: authContext.workspace.id,
      displayName: draftAgent.roleName,
      mission: draftAgent.mission,
      responsibilities: draftAgent.responsibilities,
      allowedTools: draftAgent.allowedTools,
      knowledgeSources: draftAgent.knowledgeSources,
      triggerModes: draftAgent.triggerModes,
      approvalPolicy: draftAgent.approvalPolicy,
      successMetrics: draftAgent.successMetrics,
      constraints: draftAgent.constraints,
      status: "active",
      currentVersionId: version.id,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };

    getStore().agentVersions.push(version);
    getStore().agents.unshift(agent);
    recordAuditEvent({
      organizationId: authContext.organization.id,
      workspaceId: authContext.workspace.id,
      userId: authContext.user.id,
      eventType: "agent.created",
      entityType: "agent",
      entityId: agent.id,
      payload: {
        displayName: agent.displayName,
      },
    });

    return reply.code(201).send(ok(agent));
  });

  app.patch("/agents", async (request, reply) => {
    const authContext = await requireSession(request, reply);
    if (!authContext) {
      return;
    }

    const payload = request.body as Partial<AgentSpec> & { agentId?: string };
    if (!payload.agentId) {
      return reply.code(422).send(fail("agentId", "agentId is required."));
    }

    const agent = getStore().agents.find(
      (candidate) => candidate.id === payload.agentId && candidate.workspaceId === authContext.workspace.id,
    );
    if (!agent) {
      return reply.code(404).send(fail("agentId", "Agent not found.", "exists"));
    }

    if (payload.displayName) {
      agent.displayName = payload.displayName;
    }
    if (payload.mission) {
      agent.mission = payload.mission;
    }
    if (payload.responsibilities) {
      agent.responsibilities = payload.responsibilities;
    }
    if (payload.allowedTools) {
      agent.allowedTools = payload.allowedTools;
    }
    if (payload.knowledgeSources) {
      agent.knowledgeSources = payload.knowledgeSources;
    }
    if (payload.triggerModes) {
      agent.triggerModes = payload.triggerModes;
    }
    if (payload.approvalPolicy) {
      agent.approvalPolicy = payload.approvalPolicy;
    }
    if (payload.successMetrics) {
      agent.successMetrics = payload.successMetrics;
    }
    if (payload.constraints) {
      agent.constraints = payload.constraints;
    }
    agent.updatedAt = nowIso();

    const version = buildAgentVersion({
      agentId: agent.id,
      workspaceId: agent.workspaceId,
      createdByUserId: authContext.user.id,
      generatedAgent: {
        id: createId("draft_agent"),
        roleName: agent.displayName,
        mission: agent.mission,
        responsibilities: agent.responsibilities,
        allowedTools: agent.allowedTools,
        knowledgeSources: agent.knowledgeSources,
        triggerModes: agent.triggerModes,
        approvalPolicy: agent.approvalPolicy,
        successMetrics: agent.successMetrics,
        constraints: agent.constraints,
      },
      version:
        getStore().agentVersions.filter((candidate) => candidate.agentId === agent.id).length + 1,
    });
    getStore().agentVersions.push(version);
    agent.currentVersionId = version.id;

    recordAuditEvent({
      organizationId: authContext.organization.id,
      workspaceId: authContext.workspace.id,
      userId: authContext.user.id,
      eventType: "agent.updated",
      entityType: "agent",
      entityId: agent.id,
      payload: {
        version: version.version,
      },
    });

    return reply.send(ok(agent));
  });

  app.get("/agents/:id/versions", async (request, reply) => {
    const authContext = await requireSession(request, reply);
    if (!authContext) {
      return;
    }

    const versions = getStore().agentVersions.filter(
      (candidate) => candidate.agentId === (request.params as { id: string }).id,
    );
    return reply.send(ok(versions));
  });

  app.post("/runs", async (request, reply) => {
    const authContext = await requireSession(request, reply);
    if (!authContext) {
      return;
    }

    const parsed = runCreateInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(422).send(fail("body", parsed.error.issues[0]?.message ?? "Invalid payload"));
    }

    const agent = getStore().agents.find(
      (candidate) =>
        candidate.id === parsed.data.agentId && candidate.workspaceId === authContext.workspace.id,
    );
    if (!agent) {
      return reply.code(404).send(fail("agentId", "Agent not found.", "exists"));
    }

    const integrations = getStore().organizationIntegrations.filter(
      (integration) =>
        integration.organizationId === authContext.organization.id &&
        integration.status === "connected",
    );
    const workspaceAgents = getStore().agents.filter(
      (candidate) => candidate.workspaceId === authContext.workspace.id && candidate.status === "active",
    );
    const toolGrants = getStore().toolGrants.filter(
      (grant) => grant.workspaceId === authContext.workspace.id,
    );
    const learningContext = await queryLearningLibrary({
      organizationId: authContext.organization.id,
      workspaceId: authContext.workspace.id,
      query: parsed.data.prompt ?? `${agent.displayName} ${agent.mission}`,
      limit: 8,
    });
    const planned = await planRun({
      agent,
      agents: workspaceAgents,
      prompt: parsed.data.prompt,
      learningContext,
      integrations,
      toolGrants,
      userId: authContext.user.id,
    });

    const runId = createId("run");
    const run: Run = {
      id: runId,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      approvalRequestId: null,
      orchestration: createPendingOrchestration({
        workflowType: "agentRunWorkflow",
        taskQueue: appConfig.temporalRunTaskQueue,
      }),
      ...planned.run,
      triggerType: parsed.data.triggerType,
    };

    const steps: RunStep[] = planned.steps.map((step) => ({
      ...step,
      id: createId("run_step"),
      runId,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    }));

    await insertRunGraph({
      run,
      steps,
    });

    const orchestration = await startTemporalRunWorkflow({
      runId: run.id,
    });
    const persistedRun =
      (await updateRunWorkflowStart({
        runId: run.id,
        orchestration,
        status: orchestration.status === "started" ? "queued" : run.status,
      })) ?? {
        ...run,
        orchestration,
      };

    await insertAuditEvent({
      organizationId: authContext.organization.id,
      workspaceId: authContext.workspace.id,
      userId: authContext.user.id,
      eventType: "run.created",
      entityType: "run",
      entityId: persistedRun.id,
      payload: {
        agentId: agent.id,
        status: persistedRun.status,
        planner: {
          mode: planned.plan.plannerMode,
          providerKey: planned.plan.modelProviderKey,
          modelName: planned.plan.modelName,
        },
        learningLibraryMatches: learningContext.map((result) => ({
          sourceId: result.source.id,
          sourceType: result.source.sourceType,
          title: result.source.title,
          score: result.score,
        })),
        orchestration: persistedRun.orchestration,
      },
    });

    return reply.code(201).send(
      ok({
        run: persistedRun,
        steps,
        approvalRequest: null,
        plan: planned.plan,
        learningContext,
      }),
    );
  });

  app.get("/runs", async (request, reply) => {
    const authContext = await requireSession(request, reply);
    if (!authContext) {
      return;
    }

    return reply.send(ok(await listRunsByWorkspace(authContext.workspace.id)));
  });

  app.get("/runs/:id", async (request, reply) => {
    const authContext = await requireSession(request, reply);
    if (!authContext) {
      return;
    }

    const detail = await getRunDetail({
      runId: (request.params as { id: string }).id,
      workspaceId: authContext.workspace.id,
    });
    if (!detail) {
      return reply.code(404).send(fail("id", "Run not found.", "exists"));
    }
    return reply.send(ok(detail));
  });

  app.post("/runs/:id/approve", async (request, reply) => {
    const authContext = await requireSession(request, reply);
    if (!authContext) {
      return;
    }

    const detail = await getRunDetail({
      runId: (request.params as { id: string }).id,
      workspaceId: authContext.workspace.id,
    });
    if (!detail) {
      return reply.code(404).send(fail("id", "Run not found.", "exists"));
    }
    const run = detail.run;
    const approvalRequest = await getCurrentPendingApprovalForRun(run.id);
    if (!approvalRequest) {
      return reply.code(422).send(fail("approval", "This run does not require approval."));
    }

    const approved = await approveCurrentRunApproval({
      runId: run.id,
    });
    const persistedRun = approved?.run ?? run;
    const persistedApproval = approved?.approvalRequest ?? approvalRequest;

    if (run.orchestration.workflowId) {
      const signalResult = await signalTemporalRunApproval({
        workflowId: run.orchestration.workflowId,
      });

      if (!signalResult.success) {
        persistedRun.orchestration.status = "failed_to_start";
        persistedRun.orchestration.lastError = signalResult.error;
      }
    }

    await insertAuditEvent({
      organizationId: authContext.organization.id,
      workspaceId: authContext.workspace.id,
      userId: authContext.user.id,
      eventType: "run.approved",
      entityType: "run",
      entityId: persistedRun.id,
      payload: {
        approvalRequestId: persistedApproval.id,
        orchestration: persistedRun.orchestration,
      },
    });

    return reply.send(ok({ run: persistedRun, approvalRequest: persistedApproval }));
  });

  app.post("/runs/:id/cancel", async (request, reply) => {
    const authContext = await requireSession(request, reply);
    if (!authContext) {
      return;
    }

    const detail = await getRunDetail({
      runId: (request.params as { id: string }).id,
      workspaceId: authContext.workspace.id,
    });
    if (!detail) {
      return reply.code(404).send(fail("id", "Run not found.", "exists"));
    }
    const run = detail.run;

    const cancelledRun = (await cancelRunExecution({ runId: run.id })) ?? run;
    if (run.orchestration.workflowId) {
      const cancelResult = await cancelTemporalRunWorkflow(run.orchestration.workflowId);
      if (!cancelResult.success) {
        cancelledRun.orchestration.lastError = cancelResult.error;
      }
    }

    await insertAuditEvent({
      organizationId: authContext.organization.id,
      workspaceId: authContext.workspace.id,
      userId: authContext.user.id,
      eventType: "run.cancelled",
      entityType: "run",
      entityId: cancelledRun.id,
      payload: {
        orchestration: cancelledRun.orchestration,
      },
    });

    return reply.send(ok(cancelledRun));
  });

  app.get("/events/webhooks/whatsapp", async (request, reply) => {
    const query = request.query as {
      "hub.mode"?: string;
      "hub.verify_token"?: string;
      "hub.challenge"?: string;
    };

    if (query["hub.mode"] !== "subscribe" || !query["hub.verify_token"] || !query["hub.challenge"]) {
      return reply.code(400).send("Invalid WhatsApp webhook verification request.");
    }

    const integration =
      getStore().organizationIntegrations.find((candidate) => {
        if (candidate.providerKey !== WHATSAPP_PROVIDER_KEY) {
          return false;
        }
        return getWhatsAppConfig(candidate).verifyToken === query["hub.verify_token"];
      }) ?? null;

    if (!integration) {
      return reply.code(403).send("Webhook verification failed.");
    }

    integration.metadata = withStoredIntegrationMetadata({
      ...integration.metadata,
      webhookVerifiedAt: nowIso(),
    });
    integration.updatedAt = nowIso();

    recordAuditEvent({
      organizationId: integration.organizationId,
      workspaceId: null,
      userId: integration.createdByUserId,
      eventType: "integration.webhook_verified",
      entityType: "organization_integration",
      entityId: integration.id,
      payload: {
        providerKey: integration.providerKey,
        phoneNumberId: getWhatsAppConfig(integration).phoneNumberId,
      },
    });

    return reply.type("text/plain").send(query["hub.challenge"]);
  });

  app.post(
    "/events/webhooks/:provider",
    {
      config: {
        rawBody: true,
      },
    },
    async (request, reply) => {
      const provider = findIntegrationProvider((request.params as { provider: string }).provider);
      if (!provider) {
        return reply.code(404).send(fail("provider", "Integration provider not found.", "exists"));
      }

      if (provider.key === WHATSAPP_PROVIDER_KEY) {
        const payload =
          typeof request.body === "object" && request.body ? (request.body as Record<string, unknown>) : null;
        const integration = getWhatsAppIntegrationForWebhook(payload);
        if (!integration) {
          return reply.code(404).send(fail("provider", "No connected WhatsApp install matched this event.", "exists"));
        }

        const signatureHeader = request.headers["x-hub-signature-256"];
        const rawBody = String((request as { rawBody?: string }).rawBody ?? "");
        const config = getWhatsAppConfig(integration);
        if (!rawBody || !config.appSecret) {
          return reply.code(400).send(fail("provider", "WhatsApp webhook signature could not be verified.", "auth"));
        }

        const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
        if (!verifyWhatsAppWebhookSignature({ rawBody, signatureHeader: signature, appSecret: config.appSecret })) {
          return reply.code(401).send(fail("provider", "WhatsApp webhook signature was invalid.", "auth"));
        }

        recordAuditEvent({
          organizationId: integration.organizationId,
          workspaceId: null,
          userId: null,
          eventType: "integration.webhook_received",
          entityType: "organization_integration",
          entityId: integration.id,
          payload: {
            providerKey: integration.providerKey,
            phoneNumberId: config.phoneNumberId,
          },
        });

        integration.metadata = withStoredIntegrationMetadata({
          ...integration.metadata,
          lastWebhookEventAt: nowIso(),
        });
        integration.updatedAt = nowIso();

        return reply.code(202).send(
          ok({
            accepted: true,
            provider: provider.key,
            eventId: createId("event"),
            integrationId: integration.id,
          }),
        );
      }

      return reply.code(202).send(
        ok({
          accepted: true,
          provider: provider.key,
          eventId: createId("event"),
        }),
      );
    },
  );

  app.get("/audit-events", async (request, reply) => {
    const authContext = await requireSession(request, reply);
    if (!authContext) {
      return;
    }

    return reply.send(
      ok(
        await listAuditEventsByWorkspace({
          organizationId: authContext.organization.id,
          workspaceId: authContext.workspace.id,
        }),
      ),
    );
  });
};
