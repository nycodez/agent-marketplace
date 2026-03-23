import { toIntegrationProvider, type IntegrationProviderDefinition } from "../definitions";

export const ollamaDefinition: IntegrationProviderDefinition = {
  key: "ollama",
  name: "Local Ollama",
  description: "Free local Docker-hosted Ollama models for planning, drafting, extraction, and review.",
  category: "model",
  authType: "api_key",
  setupMode: "api_key",
  toolDefinitions: [
    {
      key: "llm.plan",
      name: "Plan work",
      description: "Use a local model to turn an operating goal into a structured run plan.",
      examples: ["Plan maintenance triage", "Map collections run", "Design receivables workflow"],
    },
    {
      key: "llm.draft",
      name: "Draft content",
      description: "Draft internal or customer-facing text with a local model endpoint.",
      examples: ["Draft support reply", "Prepare escalation note", "Write follow-up summary"],
    },
    {
      key: "llm.extract",
      name: "Extract structured data",
      description: "Extract normalized fields from emails, forms, and uploaded text locally.",
      examples: ["Extract work-order facts", "Parse invoice data", "Normalize lead details"],
    },
    {
      key: "llm.review",
      name: "Review work",
      description: "Review plans and drafts with a local model before approval or execution.",
      examples: ["Check draft quality", "Review operator note", "Spot missing context"],
    },
  ],
};

export const ollamaProvider = toIntegrationProvider(ollamaDefinition);
