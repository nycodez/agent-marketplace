import { toIntegrationProvider, type IntegrationProviderDefinition } from "../definitions";

export const geminiDefinition: IntegrationProviderDefinition = {
  key: "gemini",
  name: "Google Gemini",
  description: "Customer-supplied Gemini API keys for planning, drafting, extraction, and review.",
  category: "model",
  authType: "api_key",
  setupMode: "api_key",
  toolDefinitions: [
    {
      key: "llm.plan",
      name: "Plan work",
      description: "Generate structured cross-system run plans from a business goal and the connected toolset.",
      examples: ["Plan payables workflow", "Map collections run", "Build leasing response flow"],
    },
    {
      key: "llm.draft",
      name: "Draft content",
      description: "Draft operator notes, customer-ready messages, and approval-ready summaries.",
      examples: ["Draft invoice reminder", "Prepare resident update", "Write handoff summary"],
    },
    {
      key: "llm.extract",
      name: "Extract structured data",
      description: "Extract structured fields from inbox items, tickets, and uploaded text.",
      examples: ["Extract due date", "Parse lease facts", "Normalize vendor request"],
    },
    {
      key: "llm.review",
      name: "Review work",
      description: "Review plans and drafts for missing data, risk, and execution readiness.",
      examples: ["Review outbound draft", "Check approval reasoning", "Assess plan completeness"],
    },
  ],
};

export const geminiProvider = toIntegrationProvider(geminiDefinition);
