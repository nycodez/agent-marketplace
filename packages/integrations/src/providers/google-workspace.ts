import { toIntegrationProvider, type IntegrationProviderDefinition } from "../definitions";

export const googleWorkspaceDefinition: IntegrationProviderDefinition = {
  key: "google-workspace",
  name: "Google Workspace",
  description: "Mail, calendar, and docs access for operational teams.",
  category: "productivity",
  authType: "oauth",
  setupMode: "oauth",
  toolDefinitions: [
    {
      key: "gmail.read",
      name: "Read Gmail inbox",
      description: "Read operational inboxes, unread messages, and customer threads.",
      examples: ["Read Inbox", "List Unread Emails", "Read Email Thread"],
    },
    {
      key: "gmail.send",
      name: "Send Gmail messages",
      description: "Send follow-ups, replies, and approval-ready drafts on behalf of the user.",
      examples: ["Send Email", "Reply to Customer Thread"],
      writeScoped: true,
    },
    {
      key: "calendar.read",
      name: "Read Google Calendar",
      description: "Review upcoming events, appointments, and scheduling context.",
      examples: ["Read Calendar Events", "List Upcoming Events", "Find Calendar Slot"],
    },
    {
      key: "calendar.write",
      name: "Update Google Calendar",
      description: "Create or reschedule meetings after the user approves the write action.",
      examples: ["Create Event", "Update Event", "Cancel Event"],
      writeScoped: true,
    },
    {
      key: "drive.search",
      name: "Search Google Drive",
      description: "Search docs, PDFs, and working files for operational context.",
      examples: ["Locate SOP document", "Find lease template", "Search policy memo"],
    },
  ],
};

export const googleWorkspaceProvider = toIntegrationProvider(googleWorkspaceDefinition);
