import { afterEach, describe, expect, it, vi } from "vitest";
import type { OrganizationIntegration } from "@agent-marketplace/contracts";
import { findToolExecutionAdapter } from "./execution";

const mockPage = vi.hoisted(() => ({
  goto: vi.fn(),
  locator: vi.fn(),
  setDefaultTimeout: vi.fn(),
  waitForLoadState: vi.fn(),
  title: vi.fn(),
  url: vi.fn(),
  context: vi.fn(),
}));

const mockBrowser = vi.hoisted(() => ({
  newPage: vi.fn(),
  close: vi.fn(),
}));

const mockChromium = vi.hoisted(() => ({
  launch: vi.fn(),
}));

vi.mock("playwright", () => ({
  chromium: mockChromium,
}));

const integration: OrganizationIntegration = {
  id: "integration-http",
  organizationId: "org-1",
  providerKey: "generic-api",
  displayName: "Generic API",
  status: "connected",
  authType: "api_key",
  scopes: ["http.get", "http.post", "http.patch"],
  metadata: {
    baseUrl: "https://example.com/api",
    apiKey: "secret",
  },
  createdByUserId: "user-1",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  lastValidatedAt: "2026-01-01T00:00:00.000Z",
};

const browserIntegration: OrganizationIntegration = {
  id: "integration-browser",
  organizationId: "org-1",
  providerKey: "playwright-browser",
  displayName: "Playwright Browser",
  status: "connected",
  authType: "credentials",
  scopes: ["browser.visit"],
  metadata: {
    headless: true,
  },
  createdByUserId: "user-1",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  lastValidatedAt: "2026-01-01T00:00:00.000Z",
};

const googleIntegration: OrganizationIntegration = {
  id: "integration-google",
  organizationId: "org-1",
  providerKey: "google-workspace",
  displayName: "Google Workspace",
  status: "connected",
  authType: "oauth",
  scopes: ["gmail.send"],
  metadata: {
    refreshToken: "refresh-token",
  },
  createdByUserId: "user-1",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  lastValidatedAt: "2026-01-01T00:00:00.000Z",
};

