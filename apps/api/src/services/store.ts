import crypto from "node:crypto";
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

const store: MemoryStore = {
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
};

export const nowIso = () => new Date().toISOString();
export const createId = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;

export const getStore = () => store;

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
