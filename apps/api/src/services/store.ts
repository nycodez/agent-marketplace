import crypto from "node:crypto";
import { appConfig } from "@agent-marketplace/config";
import type {
  AgentSpec,
  AgentSpecVersion,
  AgentTeamDraft,
  ApprovalRequest,
  AuditEvent,
  Membership,
  MembershipRole,
  Organization,
  OrganizationIntegration,
  ProgramFile,
  PublicationRecord,
  Run,
  RunStep,
  ToolGrant,
  User,
  Workspace,
} from "@agent-marketplace/contracts";
import { Pool, type PoolClient } from "pg";

export type StoredUser = User & {
  passwordHash: string;
};

export type SessionRecord = {
  token: string;
  userId: string;
  organizationId: string;
  workspaceId: string;
  createdAt: string;
};

type MemoryStore = {
  users: StoredUser[];
  sessions: SessionRecord[];
  organizations: Organization[];
  workspaces: Workspace[];
  memberships: Membership[];
  drafts: AgentTeamDraft[];
  agents: AgentSpec[];
  agentVersions: AgentSpecVersion[];
  organizationIntegrations: OrganizationIntegration[];
  toolGrants: ToolGrant[];
  programFiles: ProgramFile[];
  publicationRecords: PublicationRecord[];
  runs: Run[];
  runSteps: RunStep[];
  approvalRequests: ApprovalRequest[];
  auditEvents: AuditEvent[];
};

type ColumnValue = {
  value: unknown;
  cast?: "jsonb";
};

type DatabaseRecord = Record<string, unknown | ColumnValue>;

const createEmptyStore = (): MemoryStore => ({
  users: [],
  sessions: [],
  organizations: [],
  workspaces: [],
  memberships: [],
  drafts: [],
  agents: [],
  agentVersions: [],
  organizationIntegrations: [],
  toolGrants: [],
  programFiles: [],
  publicationRecords: [],
  runs: [],
  runSteps: [],
  approvalRequests: [],
  auditEvents: [],
});

const store: MemoryStore = createEmptyStore();
const pool = new Pool({
  connectionString: appConfig.databaseUrl,
});

let initializationPromise: Promise<void> | null = null;
let persistenceQueue: Promise<void> = Promise.resolve();
let hasInitializedStore = false;

export const nowIso = () => new Date().toISOString();
export const createId = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;

export const getStore = () => store;

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

const jsonb = (value: unknown): ColumnValue => ({
  value: JSON.stringify(value ?? null),
  cast: "jsonb",
});

const isColumnValue = (value: unknown): value is ColumnValue =>
  !!value && typeof value === "object" && "value" in value;

const assignStore = (next: MemoryStore) => {
  store.users = next.users;
  store.sessions = next.sessions;
  store.organizations = next.organizations;
  store.workspaces = next.workspaces;
  store.memberships = next.memberships;
  store.drafts = next.drafts;
  store.agents = next.agents;
  store.agentVersions = next.agentVersions;
  store.organizationIntegrations = next.organizationIntegrations;
  store.toolGrants = next.toolGrants;
  store.programFiles = next.programFiles;
  store.publicationRecords = next.publicationRecords;
  store.runs = next.runs;
  store.runSteps = next.runSteps;
  store.approvalRequests = next.approvalRequests;
  store.auditEvents = next.auditEvents;
};

const insertRow = async (client: PoolClient, table: string, record: DatabaseRecord) => {
  const entries = Object.entries(record);
  if (!entries.length) {
    return;
  }

  const columns = entries.map(([column]) => column);
  const values = entries.map(([, value]) => (isColumnValue(value) ? value.value : value));
  const placeholders = entries.map(([, value], index) => {
    const placeholder = `$${index + 1}`;
    return isColumnValue(value) && value.cast ? `${placeholder}::${value.cast}` : placeholder;
  });

  await client.query(
    `insert into ${table} (${columns.join(", ")}) values (${placeholders.join(", ")})`,
    values,
  );
};

