import { toIntegrationProvider, type IntegrationProviderDefinition } from "../definitions";

export const arweaveDefinition: IntegrationProviderDefinition = {
  key: "arweave",
  name: "Arweave",
  description: "Publish immutable program files, manifests, and bundles to Arweave.",
  category: "publishing",
  authType: "wallet",
  setupMode: "wallet",
  toolDefinitions: [
    {
      key: "arweave.upload_program",
      name: "Upload program to Arweave",
      description: "Store immutable agent settings or program files on Arweave.",
      examples: ["Upload JSON config", "Publish durable prompt pack", "Store workflow settings"],
      writeScoped: true,
    },
    {
      key: "arweave.pin_manifest",
      name: "Pin Arweave manifest",
      description: "Publish a manifest that indexes uploaded settings and release metadata.",
      examples: ["Pin release manifest", "Publish content index", "Finalize durable bundle"],
      writeScoped: true,
    },
  ],
};

export const arweaveProvider = toIntegrationProvider(arweaveDefinition);
