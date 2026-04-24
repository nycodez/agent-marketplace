import { toIntegrationProvider, type IntegrationProviderDefinition } from "../definitions";

export const playwrightBrowserDefinition: IntegrationProviderDefinition = {
  key: "playwright-browser",
  name: "Playwright Browser",
  description: "Visit arbitrary websites with a real browser session and saved operator credentials.",
  category: "custom",
  authType: "credentials",
  setupMode: "credentials",
  toolDefinitions: [
    {
      key: "browser.visit",
      name: "Visit website",
      description: "Open a page, optionally log in with a saved credential, and capture page text for the supervisor.",
      examples: ["Visit billing portal", "Open invoice page", "Review account dashboard"],
    },
    {
      key: "browser.download",
      name: "Download file",
      description: "Authenticate into a website and download a bill, statement, or portal file for later processing.",
      examples: ["Download invoice PDF", "Fetch monthly statement", "Download billing export"],
    },
  ],
};

export const playwrightBrowserProvider = toIntegrationProvider(playwrightBrowserDefinition);