const loadStoreFromDatabase = async () => {
  const [
    usersResult,
    sessionsResult,
    organizationsResult,
    workspacesResult,
    membershipsResult,
    draftsResult,
    agentsResult,
    agentVersionsResult,
    organizationIntegrationsResult,
    toolGrantsResult,
    programFilesResult,
    publicationRecordsResult,
    runsResult,
    runStepsResult,
    approvalRequestsResult,
    auditEventsResult,
  ] = await Promise.all([
    pool.query(
      "select id, email, name, password_hash, created_at from users order by created_at asc",
    ),
    pool.query(
      "select token, user_id, organization_id, workspace_id, created_at from sessions order by created_at asc",
    ),
    pool.query(
      "select id, name, slug, created_by_user_id, created_at, updated_at from organizations order by created_at asc",
    ),
    pool.query(
      "select id, organization_id, name, slug, created_at, updated_at from workspaces order by created_at asc",
    ),
    pool.query(
      "select id, user_id, organization_id, workspace_id, role, created_at from memberships order by created_at asc",
    ),
    pool.query(
      "select id, organization_id, workspace_id, title, brief, status, clarifications, generated_agents, created_by_user_id, updated_by_user_id, created_at, updated_at from agent_team_drafts order by updated_at desc, created_at desc",
    ),
    pool.query(
      "select id, workspace_id, organization_id, display_name, mission, responsibilities, allowed_tools, knowledge_sources, trigger_modes, approval_policy, success_metrics, constraints, status, current_version_id, created_at, updated_at from agents order by updated_at desc, created_at desc",
    ),
    pool.query(
      "select id, agent_id, workspace_id, version, spec, created_by_user_id, created_at from agent_spec_versions order by agent_id asc, version desc",
    ),
    pool.query(
      "select id, organization_id, provider_key, display_name, status, auth_type, scopes, metadata, created_by_user_id, created_at, updated_at, last_validated_at from organization_integrations order by updated_at desc, created_at desc",
    ),
    pool.query(
      "select id, workspace_id, agent_id, organization_integration_id, provider_key, tools, created_by_user_id, created_at from tool_grants order by created_at desc",
    ),
    pool.query(
      "select id, organization_id, workspace_id, agent_id, name, description, source_type, content, tags, created_by_user_id, created_at, updated_at from program_files order by updated_at desc, created_at desc",
    ),
    pool.query(
      "select id, organization_id, workspace_id, program_file_id, target, status, organization_integration_id, summary, transaction_id, gateway_url, metadata, orchestration, created_by_user_id, created_at, updated_at from publication_records order by created_at desc",
    ),
    pool.query(
      "select id, organization_id, workspace_id, agent_id, trigger_type, status, summary, planned_actions, approval_requirement, approval_request_id, orchestration, created_by_user_id, created_at, updated_at from runs order by created_at desc",
    ),
    pool.query(
      "select id, run_id, title, status, output, metadata, created_at, updated_at from run_steps order by created_at asc",
    ),
    pool.query(
      "select id, run_id, workspace_id, status, summary, requested_actions, created_at, resolved_at from approval_requests order by created_at desc",
    ),
    pool.query(
      "select id, organization_id, workspace_id, user_id, event_type, entity_type, entity_id, payload, created_at from audit_events order by created_at desc",
    ),
  ]);

  assignStore({
    users: usersResult.rows.map((row) => ({
      id: row.id,
      email: row.email,
      name: row.name,
      passwordHash: row.password_hash,
      createdAt: toIsoString(row.created_at) ?? nowIso(),
    })),
    sessions: sessionsResult.rows.map((row) => ({
      token: row.token,
      userId: row.user_id,
      organizationId: row.organization_id,
      workspaceId: row.workspace_id,
      createdAt: toIsoString(row.created_at) ?? nowIso(),
    })),
    organizations: organizationsResult.rows.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      createdByUserId: row.created_by_user_id,
      createdAt: toIsoString(row.created_at) ?? nowIso(),
      updatedAt: toIsoString(row.updated_at) ?? nowIso(),
    })),
    workspaces: workspacesResult.rows.map((row) => ({
      id: row.id,
      organizationId: row.organization_id,
      name: row.name,
      slug: row.slug,
      createdAt: toIsoString(row.created_at) ?? nowIso(),
      updatedAt: toIsoString(row.updated_at) ?? nowIso(),
    })),
    memberships: membershipsResult.rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      organizationId: row.organization_id,
      workspaceId: row.workspace_id,
      role: row.role,
      createdAt: toIsoString(row.created_at) ?? nowIso(),
    })),
    drafts: draftsResult.rows.map((row) => ({
      id: row.id,
      organizationId: row.organization_id,
      workspaceId: row.workspace_id,
      title: row.title,
      brief: row.brief,
      status: row.status,
      clarifications: toStringArray(row.clarifications),
      generatedAgents: Array.isArray(row.generated_agents) ? row.generated_agents : [],
      createdByUserId: row.created_by_user_id,
      updatedByUserId: row.updated_by_user_id,
      createdAt: toIsoString(row.created_at) ?? nowIso(),
      updatedAt: toIsoString(row.updated_at) ?? nowIso(),
    })),
    agents: agentsResult.rows.map((row) => ({
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
    })),
    agentVersions: agentVersionsResult.rows.map((row) => ({
      id: row.id,
      agentId: row.agent_id,
      workspaceId: row.workspace_id,
      version: Number(row.version),
      spec: row.spec,
      createdByUserId: row.created_by_user_id,
      createdAt: toIsoString(row.created_at) ?? nowIso(),
    })),
    organizationIntegrations: organizationIntegrationsResult.rows.map((row) => ({
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
    })),
    toolGrants: toolGrantsResult.rows.map((row) => ({
      id: row.id,
      workspaceId: row.workspace_id,
      agentId: row.agent_id,
      organizationIntegrationId: row.organization_integration_id,
      providerKey: row.provider_key,
      tools: toStringArray(row.tools),
      createdByUserId: row.created_by_user_id,
      createdAt: toIsoString(row.created_at) ?? nowIso(),
    })),
    programFiles: programFilesResult.rows.map((row) => ({
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
    })),
    publicationRecords: publicationRecordsResult.rows.map((row) => ({
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
      metadata: toRecord(row.metadata),
      orchestration: row.orchestration,
      createdByUserId: row.created_by_user_id,
      createdAt: toIsoString(row.created_at) ?? nowIso(),
      updatedAt: toIsoString(row.updated_at) ?? nowIso(),
    })),
    runs: runsResult.rows.map((row) => ({
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
      orchestration: row.orchestration,
      createdByUserId: row.created_by_user_id,
      createdAt: toIsoString(row.created_at) ?? nowIso(),
      updatedAt: toIsoString(row.updated_at) ?? nowIso(),
    })),
    runSteps: runStepsResult.rows.map((row) => ({
      id: row.id,
      runId: row.run_id,
      title: row.title,
      status: row.status,
      output: row.output,
      metadata: toRecord(row.metadata),
      createdAt: toIsoString(row.created_at) ?? nowIso(),
      updatedAt: toIsoString(row.updated_at) ?? nowIso(),
    })),
    approvalRequests: approvalRequestsResult.rows.map((row) => ({
      id: row.id,
      runId: row.run_id,
      workspaceId: row.workspace_id,
      status: row.status,
      summary: row.summary,
      requestedActions: toStringArray(row.requested_actions),
      createdAt: toIsoString(row.created_at) ?? nowIso(),
      resolvedAt: toIsoString(row.resolved_at),
    })),
    auditEvents: auditEventsResult.rows.map((row) => ({
      id: row.id,
      organizationId: row.organization_id,
      workspaceId: row.workspace_id,
      userId: row.user_id,
      eventType: row.event_type,
      entityType: row.entity_type,
      entityId: row.entity_id,
      payload: toRecord(row.payload),
      createdAt: toIsoString(row.created_at) ?? nowIso(),
    })),
  });
};

