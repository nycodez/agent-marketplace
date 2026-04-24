import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { appConfig } from "@agent-marketplace/config";
import type { ExecutionReceipt, OrganizationIntegration } from "@agent-marketplace/contracts";

export type ToolExecutionResult = {
  output: string | null;
  receipt: ExecutionReceipt;
};

export type ToolExecutionContext = {
  integration: OrganizationIntegration;
  tool: string;
  args: Record<string, unknown>;
  runtime?: {
    websiteCredential?: {
      id: string;
      label: string;
      origin: string;
      loginUrl: string;
      username: string;
      password: string;
      usernameSelector: string;
      passwordSelector: string;
      submitSelector: string | null;
      successSelector: string | null;
    } | null;
  };
};

export type ToolExecutionAdapter = {
  tool: string;
  execute: (context: ToolExecutionContext) => Promise<ToolExecutionResult>;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const requireString = (value: unknown, field: string) => {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} is required.`);
  }
  return value.trim();
};

const requireUrl = (value: unknown, field: string) => {
  const candidate = requireString(value, field);
  const parsed = new URL(candidate);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`${field} must use http or https.`);
  }
  return parsed;
};

const normalizeQuery = (value: unknown) => {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => entry !== undefined && entry !== null)
      .map(([key, entry]) => [key, String(entry)]),
  );
};

const normalizeHeaders = (value: unknown) => {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => typeof entry === "string" && entry.trim())
      .map(([key, entry]) => [key, String(entry).trim()]),
  );
};

const guessFilenameFromUrl = (value: string) => {
  try {
    const url = new URL(value);
    const segment = url.pathname.split("/").filter(Boolean).at(-1);
    return segment && segment.trim() ? segment : "download.bin";
  } catch {
    return "download.bin";
  }
};

const guessMimeTypeFromFilename = (filename: string) => {
  const normalized = filename.toLowerCase();
  if (normalized.endsWith(".pdf")) {
    return "application/pdf";
  }
  if (normalized.endsWith(".csv")) {
    return "text/csv";
  }
  if (normalized.endsWith(".json")) {
    return "application/json";
  }
  if (normalized.endsWith(".txt")) {
    return "text/plain";
  }
  return "application/octet-stream";
};

const buildTempDownloadPath = (filename: string) =>
  path.join(os.tmpdir(), `agent-marketplace-${crypto.randomUUID()}-${filename}`);

const parseResponseBody = async (response: Response) => {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return response.json();
  }
  return response.text();
};

const encodeBase64Url = (value: string) =>
  Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

const readOptionalRuntimeEnv = (name: string) => {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : null;
};

const getGoogleOauthConfig = () => {
  const clientId = readOptionalRuntimeEnv("GOOGLE_CLIENT_ID") ?? appConfig.googleClientId ?? null;
  const clientSecret =
    readOptionalRuntimeEnv("GOOGLE_CLIENT_SECRET") ?? appConfig.googleClientSecret ?? null;

  if (!clientId || !clientSecret) {
    throw new Error("Google Workspace OAuth environment is not configured.");
  }

  return { clientId, clientSecret };
};

const getGoogleRefreshToken = (integration: OrganizationIntegration) => {
  const refreshToken =
    typeof integration.metadata.refreshToken === "string" ? integration.metadata.refreshToken.trim() : "";
  if (!refreshToken) {
    throw new Error("Google Workspace refresh token is not configured for this install.");
  }
  return refreshToken;
};

const refreshGoogleAccessToken = async (integration: OrganizationIntegration) => {
  const { clientId, clientSecret } = getGoogleOauthConfig();
  const refreshToken = getGoogleRefreshToken(integration);
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    throw new Error(`Google token refresh failed: ${await response.text()}`);
  }

  const payload = (await response.json()) as Record<string, unknown>;
  const accessToken = typeof payload.access_token === "string" ? payload.access_token : null;
  if (!accessToken) {
    throw new Error("Google token refresh did not return an access token.");
  }
  return accessToken;
};

const buildScopedUrl = ({
  baseUrl,
  path,
  query,
}: {
  baseUrl: string;
  path: string;
  query: Record<string, string>;
}) => {
  if (/^https?:\/\//i.test(path) || path.startsWith("//")) {
    throw new Error("Generic API path must be relative to the configured baseUrl.");
  }

  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const base = new URL(normalizedBase);
  const url = new URL(path.replace(/^\/+/, ""), normalizedBase);

  if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) {
    throw new Error("Generic API request escaped the configured baseUrl scope.");
  }

  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }

  return url;
};

const genericApiExecute = async (
  method: "GET" | "POST" | "PATCH",
  context: ToolExecutionContext,
): Promise<ToolExecutionResult> => {
  const metadata = context.integration.metadata;
  const baseUrl = requireString(metadata.baseUrl, "metadata.baseUrl");
  const path = requireString(context.args.path, "path");
  const query = normalizeQuery(context.args.query);
  const body = isRecord(context.args.body) ? context.args.body : null;
  const headers = new Headers({
    accept: "application/json, text/plain;q=0.9, */*;q=0.8",
    ...normalizeHeaders(metadata.headers),
    ...normalizeHeaders(context.args.headers),
  });

  const apiKey = typeof metadata.apiKey === "string" ? metadata.apiKey.trim() : "";
  if (apiKey && !headers.has("authorization")) {
    headers.set("authorization", `Bearer ${apiKey}`);
  }
  if (body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const timeoutMs =
    typeof metadata.timeoutMs === "number" && Number.isFinite(metadata.timeoutMs)
      ? Math.max(1_000, metadata.timeoutMs)
      : 10_000;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const url = buildScopedUrl({ baseUrl, path, query });
    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const data = await parseResponseBody(response);

    if (!response.ok) {
      throw new Error(
        `Generic API ${method} failed with ${response.status}${typeof data === "string" ? `: ${data}` : ""}`,
      );
    }

    return {
      output: typeof data === "string" ? data : JSON.stringify(data, null, 2),
      receipt: {
        providerKey: context.integration.providerKey,
        tool: context.tool,
        summary: `${method} ${url.pathname}`,
        data: {
          method,
          url: url.toString(),
          status: response.status,
          response: data,
        },
      },
    };
  } finally {
    clearTimeout(timeout);
  }
};

const callSlack = async ({
  token,
  path,
  body,
}: {
  token: string;
  path: string;
  body?: Record<string, unknown>;
}) => {
  const response = await fetch(`https://slack.com/api/${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(body ?? {}),
  });

  const data = (await response.json()) as Record<string, unknown>;
  if (!response.ok || data.ok !== true) {
    throw new Error(typeof data.error === "string" ? data.error : `Slack API request failed for ${path}.`);
  }
  return data;
};

