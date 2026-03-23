import { Connection, Client } from "@temporalio/client";
import { appConfig } from "@agent-marketplace/config";
import type { OrchestrationRef } from "@agent-marketplace/contracts";

let clientPromise: Promise<Client> | null = null;

const getTemporalClient = async () => {
  if (!clientPromise) {
    clientPromise = (async () => {
      const connection = await Connection.connect({
        address: appConfig.temporalAddress,
      });

      return new Client({
        connection,
        namespace: appConfig.temporalNamespace,
      });
    })();
  }

  return clientPromise;
};

const unavailableOrchestration = ({
  workflowType,
  taskQueue,
  error,
}: {
  workflowType: string;
  taskQueue: string;
  error?: string | null;
}): OrchestrationRef => ({
  engine: "temporal",
  workflowId: null,
  workflowRunId: null,
  workflowType,
  taskQueue,
  namespace: appConfig.temporalNamespace,
  status: error ? "failed_to_start" : "unavailable",
  lastError: error ?? null,
});

const withRunHandle = async (workflowId: string) => {
  const client = await getTemporalClient();
  return client.workflow.getHandle(workflowId);
};

export const startTemporalRunWorkflow = async ({
  runId,
  workspaceId,
  organizationId,
  agentId,
  approvalRequired,
  plannedActions,
}: {
  runId: string;
  workspaceId: string;
  organizationId: string;
  agentId: string;
  approvalRequired: boolean;
  plannedActions: string[];
}): Promise<OrchestrationRef> => {
  const workflowType = "agentRunWorkflow";
  const taskQueue = appConfig.temporalRunTaskQueue;

  if (!appConfig.temporalEnabled) {
    return unavailableOrchestration({
      workflowType,
      taskQueue,
    });
  }

  try {
    const client = await getTemporalClient();
    const handle = await client.workflow.start(workflowType, {
      taskQueue,
      workflowId: `run-${runId}`,
      args: [
        {
          runId,
          workspaceId,
          organizationId,
          agentId,
          approvalRequired,
          plannedActions,
        },
      ],
    });

    return {
      engine: "temporal",
      workflowId: handle.workflowId,
      workflowRunId: handle.firstExecutionRunId,
      workflowType,
      taskQueue,
      namespace: appConfig.temporalNamespace,
      status: "started",
      lastError: null,
    };
  } catch (error) {
    return unavailableOrchestration({
      workflowType,
      taskQueue,
      error: error instanceof Error ? error.message : "Unknown Temporal error",
    });
  }
};

export const startTemporalPublicationWorkflow = async ({
  publicationId,
  programFileId,
  organizationId,
  workspaceId,
  target,
  programName,
}: {
  publicationId: string;
  programFileId: string;
  organizationId: string;
  workspaceId: string;
  target: "base" | "arweave";
  programName: string;
}): Promise<OrchestrationRef> => {
  const workflowType = "programPublicationWorkflow";
  const taskQueue = appConfig.temporalPublicationTaskQueue;

  if (!appConfig.temporalEnabled) {
    return unavailableOrchestration({
      workflowType,
      taskQueue,
    });
  }

  try {
    const client = await getTemporalClient();
    const handle = await client.workflow.start(workflowType, {
      taskQueue,
      workflowId: `publication-${publicationId}`,
      args: [
        {
          publicationId,
          programFileId,
          organizationId,
          workspaceId,
          target,
          programName,
        },
      ],
    });

    return {
      engine: "temporal",
      workflowId: handle.workflowId,
      workflowRunId: handle.firstExecutionRunId,
      workflowType,
      taskQueue,
      namespace: appConfig.temporalNamespace,
      status: "started",
      lastError: null,
    };
  } catch (error) {
    return unavailableOrchestration({
      workflowType,
      taskQueue,
      error: error instanceof Error ? error.message : "Unknown Temporal error",
    });
  }
};

export const signalTemporalRunApproval = async ({
  workflowId,
  approved,
  resolvedByUserId,
}: {
  workflowId: string;
  approved: boolean;
  resolvedByUserId: string;
}) => {
  if (!appConfig.temporalEnabled) {
    return {
      success: false,
      error: "Temporal is disabled.",
    };
  }

  try {
    const handle = await withRunHandle(workflowId);
    await handle.signal("approvalResolved", {
      approved,
      resolvedByUserId,
    });

    return {
      success: true,
      error: null,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown Temporal signal error",
    };
  }
};

export const cancelTemporalRunWorkflow = async (workflowId: string) => {
  if (!appConfig.temporalEnabled) {
    return {
      success: false,
      error: "Temporal is disabled.",
    };
  }

  try {
    const handle = await withRunHandle(workflowId);
    await handle.cancel();
    return {
      success: true,
      error: null,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown Temporal cancel error",
    };
  }
};
