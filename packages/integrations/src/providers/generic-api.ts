import { toIntegrationProvider, type IntegrationProviderDefinition } from "../definitions";

export const genericApiDefinition: IntegrationProviderDefinition = {
  key: "generic-api",
  name: "Generic API",
  description: "Bring your own REST endpoint with scoped API keys.",
  category: "custom",
  authType: "api_key",
  setupMode: "api_key",
  toolDefinitions: [
    {
      key: "http.get",
      name: "GET request",
      description: "Read data from a customer-defined endpoint without mutating state.",
      examples: ["Read external status", "Fetch catalog data", "Pull remote record"],
    },
    {
      key: "http.post",
      name: "POST request",
      description: "Create records or trigger actions on a customer-defined endpoint.",
      examples: ["Create remote task", "Trigger webhook-like action", "Push lead payload"],
      writeScoped: true,
    },
    {
      key: "http.patch",
      name: "PATCH request",
      description: "Update a record on a customer-defined endpoint after approval.",
      examples: ["Update remote record", "Change status", "Write back external metadata"],
      writeScoped: true,
    },
  ],
};

export const genericApiProvider = toIntegrationProvider(genericApiDefinition);
