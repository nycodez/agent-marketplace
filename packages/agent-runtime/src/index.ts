import type {
  AgentDraft,
  AgentSpec,
  AgentTeamDraft,
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
  agent,
  prompt,
  executableTools,
  missingGrantTools,
}: {
  agent: AgentSpec;
  prompt?: string;
  executableTools: string[];
  missingGrantTools: string[];
}): RunPlan => {
  const stepChain: RunPlanStep[] = executableTools.length
    ? executableTools.map((tool, index) => ({
        id: `step-${index + 1}`,
        title: index === 0 ? "Review context" : `Use ${tool}`,
        objective:
          index === 0
            ? "Review the current task context and collect the facts needed for execution."
            : `Use ${tool} to advance the current assignment.`,
        tool: index === 0 && !tool.includes(".read") ? null : tool,
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
          dependsOn: [],
          requiresApproval: false,
          kind: "reason" as const,
        },
      ];

  const requestedActions = stepChain
    .filter((step) => step.tool && writeScopedTools.has(step.tool))
    .map((step) => `Execute ${step.tool}`);

  return {
    summary: `${agent.displayName} is preparing a run plan for the current task.`,
    plannedActions: [
      `Review ${agent.displayName.toLowerCase()} mission and current task brief`,
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
    return {
      ...step,
      id: step.id?.trim() ? step.id : `step-${index + 1}`,
      tool,
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
  prompt,
  integrations,
  toolGrants,
  userId,
}: {
  agent: AgentSpec;
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
    executableTools,
    missingGrantTools,
    integrations,
  });

  const plan = normalizeRunPlan({
    plan:
      llmPlan ??
      fallbackRunPlan({
        agent,
        prompt,
        executableTools,
        missingGrantTools,
      }),
    executableTools,
    missingGrantTools,
  });

  const run: Omit<Run, "id" | "approvalRequestId" | "orchestration" | "createdAt" | "updatedAt"> = {
    organizationId: agent.organizationId,
    workspaceId: agent.workspaceId,
    agentId: agent.id,
    triggerType: "manual" satisfies TriggerType,
    status: plan.requestedActions.length ? "awaiting_approval" : "running",
    summary: plan.summary,
    plannedActions: plan.plannedActions,
    approvalRequirement: plan.requestedActions.length ? "required" : "not_required",
    createdByUserId: userId,
  };

  const planningStep: Omit<RunStep, "id" | "createdAt" | "updatedAt"> = {
    runId: "",
    title: "Plan run",
    status: "completed",
    output: `Prepared ${plan.steps.length} execution steps using ${plan.plannerMode === "llm" ? `${plan.modelProviderKey}:${plan.modelName}` : "fallback planning"}.`,
    metadata: {
      plan,
      generatedAt: nowIso(),
    },
  };

  const executionSteps: Array<Omit<RunStep, "id" | "createdAt" | "updatedAt">> = plan.steps.map((step, index) => ({
    runId: "",
    title: step.title,
    status: plan.requestedActions.length ? "queued" : index === 0 ? "running" : "queued",
    output: null,
    metadata: {
      planStep: step,
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
  const gatewayUrl =
    target === "base"
      ? `https://basescan.org/address/${slugify(programFile.name)}`
      : `https://arweave.net/${slugify(programFile.name)}`;

  return {
    organizationId: programFile.organizationId,
    workspaceId: programFile.workspaceId,
    programFileId: programFile.id,
    target,
    status: integration ? "published" : "queued",
    organizationIntegrationId: integration?.id ?? null,
    summary: `Prepared ${summarizeProgram(programFile)} for ${target} publication.`,
    transactionId: integration ? `${target}_${slugify(programFile.name)}_${Date.now()}` : null,
    gatewayUrl: integration ? gatewayUrl : null,
    metadata: {
      target,
      createdByUserId: userId,
      integrationStatus: integration?.status ?? "missing",
      tags: programFile.tags,
    },
    createdByUserId: userId,
  };
};

export { testPlannerModelIntegration } from "./llm";
