import type {
  AgentDraft,
  AgentSpec,
  AgentTeamDraft,
  ApprovalPreview,
  ApprovalRequirement,
  DraftGenerationResult,
  OrganizationIntegration,
  ProgramFile,
  PublicationRecord,
  Run,
  RunPlan,
  RunPlanStep,
  RunStep,
  ToolGrant,
  TriggerType,
} from "@agent-marketplace/contracts";
import { writeScopedTools } from "@agent-marketplace/integrations";
import {
  generateDraftsWithModel,
  generateRunPlanWithModel,
  testPlannerModelIntegration,
} from "./llm";

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const nowIso = () => new Date().toISOString();
const isReadOnlyTool = (tool: string) =>
  tool.includes(".read") || tool === "http.get" || tool.includes(".search");

const buildStepArguments = ({
  tool,
  prompt,
}: {
  tool: string | null;
  prompt?: string;
}) => {
  if (!tool) {
    return {};
  }

  switch (tool) {
    case "http.get":
      return {
        path: "/",
        query: prompt ? { q: prompt.slice(0, 120) } : {},
      };
    case "http.post":
    case "http.patch":
      return {
        path: "/",
        body: {
          prompt: prompt ?? "Execute the approved action.",
        },
      };
    case "slack.read":
      return {
        limit: 10,
      };
    case "slack.post":
      return {
        text: prompt ? `Operator update: ${prompt}` : "Operator update ready for approval.",
      };
    case "slack.thread":
      return {
        threadTs: "REQUIRED_AT_EXECUTION",
        text: prompt ? `Thread update: ${prompt}` : "Thread update ready for approval.",
      };
    default:
      return {};
  }
};

const buildApprovalPreview = ({
  tool,
  prompt,
  args,
}: {
  tool: string;
  prompt?: string;
  args: Record<string, unknown>;
}): ApprovalPreview => ({
  summary: `Approve ${tool} for this run step.`,
  requestedActions: [`Execute ${tool}`],
  tool,
  targetLabel:
    typeof args.channelId === "string"
      ? args.channelId
      : typeof args.path === "string"
        ? args.path
        : null,
  payload: {
    prompt: prompt ?? null,
    ...args,
  },
});

const summarizeAgentGrantMap = ({
  agents,
  toolGrants,
}: {
  agents: AgentSpec[];
  toolGrants: ToolGrant[];
}) =>
  new Map(
    agents.map((candidate) => [
      candidate.id,
      new Set(
        toolGrants
          .filter((grant) => grant.agentId === candidate.id)
          .flatMap((grant) => grant.tools),
      ),
    ]),
  );

const assignAgentForTool = ({
  tool,
  supervisor,
  agents,
  toolGrants,
}: {
  tool: string | null;
  supervisor: AgentSpec;
  agents: AgentSpec[];
  toolGrants: ToolGrant[];
}) => {
  if (!tool) {
    return supervisor.id;
  }

  const grantedToolMap = summarizeAgentGrantMap({
    agents,
    toolGrants,
  });

  const specialist = agents.find((candidate) => {
    if (candidate.id === supervisor.id || candidate.status !== "active") {
      return false;
    }
    return grantedToolMap.get(candidate.id)?.has(tool) ?? false;
  });

  if (specialist) {
    return specialist.id;
  }

  return supervisor.id;
};

const inferRoleSeeds = (brief: string) => {
  const normalized = brief.toLowerCase();
  const seeds: string[] = [];

  if (normalized.includes("sales") || normalized.includes("pipeline")) {
    seeds.push("Pipeline Operator");
  }
  if (normalized.includes("support") || normalized.includes("inbox")) {
    seeds.push("Customer Support Agent");
  }
  if (normalized.includes("calendar") || normalized.includes("meeting")) {
    seeds.push("Scheduling Coordinator");
  }
  if (normalized.includes("crm") || normalized.includes("records")) {
    seeds.push("CRM Steward");
  }
  if (normalized.includes("research") || normalized.includes("brief")) {
    seeds.push("Research Analyst");
  }

  return seeds.length ? seeds : ["Operations Agent", "Communications Agent"];
};

const roleToTools = (role: string): string[] => {
  const normalized = role.toLowerCase();

  if (normalized.includes("support")) {
    return ["gmail.read", "gmail.send", "slack.post"];
  }
  if (normalized.includes("scheduling")) {
    return ["calendar.read", "calendar.write", "gmail.send"];
  }
  if (normalized.includes("crm")) {
    return ["crm.contacts.read", "crm.contacts.write", "crm.tasks.write"];
  }
  if (normalized.includes("pipeline")) {
    return ["crm.contacts.read", "crm.tasks.write", "slack.post"];
  }

  return ["gmail.read", "slack.post", "http.get"];
};

