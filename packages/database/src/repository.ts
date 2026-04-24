import crypto from "node:crypto";
import { appConfig } from "@agent-marketplace/config";
import type {
  AgentSpec,
  AgentChatMessage,
  AgentChatThread,
  AgentChatThreadStatus,
  AgentChatMessageRole,
  ApprovalRequest,
  AuditEvent,
  CreateWebsiteCredentialInput,
  LearningLibraryQueryResult,
  LearningLibrarySource,
  LearningLibrarySourceType,
  LearningLibraryVisibility,
  OrganizationIntegration,
  OrchestrationRef,
  ProgramFile,
  PublicationRecord,
  Run,
  RunStep,
  ToolGrant,
  UpdateWebsiteCredentialInput,
  WebsiteCredential,
} from "@agent-marketplace/contracts";
import { Pool, type PoolClient } from "pg";

const pool = new Pool({
  connectionString: appConfig.databaseUrl,
});

const nowIso = () => new Date().toISOString();
const createId = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;
const credentialKey = crypto
  .createHash("sha256")
  .update(appConfig.credentialsEncryptionKey ?? appConfig.sessionSecret)
  .digest();

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

const contentHash = (value: string) => crypto.createHash("sha256").update(value).digest("hex");

const chunkContent = (content: string, chunkSize = 2400, overlap = 240) => {
  const normalized = content.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
  if (!normalized) {
    return [];
  }

  const chunks: string[] = [];
  let cursor = 0;
  while (cursor < normalized.length) {
    const hardEnd = Math.min(cursor + chunkSize, normalized.length);
    const softBreak = normalized.lastIndexOf("\n", hardEnd);
    const end = softBreak > cursor + chunkSize * 0.6 ? softBreak : hardEnd;
    const chunk = normalized.slice(cursor, end).trim();
    if (chunk) {
      chunks.push(chunk);
    }
    if (end >= normalized.length) {
      break;
    }
    cursor = Math.max(0, end - overlap);
  }

  return chunks;
};

const encryptSecret = (value: string) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", credentialKey, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
  };
};

