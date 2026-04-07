import crypto from "node:crypto";
import { appConfig } from "@agent-marketplace/config";
import type {
  AgentSpec,
  ApprovalRequest,
  AuditEvent,
  OrganizationIntegration,
  OrchestrationRef,
  ProgramFile,
  PublicationRecord,
  Run,
  RunStep,
  ToolGrant,
} from "@agent-marketplace/contracts";
import { Pool, type PoolClient } from "pg";

const pool = new Pool({
  connectionString: appConfig.databaseUrl,
});

const nowIso = () => new Date().toISOString();
const createId = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;

const toIsoString = (value: unknown) => {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  const next = new Date(String(value));
  return Number.isNaN(next.valueOf()) ? null : next.toISOString();
};

const toStringArray = (value: unknown) =>
  Array.isArray(value) ? value.map((entry) => String(entry)) : [];

const toRecord = (value: unknown) =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const mapAgent = (row: Record<string, any>): AgentSpec => ({
  id: row.id,
  workspaceId: row.workspace_id,
  organizationId: row.organization_id,
  displayName: row.display_name,
  mission: row.mission,
  responsibilities: toStringArray(row.responsibilities),
  allowedTools: toStringArray(row.allowed_tools),
  knowledgeSources: toStringArray(row.knowledge_sources),
  triggerModes: Array.isArray(row.trigger_modes) ? row.trigger_modes : [],
  approvalPolicy: row.approval_policy,
  successMetrics: toStringArray(row.success_metrics),
  constraints: toStringArray(row.constraints),
  status: row.status,
  currentVersionId: row.current_version_id,
  createdAt: toIsoString(row.created_at) ?? nowIso(),
  updatedAt: toIsoString(row.updated_at) ?? nowIso(),
});

const mapIntegration = (row: Record<string, any>): OrganizationIntegration => ({
  id: row.id,
  organizationId: row.organization_id,
  providerKey: row.provider_key,
  displayName: row.display_name,
  status: row.status,
  authType: row.auth_type,
  scopes: toStringArray(row.scopes),
  metadata: toRecord(row.metadata),
  createdByUserId: row.created_by_user_id,
  createdAt: toIsoString(row.created_at) ?? nowIso(),
  updatedAt: toIsoString(row.updated_at) ?? nowIso(),
  lastValidatedAt: toIsoString(row.last_validated_at),
});

const mapToolGrant = (row: Record<string, any>): ToolGrant => ({
  id: row.id,
  workspaceId: row.workspace_id,
  agentId: row.agent_id,
  organizationIntegrationId: row.organization_integration_id,
  providerKey: row.provider_key,
  tools: toStringArray(row.tools),
  createdByUserId: row.created_by_user_id,
  createdAt: toIsoString(row.created_at) ?? nowIso(),
});

const mapProgramFile = (row: Record<string, any>): ProgramFile => ({
  id: row.id,
  organizationId: row.organization_id,
  workspaceId: row.workspace_id,
  agentId: row.agent_id,
  name: row.name,
  description: row.description,
  sourceType: row.source_type,
  content: row.content,
  tags: toStringArray(row.tags),
  createdByUserId: row.created_by_user_id,
  createdAt: toIsoString(row.created_at) ?? nowIso(),
  updatedAt: toIsoString(row.updated_at) ?? nowIso(),
});

const mapPublication = (row: Record<string, any>): PublicationRecord => ({
  id: row.id,
  organizationId: row.organization_id,
  workspaceId: row.workspace_id,
  programFileId: row.program_file_id,
  target: row.target,
  status: row.status,
  organizationIntegrationId: row.organization_integration_id,
  summary: row.summary,
  transactionId: row.transaction_id,
  gatewayUrl: row.gateway_url,
  explorerUrl: row.explorer_url,
  contentHash: row.content_hash,
  network: row.network,
  metadata: toRecord(row.metadata),
  receipt: row.receipt ? toRecord(row.receipt) as PublicationRecord["receipt"] : null,
  orchestration: toRecord(row.orchestration) as OrchestrationRef,
  createdByUserId: row.created_by_user_id,
  createdAt: toIsoString(row.created_at) ?? nowIso(),
  updatedAt: toIsoString(row.updated_at) ?? nowIso(),
});

