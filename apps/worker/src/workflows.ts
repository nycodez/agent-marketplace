import { condition, defineSignal, proxyActivities, setHandler } from "@temporalio/workflow";
import type {
  AgentRunWorkflowInput,
  ProgramPublicationWorkflowInput,
} from "./activities";

const approvalResolvedSignal = defineSignal("approvalResolved");

const {
  advanceRunExecution,
} = proxyActivities<{
  advanceRunExecution: typeof import("./activities").advanceRunExecution;
}>({
  startToCloseTimeout: "10 minutes",
});

const {
  publishProgramFile,
  handlePublicationFailure,
} = proxyActivities<{
  publishProgramFile: typeof import("./activities").publishProgramFile;
  handlePublicationFailure: typeof import("./activities").handlePublicationFailure;
}>({
  startToCloseTimeout: "10 minutes",
  retry: {
    maximumAttempts: 1,
  },
});

export async function agentRunWorkflow(input: AgentRunWorkflowInput) {
  let approvalResolved = false;

  setHandler(approvalResolvedSignal, () => {
    approvalResolved = true;
  });

  while (true) {
    const result = await advanceRunExecution(input);

    if (result.status === "awaiting_approval") {
      await condition(() => approvalResolved);
      approvalResolved = false;
      continue;
    }

    if (result.status === "running") {
      continue;
    }

    return result;
  }
}

export async function programPublicationWorkflow(input: ProgramPublicationWorkflowInput) {
  try {
    const result = await publishProgramFile(input);
    return {
      status: "published",
      ...result,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown publication failure.";
    await handlePublicationFailure({
      publicationId: input.publicationId,
      message,
    });
    return {
      status: "failed",
      error: message,
    };
  }
}