const fallbackDraftGeneration = (brief: string): DraftGenerationResult => {
  const roleSeeds = inferRoleSeeds(brief);
  const generatedAgents: AgentDraft[] = roleSeeds.map((role, index) => {
    const tools = roleToTools(role);
    const approvalPolicy: ApprovalRequirement = tools.some((tool) => writeScopedTools.has(tool))
      ? "required"
      : "not_required";

    return {
      id: `draft-agent-${index + 1}-${slugify(role)}`,
      roleName: role,
      mission: `Own the ${role.toLowerCase()} workflow described in the workspace brief.`,
      responsibilities: [
        `Translate the brief into repeatable ${role.toLowerCase()} workflows.`,
        "Monitor assigned work, summarize context, and surface blockers early.",
        "Prepare external actions in a reviewable, least-privilege format.",
      ],
      allowedTools: tools,
      knowledgeSources: ["workspace brief", "connected integrations", "approved run history"],
      triggerModes: ["manual", "integration_event"],
      approvalPolicy,
      successMetrics: [
        "Time to first useful action",
        "Actions completed without rework",
        "Approval turnaround time",
      ],
      constraints: [
        "Do not perform external writes without explicit approval when required.",
        "Operate only on explicitly granted integrations and tools.",
      ],
    };
  });

  return {
    generatedAgents,
    clarifications:
      brief.trim().length < 80
        ? [
            "The brief is thin. Add target systems, example tasks, and the decisions these agents should make autonomously.",
          ]
        : [],
    plannerMode: "fallback",
    modelProviderKey: null,
    modelName: null,
  };
};

const normalizeDraftGeneration = (result: DraftGenerationResult): DraftGenerationResult => ({
  ...result,
  generatedAgents: result.generatedAgents.map((agent, index) => {
    const dedupedTools = Array.from(new Set(agent.allowedTools));
    const approvalPolicy: ApprovalRequirement = dedupedTools.some((tool) => writeScopedTools.has(tool))
      ? "required"
      : agent.approvalPolicy;

    return {
      ...agent,
      id: agent.id?.trim() ? agent.id : `draft-agent-${index + 1}-${slugify(agent.roleName)}`,
      allowedTools: dedupedTools,
      approvalPolicy,
      knowledgeSources: agent.knowledgeSources.length ? agent.knowledgeSources : ["workspace brief"],
      triggerModes: agent.triggerModes.length ? agent.triggerModes : ["manual", "integration_event"],
      successMetrics: agent.successMetrics.length ? agent.successMetrics : ["Time to first useful action"],
      constraints: agent.constraints.length
        ? agent.constraints
        : ["Operate only on explicitly granted integrations and tools."],
    };
  }),
});

const fallbackRunPlan = ({
  supervisor,
  agents,
  prompt,
  executableTools,
  missingGrantTools,
  toolGrants,
}: {
  supervisor: AgentSpec;
  agents: AgentSpec[];
  prompt?: string;
  executableTools: string[];
  missingGrantTools: string[];
  toolGrants: ToolGrant[];
}): RunPlan => {
  const stepChain: RunPlanStep[] = executableTools.length
    ? executableTools.map((tool, index) => ({
        id: `step-${index + 1}`,
        title: index === 0 ? "Review context" : `Use ${tool}`,
        objective:
          index === 0
            ? "Review the current task context and collect the facts needed for execution."
            : `Use ${tool} to advance the current assignment.`,
        tool: index === 0 && !isReadOnlyTool(tool) ? null : tool,
        assignedAgentId: assignAgentForTool({
          tool: index === 0 && !isReadOnlyTool(tool) ? null : tool,
          supervisor,
          agents,
          toolGrants,
        }),
        arguments: buildStepArguments({
          tool: index === 0 && !isReadOnlyTool(tool) ? null : tool,
          prompt,
        }),
        approvalPreview:
          writeScopedTools.has(tool)
            ? buildApprovalPreview({
                tool,
                prompt,
                args: buildStepArguments({
                  tool,
                  prompt,
                }),
              })
            : null,
        handoffSummary:
          index === 0
            ? `${supervisor.displayName} prepares the execution context.`
            : `Specialist executes ${tool} and returns the result to ${supervisor.displayName}.`,
        dependsOn: index === 0 ? [] : [`step-${index}`],
        requiresApproval: writeScopedTools.has(tool),
        kind: index === 0 ? "reason" : "tool_call",
      }))
    : [
        {
          id: "step-1",
          title: "Pause for setup",
          objective: "No granted tools are available yet, so stay in planning mode until integrations are connected.",
          tool: null,
          assignedAgentId: supervisor.id,
          arguments: {},
          approvalPreview: null,
          handoffSummary: `${supervisor.displayName} is waiting for a usable tool grant.`,
          dependsOn: [],
          requiresApproval: false,
          kind: "reason" as const,
        },
      ];

  const requestedActions = stepChain
    .filter((step) => step.tool && writeScopedTools.has(step.tool))
    .map((step) => `Execute ${step.tool}`);

  return {
    summary: `${supervisor.displayName} is coordinating a run for the current task.`,
    plannedActions: [
      `Review ${supervisor.displayName.toLowerCase()} mission and current task brief`,
      prompt ? `Use prompt context: ${prompt}` : "Use workspace brief and latest configuration",
      `Operate with granted tools: ${executableTools.join(", ") || "none yet"}`,
      missingGrantTools.length
        ? `Do not use ungranted tools: ${missingGrantTools.join(", ")}`
        : "All configured tools are granted for execution",
    ],
    requestedActions,
    executableTools,
    missingGrantTools,
    plannerMode: "fallback",
    modelProviderKey: null,
    modelName: null,
    clarifications: executableTools.length ? [] : ["Connect and grant at least one operational tool before running."],
    steps: stepChain,
  };
};