const mapRun = (row: Record<string, any>): Run => ({
  id: row.id,
  organizationId: row.organization_id,
  workspaceId: row.workspace_id,
  agentId: row.agent_id,
  triggerType: row.trigger_type,
  status: row.status,
  summary: row.summary,
  plannedActions: toStringArray(row.planned_actions),
  approvalRequirement: row.approval_requirement,
  approvalRequestId: row.approval_request_id,
  orchestration: toRecord(row.orchestration) as OrchestrationRef,
  createdByUserId: row.created_by_user_id,
  createdAt: toIsoString(row.created_at) ?? nowIso(),
  updatedAt: toIsoString(row.updated_at) ?? nowIso(),
});

const mapRunStep = (row: Record<string, any>): RunStep => ({
  id: row.id,
  runId: row.run_id,
  title: row.title,
  status: row.status,
  tool: row.tool,
  assignedAgentId: row.assigned_agent_id,
  attempt: Number(row.attempt ?? 0),
  output: row.output,
  errorCode: row.error_code,
  startedAt: toIsoString(row.started_at),
  finishedAt: toIsoString(row.finished_at),
  receipt: row.receipt ? toRecord(row.receipt) as RunStep["receipt"] : null,
  inputSnapshot: row.input_snapshot ? toRecord(row.input_snapshot) : null,
  metadata: toRecord(row.metadata),
  createdAt: toIsoString(row.created_at) ?? nowIso(),
  updatedAt: toIsoString(row.updated_at) ?? nowIso(),
});

const mapApproval = (row: Record<string, any>): ApprovalRequest => ({
  id: row.id,
  runId: row.run_id,
  runStepId: row.run_step_id,
  workspaceId: row.workspace_id,
  status: row.status,
  summary: row.summary,
  tool: row.tool,
  targetLabel: row.target_label,
  payload: toRecord(row.payload),
  requestedActions: toStringArray(row.requested_actions),
  createdAt: toIsoString(row.created_at) ?? nowIso(),
  resolvedAt: toIsoString(row.resolved_at),
});

const mapAuditEvent = (row: Record<string, any>): AuditEvent => ({
  id: row.id,
  organizationId: row.organization_id,
  workspaceId: row.workspace_id,
  userId: row.user_id,
  eventType: row.event_type,
  entityType: row.entity_type,
  entityId: row.entity_id,
  payload: toRecord(row.payload),
  createdAt: toIsoString(row.created_at) ?? nowIso(),
});

