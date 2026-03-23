import { toIntegrationProvider, type IntegrationProviderDefinition } from "../definitions";

export const salesforceDefinition: IntegrationProviderDefinition = {
  key: "salesforce",
  name: "Salesforce",
  description: "Enterprise CRM reads, updates, and task orchestration.",
  category: "crm",
  authType: "oauth",
  setupMode: "oauth",
  toolDefinitions: [
    {
      key: "sf.records.read",
      name: "Read Salesforce records",
      description: "Inspect accounts, contacts, opportunities, and case context.",
      examples: ["Read account record", "Inspect opportunity status", "Review support case"],
    },
    {
      key: "sf.records.write",
      name: "Update Salesforce records",
      description: "Update CRM fields, opportunity notes, and ownership after approval.",
      examples: ["Update customer record", "Advance opportunity stage", "Add case note"],
      writeScoped: true,
    },
    {
      key: "sf.tasks.write",
      name: "Create Salesforce tasks",
      description: "Create follow-up tasks and queue human action items inside Salesforce.",
      examples: ["Create callback task", "Queue renewal review", "Assign collections follow-up"],
      writeScoped: true,
    },
  ],
};

export const salesforceProvider = toIntegrationProvider(salesforceDefinition);