const normalizeRunPlan = ({
  plan,
  executableTools,
  missingGrantTools,
}: {
  plan: RunPlan;
  executableTools: string[];
  missingGrantTools: string[];
}): RunPlan => {
  const allowedToolSet = new Set(executableTools);

  const normalizedSteps = plan.steps.map((step, index) => {
    const tool = step.tool && allowedToolSet.has(step.tool) ? step.tool : null;
    const args =
      step.arguments && typeof step.arguments === "object" && !Array.isArray(step.arguments)
        ? step.arguments
        : {};
    return {
      ...step,
      id: step.id?.trim() ? step.id : `step-${index + 1}`,
      tool,
      assignedAgentId:
        typeof step.assignedAgentId === "string" && step.assignedAgentId.trim()
          ? step.assignedAgentId
          : null,
      arguments: args,
      approvalPreview:
        tool && writeScopedTools.has(tool)
          ? step.approvalPreview ?? buildApprovalPreview({ tool, args, prompt: undefined })
          : null,
      handoffSummary:
        typeof step.handoffSummary === "string" && step.handoffSummary.trim()
          ? step.handoffSummary
          : null,
      requiresApproval: tool ? writeScopedTools.has(tool) : step.requiresApproval,
      dependsOn: step.dependsOn.filter(Boolean),
    };
  });

  const requestedActions = normalizedSteps
    .filter((step) => step.tool && writeScopedTools.has(step.tool))
    .map((step) => `Execute ${step.tool}`);

  return {
    ...plan,
    executableTools,
    missingGrantTools,
    plannedActions: plan.plannedActions.length
      ? plan.plannedActions
      : normalizedSteps.map((step) => `${step.title}: ${step.objective}`),
    requestedActions,
    steps: normalizedSteps,
  };
};

export const generateAgentDraftsFromBrief = async ({
  brief,
  integrations = [],
}: {
  brief: string;
  integrations?: OrganizationIntegration[];
}): Promise<DraftGenerationResult> => {
  const llmResult = await generateDraftsWithModel({
    brief,
    integrations,
  });

  return normalizeDraftGeneration(llmResult ?? fallbackDraftGeneration(brief));
};

export const publishAgentsFromDraft = (draft: AgentTeamDraft) => {
  return draft.generatedAgents.map((generatedAgent) => {
    const spec: Omit<AgentSpec, "id" | "currentVersionId" | "createdAt" | "updatedAt"> = {
      workspaceId: draft.workspaceId,
      organizationId: draft.organizationId,
      displayName: generatedAgent.roleName,
      mission: generatedAgent.mission,
      responsibilities: generatedAgent.responsibilities,
      allowedTools: generatedAgent.allowedTools,
      knowledgeSources: generatedAgent.knowledgeSources,
      triggerModes: generatedAgent.triggerModes,
      approvalPolicy: generatedAgent.approvalPolicy,
      successMetrics: generatedAgent.successMetrics,
      constraints: generatedAgent.constraints,
      status: "active",
    };

    return spec;
  });
};

