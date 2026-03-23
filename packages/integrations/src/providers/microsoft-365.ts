import { toIntegrationProvider, type IntegrationProviderDefinition } from "../definitions";

export const microsoft365Definition: IntegrationProviderDefinition = {
  key: "microsoft-365",
  name: "Microsoft 365",
  description: "Outlook, calendar, and file access for enterprise workflows.",
  category: "productivity",
  authType: "oauth",
  setupMode: "oauth",
  toolDefinitions: [
    {
      key: "outlook.read",
      name: "Read Outlook inbox",
      description: "Read inbox activity, unread messages, and long-running conversation threads.",
      examples: ["Read Inbox", "List Unread Emails", "Read Email Thread"],
    },
    {
      key: "outlook.send",
      name: "Send Outlook messages",
      description: "Send replies, follow-ups, and stakeholder updates from Outlook.",
      examples: ["Send Email", "Draft customer response"],
      writeScoped: true,
    },
    {
      key: "calendar.read",
      name: "Read Outlook calendar",
      description: "Inspect calendars for upcoming commitments and open time slots.",
      examples: ["Read Calendar Events", "List Upcoming Events", "Find Calendar Slot"],
    },
    {
      key: "calendar.write",
      name: "Update Outlook calendar",
      description: "Create, move, or cancel calendar events after approval.",
      examples: ["Create Event", "Update Event", "Cancel Event"],
      writeScoped: true,
    },
    {
      key: "onedrive.search",
      name: "Search OneDrive files",
      description: "Search worksheets, contracts, and SOP files stored in OneDrive.",
      examples: ["Find invoice template", "Locate signed contract", "Search policy workbook"],
    },
  ],
};

export const microsoft365Provider = toIntegrationProvider(microsoft365Definition);