const slackExecute = async (context: ToolExecutionContext): Promise<ToolExecutionResult> => {
  const metadata = context.integration.metadata;
  const botToken = requireString(metadata.botToken, "metadata.botToken");
  const defaultChannelId =
    typeof metadata.defaultChannelId === "string" && metadata.defaultChannelId.trim()
      ? metadata.defaultChannelId.trim()
      : null;

  switch (context.tool) {
    case "slack.read": {
      const channelId =
        typeof context.args.channelId === "string" && context.args.channelId.trim()
          ? context.args.channelId.trim()
          : defaultChannelId;
      if (!channelId) {
        throw new Error("channelId is required when no metadata.defaultChannelId is configured.");
      }

      const limit =
        typeof context.args.limit === "number" && Number.isFinite(context.args.limit)
          ? Math.max(1, Math.min(200, Math.trunc(context.args.limit)))
          : 10;
      const threadTs =
        typeof context.args.threadTs === "string" && context.args.threadTs.trim()
          ? context.args.threadTs.trim()
          : null;
      const data = await callSlack({
        token: botToken,
        path: threadTs ? "conversations.replies" : "conversations.history",
        body: threadTs ? { channel: channelId, ts: threadTs, limit } : { channel: channelId, limit },
      });

      return {
        output: JSON.stringify(data, null, 2),
        receipt: {
          providerKey: context.integration.providerKey,
          tool: context.tool,
          summary: `Read Slack ${threadTs ? "thread" : "channel"} ${channelId}`,
          data,
        },
      };
    }
    case "slack.post":
    case "slack.thread": {
      const channelId =
        typeof context.args.channelId === "string" && context.args.channelId.trim()
          ? context.args.channelId.trim()
          : defaultChannelId;
      if (!channelId) {
        throw new Error("channelId is required when no metadata.defaultChannelId is configured.");
      }

      const text = requireString(context.args.text, "text");
      const threadTs =
        context.tool === "slack.thread"
          ? requireString(context.args.threadTs, "threadTs")
          : typeof context.args.threadTs === "string" && context.args.threadTs.trim()
            ? context.args.threadTs.trim()
            : undefined;

      const data = await callSlack({
        token: botToken,
        path: "chat.postMessage",
        body: {
          channel: channelId,
          text,
          ...(threadTs ? { thread_ts: threadTs } : {}),
        },
      });

      return {
        output: text,
        receipt: {
          providerKey: context.integration.providerKey,
          tool: context.tool,
          summary: `Posted Slack message to ${channelId}`,
          data,
        },
      };
    }
    default:
      throw new Error(`Slack adapter does not support ${context.tool}.`);
  }
};