const withTransaction = async <T>(callback: (client: PoolClient) => Promise<T>) => {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await callback(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
};

export type RunListItem = Run & {
  agent: AgentSpec | null;
  approvalRequest: ApprovalRequest | null;
};

export type RunDetail = {
  run: Run;
  steps: RunStep[];
  approvalRequest: ApprovalRequest | null;
};

export type RunExecutionContext = {
  run: Run;
  steps: RunStep[];
  approvals: ApprovalRequest[];
  agents: AgentSpec[];
  integrations: OrganizationIntegration[];
  toolGrants: ToolGrant[];
};

export type PublicationExecutionContext = {
  publication: PublicationRecord;
  programFile: ProgramFile;
  integration: OrganizationIntegration | null;
};

export const insertRunGraph = async ({
  run,
  steps,
}: {
  run: Run;
  steps: RunStep[];
}) => {
  await withTransaction(async (client) => {
    await client.query(
      `insert into runs (
        id, organization_id, workspace_id, agent_id, trigger_type, status, summary,
        planned_actions, approval_requirement, approval_request_id, orchestration,
        created_by_user_id, created_at, updated_at
      ) values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11::jsonb,$12,$13,$14)`,
      [
        run.id,
        run.organizationId,
        run.workspaceId,
        run.agentId,
        run.triggerType,
        run.status,
        run.summary,
        JSON.stringify(run.plannedActions),
        run.approvalRequirement,
        run.approvalRequestId,
        JSON.stringify(run.orchestration),
        run.createdByUserId,
        run.createdAt,
        run.updatedAt,
      ],
    );

    for (const step of steps) {
      await client.query(
        `insert into run_steps (
          id, run_id, title, status, tool, assigned_agent_id, attempt, output, error_code,
          started_at, finished_at, receipt, input_snapshot, metadata, created_at, updated_at
        ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13::jsonb,$14::jsonb,$15,$16)`,
        [
          step.id,
          step.runId,
          step.title,
          step.status,
          step.tool,
          step.assignedAgentId,
          step.attempt,
          step.output,
          step.errorCode,
          step.startedAt,
          step.finishedAt,
          step.receipt ? JSON.stringify(step.receipt) : null,
          step.inputSnapshot ? JSON.stringify(step.inputSnapshot) : null,
          JSON.stringify(step.metadata),
          step.createdAt,
          step.updatedAt,
        ],
      );
    }
  });
};

export const updateRunWorkflowStart = async ({
  runId,
  orchestration,
  status,
}: {
  runId: string;
  orchestration: OrchestrationRef;
  status?: Run["status"];
}) => {
  const result = await pool.query(
    `update runs
      set orchestration = $2::jsonb,
          status = coalesce($3, status),
          updated_at = $4
      where id = $1
      returning *`,
    [runId, JSON.stringify(orchestration), status ?? null, nowIso()],
  );
  return result.rows[0] ? mapRun(result.rows[0]) : null;
};

export const listRunsByWorkspace = async (workspaceId: string): Promise<RunListItem[]> => {
  const [runsResult, agentsResult, approvalsResult] = await Promise.all([
    pool.query("select * from runs where workspace_id = $1 order by created_at desc", [workspaceId]),
    pool.query("select * from agents where workspace_id = $1", [workspaceId]),
    pool.query("select * from approval_requests where workspace_id = $1 order by created_at desc", [workspaceId]),
  ]);

  const agents = new Map(agentsResult.rows.map((row) => {
    const agent = mapAgent(row);
    return [agent.id, agent] as const;
  }));
  const approvals = approvalsResult.rows.map(mapApproval);
  const currentApprovalByRun = new Map<string, ApprovalRequest>();
  for (const approval of approvals) {
    if (approval.status === "pending" && !currentApprovalByRun.has(approval.runId)) {
      currentApprovalByRun.set(approval.runId, approval);
    }
  }

  return runsResult.rows.map((row) => {
    const run = mapRun(row);
    return {
      ...run,
      approvalRequest: currentApprovalByRun.get(run.id) ?? null,
      agent: agents.get(run.agentId) ?? null,
    };
  });
};

export const getRunDetail = async ({
  runId,
  workspaceId,
}: {
  runId: string;
  workspaceId: string;
}): Promise<RunDetail | null> => {
  const runResult = await pool.query("select * from runs where id = $1 and workspace_id = $2", [runId, workspaceId]);
  const row = runResult.rows[0];
  if (!row) {
    return null;
  }

  const [stepsResult, approvalsResult] = await Promise.all([
    pool.query("select * from run_steps where run_id = $1 order by created_at asc", [runId]),
    pool.query("select * from approval_requests where run_id = $1 order by created_at desc", [runId]),
  ]);

  const approvalRequest =
    approvalsResult.rows.map(mapApproval).find((approval) => approval.status === "pending") ?? null;

  return {
    run: mapRun(row),
    steps: stepsResult.rows.map(mapRunStep),
    approvalRequest,
  };
};

export const getCurrentPendingApprovalForRun = async (runId: string) => {
  const result = await pool.query(
    "select * from approval_requests where run_id = $1 and status = 'pending' order by created_at desc limit 1",
    [runId],
  );
  return result.rows[0] ? mapApproval(result.rows[0]) : null;
};

export const approveCurrentRunApproval = async ({
  runId,
}: {
  runId: string;
}) => {
  return withTransaction(async (client) => {
    const approvalResult = await client.query(
      "select * from approval_requests where run_id = $1 and status = 'pending' order by created_at desc limit 1 for update",
      [runId],
    );
    const approvalRow = approvalResult.rows[0];
    if (!approvalRow) {
      return null;
    }

    const resolvedAt = nowIso();
    const updatedApprovalResult = await client.query(
      `update approval_requests
        set status = 'approved', resolved_at = $2
        where id = $1
        returning *`,
      [approvalRow.id, resolvedAt],
    );

    const updatedRunResult = await client.query(
      `update runs
        set status = 'queued', approval_request_id = null, updated_at = $2
        where id = $1
        returning *`,
      [runId, resolvedAt],
    );

    return {
      approvalRequest: mapApproval(updatedApprovalResult.rows[0]),
      run: updatedRunResult.rows[0] ? mapRun(updatedRunResult.rows[0]) : null,
    };
  });
};

export const cancelRunExecution = async ({
  runId,
}: {
  runId: string;
}) => {
  return withTransaction(async (client) => {
    const updatedAt = nowIso();
    const runResult = await client.query(
      `update runs
        set status = 'cancelled', approval_request_id = null, updated_at = $2
        where id = $1
        returning *`,
      [runId, updatedAt],
    );
    const runRow = runResult.rows[0];
    if (!runRow) {
      return null;
    }

    await client.query(
      `update run_steps
        set status = 'skipped',
            output = coalesce(output, 'Cancelled by operator.'),
            finished_at = coalesce(finished_at, $2),
            updated_at = $2
        where run_id = $1 and status in ('queued', 'running')`,
      [runId, updatedAt],
    );

    await client.query(
      `update approval_requests
        set status = 'rejected',
            resolved_at = coalesce(resolved_at, $2)
        where run_id = $1 and status = 'pending'`,
      [runId, updatedAt],
    );

    return mapRun(runRow);
  });
};

export const getRunExecutionContext = async (runId: string): Promise<RunExecutionContext | null> => {
  const runResult = await pool.query("select * from runs where id = $1", [runId]);
  const runRow = runResult.rows[0];
  if (!runRow) {
    return null;
  }

  const run = mapRun(runRow);

  const [stepsResult, approvalsResult, agentsResult, integrationsResult, grantsResult] = await Promise.all([
    pool.query("select * from run_steps where run_id = $1 order by created_at asc", [runId]),
    pool.query("select * from approval_requests where run_id = $1 order by created_at desc", [runId]),
    pool.query("select * from agents where workspace_id = $1 and status = 'active' order by created_at asc", [run.workspaceId]),
    pool.query(
      "select * from organization_integrations where organization_id = $1 and status = 'connected' order by updated_at desc",
      [run.organizationId],
    ),
    pool.query("select * from tool_grants where workspace_id = $1 order by created_at asc", [run.workspaceId]),
  ]);

  return {
    run,
    steps: stepsResult.rows.map(mapRunStep),
    approvals: approvalsResult.rows.map(mapApproval),
    agents: agentsResult.rows.map(mapAgent),
    integrations: integrationsResult.rows.map(mapIntegration),
    toolGrants: grantsResult.rows.map(mapToolGrant),
  };
};

export const createStepApprovalRequest = async ({
  runId,
  runStepId,
  workspaceId,
  summary,
  tool,
  targetLabel,
  payload,
  requestedActions,
}: {
  runId: string;
  runStepId: string;
  workspaceId: string;
  summary: string;
  tool: string | null;
  targetLabel: string | null;
  payload: Record<string, unknown>;
  requestedActions: string[];
}) => {
  return withTransaction(async (client) => {
    const createdAt = nowIso();
    const id = createId("approval");
    const result = await client.query(
      `insert into approval_requests (
        id, run_id, run_step_id, workspace_id, status, summary, tool, target_label, payload,
        requested_actions, created_at, resolved_at
      ) values ($1,$2,$3,$4,'pending',$5,$6,$7,$8::jsonb,$9::jsonb,$10,null)
      returning *`,
      [
        id,
        runId,
        runStepId,
        workspaceId,
        summary,
        tool,
        targetLabel,
        JSON.stringify(payload),
        JSON.stringify(requestedActions),
        createdAt,
      ],
    );

    await client.query(
      `update runs
        set status = 'awaiting_approval', approval_request_id = $2, updated_at = $3
        where id = $1`,
      [runId, id, createdAt],
    );

    return mapApproval(result.rows[0]);
  });
};

export const markRunStepStarted = async ({
  stepId,
  attempt,
}: {
  stepId: string;
  attempt: number;
}) => {
  const startedAt = nowIso();
  const result = await pool.query(
    `update run_steps
      set status = 'running',
          attempt = $2,
          started_at = coalesce(started_at, $3),
          updated_at = $3
      where id = $1
      returning *`,
    [stepId, attempt, startedAt],
  );
  return result.rows[0] ? mapRunStep(result.rows[0]) : null;
};

export const completeRunStep = async ({
  stepId,
  output,
  receipt,
}: {
  stepId: string;
  output: string | null;
  receipt: RunStep["receipt"];
}) => {
  const finishedAt = nowIso();
  const result = await pool.query(
    `update run_steps
      set status = 'completed',
          output = $2,
          receipt = $3::jsonb,
          finished_at = $4,
          error_code = null,
          updated_at = $4
      where id = $1
      returning *`,
    [stepId, output, receipt ? JSON.stringify(receipt) : null, finishedAt],
  );
  return result.rows[0] ? mapRunStep(result.rows[0]) : null;
};

export const failRunStep = async ({
  stepId,
  errorCode,
  output,
  receipt,
}: {
  stepId: string;
  errorCode: string;
  output: string;
  receipt: RunStep["receipt"];
}) => {
  const finishedAt = nowIso();
  const result = await pool.query(
    `update run_steps
      set status = 'failed',
          output = $2,
          error_code = $3,
          receipt = $4::jsonb,
          finished_at = $5,
          updated_at = $5
      where id = $1
      returning *`,
    [stepId, output, errorCode, receipt ? JSON.stringify(receipt) : null, finishedAt],
  );
  return result.rows[0] ? mapRunStep(result.rows[0]) : null;
};

export const updateRunStatus = async ({
  runId,
  status,
  approvalRequestId,
  summary,
}: {
  runId: string;
  status: Run["status"];
  approvalRequestId?: string | null;
  summary?: string;
}) => {
  const updatedAt = nowIso();
  const result = await pool.query(
    `update runs
      set status = $2,
          approval_request_id = coalesce($3, approval_request_id),
          summary = coalesce($4, summary),
          updated_at = $5
      where id = $1
      returning *`,
    [runId, status, approvalRequestId ?? null, summary ?? null, updatedAt],
  );
  return result.rows[0] ? mapRun(result.rows[0]) : null;
};

export const clearRunApprovalPointer = async (runId: string) => {
  await pool.query("update runs set approval_request_id = null, updated_at = $2 where id = $1", [runId, nowIso()]);
};

export const completeRun = async ({
  runId,
  summary,
}: {
  runId: string;
  summary: string;
}) => {
  const updatedAt = nowIso();
  const result = await pool.query(
    `update runs
      set status = 'completed',
          approval_request_id = null,
          summary = $2,
          updated_at = $3
      where id = $1
      returning *`,
    [runId, summary, updatedAt],
  );
  return result.rows[0] ? mapRun(result.rows[0]) : null;
};

export const failRun = async ({
  runId,
  summary,
}: {
  runId: string;
  summary: string;
}) => {
  const updatedAt = nowIso();
  const result = await pool.query(
    `update runs
      set status = 'failed',
          approval_request_id = null,
          summary = $2,
          updated_at = $3
      where id = $1
      returning *`,
    [runId, summary, updatedAt],
  );
  return result.rows[0] ? mapRun(result.rows[0]) : null;
};

export const insertPublicationRecord = async (publication: PublicationRecord) => {
  const result = await pool.query(
    `insert into publication_records (
      id, organization_id, workspace_id, program_file_id, target, status,
      organization_integration_id, summary, transaction_id, gateway_url, explorer_url,
      content_hash, network, metadata, receipt, orchestration, created_by_user_id, created_at, updated_at
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15::jsonb,$16::jsonb,$17,$18,$19)
    returning *`,
    [
      publication.id,
      publication.organizationId,
      publication.workspaceId,
      publication.programFileId,
      publication.target,
      publication.status,
      publication.organizationIntegrationId,
      publication.summary,
      publication.transactionId,
      publication.gatewayUrl,
      publication.explorerUrl,
      publication.contentHash,
      publication.network,
      JSON.stringify(publication.metadata),
      publication.receipt ? JSON.stringify(publication.receipt) : null,
      JSON.stringify(publication.orchestration),
      publication.createdByUserId,
      publication.createdAt,
      publication.updatedAt,
    ],
  );
  return mapPublication(result.rows[0]);
};

export const updatePublicationWorkflowStart = async ({
  publicationId,
  orchestration,
  status,
}: {
  publicationId: string;
  orchestration: OrchestrationRef;
  status?: PublicationRecord["status"];
}) => {
  const result = await pool.query(
    `update publication_records
      set orchestration = $2::jsonb,
          status = coalesce($3, status),
          updated_at = $4
      where id = $1
      returning *`,
    [publicationId, JSON.stringify(orchestration), status ?? null, nowIso()],
  );
  return result.rows[0] ? mapPublication(result.rows[0]) : null;
};

export const listPublicationsByProgramFile = async (programFileId: string) => {
  const result = await pool.query(
    "select * from publication_records where program_file_id = $1 order by created_at desc",
    [programFileId],
  );
  return result.rows.map(mapPublication);
};

export const getProgramFileById = async ({
  programFileId,
  workspaceId,
}: {
  programFileId: string;
  workspaceId?: string;
}) => {
  const result = await pool.query(
    `select * from program_files
      where id = $1
      ${workspaceId ? "and workspace_id = $2" : ""}
      limit 1`,
    workspaceId ? [programFileId, workspaceId] : [programFileId],
  );
  return result.rows[0] ? mapProgramFile(result.rows[0]) : null;
};

export const getPublicationExecutionContext = async (publicationId: string): Promise<PublicationExecutionContext | null> => {
  const publicationResult = await pool.query("select * from publication_records where id = $1", [publicationId]);
  const row = publicationResult.rows[0];
  if (!row) {
    return null;
  }

  const publication = mapPublication(row);
  const [programFile, integration] = await Promise.all([
    getProgramFileById({ programFileId: publication.programFileId }),
    publication.organizationIntegrationId
      ? pool.query("select * from organization_integrations where id = $1", [publication.organizationIntegrationId]).then((result) =>
          result.rows[0] ? mapIntegration(result.rows[0]) : null,
        )
      : Promise.resolve(null),
  ]);

  if (!programFile) {
    return null;
  }

  return {
    publication,
    programFile,
    integration,
  };
};

export const completePublication = async ({
  publicationId,
  status,
  transactionId,
  gatewayUrl,
  explorerUrl,
  contentHash,
  network,
  summary,
  receipt,
}: {
  publicationId: string;
  status: PublicationRecord["status"];
  transactionId: string;
  gatewayUrl: string | null;
  explorerUrl: string | null;
  contentHash: string;
  network: string;
  summary: string;
  receipt: PublicationRecord["receipt"];
}) => {
  const updatedAt = nowIso();
  const result = await pool.query(
    `update publication_records
      set status = $2,
          transaction_id = $3,
          gateway_url = $4,
          explorer_url = $5,
          content_hash = $6,
          network = $7,
          summary = $8,
          receipt = $9::jsonb,
          updated_at = $10
      where id = $1
      returning *`,
    [
      publicationId,
      status,
      transactionId,
      gatewayUrl,
      explorerUrl,
      contentHash,
      network,
      summary,
      receipt ? JSON.stringify(receipt) : null,
      updatedAt,
    ],
  );
  return result.rows[0] ? mapPublication(result.rows[0]) : null;
};

export const failPublication = async ({
  publicationId,
  summary,
}: {
  publicationId: string;
  summary: string;
}) => {
  const result = await pool.query(
    `update publication_records
      set status = 'failed',
          summary = $2,
          updated_at = $3
      where id = $1
      returning *`,
    [publicationId, summary, nowIso()],
  );
  return result.rows[0] ? mapPublication(result.rows[0]) : null;
};

export const insertAuditEvent = async ({
  organizationId,
  workspaceId,
  userId,
  eventType,
  entityType,
  entityId,
  payload,
}: Omit<AuditEvent, "id" | "createdAt">) => {
  const event: AuditEvent = {
    id: createId("audit"),
    organizationId,
    workspaceId,
    userId,
    eventType,
    entityType,
    entityId,
    payload,
    createdAt: nowIso(),
  };

  const result = await pool.query(
    `insert into audit_events (
      id, organization_id, workspace_id, user_id, event_type, entity_type, entity_id, payload, created_at
    ) values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)
    returning *`,
    [
      event.id,
      event.organizationId,
      event.workspaceId,
      event.userId,
      event.eventType,
      event.entityType,
      event.entityId,
      JSON.stringify(event.payload),
      event.createdAt,
    ],
  );

  return mapAuditEvent(result.rows[0]);
};

export const listAuditEventsByWorkspace = async ({
  organizationId,
  workspaceId,
}: {
  organizationId: string;
  workspaceId: string;
}) => {
  const result = await pool.query(
    `select * from audit_events
      where organization_id = $1 and (workspace_id = $2 or workspace_id is null)
      order by created_at desc`,
    [organizationId, workspaceId],
  );
  return result.rows.map(mapAuditEvent);
};

export const deleteSession = async (token: string) => {
  await pool.query("delete from sessions where token = $1", [token]);
};

export const getDatabasePool = () => pool;