const persistStoreToDatabase = async () => {
  const client = await pool.connect();

  try {
    await client.query("begin");
    await client.query("set constraints all deferred");
    // Keep the current route layer intact by snapshotting the normalized store back into Postgres.
    await client.query(`
      truncate table
        audit_events,
        run_steps,
        approval_requests,
        runs,
        publication_records,
        program_files,
        tool_grants,
        organization_integrations,
        agent_spec_versions,
        agents,
        agent_team_drafts,
        memberships,
        sessions,
        workspaces,
        organizations,
        users
      restart identity
      cascade
    `);

    for (const user of store.users) {
      await insertRow(client, "users", {
        id: user.id,
        email: user.email,
        name: user.name,
        password_hash: user.passwordHash,
        created_at: user.createdAt,
      });
    }

    for (const organization of store.organizations) {
      await insertRow(client, "organizations", {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        created_by_user_id: organization.createdByUserId,
        created_at: organization.createdAt,
        updated_at: organization.updatedAt,
      });
    }

    for (const workspace of store.workspaces) {
      await insertRow(client, "workspaces", {
        id: workspace.id,
        organization_id: workspace.organizationId,
        name: workspace.name,
        slug: workspace.slug,
        created_at: workspace.createdAt,
        updated_at: workspace.updatedAt,
      });
    }

    for (const membership of store.memberships) {
      await insertRow(client, "memberships", {
        id: membership.id,
        user_id: membership.userId,
        organization_id: membership.organizationId,
        workspace_id: membership.workspaceId,
        role: membership.role,
        created_at: membership.createdAt,
      });
    }

    for (const session of store.sessions) {
      await insertRow(client, "sessions", {
        token: session.token,
        user_id: session.userId,
        organization_id: session.organizationId,
        workspace_id: session.workspaceId,
        created_at: session.createdAt,
      });
    }

    for (const draft of store.drafts) {
      await insertRow(client, "agent_team_drafts", {
        id: draft.id,
        organization_id: draft.organizationId,
        workspace_id: draft.workspaceId,
        title: draft.title,
        brief: draft.brief,
        status: draft.status,
        clarifications: jsonb(draft.clarifications),
        generated_agents: jsonb(draft.generatedAgents),
        created_by_user_id: draft.createdByUserId,
        updated_by_user_id: draft.updatedByUserId,
        created_at: draft.createdAt,
        updated_at: draft.updatedAt,
      });
    }

    for (const agent of store.agents) {
      await insertRow(client, "agents", {
        id: agent.id,
        workspace_id: agent.workspaceId,
        organization_id: agent.organizationId,
        display_name: agent.displayName,
        mission: agent.mission,
        responsibilities: jsonb(agent.responsibilities),
        allowed_tools: jsonb(agent.allowedTools),
        knowledge_sources: jsonb(agent.knowledgeSources),
        trigger_modes: jsonb(agent.triggerModes),
        approval_policy: agent.approvalPolicy,
        success_metrics: jsonb(agent.successMetrics),
        constraints: jsonb(agent.constraints),
        status: agent.status,
        current_version_id: agent.currentVersionId,
        created_at: agent.createdAt,
        updated_at: agent.updatedAt,
      });
    }

    for (const version of store.agentVersions) {
      await insertRow(client, "agent_spec_versions", {
        id: version.id,
        agent_id: version.agentId,
        workspace_id: version.workspaceId,
        version: version.version,
        spec: jsonb(version.spec),
        created_by_user_id: version.createdByUserId,
        created_at: version.createdAt,
      });
    }

    for (const integration of store.organizationIntegrations) {
      await insertRow(client, "organization_integrations", {
        id: integration.id,
        organization_id: integration.organizationId,
        provider_key: integration.providerKey,
        display_name: integration.displayName,
        status: integration.status,
        auth_type: integration.authType,
        scopes: jsonb(integration.scopes),
        metadata: jsonb(integration.metadata),
        created_by_user_id: integration.createdByUserId,
        created_at: integration.createdAt,
        updated_at: integration.updatedAt,
        last_validated_at: integration.lastValidatedAt,
      });
    }

    for (const grant of store.toolGrants) {
      await insertRow(client, "tool_grants", {
        id: grant.id,
        workspace_id: grant.workspaceId,
        agent_id: grant.agentId,
        organization_integration_id: grant.organizationIntegrationId,
        provider_key: grant.providerKey,
        tools: jsonb(grant.tools),
        created_by_user_id: grant.createdByUserId,
        created_at: grant.createdAt,
      });
    }

    for (const programFile of store.programFiles) {
      await insertRow(client, "program_files", {
        id: programFile.id,
        organization_id: programFile.organizationId,
        workspace_id: programFile.workspaceId,
        agent_id: programFile.agentId,
        name: programFile.name,
        description: programFile.description,
        source_type: programFile.sourceType,
        content: programFile.content,
        tags: jsonb(programFile.tags),
        created_by_user_id: programFile.createdByUserId,
        created_at: programFile.createdAt,
        updated_at: programFile.updatedAt,
      });
    }

    for (const publication of store.publicationRecords) {
      await insertRow(client, "publication_records", {
        id: publication.id,
        organization_id: publication.organizationId,
        workspace_id: publication.workspaceId,
        program_file_id: publication.programFileId,
        target: publication.target,
        status: publication.status,
        organization_integration_id: publication.organizationIntegrationId,
        summary: publication.summary,
        transaction_id: publication.transactionId,
        gateway_url: publication.gatewayUrl,
        metadata: jsonb(publication.metadata),
        orchestration: jsonb(publication.orchestration),
        created_by_user_id: publication.createdByUserId,
        created_at: publication.createdAt,
        updated_at: publication.updatedAt,
      });
    }

    for (const run of store.runs) {
      await insertRow(client, "runs", {
        id: run.id,
        organization_id: run.organizationId,
        workspace_id: run.workspaceId,
        agent_id: run.agentId,
        trigger_type: run.triggerType,
        status: run.status,
        summary: run.summary,
        planned_actions: jsonb(run.plannedActions),
        approval_requirement: run.approvalRequirement,
        approval_request_id: run.approvalRequestId,
        orchestration: jsonb(run.orchestration),
        created_by_user_id: run.createdByUserId,
        created_at: run.createdAt,
        updated_at: run.updatedAt,
      });
    }

    for (const step of store.runSteps) {
      await insertRow(client, "run_steps", {
        id: step.id,
        run_id: step.runId,
        title: step.title,
        status: step.status,
        output: step.output,
        metadata: jsonb(step.metadata),
        created_at: step.createdAt,
        updated_at: step.updatedAt,
      });
    }

    for (const approvalRequest of store.approvalRequests) {
      await insertRow(client, "approval_requests", {
        id: approvalRequest.id,
        run_id: approvalRequest.runId,
        workspace_id: approvalRequest.workspaceId,
        status: approvalRequest.status,
        summary: approvalRequest.summary,
        requested_actions: jsonb(approvalRequest.requestedActions),
        created_at: approvalRequest.createdAt,
        resolved_at: approvalRequest.resolvedAt,
      });
    }

    for (const event of store.auditEvents) {
      await insertRow(client, "audit_events", {
        id: event.id,
        organization_id: event.organizationId,
        workspace_id: event.workspaceId,
        user_id: event.userId,
        event_type: event.eventType,
        entity_type: event.entityType,
        entity_id: event.entityId,
        payload: jsonb(event.payload),
        created_at: event.createdAt,
      });
    }

    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
};

export const initStoreFromDatabase = async () => {
  if (hasInitializedStore) {
    return;
  }

  if (!initializationPromise) {
    initializationPromise = loadStoreFromDatabase()
      .then(() => {
        hasInitializedStore = true;
      })
      .catch((error) => {
        initializationPromise = null;
        throw error;
      });
  }

  await initializationPromise;
};

export const persistStore = async () => {
  await initStoreFromDatabase();

  persistenceQueue = persistenceQueue
    .catch(() => undefined)
    .then(async () => {
      await persistStoreToDatabase();
    });

  await persistenceQueue;
};

export const createMembership = ({
  userId,
  organizationId,
  workspaceId,
  role,
}: {
  userId: string;
  organizationId: string;
  workspaceId: string;
  role: MembershipRole;
}) => {
  const membership: Membership = {
    id: createId("membership"),
    userId,
    organizationId,
    workspaceId,
    role,
    createdAt: nowIso(),
  };
  store.memberships.push(membership);
  return membership;
};

export const recordAuditEvent = ({
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
  store.auditEvents.unshift(event);
  return event;
};
