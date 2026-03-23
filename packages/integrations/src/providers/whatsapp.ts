import { toIntegrationProvider, type IntegrationProviderDefinition } from "../definitions";

export const whatsappDefinition: IntegrationProviderDefinition = {
  key: "whatsapp",
  name: "WhatsApp",
  description: "Business messaging for customer updates, handoffs, and approval-gated outbound replies.",
  category: "communication",
  authType: "api_key",
  setupMode: "api_key",
  toolDefinitions: [
    {
      key: "whatsapp.read",
      name: "Read WhatsApp threads",
      description: "Review inbound WhatsApp conversations, support handoffs, and unresolved customer replies.",
      examples: ["Read customer thread", "Review open conversation", "Summarize inbound handoff"],
    },
    {
      key: "whatsapp.send",
      name: "Send WhatsApp messages",
      description: "Send approved updates, reminders, and customer-ready replies over WhatsApp.",
      examples: ["Send payment reminder", "Reply to resident", "Deliver appointment update"],
      writeScoped: true,
    },
    {
      key: "whatsapp.template.send",
      name: "Send WhatsApp templates",
      description: "Send pre-approved template messages for notifications, reminders, and operational prompts.",
      examples: ["Send renewal reminder", "Send dispatch notification", "Send collections prompt"],
      writeScoped: true,
    },
  ],
};

export const whatsappProvider = toIntegrationProvider(whatsappDefinition);