const decryptSecret = ({
  ciphertext,
  iv,
  authTag,
}: {
  ciphertext: string;
  iv: string;
  authTag: string;
}) => {
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    credentialKey,
    Buffer.from(iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(authTag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
};

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

const mapWebsiteCredential = (row: Record<string, any>): WebsiteCredential => ({
  id: row.id,
  organizationId: row.organization_id,
  workspaceId: row.workspace_id,
  label: row.label,
  origin: row.origin,
  loginUrl: row.login_url,
  username: row.username,
  usernameSelector: row.username_selector,
  passwordSelector: row.password_selector,
  submitSelector: row.submit_selector,
  successSelector: row.success_selector,
  notes: row.notes,
  hasSecret: !!row.secret_ciphertext,
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

const mapLearningLibrarySource = (row: Record<string, any>): LearningLibrarySource => ({
  id: row.id,
  organizationId: row.organization_id,
  workspaceId: row.workspace_id,
  sourceType: row.source_type,
  sourceId: row.source_id,
  title: row.title,
  summary: row.summary,
  status: row.status,
  visibility: row.visibility,
  metadata: toRecord(row.metadata),
  indexedAt: toIsoString(row.indexed_at),
  indexError: row.index_error,
  deletedAt: toIsoString(row.deleted_at),
  createdByUserId: row.created_by_user_id,
  createdAt: toIsoString(row.created_at) ?? nowIso(),
  updatedAt: toIsoString(row.updated_at) ?? nowIso(),
  chunkCount: row.chunk_count === undefined ? undefined : Number(row.chunk_count),
});

const mapLearningLibraryQueryResult = (row: Record<string, any>): LearningLibraryQueryResult => ({
  source: mapLearningLibrarySource({
    id: row.source_id,
    organization_id: row.organization_id,
    workspace_id: row.workspace_id,
    source_type: row.source_type,
    source_id: row.external_source_id,
    title: row.title,
    summary: row.summary,
    status: row.status,
    visibility: row.visibility,
    metadata: row.source_metadata,
    indexed_at: row.indexed_at,
    index_error: row.index_error,
    deleted_at: row.deleted_at,
    created_by_user_id: row.created_by_user_id,
    created_at: row.source_created_at,
    updated_at: row.source_updated_at,
  }),
  chunkId: row.chunk_id,
  chunkIndex: Number(row.chunk_index),
  content: row.content,
  score: Number(row.score ?? 0),
  metadata: toRecord(row.chunk_metadata),
});

const mapAgentChatThread = (row: Record<string, any>): AgentChatThread => ({
  id: row.id,
  organizationId: row.organization_id,
  workspaceId: row.workspace_id,
  title: row.title,
  status: row.status,
  createdByUserId: row.created_by_user_id,
  archivedAt: toIsoString(row.archived_at),
  createdAt: toIsoString(row.created_at) ?? nowIso(),
  updatedAt: toIsoString(row.updated_at) ?? nowIso(),
  lastMessage: row.last_message === undefined ? undefined : row.last_message,
  messageCount: row.message_count === undefined ? undefined : Number(row.message_count),
});

const mapAgentChatMessage = (row: Record<string, any>): AgentChatMessage => ({
  id: row.id,
  threadId: row.thread_id,
  organizationId: row.organization_id,
  workspaceId: row.workspace_id,
  role: row.role,
  content: row.content,
  memoryContext: Array.isArray(row.memory_context) ? row.memory_context as LearningLibraryQueryResult[] : [],
  metadata: toRecord(row.metadata),
  createdAt: toIsoString(row.created_at) ?? nowIso(),
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

export type WebsiteCredentialExecutionRecord = WebsiteCredential & {
  password: string;
};

export type AgentChatDetail = {
  thread: AgentChatThread;
  messages: AgentChatMessage[];
};

export type LearningLibraryListOptions = {
  organizationId: string;
  workspaceId: string;
  sourceType?: LearningLibrarySourceType;
  status?: LearningLibrarySource["status"];
  search?: string;
  limit?: number;
  offset?: number;
};

export type LearningLibraryIndexInput = {
  organizationId: string;
  workspaceId: string;
  sourceType: LearningLibrarySourceType;
  sourceId?: string;
  title: string;
  summary?: string | null;
  content: string;
  visibility?: LearningLibraryVisibility;
  metadata?: Record<string, unknown>;
  createdByUserId?: string | null;
};

const boundedLimit = (value: number | undefined, fallback: number, max: number) => {
  const resolved = Number.isFinite(value) ? value : fallback;
  return Math.max(1, Math.min(max, Math.trunc(resolved ?? fallback)));
};

export const listAgentChatThreads = async ({
  organizationId,
  workspaceId,
  status,
}: {
  organizationId: string;
  workspaceId: string;
  status?: AgentChatThreadStatus;
}) => {
  const result = await pool.query(
    `select
        t.*,
        count(m.id)::int as message_count,
        (
          select content
          from agent_chat_messages latest
          where latest.thread_id = t.id
          order by latest.created_at desc
          limit 1
        ) as last_message
      from agent_chat_threads t
      left join agent_chat_messages m on m.thread_id = t.id
      where t.organization_id = $1
        and t.workspace_id = $2
        and ($3::text is null or t.status = $3)
      group by t.id
      order by t.updated_at desc, t.created_at desc`,
    [organizationId, workspaceId, status ?? null],
  );
  return result.rows.map(mapAgentChatThread);
};

export const createAgentChatThread = async ({
  organizationId,
  workspaceId,
  createdByUserId,
  title,
}: {
  organizationId: string;
  workspaceId: string;
  createdByUserId: string;
  title: string;
}) => {
  const timestamp = nowIso();
  const result = await pool.query(
    `insert into agent_chat_threads (
      id, organization_id, workspace_id, title, status, created_by_user_id,
      archived_at, created_at, updated_at
    ) values ($1,$2,$3,$4,'active',$5,null,$6,$6)
    returning *`,
    [
      createId("chat_thread"),
      organizationId,
      workspaceId,
      title.trim(),
      createdByUserId,
      timestamp,
    ],
  );
  return mapAgentChatThread(result.rows[0]);
};

export const getAgentChatDetail = async ({
  threadId,
  organizationId,
  workspaceId,
}: {
  threadId: string;
  organizationId: string;
  workspaceId: string;
}): Promise<AgentChatDetail | null> => {
  const [threadResult, messagesResult] = await Promise.all([
    pool.query(
      `select * from agent_chat_threads
        where id = $1 and organization_id = $2 and workspace_id = $3
        limit 1`,
      [threadId, organizationId, workspaceId],
    ),
    pool.query(
      `select * from agent_chat_messages
        where thread_id = $1 and organization_id = $2 and workspace_id = $3
        order by created_at asc`,
      [threadId, organizationId, workspaceId],
    ),
  ]);
  if (!threadResult.rows[0]) {
    return null;
  }

  return {
    thread: mapAgentChatThread(threadResult.rows[0]),
    messages: messagesResult.rows.map(mapAgentChatMessage),
  };
};

export const insertAgentChatMessage = async ({
  threadId,
  organizationId,
  workspaceId,
  role,
  content,
  memoryContext = [],
  metadata = {},
}: {
  threadId: string;
  organizationId: string;
  workspaceId: string;
  role: AgentChatMessageRole;
  content: string;
  memoryContext?: LearningLibraryQueryResult[];
  metadata?: Record<string, unknown>;
}) => {
  const timestamp = nowIso();
  const result = await withTransaction(async (client) => {
    const messageResult = await client.query(
      `insert into agent_chat_messages (
        id, thread_id, organization_id, workspace_id, role, content, memory_context, metadata, created_at
      ) values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9)
      returning *`,
      [
        createId("chat_message"),
        threadId,
        organizationId,
        workspaceId,
        role,
        content,
        JSON.stringify(memoryContext),
        JSON.stringify(metadata),
        timestamp,
      ],
    );
    await client.query(
      `update agent_chat_threads
        set updated_at = $2,
            status = case when status = 'archived' then 'active' else status end,
            archived_at = case when status = 'archived' then null else archived_at end
        where id = $1 and organization_id = $3 and workspace_id = $4`,
      [threadId, timestamp, organizationId, workspaceId],
    );
    return messageResult;
  });

  return mapAgentChatMessage(result.rows[0]);
};

export const archiveAgentChatThread = async ({
  threadId,
  organizationId,
  workspaceId,
}: {
  threadId: string;
  organizationId: string;
  workspaceId: string;
}) => {
  const timestamp = nowIso();
  const result = await pool.query(
    `update agent_chat_threads
      set status = 'archived',
          archived_at = $4,
          updated_at = $4
      where id = $1 and organization_id = $2 and workspace_id = $3
      returning *`,
    [threadId, organizationId, workspaceId, timestamp],
  );
  return result.rows[0] ? mapAgentChatThread(result.rows[0]) : null;
};

export const resumeAgentChatThread = async ({
  threadId,
  organizationId,
  workspaceId,
}: {
  threadId: string;
  organizationId: string;
  workspaceId: string;
}) => {
  const timestamp = nowIso();
  const result = await pool.query(
    `update agent_chat_threads
      set status = 'active',
          archived_at = null,
          updated_at = $4
      where id = $1 and organization_id = $2 and workspace_id = $3
      returning *`,
    [threadId, organizationId, workspaceId, timestamp],
  );
  return result.rows[0] ? mapAgentChatThread(result.rows[0]) : null;
};

export const listLearningLibrarySources = async ({
  organizationId,
  workspaceId,
  sourceType,
  status,
  search,
  limit,
  offset,
}: LearningLibraryListOptions) => {
  const result = await pool.query(
    `select s.*, count(c.id)::int as chunk_count
      from learning_library_sources s
      left join learning_library_chunks c on c.source_id = s.id
      where s.organization_id = $1
        and s.workspace_id = $2
        and s.deleted_at is null
        and ($3::text is null or s.source_type = $3)
        and ($4::text is null or s.status = $4)
        and (
          $5::text is null
          or s.title ilike '%' || $5 || '%'
          or coalesce(s.summary, '') ilike '%' || $5 || '%'
        )
      group by s.id
      order by s.updated_at desc, s.created_at desc
      limit $6 offset $7`,
    [
      organizationId,
      workspaceId,
      sourceType ?? null,
      status ?? null,
      search?.trim() || null,
      boundedLimit(limit, 50, 200),
      Number.isFinite(offset) ? Math.max(0, Math.trunc(offset ?? 0)) : 0,
    ],
  );
  return result.rows.map(mapLearningLibrarySource);
};

export const indexLearningLibraryContent = async ({
  organizationId,
  workspaceId,
  sourceType,
  sourceId,
  title,
  summary = null,
  content,
  visibility = "workspace",
  metadata = {},
  createdByUserId = null,
}: LearningLibraryIndexInput) => {
  const chunks = chunkContent(content);
  const librarySourceId = createId("library_source");
  const resolvedSourceId = sourceId?.trim() || librarySourceId;
  const timestamp = nowIso();

  return withTransaction(async (client) => {
    const sourceResult = await client.query(
      `insert into learning_library_sources (
        id, organization_id, workspace_id, source_type, source_id, title, summary, status,
        visibility, metadata, indexed_at, index_error, deleted_at, created_by_user_id, created_at, updated_at
      ) values ($1,$2,$3,$4,$5,$6,$7,'pending',$8,$9::jsonb,null,null,null,$10,$11,$11)
      on conflict (workspace_id, source_type, source_id) do update set
        organization_id = excluded.organization_id,
        title = excluded.title,
        summary = excluded.summary,
        status = 'pending',
        visibility = excluded.visibility,
        metadata = excluded.metadata,
        index_error = null,
        deleted_at = null,
        updated_at = excluded.updated_at
      returning *`,
      [
        librarySourceId,
        organizationId,
        workspaceId,
        sourceType,
        resolvedSourceId,
        title.trim(),
        summary?.trim() || null,
        visibility,
        JSON.stringify(metadata),
        createdByUserId,
        timestamp,
      ],
    );
    const source = mapLearningLibrarySource(sourceResult.rows[0]);

    await client.query("delete from learning_library_chunks where source_id = $1", [source.id]);

    if (!chunks.length) {
      const failedResult = await client.query(
        `update learning_library_sources
          set status = 'failed',
              indexed_at = null,
              index_error = 'No indexable content was provided.',
              updated_at = $2
          where id = $1
          returning *`,
        [source.id, nowIso()],
      );
      return mapLearningLibrarySource(failedResult.rows[0]);
    }

    for (const [index, chunk] of chunks.entries()) {
      await client.query(
        `insert into learning_library_chunks (
          id, source_id, organization_id, workspace_id, chunk_index, content,
          content_hash, metadata, created_at
        ) values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)
        on conflict (source_id, content_hash) do nothing`,
        [
          createId("library_chunk"),
          source.id,
          organizationId,
          workspaceId,
          index,
          chunk,
          contentHash(chunk),
          JSON.stringify({ sourceType, sourceId: resolvedSourceId }),
          nowIso(),
        ],
      );
    }

    const indexedResult = await client.query(
      `update learning_library_sources
        set status = 'indexed',
            indexed_at = $2,
            index_error = null,
            updated_at = $2
        where id = $1
        returning *`,
      [source.id, nowIso()],
    );
    return mapLearningLibrarySource({ ...indexedResult.rows[0], chunk_count: chunks.length });
  });
};

export const updateLearningLibrarySource = async ({
  sourceId,
  organizationId,
  workspaceId,
  title,
  summary,
  visibility,
  metadata,
}: {
  sourceId: string;
  organizationId: string;
  workspaceId: string;
  title?: string;
  summary?: string | null;
  visibility?: LearningLibraryVisibility;
  metadata?: Record<string, unknown>;
}) => {
  const result = await pool.query(
    `update learning_library_sources
      set title = coalesce($4, title),
          summary = case when $5::boolean then $6 else summary end,
          visibility = coalesce($7, visibility),
          metadata = coalesce($8::jsonb, metadata),
          updated_at = $9
      where id = $1 and organization_id = $2 and workspace_id = $3 and deleted_at is null
      returning *`,
    [
      sourceId,
      organizationId,
      workspaceId,
      title?.trim() || null,
      summary !== undefined,
      summary?.trim() || null,
      visibility ?? null,
      metadata ? JSON.stringify(metadata) : null,
      nowIso(),
    ],
  );
  return result.rows[0] ? mapLearningLibrarySource(result.rows[0]) : null;
};

export const deleteLearningLibrarySource = async ({
  sourceId,
  organizationId,
  workspaceId,
}: {
  sourceId: string;
  organizationId: string;
  workspaceId: string;
}) => {
  const result = await pool.query(
    `delete from learning_library_sources
      where id = $1 and organization_id = $2 and workspace_id = $3
      returning *`,
    [sourceId, organizationId, workspaceId],
  );
  return result.rows[0] ? mapLearningLibrarySource(result.rows[0]) : null;
};

export const purgeLearningLibrary = async ({
  organizationId,
  workspaceId,
  sourceType,
  sourceId,
}: {
  organizationId: string;
  workspaceId: string;
  sourceType?: LearningLibrarySourceType;
  sourceId?: string;
}) => {
  const result = await pool.query(
    `delete from learning_library_sources
      where organization_id = $1
        and workspace_id = $2
        and ($3::text is null or source_type = $3)
        and ($4::text is null or source_id = $4)`,
    [organizationId, workspaceId, sourceType ?? null, sourceId ?? null],
  );
  return { deletedCount: result.rowCount ?? 0 };
};

export const queryLearningLibrary = async ({
  organizationId,
  workspaceId,
  query,
  sourceTypes,
  limit,
}: {
  organizationId: string;
  workspaceId: string;
  query: string;
  sourceTypes?: LearningLibrarySourceType[];
  limit?: number;
}) => {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) {
    return [];
  }

  const result = await pool.query(
    `with search as (
        select websearch_to_tsquery('english', $3) as ts_query
      )
      select
        s.id as source_id,
        s.organization_id,
        s.workspace_id,
        s.source_type,
        s.source_id as external_source_id,
        s.title,
        s.summary,
        s.status,
        s.visibility,
        s.metadata as source_metadata,
        s.indexed_at,
        s.index_error,
        s.deleted_at,
        s.created_by_user_id,
        s.created_at as source_created_at,
        s.updated_at as source_updated_at,
        c.id as chunk_id,
        c.chunk_index,
        c.content,
        c.metadata as chunk_metadata,
        greatest(
          ts_rank_cd(c.search_vector, search.ts_query),
          case when c.content ilike '%' || $3 || '%' then 0.05 else 0 end
        ) as score
      from learning_library_chunks c
      join learning_library_sources s on s.id = c.source_id
      cross join search
      where s.organization_id = $1
        and s.workspace_id = $2
        and s.status = 'indexed'
        and s.deleted_at is null
        and ($4::text[] is null or s.source_type = any($4::text[]))
        and (
          c.search_vector @@ search.ts_query
          or c.content ilike '%' || $3 || '%'
          or s.title ilike '%' || $3 || '%'
          or coalesce(s.summary, '') ilike '%' || $3 || '%'
        )
      order by score desc, s.updated_at desc, c.chunk_index asc
      limit $5`,
    [
      organizationId,
      workspaceId,
      normalizedQuery,
      sourceTypes?.length ? sourceTypes : null,
      boundedLimit(limit, 8, 20),
    ],
  );

  return result.rows.map(mapLearningLibraryQueryResult);
};

export const indexProgramFileInLearningLibrary = async ({
  programFileId,
  organizationId,
  workspaceId,
  createdByUserId,
}: {
  programFileId: string;
  organizationId: string;
  workspaceId: string;
  createdByUserId?: string | null;
}) => {
  const programFile = await getProgramFileById({ programFileId, workspaceId });
  if (!programFile || programFile.organizationId !== organizationId) {
    return null;
  }

  return indexLearningLibraryContent({
    organizationId,
    workspaceId,
    sourceType: "program_file",
    sourceId: programFile.id,
    title: programFile.name,
    summary: programFile.description,
    content: [
      programFile.name,
      programFile.description ?? "",
      `Source type: ${programFile.sourceType}`,
      programFile.tags.length ? `Tags: ${programFile.tags.join(", ")}` : "",
      programFile.content,
    ].filter(Boolean).join("\n\n"),
    metadata: {
      agentId: programFile.agentId,
      sourceType: programFile.sourceType,
      tags: programFile.tags,
    },
    createdByUserId,
  });
};

export const indexRunInLearningLibrary = async ({
  runId,
  organizationId,
  workspaceId,
  createdByUserId,
}: {
  runId: string;
  organizationId: string;
  workspaceId: string;
  createdByUserId?: string | null;
}) => {
  const detail = await getRunDetail({ runId, workspaceId });
  if (!detail || detail.run.organizationId !== organizationId) {
    return null;
  }

  const content = [
    `Run summary: ${detail.run.summary}`,
    `Status: ${detail.run.status}`,
    detail.run.plannedActions.length ? `Planned actions:\n${detail.run.plannedActions.map((action) => `- ${action}`).join("\n")}` : "",
    detail.steps
      .filter((step) => step.output)
      .map((step) => `${step.title}\n${step.output}`)
      .join("\n\n"),
  ].filter(Boolean).join("\n\n");

  return indexLearningLibraryContent({
    organizationId,
    workspaceId,
    sourceType: "agent_run",
    sourceId: detail.run.id,
    title: `Run ${detail.run.id}`,
    summary: detail.run.summary,
    content,
    metadata: {
      agentId: detail.run.agentId,
      status: detail.run.status,
    },
    createdByUserId,
  });
};

export const reindexLearningLibraryWorkspace = async ({
  organizationId,
  workspaceId,
  sourceType,
  sourceId,
  limit,
  createdByUserId,
}: {
  organizationId: string;
  workspaceId: string;
  sourceType?: LearningLibrarySourceType;
  sourceId?: string;
  limit?: number;
  createdByUserId?: string | null;
}) => {
  const max = boundedLimit(limit, 100, 500);
  let indexedCount = 0;
  let failedCount = 0;

  if (!sourceType || sourceType === "program_file") {
    const result = await pool.query(
      `select id from program_files
        where organization_id = $1 and workspace_id = $2 and ($3::text is null or id = $3)
        order by updated_at desc
        limit $4`,
      [organizationId, workspaceId, sourceId ?? null, max],
    );
    for (const row of result.rows) {
      const indexed = await indexProgramFileInLearningLibrary({
        programFileId: row.id,
        organizationId,
        workspaceId,
        createdByUserId,
      });
      indexed ? indexedCount += 1 : failedCount += 1;
    }
  }

  if (!sourceType || sourceType === "agent_run") {
    const result = await pool.query(
      `select id from runs
        where organization_id = $1
          and workspace_id = $2
          and status in ('completed', 'failed', 'cancelled')
          and ($3::text is null or id = $3)
        order by updated_at desc
        limit $4`,
      [organizationId, workspaceId, sourceId ?? null, max],
    );
    for (const row of result.rows) {
      const indexed = await indexRunInLearningLibrary({
        runId: row.id,
        organizationId,
        workspaceId,
        createdByUserId,
      });
      indexed ? indexedCount += 1 : failedCount += 1;
    }
  }

  return { indexedCount, failedCount };
};

export const listWebsiteCredentialsByWorkspace = async ({
  organizationId,
  workspaceId,
}: {
  organizationId: string;
  workspaceId: string;
}) => {
  const result = await pool.query(
    `select * from website_credentials
      where organization_id = $1 and workspace_id = $2
      order by updated_at desc, created_at desc`,
    [organizationId, workspaceId],
  );
  return result.rows.map(mapWebsiteCredential);
};

export const createWebsiteCredential = async ({
  organizationId,
  workspaceId,
  createdByUserId,
  input,
}: {
  organizationId: string;
  workspaceId: string;
  createdByUserId: string;
  input: CreateWebsiteCredentialInput;
}) => {
  const id = createId("credential");
  const createdAt = nowIso();
  const encrypted = encryptSecret(input.password);
  const result = await pool.query(
    `insert into website_credentials (
      id, organization_id, workspace_id, label, origin, login_url, username,
      secret_ciphertext, secret_iv, secret_auth_tag, username_selector, password_selector,
      submit_selector, success_selector, notes, created_by_user_id, created_at, updated_at, last_validated_at
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,null)
    returning *`,
    [
      id,
      organizationId,
      workspaceId,
      input.label.trim(),
      input.origin.trim(),
      input.loginUrl.trim(),
      input.username.trim(),
      encrypted.ciphertext,
      encrypted.iv,
      encrypted.authTag,
      input.usernameSelector.trim(),
      input.passwordSelector.trim(),
      input.submitSelector?.trim() || null,
      input.successSelector?.trim() || null,
      input.notes?.trim() || null,
      createdByUserId,
      createdAt,
      createdAt,
    ],
  );
  return mapWebsiteCredential(result.rows[0]);
};

export const updateWebsiteCredential = async ({
  credentialId,
  organizationId,
  workspaceId,
  input,
}: {
  credentialId: string;
  organizationId: string;
  workspaceId: string;
  input: UpdateWebsiteCredentialInput;
}) => {
  const existingResult = await pool.query(
    `select * from website_credentials
      where id = $1 and organization_id = $2 and workspace_id = $3`,
    [credentialId, organizationId, workspaceId],
  );
  const existingRow = existingResult.rows[0];
  if (!existingRow) {
    return null;
  }

  const encrypted = input.password ? encryptSecret(input.password) : null;
  const updatedAt = nowIso();
  const result = await pool.query(
    `update website_credentials
      set label = $4,
          origin = $5,
          login_url = $6,
          username = $7,
          secret_ciphertext = $8,
          secret_iv = $9,
          secret_auth_tag = $10,
          username_selector = $11,
          password_selector = $12,
          submit_selector = $13,
          success_selector = $14,
          notes = $15,
          updated_at = $16
      where id = $1 and organization_id = $2 and workspace_id = $3
      returning *`,
    [
      credentialId,
      organizationId,
      workspaceId,
      input.label?.trim() ?? existingRow.label,
      input.origin?.trim() ?? existingRow.origin,
      input.loginUrl?.trim() ?? existingRow.login_url,
      input.username?.trim() ?? existingRow.username,
      encrypted?.ciphertext ?? existingRow.secret_ciphertext,
      encrypted?.iv ?? existingRow.secret_iv,
      encrypted?.authTag ?? existingRow.secret_auth_tag,
      input.usernameSelector?.trim() ?? existingRow.username_selector,
      input.passwordSelector?.trim() ?? existingRow.password_selector,
      input.submitSelector === undefined ? existingRow.submit_selector : input.submitSelector?.trim() || null,
      input.successSelector === undefined ? existingRow.success_selector : input.successSelector?.trim() || null,
      input.notes === undefined ? existingRow.notes : input.notes?.trim() || null,
      updatedAt,
    ],
  );
  return result.rows[0] ? mapWebsiteCredential(result.rows[0]) : null;
};

export const deleteWebsiteCredential = async ({
  credentialId,
  organizationId,
  workspaceId,
}: {
  credentialId: string;
  organizationId: string;
  workspaceId: string;
}) => {
  const result = await pool.query(
    `delete from website_credentials
      where id = $1 and organization_id = $2 and workspace_id = $3
      returning *`,
    [credentialId, organizationId, workspaceId],
  );
  return result.rows[0] ? mapWebsiteCredential(result.rows[0]) : null;
};

export const getWebsiteCredentialForExecution = async ({
  credentialId,
  organizationId,
  workspaceId,
}: {
  credentialId: string;
  organizationId: string;
  workspaceId: string;
}) => {
  const result = await pool.query(
    `select * from website_credentials
      where id = $1 and organization_id = $2 and workspace_id = $3
      limit 1`,
    [credentialId, organizationId, workspaceId],
  );
  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return {
    ...mapWebsiteCredential(row),
    password: decryptSecret({
      ciphertext: row.secret_ciphertext,
      iv: row.secret_iv,
      authTag: row.secret_auth_tag,
    }),
  } satisfies WebsiteCredentialExecutionRecord;
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

  const agents = new Map(agentsResult.rows.map((row: Record<string, any>) => {
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

  return runsResult.rows.map((row: Record<string, any>) => {
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
    approvalsResult.rows.map(mapApproval).find((approval: ApprovalRequest) => approval.status === "pending") ?? null;

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
      ? pool.query("select * from organization_integrations where id = $1", [publication.organizationIntegrationId]).then((result: { rows: Record<string, any>[] }) =>
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
