import type { IntegrationProvider } from "@agent-marketplace/contracts";

import type { IntegrationProviderDefinition, IntegrationToolDefinition } from "./definitions";
import {
  anthropicDefinition,
  anthropicProvider,
  arweaveDefinition,
  arweaveProvider,
  baseDefinition,
  baseProvider,
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
  openAiDefinition,
  openAiProvider,
  salesforceDefinition,
  salesforceProvider,
  slackDefinition,
  slackProvider,
  webhookDefinition,
  webhookProvider,
} from "./providers";

const providerDefinitions: IntegrationProviderDefinition[] = [
  openAiDefinition,
  anthropicDefinition,
  grokDefinition,
  googleWorkspaceDefinition,
  microsoft365Definition,
  slackDefinition,
  hubSpotDefinition,
  salesforceDefinition,
  genericApiDefinition,
  webhookDefinition,
  baseDefinition,
  arweaveDefinition,
];

export const integrationProviders: IntegrationProvider[] = [
  openAiProvider,
  anthropicProvider,
  grokProvider,
  googleWorkspaceProvider,
  microsoft365Provider,
  slackProvider,
  hubSpotProvider,
  salesforceProvider,
  genericApiProvider,
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
export * from "./providers";
