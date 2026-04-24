import crypto from "node:crypto";
import { Context } from "@temporalio/activity";
import { appConfig } from "@agent-marketplace/config";
import type { ApprovalPreview, PublicationReceipt, RunPlanStep, RunStep } from "@agent-marketplace/contracts";
import {
  clearRunApprovalPointer,
  completePublication,
  completeRun,
  completeRunStep,
  createStepApprovalRequest,
  failPublication,
  failRun,
  failRunStep,
  getPublicationExecutionContext,
  getRunExecutionContext,
  getWebsiteCredentialForExecution,
  indexRunInLearningLibrary,
  insertAuditEvent,
  markRunStepStarted,
  updateRunStatus,
} from "@agent-marketplace/database";
import { findToolExecutionAdapter, writeScopedTools } from "@agent-marketplace/integrations";
import Arweave from "arweave";
import type { JWKInterface } from "arweave/web/lib/wallet";
import { baseSepolia } from "viem/chains";
import { createPublicClient, createWalletClient, http, keccak256, stringToHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

export type AgentRunWorkflowInput = {
  runId: string;
};

export type ProgramPublicationWorkflowInput = {
  publicationId: string;
};

type AdvanceRunResult =
  | {
      status: "awaiting_approval";
      note: string;
    }
  | {
      status: "completed" | "failed" | "cancelled";
      note: string;
    }
  | {
      status: "running";
      note: string;
      executedStepId: string | null;
    };

type LoadedRunContext = NonNullable<Awaited<ReturnType<typeof getRunExecutionContext>>>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const toRecord = (value: unknown) => (isRecord(value) ? value : {});

const toPlanStep = (step: RunStep): RunPlanStep | null => {
  const value = step.metadata.planStep;
  return isRecord(value) ? (value as unknown as RunPlanStep) : null;
};

const getApprovalPreview = (step: RunStep) => {
  const value = step.metadata.approvalPreview;
  return isRecord(value) ? (value as unknown as ApprovalPreview) : null;
};

const isBrowserTool = (tool: string | null) => typeof tool === "string" && tool.startsWith("browser.");

const resolveIntegrationForTool = ({
  agentId,
  tool,
  toolGrants,
  integrations,
}: {
  agentId: string | null;
  tool: string;
  toolGrants: LoadedRunContext["toolGrants"];
  integrations: LoadedRunContext["integrations"];
}) => {
  const orderedAgentIds = agentId ? [agentId] : [];
  const grant = toolGrants.find(
    (candidate) => orderedAgentIds.includes(candidate.agentId) && candidate.tools.includes(tool),
  )
    ?? toolGrants.find((candidate) => candidate.tools.includes(tool));

  if (!grant) {
    return null;
  }

  return integrations.find((integration) => integration.id === grant.organizationIntegrationId) ?? null;
};

const dependenciesSatisfied = ({
  step,
  stepsByPlanId,
}: {
  step: RunStep;
  stepsByPlanId: Map<string, RunStep>;
}) => {
  const planStep = toPlanStep(step);
  if (!planStep) {
    return true;
  }

  return planStep.dependsOn.every((dependencyId) => stepsByPlanId.get(dependencyId)?.status === "completed");
};

const getNextExecutableStep = (steps: RunStep[]) => {
  const stepsByPlanId = new Map(
    steps.flatMap((step) => {
      const planStep = toPlanStep(step);
      return planStep?.id ? [[planStep.id, step] as const] : [];
    }),
  );
  return (
    steps.find((step) => step.status === "queued" && dependenciesSatisfied({ step, stepsByPlanId })) ?? null
  );
};

const createSyntheticReceipt = ({
  tool,
  summary,
  data,
}: {
  tool: string;
  summary: string;
  data: Record<string, unknown>;
}) => ({
  providerKey: "system",
  tool,
  summary,
  data,
});

const createDefaultApprovalPreview = (step: RunStep, tool: string): ApprovalPreview => ({
  summary: `Approve ${tool} for ${step.title}`,
  requestedActions: [`Execute ${tool}`],
  tool,
  targetLabel:
    step.inputSnapshot && typeof step.inputSnapshot.path === "string"
      ? step.inputSnapshot.path
      : null,
  payload: step.inputSnapshot ?? {},
});

export async function advanceRunExecution(input: AgentRunWorkflowInput): Promise<AdvanceRunResult> {
  const context = await getRunExecutionContext(input.runId);
  if (!context) {
    return {
      status: "failed",
      note: `Run ${input.runId} no longer exists.`,
    };
  }

  if (context.run.status === "cancelled") {
    return {
      status: "cancelled",
      note: `Run ${input.runId} was cancelled before execution.`,
    };
  }

  if (context.run.status === "failed" || context.run.status === "completed") {
    return {
      status: context.run.status,
      note: context.run.summary,
    };
  }

  const nextStep = getNextExecutableStep(context.steps);
  if (!nextStep) {
    const completed = await completeRun({
      runId: context.run.id,
      summary: `Completed ${context.steps.filter((step) => step.status === "completed").length} steps.`,
    });
    await indexRunInLearningLibrary({
      runId: context.run.id,
      organizationId: context.run.organizationId,
      workspaceId: context.run.workspaceId,
      createdByUserId: context.run.createdByUserId,
    });
    return {
      status: "completed",
      note: completed?.summary ?? "Run completed.",
    };
  }

  const planStep = toPlanStep(nextStep);
  const assignedAgentId = nextStep.assignedAgentId ?? context.run.agentId;

  if (!nextStep.tool) {
    await markRunStepStarted({
      stepId: nextStep.id,
      attempt: nextStep.attempt + 1,
    });
    await completeRunStep({
      stepId: nextStep.id,
      output:
        typeof planStep?.handoffSummary === "string" && planStep.handoffSummary
          ? planStep.handoffSummary
          : nextStep.title,
      receipt: createSyntheticReceipt({
        tool: "system.reason",
        summary: nextStep.title,
        data: {
          assignedAgentId,
          handoffSummary: planStep?.handoffSummary ?? null,
        },
      }),
    });
    await updateRunStatus({
      runId: context.run.id,
      status: "running",
    });
    return {
      status: "running",
      note: `Completed non-tool step ${nextStep.title}.`,
      executedStepId: nextStep.id,
    };
  }

  if (writeScopedTools.has(nextStep.tool)) {
    const approved = context.approvals.find(
      (approval) => approval.runStepId === nextStep.id && approval.status === "approved",
    );
    if (!approved) {
      const existingPending = context.approvals.find(
        (approval) => approval.runStepId === nextStep.id && approval.status === "pending",
      );
      if (!existingPending) {
        const preview = getApprovalPreview(nextStep) ?? createDefaultApprovalPreview(nextStep, nextStep.tool);
        const approval = await createStepApprovalRequest({
          runId: context.run.id,
          runStepId: nextStep.id,
          workspaceId: context.run.workspaceId,
          summary: preview.summary,
          tool: preview.tool,
          targetLabel: preview.targetLabel,
          payload: preview.payload,
          requestedActions: preview.requestedActions,
        });

        await insertAuditEvent({
          organizationId: context.run.organizationId,
          workspaceId: context.run.workspaceId,
          userId: null,
          eventType: "run.step_approval_requested",
          entityType: "approval_request",
          entityId: approval.id,
          payload: {
            runId: context.run.id,
            runStepId: nextStep.id,
            tool: nextStep.tool,
          },
        });
      }

      return {
        status: "awaiting_approval",
        note: `Waiting for approval on ${nextStep.tool}.`,
      };
    }

    await clearRunApprovalPointer(context.run.id);
  }

  const integration = resolveIntegrationForTool({
    agentId: assignedAgentId,
    tool: nextStep.tool,
    toolGrants: context.toolGrants,
    integrations: context.integrations,
  });

  if (!integration) {
    const message = `No connected integration grant is available for ${nextStep.tool}.`;
    await failRunStep({
      stepId: nextStep.id,
      errorCode: "missing_integration",
      output: message,
      receipt: createSyntheticReceipt({
        tool: nextStep.tool,
        summary: message,
        data: {
          assignedAgentId,
        },
      }),
    });
    await failRun({
      runId: context.run.id,
      summary: message,
    });
    return {
      status: "failed",
      note: message,
    };
  }

  const adapter = findToolExecutionAdapter(nextStep.tool);
  if (!adapter) {
    const message = `No execution adapter is registered for ${nextStep.tool}.`;
    await failRunStep({
      stepId: nextStep.id,
      errorCode: "missing_adapter",
      output: message,
      receipt: createSyntheticReceipt({
        tool: nextStep.tool,
        summary: message,
        data: {
          providerKey: integration.providerKey,
        },
      }),
    });
    await failRun({
      runId: context.run.id,
      summary: message,
    });
    return {
      status: "failed",
      note: message,
    };
  }

  const credentialId = isBrowserTool(nextStep.tool)
    ? typeof nextStep.inputSnapshot?.credentialId === "string" && nextStep.inputSnapshot.credentialId.trim()
      ? nextStep.inputSnapshot.credentialId.trim()
      : typeof integration.metadata.defaultCredentialId === "string" && integration.metadata.defaultCredentialId.trim()
        ? integration.metadata.defaultCredentialId.trim()
        : null
    : null;

  const websiteCredential = credentialId
    ? await getWebsiteCredentialForExecution({
        credentialId,
        organizationId: context.run.organizationId,
        workspaceId: context.run.workspaceId,
      })
    : null;

  if (credentialId && !websiteCredential) {
    const message = `Website credential ${credentialId} is not available for ${nextStep.tool}.`;
    await failRunStep({
      stepId: nextStep.id,
      errorCode: "missing_credential",
      output: message,
      receipt: createSyntheticReceipt({
        tool: nextStep.tool,
        summary: message,
        data: {
          providerKey: integration.providerKey,
          credentialId,
        },
      }),
    });
    await failRun({
      runId: context.run.id,
      summary: message,
    });
    return {
      status: "failed",
      note: message,
    };
  }

  await updateRunStatus({
    runId: context.run.id,
    status: "running",
  });

  await markRunStepStarted({
    stepId: nextStep.id,
    attempt: nextStep.attempt + 1,
  });

  try {
    const result = await adapter.execute({
      integration,
      tool: nextStep.tool,
      args: nextStep.inputSnapshot ?? {},
      runtime: {
        websiteCredential,
      },
    });

    await completeRunStep({
      stepId: nextStep.id,
      output: result.output,
      receipt: result.receipt,
    });

    await insertAuditEvent({
      organizationId: context.run.organizationId,
      workspaceId: context.run.workspaceId,
      userId: null,
      eventType: "run.step_completed",
      entityType: "run_step",
      entityId: nextStep.id,
      payload: {
        runId: context.run.id,
        tool: nextStep.tool,
        assignedAgentId,
      },
    });

    return {
      status: "running",
      note: `Executed ${nextStep.tool}.`,
      executedStepId: nextStep.id,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : `Execution failed for ${nextStep.tool}.`;
    await failRunStep({
      stepId: nextStep.id,
      errorCode: "execution_failed",
      output: message,
      receipt: createSyntheticReceipt({
        tool: nextStep.tool,
        summary: message,
        data: {
          providerKey: integration.providerKey,
          assignedAgentId,
        },
      }),
    });
    await failRun({
      runId: context.run.id,
      summary: message,
    });
    await insertAuditEvent({
      organizationId: context.run.organizationId,
      workspaceId: context.run.workspaceId,
      userId: null,
      eventType: "run.step_failed",
      entityType: "run_step",
      entityId: nextStep.id,
      payload: {
        runId: context.run.id,
        tool: nextStep.tool,
        error: message,
      },
    });
    return {
      status: "failed",
      note: message,
    };
  }
}

const sha256Hex = (value: string) => crypto.createHash("sha256").update(value).digest("hex");

const buildArweaveClient = () => {
  const gateway = new URL(appConfig.arweaveGatewayUrl ?? "https://arweave.net");
  return Arweave.init({
    host: gateway.hostname,
    port: gateway.port ? Number(gateway.port) : gateway.protocol === "https:" ? 443 : 80,
    protocol: gateway.protocol.replace(":", "") as "http" | "https",
  });
};

const publishToArweave = async ({
  publicationId,
  programFileId,
  content,
  name,
  workspaceId,
}: {
  publicationId: string;
  programFileId: string;
  content: string;
  name: string;
  workspaceId: string;
}) => {
  if (!appConfig.arweaveWalletJwk) {
    throw new Error("ARWEAVE_WALLET_JWK is not configured.");
  }

  const wallet = JSON.parse(appConfig.arweaveWalletJwk) as JWKInterface;
  const arweave = buildArweaveClient();
  const tx = await arweave.createTransaction({ data: content }, wallet);
  tx.addTag("App-Name", "agent-marketplace");
  tx.addTag("Program-File-Id", programFileId);
  tx.addTag("Publication-Id", publicationId);
  tx.addTag("Workspace-Id", workspaceId);
  tx.addTag("Program-Name", name);

  await arweave.transactions.sign(tx, wallet);
  const response = await arweave.transactions.post(tx);
  if (response.status !== 200 && response.status !== 202) {
    throw new Error(`Arweave upload failed with status ${response.status}.`);
  }

  const contentHash = sha256Hex(content);
  const gatewayBase = appConfig.arweaveGatewayUrl ?? "https://arweave.net";
  const receipt: PublicationReceipt = {
    target: "arweave",
    network: "arweave-mainnet",
    transactionId: tx.id,
    explorerUrl: `https://viewblock.io/arweave/tx/${tx.id}`,
    gatewayUrl: `${gatewayBase.replace(/\/+$/, "")}/${tx.id}`,
    contentHash,
    metadataHash: sha256Hex(JSON.stringify({ publicationId, programFileId, name })),
    data: {
      status: response.status,
      reward: tx.reward,
      dataSize: tx.data_size,
    },
  };

  return receipt;
};

const publishToBase = async ({
  publicationId,
  programFileId,
  content,
  name,
}: {
  publicationId: string;
  programFileId: string;
  content: string;
  name: string;
}) => {
  if (!appConfig.baseSepoliaRpcUrl || !appConfig.basePublisherPrivateKey) {
    throw new Error("Base Sepolia publisher environment is not configured.");
  }

  const account = privateKeyToAccount(appConfig.basePublisherPrivateKey as `0x${string}`);
  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(appConfig.baseSepoliaRpcUrl),
  });
  const walletClient = createWalletClient({
    account,
    chain: baseSepolia,
    transport: http(appConfig.baseSepoliaRpcUrl),
  });

  const contentHash = sha256Hex(content);
  const metadataHash = sha256Hex(JSON.stringify({ publicationId, programFileId, name }));
  const anchorPayload = JSON.stringify({
    publicationId,
    programFileId,
    name,
    contentHash,
    metadataHash,
  });

  const hash = await walletClient.sendTransaction({
    account,
    to: account.address,
    value: 0n,
    data: stringToHex(anchorPayload),
  });
  const chainReceipt = await publicClient.waitForTransactionReceipt({ hash });

  const receipt: PublicationReceipt = {
    target: "base",
    network: "base-sepolia",
    transactionId: hash,
    explorerUrl: `https://sepolia.basescan.org/tx/${hash}`,
    gatewayUrl: null,
    contentHash,
    metadataHash,
    data: {
      blockNumber: chainReceipt.blockNumber.toString(),
      blockHash: chainReceipt.blockHash,
      transactionHash: chainReceipt.transactionHash,
      payloadHash: keccak256(stringToHex(anchorPayload)),
    },
  };

  return receipt;
};