describe("tool execution adapters", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    mockPage.goto.mockReset();
    mockPage.locator.mockReset();
    mockPage.setDefaultTimeout.mockReset();
    mockPage.waitForLoadState.mockReset();
    mockPage.title.mockReset();
    mockPage.url.mockReset();
    mockPage.context.mockReset();
    mockBrowser.newPage.mockReset();
    mockBrowser.close.mockReset();
    mockChromium.launch.mockReset();
  });

  it("executes scoped generic API reads", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: {
          get: () => "application/json",
        },
        json: async () => ({ ok: true }),
      }),
    );

    const adapter = findToolExecutionAdapter("http.get");
    expect(adapter).not.toBeNull();

    const result = await adapter!.execute({
      integration,
      tool: "http.get",
      args: {
        path: "/records",
        query: { status: "open" },
      },
    });

    expect(result.receipt.summary).toContain("GET /api/records");
  });

  it("rejects absolute generic API paths", async () => {
    const adapter = findToolExecutionAdapter("http.get");
    await expect(
      adapter!.execute({
        integration,
        tool: "http.get",
        args: {
          path: "https://evil.example.com/records",
        },
      }),
    ).rejects.toThrow("relative");
  });

  it("visits a website with a saved browser credential", async () => {
    const locator = {
      fill: vi.fn(),
      click: vi.fn(),
      waitFor: vi.fn(),
      innerText: vi.fn().mockResolvedValue("Account summary and current balance"),
      press: vi.fn(),
    };

    mockPage.goto.mockResolvedValue(undefined);
    mockPage.locator.mockReturnValue(locator);
    mockPage.waitForLoadState.mockResolvedValue(undefined);
    mockPage.title.mockResolvedValue("Billing portal");
    mockPage.url.mockReturnValue("https://billing.example.com/dashboard");
    mockBrowser.newPage.mockResolvedValue(mockPage);
    mockBrowser.close.mockResolvedValue(undefined);
    mockChromium.launch.mockResolvedValue(mockBrowser);

    const adapter = findToolExecutionAdapter("browser.visit");
    expect(adapter).not.toBeNull();

    const result = await adapter!.execute({
      integration: browserIntegration,
      tool: "browser.visit",
      args: {
        url: "https://billing.example.com/dashboard",
        waitForSelector: "#dashboard",
      },
      runtime: {
        websiteCredential: {
          id: "cred-1",
          label: "Billing portal",
          origin: "https://billing.example.com",
          loginUrl: "https://billing.example.com/login",
          username: "agent@example.com",
          password: "secret",
          usernameSelector: "#email",
          passwordSelector: "#password",
          submitSelector: "button[type='submit']",
          successSelector: "#dashboard",
        },
      },
    });

    expect(mockChromium.launch).toHaveBeenCalledWith({ headless: true });
    expect(mockPage.goto).toHaveBeenNthCalledWith(
      1,
      "https://billing.example.com/login",
      { waitUntil: "domcontentloaded" },
    );
    expect(mockPage.goto).toHaveBeenNthCalledWith(
      2,
      "https://billing.example.com/dashboard",
      { waitUntil: "domcontentloaded" },
    );
    expect(result.receipt.data.authenticated).toBe(true);
    expect(result.output).toContain("Account summary");
  });

  it("sends Gmail messages using a refreshed Google access token", async () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "client-id");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "client-secret");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ access_token: "access-token" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: "message-1", threadId: "thread-1" }),
        }),
    );

    const adapter = findToolExecutionAdapter("gmail.send");
    expect(adapter).not.toBeNull();

    const result = await adapter!.execute({
      integration: googleIntegration,
      tool: "gmail.send",
      args: {
        to: "resident@example.com",
        subject: "Rent reminder",
        text: "Your rent is due tomorrow.",
      },
    });

    expect(result.receipt.summary).toContain("resident@example.com");
    expect(result.receipt.data.id).toBe("message-1");
  });

  it("downloads a file from an authenticated website session", async () => {
    const locator = {
      fill: vi.fn(),
      click: vi.fn(),
      waitFor: vi.fn(),
      innerText: vi.fn(),
      press: vi.fn(),
    };
    const requestGet = vi.fn().mockResolvedValue({
      ok: () => true,
      status: () => 200,
      body: async () => Buffer.from("pdf-bytes"),
      headers: () => ({
        "content-type": "application/pdf",
      }),
    });

    mockPage.goto.mockResolvedValue(undefined);
    mockPage.locator.mockReturnValue(locator);
    mockPage.waitForLoadState.mockResolvedValue(undefined);
    mockPage.context.mockReturnValue({
      request: {
        get: requestGet,
      },
    });
    mockBrowser.newPage.mockResolvedValue(mockPage);
    mockBrowser.close.mockResolvedValue(undefined);
    mockChromium.launch.mockResolvedValue(mockBrowser);

    const adapter = findToolExecutionAdapter("browser.download");
    expect(adapter).not.toBeNull();

    const result = await adapter!.execute({
      integration: browserIntegration,
      tool: "browser.download",
      args: {
        fileUrl: "https://billing.example.com/invoices/april.pdf",
      },
      runtime: {
        websiteCredential: {
          id: "cred-1",
          label: "Billing portal",
          origin: "https://billing.example.com",
          loginUrl: "https://billing.example.com/login",
          username: "agent@example.com",
          password: "secret",
          usernameSelector: "#email",
          passwordSelector: "#password",
          submitSelector: "button[type='submit']",
          successSelector: "#dashboard",
        },
      },
    });

    expect(requestGet).toHaveBeenCalledWith("https://billing.example.com/invoices/april.pdf");
    expect(result.receipt.summary).toContain("april.pdf");
    expect(result.receipt.data.mimeType).toBe("application/pdf");
    expect(result.output).toContain("Downloaded april.pdf");
  });
});