const gmailSendExecute = async (context: ToolExecutionContext): Promise<ToolExecutionResult> => {
  const accessToken = await refreshGoogleAccessToken(context.integration);
  const to = requireString(context.args.to, "to");
  const subject = requireString(context.args.subject, "subject");
  const text =
    typeof context.args.text === "string" && context.args.text.trim()
      ? context.args.text.trim()
      : null;
  const html =
    typeof context.args.html === "string" && context.args.html.trim()
      ? context.args.html.trim()
      : null;
  const cc =
    typeof context.args.cc === "string" && context.args.cc.trim() ? context.args.cc.trim() : null;
  const bcc =
    typeof context.args.bcc === "string" && context.args.bcc.trim() ? context.args.bcc.trim() : null;
  const replyTo =
    typeof context.args.replyTo === "string" && context.args.replyTo.trim()
      ? context.args.replyTo.trim()
      : null;

  if (!text && !html) {
    throw new Error("Either text or html is required for gmail.send.");
  }

  const headers = [
    `To: ${to}`,
    `Subject: ${subject}`,
    ...(cc ? [`Cc: ${cc}`] : []),
    ...(bcc ? [`Bcc: ${bcc}`] : []),
    ...(replyTo ? [`Reply-To: ${replyTo}`] : []),
    "MIME-Version: 1.0",
    `Content-Type: ${html ? "text/html; charset=UTF-8" : "text/plain; charset=UTF-8"}`,
    "",
    html ?? text!,
  ];

  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      raw: encodeBase64Url(headers.join("\r\n")),
    }),
  });

  const data = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(
      typeof data.error === "object" && data.error && "message" in data.error
        ? String((data.error as { message?: unknown }).message ?? "Gmail send failed.")
        : "Gmail send failed.",
    );
  }

  return {
    output: text ?? html,
    receipt: {
      providerKey: context.integration.providerKey,
      tool: context.tool,
      summary: `Sent Gmail message to ${to}`,
      data: {
        to,
        subject,
        id: typeof data.id === "string" ? data.id : null,
        threadId: typeof data.threadId === "string" ? data.threadId : null,
      },
    },
  };
};