export async function publishProgramFile(input: ProgramPublicationWorkflowInput) {
  const info = Context.current().info;
  const context = await getPublicationExecutionContext(input.publicationId);
  if (!context) {
    throw new Error(`Publication ${input.publicationId} no longer exists.`);
  }

  let receipt: PublicationReceipt;

  try {
    receipt =
      context.publication.target === "arweave"
        ? await publishToArweave({
            publicationId: context.publication.id,
            programFileId: context.programFile.id,
            content: context.programFile.content,
            name: context.programFile.name,
            workspaceId: context.programFile.workspaceId,
          })
        : await publishToBase({
            publicationId: context.publication.id,
            programFileId: context.programFile.id,
            content: context.programFile.content,
            name: context.programFile.name,
          });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Publication failed.";
    await failPublication({
      publicationId: context.publication.id,
      summary: message,
    });
    throw error;
  }

  await completePublication({
    publicationId: context.publication.id,
    status: "published",
    transactionId: receipt.transactionId,
    gatewayUrl: receipt.gatewayUrl,
    explorerUrl: receipt.explorerUrl,
    contentHash: receipt.contentHash,
    network: receipt.network,
    summary: `Published ${context.programFile.name} to ${context.publication.target}.`,
    receipt,
  });

  await insertAuditEvent({
    organizationId: context.publication.organizationId,
    workspaceId: context.publication.workspaceId,
    userId: null,
    eventType: `program_file.published.${context.publication.target}`,
    entityType: "publication_record",
    entityId: context.publication.id,
    payload: {
      transactionId: receipt.transactionId,
      network: receipt.network,
      workflowId: info.workflowExecution.workflowId,
    },
  });

  return {
    workflowId: info.workflowExecution.workflowId,
    runId: info.workflowExecution.runId,
    transactionId: receipt.transactionId,
    gatewayUrl: receipt.gatewayUrl,
    explorerUrl: receipt.explorerUrl,
    contentHash: receipt.contentHash,
    network: receipt.network,
  };
}

export async function handlePublicationFailure({
  publicationId,
  message,
}: {
  publicationId: string;
  message: string;
}) {
  const context = await getPublicationExecutionContext(publicationId);
  if (context?.publication.status === "failed") {
    return;
  }

  await failPublication({
    publicationId,
    summary: message,
  });
}