export const planRun = async ({
  agent,
  agents,
  prompt,
  integrations,
  toolGrants,
  userId,
}: {
  agent: AgentSpec;
  agents: AgentSpec[];
  prompt?: string;
  integrations: OrganizationIntegration[];
  toolGrants: ToolGrant[];
  userId: string;
}): Promise<{
  run: Omit<Run, "id" | "approvalRequestId" | "orchestration" | "createdAt" | "updatedAt">;
  steps: Array<Omit<RunStep, "id" | "createdAt" | "updatedAt">>;
  requestedActions: string[];
  plan: RunPlan;
}> => {
  const grantedTools = new Set(toolGrants.flatMap((grant) => grant.tools));
  const executableTools = agent.allowedTools.filter((tool) => grantedTools.has(tool));
  const missingGrantTools = agent.allowedTools.filter((tool) => !grantedTools.has(tool));

  const llmPlan = await generateRunPlanWithModel({
    mission: agent.mission,
    prompt,
    agents: agents.map((candidate) => ({
      id: candidate.id,
      displayName: candidate.displayName,
      mission: candidate.mission,
      allowedTools: candidate.allowedTools,
    })),
    executableTools,
    missingGrantTools,
    integrations,
  });

  const plan = normalizeRunPlan({
    plan:
      llmPlan ??
      fallbackRunPlan({
        supervisor: agent,
        agents,
        prompt,
        executableTools,
        missingGrantTools,
        toolGrants,
      }),
    executableTools,
    missingGrantTools,
  });

  const run: Omit<Run, "id" | "approvalRequestId" | "orchestration" | "createdAt" | "updatedAt"> = {
    organizationId: agent.organizationId,
    workspaceId: agent.workspaceId,
    agentId: agent.id,
    triggerType: "manual" satisfies TriggerType,
    status: "queued",
    summary: plan.summary,
    plannedActions: plan.plannedActions,
    approvalRequirement: plan.requestedActions.length ? "required" : "not_required",
    createdByUserId: userId,
  };

  const planningStep: Omit<RunStep, "id" | "createdAt" | "updatedAt"> = {
    runId: "",
    title: "Plan run",
    status: "completed",
    tool: null,
    assignedAgentId: agent.id,
    attempt: 0,
    output: `Prepared ${plan.steps.length} execution steps using ${plan.plannerMode === "llm" ? `${plan.modelProviderKey}:${plan.modelName}` : "fallback planning"}.`,
    errorCode: null,
    startedAt: nowIso(),
    finishedAt: nowIso(),
    receipt: null,
    inputSnapshot: null,
    metadata: {
      plan,
      generatedAt: nowIso(),
    },
  };

  const executionSteps: Array<Omit<RunStep, "id" | "createdAt" | "updatedAt">> = plan.steps.map((step, index) => ({
    runId: "",
    title: step.title,
    status: "queued",
    tool: step.tool,
    assignedAgentId: step.assignedAgentId,
    attempt: 0,
    output: null,
    errorCode: null,
    startedAt: null,
    finishedAt: null,
    receipt: null,
    inputSnapshot: step.arguments,
    metadata: {
      planStep: step,
      handoffSummary: step.handoffSummary,
      approvalPreview: step.approvalPreview,
      plannerMode: plan.plannerMode,
      modelProviderKey: plan.modelProviderKey,
      modelName: plan.modelName,
    },
  }));

  return {
    run,
    steps: [planningStep, ...executionSteps],
    requestedActions: plan.requestedActions,
    plan,
  };
};

export const summarizeAgentTooling = ({
  agent,
  toolGrants,
}: {
  agent: AgentSpec;
  toolGrants: ToolGrant[];
}) => {
  const grantedTools = new Set(toolGrants.flatMap((grant) => grant.tools));
  return {
    grantedTools: agent.allowedTools.filter((tool) => grantedTools.has(tool)),
    missingGrantTools: agent.allowedTools.filter((tool) => !grantedTools.has(tool)),
  };
};

const summarizeProgram = (programFile: ProgramFile) =>
  `${programFile.name} (${programFile.sourceType}) with ${programFile.tags.length} tags`;

export const planPublication = ({
  programFile,
  target,
  integration,
  userId,
}: {
  programFile: ProgramFile;
  target: "base" | "arweave";
  integration: OrganizationIntegration | null;
  userId: string;
}): Omit<PublicationRecord, "id" | "orchestration" | "createdAt" | "updatedAt"> => {
  return {
    organizationId: programFile.organizationId,
    workspaceId: programFile.workspaceId,
    programFileId: programFile.id,
    target,
    status: "queued",
    organizationIntegrationId: integration?.id ?? null,
    summary: `Prepared ${summarizeProgram(programFile)} for ${target} publication.`,
    transactionId: null,
    gatewayUrl: null,
    explorerUrl: null,
    contentHash: null,
    network: null,
    metadata: {
      target,
      createdByUserId: userId,
      integrationStatus: integration?.status ?? "missing",
      tags: programFile.tags,
    },
    receipt: null,
    createdByUserId: userId,
  };
};

export { testPlannerModelIntegration } from "./llm";