const browserVisitExecute = async (context: ToolExecutionContext): Promise<ToolExecutionResult> => {
  const targetUrl = requireUrl(context.args.url, "url");
  const waitForSelector =
    typeof context.args.waitForSelector === "string" && context.args.waitForSelector.trim()
      ? context.args.waitForSelector.trim()
      : null;
  const captureSelector =
    typeof context.args.captureSelector === "string" && context.args.captureSelector.trim()
      ? context.args.captureSelector.trim()
      : null;
  const timeoutMs =
    typeof context.integration.metadata.timeoutMs === "number" && Number.isFinite(context.integration.metadata.timeoutMs)
      ? Math.max(1_000, Math.trunc(context.integration.metadata.timeoutMs))
      : 20_000;
  const headless =
    typeof context.integration.metadata.headless === "boolean"
      ? context.integration.metadata.headless
      : true;
  const websiteCredential = context.runtime?.websiteCredential ?? null;

  if (websiteCredential && targetUrl.origin !== websiteCredential.origin) {
    throw new Error(
      `Credential ${websiteCredential.label} is scoped to ${websiteCredential.origin}, not ${targetUrl.origin}.`,
    );
  }

  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless });

  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(timeoutMs);

    if (websiteCredential) {
      await page.goto(websiteCredential.loginUrl, { waitUntil: "domcontentloaded" });
      await page.locator(websiteCredential.usernameSelector).fill(websiteCredential.username);
      await page.locator(websiteCredential.passwordSelector).fill(websiteCredential.password);
      if (websiteCredential.submitSelector) {
        await page.locator(websiteCredential.submitSelector).click();
      } else {
        await page.locator(websiteCredential.passwordSelector).press("Enter");
      }

      if (websiteCredential.successSelector) {
        await page.locator(websiteCredential.successSelector).waitFor({ state: "visible" });
      } else {
        await page.waitForLoadState("networkidle");
      }
    }

    await page.goto(targetUrl.toString(), { waitUntil: "domcontentloaded" });
    if (waitForSelector) {
      await page.locator(waitForSelector).waitFor({ state: "visible" });
    } else {
      await page.waitForLoadState("networkidle");
    }

    const title = await page.title();
    const bodyText = captureSelector
      ? await page.locator(captureSelector).innerText()
      : await page.locator("body").innerText();
    const excerpt = bodyText.trim().slice(0, 5_000);
    const finalUrl = page.url();

    return {
      output: excerpt || null,
      receipt: {
        providerKey: context.integration.providerKey,
        tool: context.tool,
        summary: `Visited ${new URL(finalUrl).hostname}${captureSelector ? ` with ${captureSelector}` : ""}`,
        data: {
          title,
          url: finalUrl,
          excerpt,
          authenticated: !!websiteCredential,
          credentialLabel: websiteCredential?.label ?? null,
          captureSelector,
          waitForSelector,
        },
      },
    };
  } finally {
    await browser.close();
  }
};

