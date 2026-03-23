import { condition, defineSignal, proxyActivities, setHandler } from "@temporalio/workflow";
import type {
  AgentRunWorkflowInput,
  ProgramPublicationWorkflowInput,
} from "./activities";

const approvalResolvedSignal = defineSignal<[{
  approved: boolean;
  resolvedByUserId: string;
}]>("approvalResolved");

const { executeAgentRun, publishProgramFile } = proxyActivities<{
  executeAgentRun: typeof import("./activities").executeAgentRun;
  publishProgramFile: typeof import("./activities").publishProgramFile;
}>({
  startToCloseTimeout: "5 minutes",
});

export async function agentRunWorkflow(input: AgentRunWorkflowInput) {
  let approvalResolved = !input.approvalRequired;
  let approved = !input.approvalRequired;
  let resolvedByUserId: string | null = null;

  setHandler(approvalResolvedSignal, (payload) => {
    approvalResolved = true;
    approved = payload.approved;
    resolvedByUserId = payload.resolvedByUserId;
  });

  if (input.approvalRequired) {
    await condition(() => approvalResolved);
    if (!approved) {
      return {
        status: "cancelled",
        note: `Approval was denied${resolvedByUserId ? ` by ${resolvedByUserId}` : ""}.`,
        plannedActions: input.plannedActions,
      };
    }
  }

  const result = await executeAgentRun(input);
  return {
    status: "completed",
    resolvedByUserId,
    ...result,
  };
}

export async function programPublicationWorkflow(input: ProgramPublicationWorkflowInput) {
  const result = await publishProgramFile(input);
  return {
    status: "published",
    ...result,
  };
}
