import type {
  AgentDraft,
  AgentSpec,
  AgentTeamDraft,
  ApprovalRequirement,
  OrganizationIntegration,
  ProgramFile,
  PublicationRecord,
  Run,
  RunStep,
  ToolGrant,
  TriggerType,
} from "@agent-marketplace/contracts";
import { writeScopedTools } from "@agent-marketplace/integrations";

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const inferRoleSeeds = (brief: string) => {
  const normalized = brief.toLowerCase();
  const seeds = [];

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

const nowIso = () => new Date().toISOString();

export const generateAgentDraftsFromBrief = (brief: string): Pick<AgentTeamDraft, "generatedAgents" | "clarifications"> => {
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
      knowledgeSources: [
        "workspace brief",
        "connected integrations",
        "approved run history",
      ],
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

  const clarifications =
    brief.trim().length < 80
      ? [
          "The brief is thin. Add target systems, example tasks, and the decisions these agents should make autonomously.",
        ]
      : [];

  return { generatedAgents, clarifications };
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

export const planRun = ({
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
}): {
  run: Omit<Run, "id" | "approvalRequestId" | "orchestration" | "createdAt" | "updatedAt">;
  steps: Array<Omit<RunStep, "id" | "createdAt" | "updatedAt">>;
  requestedActions: string[];
} => {
  const grantedTools = new Set(toolGrants.flatMap((grant) => grant.tools));
  const executableTools = agent.allowedTools.filter((tool) => grantedTools.has(tool));
  const missingGrantTools = agent.allowedTools.filter((tool) => !grantedTools.has(tool));
  const availableProviders = integrations.map((integration) => integration.providerKey).join(", ");
  const plannedActions = [
    `Review ${agent.displayName.toLowerCase()} mission and current task brief`,
    prompt ? `Use prompt context: ${prompt}` : "Use workspace brief and latest configuration",
    `Operate with granted tools: ${executableTools.join(", ") || "none yet"}`,
    availableProviders
      ? `Cross-check available integrations: ${availableProviders}`
      : "No connected integrations yet; stay in planning mode",
    missingGrantTools.length
      ? `Do not use ungranted tools: ${missingGrantTools.join(", ")}`
      : "All configured tools are granted for execution",
  ];

  const requestedActions = executableTools
    .filter((tool) => writeScopedTools.has(tool))
    .map((tool) => `Execute tool ${tool} after approval`);

  const run: Omit<Run, "id" | "approvalRequestId" | "orchestration" | "createdAt" | "updatedAt"> = {
    organizationId: agent.organizationId,
    workspaceId: agent.workspaceId,
    agentId: agent.id,
    triggerType: "manual" satisfies TriggerType,
    status: requestedActions.length ? "awaiting_approval" : "running",
    summary: `${agent.displayName} is preparing a run plan for the current task.`,
    plannedActions,
    approvalRequirement: requestedActions.length ? "required" : "not_required",
    createdByUserId: userId,
  };

  const steps: Array<Omit<RunStep, "id" | "createdAt" | "updatedAt">> = [
    {
      runId: "",
      title: "Plan run",
      status: "completed",
      output: `Planned ${plannedActions.length} actions.`,
      metadata: {
        plannedActions,
        executableTools,
        missingGrantTools,
        generatedAt: nowIso(),
      },
    },
    {
      runId: "",
      title: requestedActions.length ? "Await approval" : "Execute read-only workflow",
      status: requestedActions.length ? "queued" : "running",
      output: requestedActions.length ? null : "Execution can continue without approval.",
      metadata: {
        requestedActions,
        executableTools,
        missingGrantTools,
      },
    },
  ];

  return {
    run,
    steps,
    requestedActions,
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
