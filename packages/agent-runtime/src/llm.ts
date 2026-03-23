import {
  draftGenerationResultSchema,
  runPlanSchema,
  type DraftGenerationResult,
  type ModelProviderKey,
  type OrganizationIntegration,
  type RunPlan,
} from "@agent-marketplace/contracts";
import { findIntegrationToolDefinitions } from "@agent-marketplace/integrations";

const MODEL_PROVIDER_KEYS: ModelProviderKey[] = ["openai", "anthropic", "grok"];
const DEFAULT_MODELS: Record<ModelProviderKey, string> = {
  openai: "gpt-4.1-mini",
  anthropic: "claude-3-5-sonnet-latest",
  grok: "grok-3-mini",
};

const OPENAI_COMPATIBLE_BASE_URLS: Record<Exclude<ModelProviderKey, "anthropic">, string> = {
  openai: "https://api.openai.com/v1",
  grok: "https://api.x.ai/v1",
};

const runPlanJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "summary",
    "plannedActions",
    "requestedActions",
    "executableTools",
    "missingGrantTools",
    "plannerMode",
    "modelProviderKey",
    "modelName",
    "clarifications",
    "steps",
  ],
  properties: {
    summary: { type: "string" },
    plannedActions: {
      type: "array",
      items: { type: "string" },
    },
    requestedActions: {
      type: "array",
      items: { type: "string" },
    },
    executableTools: {
      type: "array",
      items: { type: "string" },
    },
    missingGrantTools: {
      type: "array",
      items: { type: "string" },
    },
    plannerMode: {
      type: "string",
      enum: ["llm", "fallback"],
    },
    modelProviderKey: {
      anyOf: [{ type: "string", enum: MODEL_PROVIDER_KEYS }, { type: "null" }],
    },
    modelName: {
      anyOf: [{ type: "string" }, { type: "null" }],
    },
    clarifications: {
      type: "array",
      items: { type: "string" },
    },
    steps: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "title", "objective", "tool", "dependsOn", "requiresApproval", "kind"],
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          objective: { type: "string" },
          tool: {
            anyOf: [{ type: "string" }, { type: "null" }],
          },
          dependsOn: {
            type: "array",
            items: { type: "string" },
          },
          requiresApproval: { type: "boolean" },
          kind: {
            type: "string",
            enum: ["reason", "tool_call", "approval", "output"],
          },
        },
      },
    },
  },
} as const;

const draftGenerationJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["generatedAgents", "clarifications", "plannerMode", "modelProviderKey", "modelName"],
  properties: {
    generatedAgents: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "roleName",
          "mission",
          "responsibilities",
          "allowedTools",
          "knowledgeSources",
          "triggerModes",
          "approvalPolicy",
          "successMetrics",
          "constraints",
        ],
        properties: {
          id: { type: "string" },
          roleName: { type: "string" },
          mission: { type: "string" },
          responsibilities: { type: "array", items: { type: "string" } },
          allowedTools: { type: "array", items: { type: "string" } },
          knowledgeSources: { type: "array", items: { type: "string" } },
          triggerModes: {
            type: "array",
            items: {
              type: "string",
              enum: ["manual", "scheduled", "webhook", "integration_event"],
            },
          },
          approvalPolicy: {
            type: "string",
            enum: ["not_required", "required"],
          },
          successMetrics: { type: "array", items: { type: "string" } },
          constraints: { type: "array", items: { type: "string" } },
        },
      },
    },
    clarifications: {
      type: "array",
      items: { type: "string" },
    },
    plannerMode: {
      type: "string",
      enum: ["llm", "fallback"],
    },
    modelProviderKey: {
      anyOf: [{ type: "string", enum: MODEL_PROVIDER_KEYS }, { type: "null" }],
    },
    modelName: {
      anyOf: [{ type: "string" }, { type: "null" }],
    },
  },
} as const;

