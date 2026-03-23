import { Context } from "@temporalio/activity";

export type AgentRunWorkflowInput = {
  runId: string;
  workspaceId: string;
  organizationId: string;
  agentId: string;
  approvalRequired: boolean;
  plannedActions: string[];
};

export type ProgramPublicationWorkflowInput = {
  publicationId: string;
  programFileId: string;
  organizationId: string;
  workspaceId: string;
  target: "base" | "arweave";
  programName: string;
};

export async function executeAgentRun(input: AgentRunWorkflowInput) {
  const info = Context.current().info;
  return {
    workflowId: info.workflowExecution.workflowId,
    runId: info.workflowExecution.runId,
    note: `Temporal activity executed ${input.plannedActions.length} planned actions for agent ${input.agentId}.`,
  };
}

export async function publishProgramFile(input: ProgramPublicationWorkflowInput) {
  const info = Context.current().info;
  const transactionId = `${input.target}_${input.programFileId}_${Date.now()}`;
  const gatewayUrl =
    input.target === "base"
      ? `https://basescan.org/address/${input.programName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`
      : `https://arweave.net/${input.programName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

  return {
    workflowId: info.workflowExecution.workflowId,
    runId: info.workflowExecution.runId,
    transactionId,
    gatewayUrl,
    note: `Temporal activity prepared ${input.target} publication for ${input.programName}.`,
  };
}
