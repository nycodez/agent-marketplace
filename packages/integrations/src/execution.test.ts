import { afterEach, describe, expect, it, vi } from "vitest";
import type { OrganizationIntegration } from "@agent-marketplace/contracts";
import { findToolExecutionAdapter } from "./execution";

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

describe("tool execution adapters", () => {
  afterEach(() => {
    vi.restoreAllMocks();
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
});
