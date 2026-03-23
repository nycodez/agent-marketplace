import { toIntegrationProvider, type IntegrationProviderDefinition } from "../definitions";

export const smartsheetDefinition: IntegrationProviderDefinition = {
  key: "smartsheet",
  name: "Smartsheet",
  description: "Sheets, rows, tasks, and workflow tracking for operational teams.",
  category: "productivity",
  authType: "api_key",
  setupMode: "api_key",
  toolDefinitions: [
    {
      key: "smartsheet.sheets.read",
      name: "Read sheets",
      description: "Review sheets, reports, and row data for work intake, project status, and coordination context.",
      examples: ["Read project sheet", "Inspect work queue", "Review task board"],
    },
    {
      key: "smartsheet.rows.write",
      name: "Update rows",
      description: "Update existing rows, statuses, and assignments after approval.",
      examples: ["Update row status", "Assign owner", "Mark task complete"],
      writeScoped: true,
    },
    {
      key: "smartsheet.rows.create",
      name: "Create rows",
      description: "Create new rows for tasks, requests, dispatches, or follow-up work.",
      examples: ["Create maintenance row", "Add collections task", "Queue renewal follow-up"],
      writeScoped: true,
    },
    {
      key: "smartsheet.attachments.read",
      name: "Read attachments",
      description: "Review files and linked attachments on rows for operational context.",
      examples: ["Open attached invoice", "Review scope file", "Check handoff document"],
    },
  ],
};

export const smartsheetProvider = toIntegrationProvider(smartsheetDefinition);
