import type { IntegrationProvider } from "@agent-marketplace/contracts";

import type { IntegrationProviderDefinition, IntegrationToolDefinition } from "./definitions";
import {
  anthropicDefinition,
  anthropicProvider,
  arweaveDefinition,
  arweaveProvider,
  baseDefinition,
  baseProvider,
  geminiDefinition,
  geminiProvider,
  genericApiDefinition,
  genericApiProvider,
  grokDefinition,
  grokProvider,
  googleWorkspaceDefinition,
  googleWorkspaceProvider,
  hubSpotDefinition,
  hubSpotProvider,
  microsoft365Definition,
  microsoft365Provider,
  ollamaDefinition,
  ollamaProvider,
  openAiDefinition,
  openAiProvider,
  playwrightBrowserDefinition,
  playwrightBrowserProvider,
  salesforceDefinition,
  salesforceProvider,
  slackDefinition,
  slackProvider,
  smartsheetDefinition,
  smartsheetProvider,
  whatsappDefinition,
  whatsappProvider,
  webhookDefinition,
  webhookProvider,
} from "./providers";

const providerDefinitions: IntegrationProviderDefinition[] = [
  openAiDefinition,
  anthropicDefinition,
  grokDefinition,
  geminiDefinition,
  ollamaDefinition,
  googleWorkspaceDefinition,
  smartsheetDefinition,
  microsoft365Definition,
  slackDefinition,
  whatsappDefinition,
  hubSpotDefinition,
  salesforceDefinition,
  genericApiDefinition,
  playwrightBrowserDefinition,
  webhookDefinition,
  baseDefinition,
  arweaveDefinition,
];

export const integrationProviders: IntegrationProvider[] = [
  openAiProvider,
  anthropicProvider,
  grokProvider,
  geminiProvider,
  ollamaProvider,
  googleWorkspaceProvider,
  smartsheetProvider,
  microsoft365Provider,
  slackProvider,
  whatsappProvider,
  hubSpotProvider,
  salesforceProvider,
  genericApiProvider,
  playwrightBrowserProvider,
  webhookProvider,
  baseProvider,
  arweaveProvider,
];

export const findIntegrationProvider = (key: string) =>
  integrationProviders.find((provider) => provider.key === key) ?? null;

export const findIntegrationProviderDefinition = (key: string) =>
  providerDefinitions.find((provider) => provider.key === key) ?? null;

export const integrationToolDefinitions = new Map<string, IntegrationToolDefinition[]>(
  providerDefinitions.map((provider) => [provider.key, provider.toolDefinitions]),
);

export const findIntegrationToolDefinitions = (providerKey: string) =>
  integrationToolDefinitions.get(providerKey) ?? [];

export const writeScopedTools = new Set(
  providerDefinitions.flatMap((provider) =>
    provider.toolDefinitions.filter((tool) => tool.writeScoped).map((tool) => tool.key),
  ),
);

export type { IntegrationProviderDefinition, IntegrationToolDefinition } from "./definitions";