const browserDownloadExecute = async (context: ToolExecutionContext): Promise<ToolExecutionResult> => {
  const targetUrl =
    typeof context.args.url === "string" && context.args.url.trim()
      ? requireUrl(context.args.url, "url")
      : null;
  const fileUrl =
    typeof context.args.fileUrl === "string" && context.args.fileUrl.trim()
      ? requireUrl(context.args.fileUrl, "fileUrl")
      : null;
  const waitForSelector =
    typeof context.args.waitForSelector === "string" && context.args.waitForSelector.trim()
      ? context.args.waitForSelector.trim()
      : null;
  const downloadSelector =
    typeof context.args.downloadSelector === "string" && context.args.downloadSelector.trim()
      ? context.args.downloadSelector.trim()
      : null;
  const timeoutMs =
    typeof context.integration.metadata.timeoutMs === "number" && Number.isFinite(context.integration.metadata.timeoutMs)
      ? Math.max(1_000, Math.trunc(context.integration.metadata.timeoutMs))
      : 20_000;
  const headless =
    typeof context.integration.metadata.headless === "boolean"
      ? context.integration.metadata.headless
      : true;
  const websiteCredential = context.runtime?.websiteCredential ?? null;
  const scopedOrigin = websiteCredential?.origin ?? null;

  if (!targetUrl && !fileUrl) {
    throw new Error("browser.download requires url or fileUrl.");
  }

  const validateScopedUrl = (url: URL) => {
    if (scopedOrigin && url.origin !== scopedOrigin) {
      throw new Error(`Credential ${websiteCredential!.label} is scoped to ${scopedOrigin}, not ${url.origin}.`);
    }
  };

  if (targetUrl) {
    validateScopedUrl(targetUrl);
  }
  if (fileUrl) {
    validateScopedUrl(fileUrl);
  }

  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless });

  try {
    const page = await browser.newPage({ acceptDownloads: true });
    page.setDefaultTimeout(timeoutMs);

    if (websiteCredential) {
      await page.goto(websiteCredential.loginUrl, { waitUntil: "domcontentloaded" });
      await page.locator(websiteCredential.usernameSelector).fill(websiteCredential.username);
      await page.locator(websiteCredential.passwordSelector).fill(websiteCredential.password);
      if (websiteCredential.submitSelector) {
        await page.locator(websiteCredential.submitSelector).click();
      } else {
        await page.locator(websiteCredential.passwordSelector).press("Enter");
      }

      if (websiteCredential.successSelector) {
        await page.locator(websiteCredential.successSelector).waitFor({ state: "visible" });
      } else {
        await page.waitForLoadState("networkidle");
      }
    }

    let filename = "download.bin";
    let mimeType = "application/octet-stream";
    let tempPath = "";
    let byteLength = 0;
    let sha256 = "";
    let sourceUrl = fileUrl?.toString() ?? targetUrl?.toString() ?? null;

    if (downloadSelector) {
      if (!targetUrl) {
        throw new Error("url is required when browser.download uses downloadSelector.");
      }

      await page.goto(targetUrl.toString(), { waitUntil: "domcontentloaded" });
      if (waitForSelector) {
        await page.locator(waitForSelector).waitFor({ state: "visible" });
      } else {
        await page.waitForLoadState("networkidle");
      }

      const downloadPromise = page.waitForEvent("download", { timeout: timeoutMs });
      await page.locator(downloadSelector).click();
      const download = await downloadPromise;
      filename = download.suggestedFilename();
      tempPath = buildTempDownloadPath(filename);
      await download.saveAs(tempPath);
      const bytes = await fs.readFile(tempPath);
      byteLength = bytes.byteLength;
      sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
      mimeType = guessMimeTypeFromFilename(filename);
      const downloadUrl = download.url();
      sourceUrl = downloadUrl || sourceUrl;
    } else {
      const directUrl = fileUrl ?? targetUrl!;
      const response = await page.context().request.get(directUrl.toString());
      if (!response.ok()) {
        throw new Error(`File download failed with status ${response.status()}.`);
      }

      const bytes = await response.body();
      filename = guessFilenameFromUrl(directUrl.toString());
      tempPath = buildTempDownloadPath(filename);
      await fs.writeFile(tempPath, bytes);
      byteLength = bytes.byteLength;
      sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
      mimeType = response.headers()["content-type"] || guessMimeTypeFromFilename(filename);
    }

    return {
      output: `Downloaded ${filename} (${byteLength} bytes)`,
      receipt: {
        providerKey: context.integration.providerKey,
        tool: context.tool,
        summary: `Downloaded ${filename}`,
        data: {
          filename,
          mimeType,
          byteLength,
          sha256,
          tempPath,
          sourceUrl,
          authenticated: !!websiteCredential,
          credentialLabel: websiteCredential?.label ?? null,
        },
      },
    };
  } finally {
    await browser.close();
  }
};

const adapters: ToolExecutionAdapter[] = [
  {
    tool: "http.get",
    execute: (context) => genericApiExecute("GET", context),
  },
  {
    tool: "http.post",
    execute: (context) => genericApiExecute("POST", context),
  },
  {
    tool: "http.patch",
    execute: (context) => genericApiExecute("PATCH", context),
  },
  {
    tool: "slack.read",
    execute: slackExecute,
  },
  {
    tool: "slack.post",
    execute: slackExecute,
  },
  {
    tool: "slack.thread",
    execute: slackExecute,
  },
  {
    tool: "gmail.send",
    execute: gmailSendExecute,
  },
  {
    tool: "browser.visit",
    execute: browserVisitExecute,
  },
  {
    tool: "browser.download",
    execute: browserDownloadExecute,
  },
];

const adaptersByTool = new Map(adapters.map((adapter) => [adapter.tool, adapter]));

export const findToolExecutionAdapter = (tool: string) => adaptersByTool.get(tool) ?? null;
