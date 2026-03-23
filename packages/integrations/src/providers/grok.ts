import { toIntegrationProvider, type IntegrationProviderDefinition } from "../definitions";

export const grokDefinition: IntegrationProviderDefinition = {
  key: "grok",
  name: "Grok",
  description: "Customer-supplied Grok API keys for structured planning, drafting, and extraction.",
  category: "model",
  authType: "api_key",
  setupMode: "api_key",
  toolDefinitions: [
    {
      key: "llm.plan",
      name: "Plan work",
      description: "Generate structured plans that span multiple integrations and approval boundaries.",
      examples: ["Plan cross-system follow-up", "Build collections sequence", "Map dispatch handoff"],
    },
    {
      key: "llm.draft",
      name: "Draft content",
      description: "Produce drafts, summaries, and operator notes using the customer-provided model key.",
      examples: ["Draft collection email", "Prepare Slack escalation", "Write customer summary"],
    },
    {
      key: "llm.extract",
      name: "Extract structured data",
      description: "Extract structured fields from text or event payloads for downstream tools.",
      examples: ["Extract lease date", "Parse invoice number", "Classify maintenance severity"],
    },
    {
      key: "llm.review",
      name: "Review work",
      description: "Review an action plan or draft before human approval or execution.",
      examples: ["Check approval request", "Review draft quality", "Spot missing data"],
    },
  ],
};

export const grokProvider = toIntegrationProvider(grokDefinition);
