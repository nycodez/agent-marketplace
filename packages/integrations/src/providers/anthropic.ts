import { toIntegrationProvider, type IntegrationProviderDefinition } from "../definitions";

export const anthropicDefinition: IntegrationProviderDefinition = {
  key: "anthropic",
  name: "Claude",
  description: "Customer-supplied Claude API keys for structured planning, drafting, and review.",
  category: "model",
  authType: "api_key",
  setupMode: "api_key",
  toolDefinitions: [
    {
      key: "llm.plan",
      name: "Plan work",
      description: "Generate multi-step plans that coordinate several integrations to complete one job.",
      examples: ["Plan maintenance triage", "Map receivables workflow", "Decompose collections run"],
    },
    {
      key: "llm.draft",
      name: "Draft content",
      description: "Draft customer-ready updates, follow-ups, and operator-facing notes.",
      examples: ["Draft support reply", "Write payment reminder", "Prepare renewal outreach"],
    },
    {
      key: "llm.extract",
      name: "Extract structured data",
      description: "Extract structured facts from emails, tickets, and uploaded text.",
      examples: ["Extract due date", "Parse issue severity", "Normalize contact data"],
    },
    {
      key: "llm.review",
      name: "Review work",
      description: "Review plans and drafts for gaps before they move to approval or execution.",
      examples: ["Review escalation note", "Check outbound draft", "Assess plan completeness"],
    },
  ],
};

export const anthropicProvider = toIntegrationProvider(anthropicDefinition);
