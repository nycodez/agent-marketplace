import { toIntegrationProvider, type IntegrationProviderDefinition } from "../definitions";

export const webhookDefinition: IntegrationProviderDefinition = {
  key: "webhook",
  name: "Webhook",
  description: "Receive inbound events from external systems.",
  category: "custom",
  authType: "webhook",
  setupMode: "webhook",
  toolDefinitions: [
    {
      key: "webhook.receive",
      name: "Receive inbound event",
      description: "Accept external system events that can trigger or enrich a team run.",
      examples: ["Receive ticket event", "Receive CRM webhook", "Receive custom trigger payload"],
    },
  ],
};

export const webhookProvider = toIntegrationProvider(webhookDefinition);
