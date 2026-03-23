import { toIntegrationProvider, type IntegrationProviderDefinition } from "../definitions";

export const hubSpotDefinition: IntegrationProviderDefinition = {
  key: "hubspot",
  name: "HubSpot",
  description: "CRM records, tasking, and pipeline actions for revenue teams.",
  category: "crm",
  authType: "oauth",
  setupMode: "oauth",
  toolDefinitions: [
    {
      key: "crm.contacts.read",
      name: "Read contacts",
      description: "Review contact records, activity timelines, and owner assignments.",
      examples: ["Read customer details", "Inspect lifecycle stage", "Check contact activity"],
    },
    {
      key: "crm.contacts.write",
      name: "Update contacts",
      description: "Update contact details, lifecycle notes, and enrichment fields after approval.",
      examples: ["Update customer contact info", "Attach qualification note", "Correct owner metadata"],
      writeScoped: true,
    },
    {
      key: "crm.tasks.write",
      name: "Create CRM tasks",
      description: "Create follow-up tasks and queue next-step work for human owners.",
      examples: ["Create follow-up task", "Schedule callback reminder", "Queue renewal outreach"],
      writeScoped: true,
    },
    {
      key: "crm.companies.write",
      name: "Update companies",
      description: "Update company records and pipeline context after review.",
      examples: ["Update account record", "Add qualification summary", "Adjust account ownership"],
      writeScoped: true,
    },
  ],
};

export const hubSpotProvider = toIntegrationProvider(hubSpotDefinition);
