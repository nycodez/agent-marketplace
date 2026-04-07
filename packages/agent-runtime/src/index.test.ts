import { describe, expect, it } from "vitest";
import type { AgentSpec, ToolGrant } from "@agent-marketplace/contracts";
import { planRun } from "./index";

const supervisor: AgentSpec = {
  id: "agent-supervisor",
  workspaceId: "workspace-1",
  organizationId: "org-1",
  displayName: "Supervisor",
  mission: "Coordinate intake and updates.",
  responsibilities: [],
  allowedTools: ["http.get", "slack.post"],
  knowledgeSources: [],
  triggerModes: ["manual"],
  approvalPolicy: "required",
  successMetrics: [],
  constraints: [],
  status: "active",
  currentVersionId: "version-1",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const specialist: AgentSpec = {
  ...supervisor,
  id: "agent-specialist",
  displayName: "Slack Specialist",
  allowedTools: ["slack.post"],
};

const toolGrants: ToolGrant[] = [
  {
    id: "grant-http",
    workspaceId: supervisor.workspaceId,
    agentId: supervisor.id,
    organizationIntegrationId: "integration-http",
    providerKey: "generic-api",
    tools: ["http.get"],
    createdByUserId: "user-1",
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "grant-slack",
    workspaceId: supervisor.workspaceId,
    agentId: specialist.id,
    organizationIntegrationId: "integration-slack",
    providerKey: "slack",
    tools: ["slack.post"],
    createdByUserId: "user-1",
    createdAt: "2026-01-01T00:00:00.000Z",
  },
];

describe("planRun", () => {
  it("builds step assignments and approval previews for fallback plans", async () => {
    const result = await planRun({
      agent: supervisor,
      agents: [supervisor, specialist],
      prompt: "Fetch the current record and post an operator update.",
      integrations: [],
      toolGrants,
      userId: "user-1",
    });

    const executionSteps = result.plan.steps.filter((step) => step.tool !== null);
    expect(result.run.status).toBe("queued");
    expect(executionSteps).toHaveLength(2);
    expect(executionSteps[0]?.assignedAgentId).toBe(supervisor.id);
    expect(executionSteps[0]?.arguments).toMatchObject({ path: "/" });
    expect(executionSteps[1]?.assignedAgentId).toBe(specialist.id);
    expect(executionSteps[1]?.approvalPreview?.tool).toBe("slack.post");
    expect(executionSteps[1]?.approvalPreview?.requestedActions).toEqual(["Execute slack.post"]);
  });
});
