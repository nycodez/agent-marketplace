import { toIntegrationProvider, type IntegrationProviderDefinition } from "../definitions";

export const baseDefinition: IntegrationProviderDefinition = {
  key: "base",
  name: "Base",
  description: "Publish agent program files and manifests to Base-backed contracts and registries.",
  category: "publishing",
  authType: "wallet",
  setupMode: "wallet",
  toolDefinitions: [
    {
      key: "base.publish_program",
      name: "Publish program to Base",
      description: "Publish agent program files or settings to Base for durable registry access.",
      examples: ["Write program file hash", "Publish settings manifest", "Register agent package"],
      writeScoped: true,
    },
    {
      key: "base.register_manifest",
      name: "Register Base manifest",
      description: "Register a manifest that points to agent settings and publication metadata.",
      examples: ["Register release manifest", "Anchor survivability metadata", "Update publication pointer"],
      writeScoped: true,
    },
  ],
};

export const baseProvider = toIntegrationProvider(baseDefinition);
