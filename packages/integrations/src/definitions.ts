import type { IntegrationProvider } from "@agent-marketplace/contracts";

export interface IntegrationToolDefinition {
  key: string;
  name: string;
  description: string;
  examples?: string[];
  writeScoped?: boolean;
}

export interface IntegrationProviderDefinition extends Omit<IntegrationProvider, "tools"> {
  toolDefinitions: IntegrationToolDefinition[];
}

export const toIntegrationProvider = (
  definition: IntegrationProviderDefinition,
): IntegrationProvider => ({
  key: definition.key,
  name: definition.name,
  description: definition.description,
  category: definition.category,
  authType: definition.authType,
  tools: definition.toolDefinitions.map((tool) => tool.key),
  setupMode: definition.setupMode,
});