type PlannerModelIntegration = {
  integration: OrganizationIntegration;
  providerKey: ModelProviderKey;
  modelName: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const extractApiKey = (integration: OrganizationIntegration) => {
  const metadata = integration.metadata;
  if (!isRecord(metadata)) {
    return null;
  }

  for (const candidate of ["apiKey", "api_key", "token", "secret"]) {
    const value = metadata[candidate];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
};

const getConfiguredModel = (integration: OrganizationIntegration, providerKey: ModelProviderKey) => {
  const metadata = integration.metadata;
  if (isRecord(metadata)) {
    const configured = metadata.defaultModel;
    if (typeof configured === "string" && configured.trim()) {
      return configured.trim();
    }
  }

  return DEFAULT_MODELS[providerKey];
};

const prefersPlanning = (integration: OrganizationIntegration) => {
  const metadata = integration.metadata;
  return isRecord(metadata) && metadata.defaultForPlanning === true;
};

const getOpenAiCompatibleBaseUrl = (integration: OrganizationIntegration, providerKey: "openai" | "grok") => {
  const metadata = integration.metadata;
  if (isRecord(metadata)) {
    const configured = metadata.baseUrl;
    if (typeof configured === "string" && configured.trim()) {
      return configured.trim().replace(/\/+$/, "");
    }
  }

  return OPENAI_COMPATIBLE_BASE_URLS[providerKey];
};

const stringifyToolCatalog = (integrations: OrganizationIntegration[]) => {
  const lines = integrations.map((integration) => {
    const toolDefinitions = findIntegrationToolDefinitions(integration.providerKey);
    const scopedTools = toolDefinitions.filter(
      (tool) => !integration.scopes.length || integration.scopes.includes(tool.key),
    );

    if (!scopedTools.length) {
      return `${integration.providerKey}: no usable tools granted`;
    }

    return `${integration.providerKey}: ${scopedTools
      .map((tool) => `${tool.key} (${tool.description})`)
      .join("; ")}`;
  });

  return lines.length ? lines.join("\n") : "No connected integrations are currently available.";
};

const extractJsonText = (value: unknown): string => {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }
        if (isRecord(item) && typeof item.text === "string") {
          return item.text;
        }
        return "";
      })
      .join("");
  }

  return "";
};

const parseJsonObject = (text: string) => {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("Model response was empty.");
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      throw new Error("Model response did not contain valid JSON.");
    }

    return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
  }
};

