import { toIntegrationProvider, type IntegrationProviderDefinition } from "../definitions";

export const slackDefinition: IntegrationProviderDefinition = {
  key: "slack",
  name: "Slack",
  description: "Read channels, post updates, and create escalation threads.",
  category: "communication",
  authType: "oauth",
  setupMode: "oauth",
  toolDefinitions: [
    {
      key: "slack.read",
      name: "Read Slack channels",
      description: "Monitor channels, DMs, and handoff conversations for work that needs attention.",
      examples: ["Read escalation channel", "Check support queue", "Summarize handoff thread"],
    },
    {
      key: "slack.post",
      name: "Post Slack updates",
      description: "Send updates, drafts, and notifications into approved channels.",
      examples: ["Post deal update", "Send triage summary", "Notify on approval-needed item"],
      writeScoped: true,
    },
    {
      key: "slack.thread",
      name: "Reply in Slack threads",
      description: "Continue existing conversations without creating new channel noise.",
      examples: ["Reply in incident thread", "Escalate in approvals thread", "Continue support handoff"],
      writeScoped: true,
    },
  ],
};

export const slackProvider = toIntegrationProvider(slackDefinition);
