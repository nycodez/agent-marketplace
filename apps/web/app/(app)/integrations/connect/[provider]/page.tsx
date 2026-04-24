import { notFound } from "next/navigation";
import {
  findIntegrationProvider,
  findIntegrationToolDefinitions,
} from "@agent-marketplace/integrations/catalog";
import { ProviderConnectionFlow } from "../../../../../components/provider-connection-flow";

export default async function ProviderConnectionPage({
  params,
}: {
  params: Promise<{ provider: string }>;
}) {
  const { provider: providerKey } = await params;
  const provider = findIntegrationProvider(providerKey);

  if (!provider) {
    notFound();
  }

  const toolDefinitions = findIntegrationToolDefinitions(provider.key);

  return <ProviderConnectionFlow provider={provider} toolDefinitions={toolDefinitions} />;
}
