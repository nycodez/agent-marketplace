import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RunExecutionContext } from "@agent-marketplace/database";
import { advanceRunExecution } from "./activities";

const mockDb = vi.hoisted(() => ({
  clearRunApprovalPointer: vi.fn(),
  completePublication: vi.fn(),
  completeRun: vi.fn(),
  completeRunStep: vi.fn(),
  createStepApprovalRequest: vi.fn(),
  failPublication: vi.fn(),
  failRun: vi.fn(),
  failRunStep: vi.fn(),
  getPublicationExecutionContext: vi.fn(),
  getRunExecutionContext: vi.fn(),
  getWebsiteCredentialForExecution: vi.fn(),
  insertAuditEvent: vi.fn(),
  markRunStepStarted: vi.fn(),
  updateRunStatus: vi.fn(),
}));

const mockIntegrations = vi.hoisted(() => ({
  findToolExecutionAdapter: vi.fn(),
  writeScopedTools: new Set(["slack.post", "http.post", "http.patch", "slack.thread"]),
}));

vi.mock("@agent-marketplace/database", () => mockDb);
vi.mock("@agent-marketplace/integrations", () => mockIntegrations);

const baseContext: RunExecutionContext = {
  run: {
    id: "run-1",
    organizationId: "org-1",
    workspaceId: "workspace-1",
    agentId: "agent-1",
    triggerType: "manual",
    status: "queued",
    summary: "Queued",
    plannedActions: [],
    approvalRequirement: "required",
    approvalRequestId: null,
    orchestration: {
      engine: "temporal",
      workflowId: "workflow-1",
      workflowRunId: "execution-1",
      workflowType: "agentRunWorkflow",
      taskQueue: "runs",
      namespace: "default",
      status: "started",
      lastError: null,
    },
    createdByUserId: "user-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  steps: [
    {
      id: "step-1",
      runId: "run-1",
      title: "Post to Slack",
      status: "queued",
      tool: "slack.post",
      assignedAgentId: "agent-1",
      attempt: 0,
      output: null,
      errorCode: null,
      startedAt: null,
      finishedAt: null,
      receipt: null,
      inputSnapshot: { text: "Hello world" },
      metadata: {
        planStep: {
          id: "step-1",
          title: "Post to Slack",
          objective: "Notify operators.",
          tool: "slack.post",
          assignedAgentId: "agent-1",
          arguments: { text: "Hello world" },
          approvalPreview: {
            summary: "Approve Slack post",
            requestedActions: ["Execute slack.post"],
            tool: "slack.post",
            targetLabel: "C123",
            payload: { text: "Hello world" },
          },
          handoffSummary: "Slack specialist sends the operator update.",
          dependsOn: [],
          requiresApproval: true,
          kind: "tool_call",
        },
        approvalPreview: {
          summary: "Approve Slack post",
          requestedActions: ["Execute slack.post"],
          tool: "slack.post",
          targetLabel: "C123",
          payload: { text: "Hello world" },
        },
      },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  ],
  approvals: [],
  agents: [],
  integrations: [],
  toolGrants: [],
};

describe("advanceRunExecution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a just-in-time approval for write steps", async () => {
    mockDb.getRunExecutionContext.mockResolvedValue(baseContext);
    mockDb.createStepApprovalRequest.mockResolvedValue({
      id: "approval-1",
      runId: "run-1",
      runStepId: "step-1",
      workspaceId: "workspace-1",
      status: "pending",
      summary: "Approve Slack post",
      tool: "slack.post",
      targetLabel: "C123",
      payload: { text: "Hello world" },
      requestedActions: ["Execute slack.post"],
      createdAt: "2026-01-01T00:00:00.000Z",
      resolvedAt: null,
    });

    const result = await advanceRunExecution({ runId: "run-1" });

    expect(result.status).toBe("awaiting_approval");
    expect(mockDb.createStepApprovalRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        runStepId: "step-1",
        tool: "slack.post",
      }),
    );
  });

  it("advances to a dependent approval-gated step using logical plan step ids", async () => {
    mockDb.getRunExecutionContext.mockResolvedValue({
      ...baseContext,
      steps: [
        {
          ...baseContext.steps[0],
          id: "db-step-plan",
          title: "Plan run",
          status: "completed",
          tool: null,
          metadata: {},
        },
        {
          ...baseContext.steps[0],
          id: "db-step-read",
          title: "Fetch context",
          status: "completed",
          tool: "http.get",
          attempt: 1,
          output: "[]",
          metadata: {
            planStep: {
              id: "step-1",
              title: "Fetch context",
              objective: "Read remote context.",
              tool: "http.get",
              assignedAgentId: "agent-1",
              arguments: { path: "/" },
              approvalPreview: null,
              handoffSummary: "Supervisor reviews the remote context.",
              dependsOn: [],
              requiresApproval: false,
              kind: "tool_call",
            },
          },
        },
        {
          ...baseContext.steps[0],
          id: "db-step-write",
          title: "Post follow-up",
          tool: "slack.post",
          metadata: {
            planStep: {
              id: "step-2",
              title: "Post follow-up",
              objective: "Send the approved follow-up.",
              tool: "slack.post",
              assignedAgentId: "agent-1",
              arguments: { text: "Hello world" },
              approvalPreview: {
                summary: "Approve Slack post",
                requestedActions: ["Execute slack.post"],
                tool: "slack.post",
                targetLabel: "C123",
                payload: { text: "Hello world" },
              },
              handoffSummary: "Specialist sends the follow-up.",
              dependsOn: ["step-1"],
              requiresApproval: true,
              kind: "tool_call",
            },
            approvalPreview: {
              summary: "Approve Slack post",
              requestedActions: ["Execute slack.post"],
              tool: "slack.post",
              targetLabel: "C123",
              payload: { text: "Hello world" },
            },
          },
        },
      ],
    });
    mockDb.createStepApprovalRequest.mockResolvedValue({
      id: "approval-2",
      runId: "run-1",
      runStepId: "db-step-write",
      workspaceId: "workspace-1",
      status: "pending",
      summary: "Approve Slack post",
      tool: "slack.post",
      targetLabel: "C123",
      payload: { text: "Hello world" },
      requestedActions: ["Execute slack.post"],
      createdAt: "2026-01-01T00:00:00.000Z",
      resolvedAt: null,
    });

    const result = await advanceRunExecution({ runId: "run-1" });

    expect(result.status).toBe("awaiting_approval");
    expect(mockDb.createStepApprovalRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        runStepId: "db-step-write",
      }),
    );
    expect(mockDb.completeRun).not.toHaveBeenCalled();
  });

  it("resolves a saved website credential before executing browser steps", async () => {
    mockDb.getRunExecutionContext.mockResolvedValue({
      ...baseContext,
      steps: [
        {
          ...baseContext.steps[0],
          id: "browser-step",
          title: "Visit billing portal",
          tool: "browser.visit",
          inputSnapshot: {
            url: "https://billing.example.com/dashboard",
            credentialId: "credential-1",
          },
          metadata: {
            planStep: {
              id: "step-browser",
              title: "Visit billing portal",
              objective: "Inspect the billing dashboard.",
              tool: "browser.visit",
              assignedAgentId: "agent-1",
              arguments: {
                url: "https://billing.example.com/dashboard",
                credentialId: "credential-1",
              },
              approvalPreview: null,
              handoffSummary: "Browser operator captures the portal state.",
              dependsOn: [],
              requiresApproval: false,
              kind: "tool_call",
            },
          },
        },
      ],
      approvals: [],
      integrations: [
        {
          id: "integration-browser",
          organizationId: "org-1",
          providerKey: "playwright-browser",
          displayName: "Playwright Browser",
          status: "connected",
          authType: "credentials",
          scopes: ["browser.visit"],
          metadata: {},
          createdByUserId: "user-1",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          lastValidatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      toolGrants: [
        {
          id: "grant-browser",
          workspaceId: "workspace-1",
          agentId: "agent-1",
          organizationIntegrationId: "integration-browser",
          providerKey: "playwright-browser",
          tools: ["browser.visit"],
          createdByUserId: "user-1",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
    mockDb.getWebsiteCredentialForExecution.mockResolvedValue({
      id: "credential-1",
      organizationId: "org-1",
      workspaceId: "workspace-1",
      label: "Billing portal",
      origin: "https://billing.example.com",
      loginUrl: "https://billing.example.com/login",
      username: "agent@example.com",
      password: "secret",
      usernameSelector: "#email",
      passwordSelector: "#password",
      submitSelector: "button[type='submit']",
      successSelector: "#dashboard",
      notes: null,
      hasSecret: true,
      createdByUserId: "user-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      lastValidatedAt: null,
    });
    mockIntegrations.findToolExecutionAdapter.mockReturnValue({
      execute: vi.fn().mockResolvedValue({
        output: "Billing portal summary",
        receipt: {
          providerKey: "playwright-browser",
          tool: "browser.visit",
          summary: "Visited billing portal",
          data: {
            authenticated: true,
          },
        },
      }),
    });

    const result = await advanceRunExecution({ runId: "run-1" });

    expect(result.status).toBe("running");
    expect(mockDb.getWebsiteCredentialForExecution).toHaveBeenCalledWith({
      credentialId: "credential-1",
      organizationId: "org-1",
      workspaceId: "workspace-1",
    });
    expect(mockIntegrations.findToolExecutionAdapter).toHaveBeenCalledWith("browser.visit");
    const adapter = mockIntegrations.findToolExecutionAdapter.mock.results[0]?.value;
    expect(adapter.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        runtime: expect.objectContaining({
          websiteCredential: expect.objectContaining({
            id: "credential-1",
          }),
        }),
      }),
    );
  });
});
