import { toIntegrationProvider, type IntegrationProviderDefinition } from "../definitions";

export const openAiDefinition: IntegrationProviderDefinition = {
  key: "openai",
  name: "OpenAI",
  description: "Customer-supplied OpenAI API keys for planning, drafting, extraction, and review.",
  category: "model",
  authType: "api_key",
  setupMode: "api_key",
  toolDefinitions: [
    {
      key: "llm.plan",
      name: "Plan work",
      description: "Turn a business goal into a structured execution plan across connected tools.",
      examples: ["Decompose collections workflow", "Plan leasing follow-up run", "Draft agent team plan"],
    },
    {
      key: "llm.draft",
      name: "Draft content",
      description: "Draft customer-ready or operator-facing copy before any external send action.",
      examples: ["Draft resident email", "Prepare renewal note", "Write escalation summary"],
    },
    {
      key: "llm.extract",
      name: "Extract structured data",
      description: "Extract names, dates, statuses, and fields from unstructured text.",
      examples: ["Parse invoice details", "Extract work-order facts", "Normalize lead intake"],
    },
    {
      key: "llm.review",
      name: "Review work",
      description: "Review drafts and plans for completeness, risk, and missing context.",
      examples: ["Review outbound draft", "Check approval rationale", "Evaluate handoff note"],
    },
  ],
};

export const openAiProvider = toIntegrationProvider(openAiDefinition);
