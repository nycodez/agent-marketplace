import type { ExecutionReceipt, OrganizationIntegration } from "@agent-marketplace/contracts";

export type ToolExecutionResult = {
  output: string | null;
  receipt: ExecutionReceipt;
};

export type ToolExecutionContext = {
  integration: OrganizationIntegration;
  tool: string;
  args: Record<string, unknown>;
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

const parseResponseBody = async (response: Response) => {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return response.json();
  }
  return response.text();
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
];

const adaptersByTool = new Map(adapters.map((adapter) => [adapter.tool, adapter]));

export const findToolExecutionAdapter = (tool: string) => adaptersByTool.get(tool) ?? null;