const callOpenAiCompatibleJson = async ({
  integration,
  providerKey,
  schemaName,
  schema,
  systemPrompt,
  userPrompt,
}: {
  integration: OrganizationIntegration;
  providerKey: "openai" | "grok";
  schemaName: string;
  schema: Record<string, unknown>;
  systemPrompt: string;
  userPrompt: string;
}) => {
  const apiKey = extractApiKey(integration);
  if (!apiKey) {
    throw new Error(`${providerKey} integration is missing an apiKey.`);
  }

  const response = await fetch(`${getOpenAiCompatibleBaseUrl(integration, providerKey)}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: getConfiguredModel(integration, providerKey),
      temperature: 0.2,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: schemaName,
          strict: true,
          schema,
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`${providerKey} request failed: ${response.status} ${await response.text()}`);
  }

  const payload = (await response.json()) as Record<string, unknown>;
  const choices = payload.choices;
  if (!Array.isArray(choices) || !choices.length || !isRecord(choices[0])) {
    throw new Error(`${providerKey} response did not contain a completion choice.`);
  }

  const message = isRecord(choices[0].message) ? choices[0].message : null;
  const content = message ? extractJsonText(message.content) : "";
  return parseJsonObject(content);
};

const callAnthropicJson = async ({
  integration,
  schema,
  systemPrompt,
  userPrompt,
}: {
  integration: OrganizationIntegration;
  schema: Record<string, unknown>;
  systemPrompt: string;
  userPrompt: string;
}) => {
  const apiKey = extractApiKey(integration);
  if (!apiKey) {
    throw new Error("Anthropic integration is missing an apiKey.");
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: getConfiguredModel(integration, "anthropic"),
      max_tokens: 1800,
      temperature: 0.2,
      system: `${systemPrompt}\nReturn JSON only. Match this schema exactly: ${JSON.stringify(schema)}`,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!response.ok) {
    throw new Error(`anthropic request failed: ${response.status} ${await response.text()}`);
  }

  const payload = (await response.json()) as Record<string, unknown>;
  const content = payload.content;
  if (!Array.isArray(content) || !content.length || !isRecord(content[0])) {
    throw new Error("Anthropic response did not contain content.");
  }

  return parseJsonObject(extractJsonText(content));
};

const callStructuredModel = async ({
  planner,
  schemaName,
  schema,
  systemPrompt,
  userPrompt,
}: {
  planner: PlannerModelIntegration;
  schemaName: string;
  schema: Record<string, unknown>;
  systemPrompt: string;
  userPrompt: string;
}) => {
  switch (planner.providerKey) {
    case "openai":
    case "grok":
      return callOpenAiCompatibleJson({
        integration: planner.integration,
        providerKey: planner.providerKey,
        schemaName,
        schema,
        systemPrompt,
        userPrompt,
      });
    case "anthropic":
      return callAnthropicJson({
        integration: planner.integration,
        schema,
        systemPrompt,
        userPrompt,
      });
  }
};

export const isModelProviderKey = (value: string): value is ModelProviderKey =>
  MODEL_PROVIDER_KEYS.includes(value as ModelProviderKey);

const toPlannerModelIntegration = (
  integration: OrganizationIntegration,
  options?: { requireConnected?: boolean },
): PlannerModelIntegration | null => {
  if (!isModelProviderKey(integration.providerKey)) {
    return null;
  }

  if (options?.requireConnected !== false && integration.status !== "connected") {
    return null;
  }

  const providerKey = integration.providerKey as ModelProviderKey;
  if (!extractApiKey(integration)) {
    return null;
  }

  return {
    integration,
    providerKey,
    modelName: getConfiguredModel(integration, providerKey),
  };
};

export const selectPlannerModelIntegration = (
  integrations: OrganizationIntegration[],
): PlannerModelIntegration | null => {
  const candidates = integrations
    .map((integration) => toPlannerModelIntegration(integration))
    .filter((integration): integration is PlannerModelIntegration => integration !== null)
    .sort((left, right) => {
      const planningBias = Number(prefersPlanning(right.integration)) - Number(prefersPlanning(left.integration));
      if (planningBias !== 0) {
        return planningBias;
      }

      return (right.integration.lastValidatedAt ?? "").localeCompare(left.integration.lastValidatedAt ?? "");
    });

  if (!candidates.length) {
    return null;
  }

  return candidates[0];
};

export const generateDraftsWithModel = async ({
  brief,
  integrations,
}: {
  brief: string;
  integrations: OrganizationIntegration[];
}): Promise<DraftGenerationResult | null> => {
  const planner = selectPlannerModelIntegration(integrations);
  if (!planner) {
    return null;
  }

  const systemPrompt =
    "You design small digital teams for an agent marketplace. Build typed agent drafts that cover real operational jobs. Keep agents concrete, narrow, and useful. Prefer 2-4 agents. Use available tools only when they meaningfully help.";
  const userPrompt = [
    `Business brief:\n${brief}`,
    `Connected integrations and currently installed scopes:\n${stringifyToolCatalog(integrations)}`,
    "Return only JSON matching the requested schema. Use tool keys exactly as listed. Trigger modes should usually be manual plus integration_event unless the brief clearly calls for scheduled work. Mark approvalPolicy as required whenever an agent includes customer-visible or system-writing tools.",
  ].join("\n\n");

  try {
    const payload = await callStructuredModel({
      planner,
      schemaName: "agent_team_draft_result",
      schema: draftGenerationJsonSchema as unknown as Record<string, unknown>,
      systemPrompt,
      userPrompt,
    });

    const normalizedPayload =
      isRecord(payload)
        ? {
            ...payload,
            plannerMode: "llm",
            modelProviderKey: planner.providerKey,
            modelName: planner.modelName,
          }
        : payload;

    const parsed = draftGenerationResultSchema.safeParse(normalizedPayload);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? "Draft generation JSON did not validate.");
    }

    return {
      ...parsed.data,
      plannerMode: "llm",
      modelProviderKey: planner.providerKey,
      modelName: planner.modelName,
    };
  } catch {
    return null;
  }
};

export const generateRunPlanWithModel = async ({
  mission,
  prompt,
  executableTools,
  missingGrantTools,
  integrations,
}: {
  mission: string;
  prompt?: string;
  executableTools: string[];
  missingGrantTools: string[];
  integrations: OrganizationIntegration[];
}): Promise<RunPlan | null> => {
  const planner = selectPlannerModelIntegration(integrations);
  if (!planner) {
    return null;
  }

  const systemPrompt =
    "You are an execution planner for an agent operating system. Produce a strict, tool-aware run plan. Prefer the smallest set of steps that can complete the job. Never use tools outside the executableTools list. If a write-like tool appears, mark the step as requiresApproval=true.";
  const userPrompt = [
    `Agent mission:\n${mission}`,
    `Operator prompt:\n${prompt ?? "Use the latest agent context and workspace brief."}`,
    `Executable tools:\n${executableTools.join(", ") || "none"}`,
    `Missing or ungranted tools:\n${missingGrantTools.join(", ") || "none"}`,
    `Connected integration scopes:\n${stringifyToolCatalog(integrations)}`,
    "Return only JSON matching the requested schema. Every tool_call step must reference one executable tool or null if no tool is needed.",
  ].join("\n\n");

  try {
    const payload = await callStructuredModel({
      planner,
      schemaName: "agent_run_plan",
      schema: runPlanJsonSchema as unknown as Record<string, unknown>,
      systemPrompt,
      userPrompt,
    });

    const normalizedPayload =
      isRecord(payload)
        ? {
            ...payload,
            plannerMode: "llm",
            modelProviderKey: planner.providerKey,
            modelName: planner.modelName,
          }
        : payload;

    const parsed = runPlanSchema.safeParse(normalizedPayload);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? "Run plan JSON did not validate.");
    }

    return {
      ...parsed.data,
      plannerMode: "llm",
      modelProviderKey: planner.providerKey,
      modelName: planner.modelName,
    };
  } catch {
    return null;
  }
};

export const testPlannerModelIntegration = async (integration: OrganizationIntegration) => {
  if (!isModelProviderKey(integration.providerKey)) {
    return {
      healthy: false,
      error: "Integration is not a supported model provider.",
      modelProviderKey: null,
      modelName: null,
    };
  }

  const planner = toPlannerModelIntegration(integration, { requireConnected: false });
  if (!planner) {
    return {
      healthy: false,
      error: "Model integration is missing a usable apiKey.",
      modelProviderKey: integration.providerKey,
      modelName: null,
    };
  }

  try {
    const payload = await callStructuredModel({
      planner,
      schemaName: "planner_probe",
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["ok"],
        properties: {
          ok: { type: "boolean" },
        },
      },
      systemPrompt: "Return a tiny JSON payload that proves the model can follow a schema.",
      userPrompt: "Respond with {\"ok\": true}.",
    });

    return {
      healthy: isRecord(payload) && payload.ok === true,
      error: null,
      modelProviderKey: planner.providerKey,
      modelName: planner.modelName,
    };
  } catch (error) {
    return {
      healthy: false,
      error: error instanceof Error ? error.message : "Unknown model provider error.",
      modelProviderKey: planner.providerKey,
      modelName: planner.modelName,
    };
  }
};
