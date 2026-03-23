import { z } from "zod";

export const membershipRoleSchema = z.enum([
  "owner",
  "admin",
  "builder",
  "operator",
  "viewer",
]);

export const draftStatusSchema = z.enum(["draft", "generated", "published"]);
export const agentStatusSchema = z.enum(["draft", "active", "paused", "archived"]);
export const runStatusSchema = z.enum([
  "queued",
  "planning",
  "awaiting_approval",
  "running",
  "completed",
  "cancelled",
  "failed",
]);
export const stepStatusSchema = z.enum(["queued", "running", "completed", "failed", "skipped"]);
export const triggerTypeSchema = z.enum([
  "manual",
  "scheduled",
  "webhook",
  "integration_event",
]);
export const approvalRequirementSchema = z.enum(["not_required", "required"]);
export const approvalStatusSchema = z.enum(["pending", "approved", "rejected"]);
export const integrationAuthTypeSchema = z.enum(["oauth", "api_key", "webhook", "wallet"]);
export const organizationIntegrationStatusSchema = z.enum([
  "pending",
  "connected",
  "failed",
  "revoked",
]);
export const setupModeSchema = z.enum(["oauth", "api_key", "webhook", "wallet"]);
export const publicationTargetSchema = z.enum(["base", "arweave"]);
export const publicationStatusSchema = z.enum([
  "queued",
  "processing",
  "published",
  "failed",
]);
export const orchestrationEngineSchema = z.enum(["temporal"]);
export const orchestrationStatusSchema = z.enum([
  "scheduled",
  "started",
  "unavailable",
  "failed_to_start",
]);
export const programFileSourceTypeSchema = z.enum([
  "typescript",
  "javascript",
  "json",
  "markdown",
  "solidity",
  "text",
]);

export const agentDraftSchema = z.object({
  id: z.string(),
  roleName: z.string(),
  mission: z.string(),
  responsibilities: z.array(z.string()),
  allowedTools: z.array(z.string()),
  knowledgeSources: z.array(z.string()),
  triggerModes: z.array(triggerTypeSchema),
  approvalPolicy: approvalRequirementSchema,
  successMetrics: z.array(z.string()),
  constraints: z.array(z.string()),
});

export const agentTeamDraftSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  workspaceId: z.string(),
  title: z.string(),
  brief: z.string(),
  status: draftStatusSchema,
  clarifications: z.array(z.string()),
  generatedAgents: z.array(agentDraftSchema),
  createdByUserId: z.string(),
  updatedByUserId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const agentSpecSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  organizationId: z.string(),
  displayName: z.string(),
  mission: z.string(),
  responsibilities: z.array(z.string()),
  allowedTools: z.array(z.string()),
  knowledgeSources: z.array(z.string()),
  triggerModes: z.array(triggerTypeSchema),
  approvalPolicy: approvalRequirementSchema,
  successMetrics: z.array(z.string()),
  constraints: z.array(z.string()),
  status: agentStatusSchema,
  currentVersionId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const agentSpecVersionSchema = z.object({
  id: z.string(),
  agentId: z.string(),
  workspaceId: z.string(),
  version: z.number().int().positive(),
  spec: agentDraftSchema,
  createdByUserId: z.string(),
  createdAt: z.string(),
});

export const organizationSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  createdByUserId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const workspaceSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  name: z.string(),
  slug: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const userSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  createdAt: z.string(),
});

export const membershipSchema = z.object({
  id: z.string(),
  userId: z.string(),
  organizationId: z.string(),
  workspaceId: z.string(),
  role: membershipRoleSchema,
  createdAt: z.string(),
});

export const integrationProviderSchema = z.object({
  key: z.string(),
  name: z.string(),
  description: z.string(),
  category: z.string(),
  authType: integrationAuthTypeSchema,
  tools: z.array(z.string()),
  setupMode: setupModeSchema,
});

export const organizationIntegrationSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  providerKey: z.string(),
  displayName: z.string(),
  status: organizationIntegrationStatusSchema,
  authType: integrationAuthTypeSchema,
  scopes: z.array(z.string()),
  metadata: z.record(z.unknown()),
  createdByUserId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  lastValidatedAt: z.string().nullable(),
});

export const toolGrantSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  agentId: z.string(),
  organizationIntegrationId: z.string(),
  providerKey: z.string(),
  tools: z.array(z.string()),
  createdByUserId: z.string(),
  createdAt: z.string(),
});

export const orchestrationRefSchema = z.object({
  engine: orchestrationEngineSchema,
  workflowId: z.string().nullable(),
  workflowRunId: z.string().nullable(),
  workflowType: z.string(),
  taskQueue: z.string(),
  namespace: z.string(),
  status: orchestrationStatusSchema,
  lastError: z.string().nullable(),
});

export const programFileSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  workspaceId: z.string(),
  agentId: z.string().nullable(),
  name: z.string(),
  description: z.string().nullable(),
  sourceType: programFileSourceTypeSchema,
  content: z.string(),
  tags: z.array(z.string()),
  createdByUserId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const publicationRecordSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  workspaceId: z.string(),
  programFileId: z.string(),
  target: publicationTargetSchema,
  status: publicationStatusSchema,
  organizationIntegrationId: z.string().nullable(),
  summary: z.string(),
  transactionId: z.string().nullable(),
  gatewayUrl: z.string().nullable(),
  metadata: z.record(z.unknown()),
  orchestration: orchestrationRefSchema,
  createdByUserId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const runStepSchema = z.object({
  id: z.string(),
  runId: z.string(),
  title: z.string(),
  status: stepStatusSchema,
  output: z.string().nullable(),
  metadata: z.record(z.unknown()),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const approvalRequestSchema = z.object({
  id: z.string(),
  runId: z.string(),
  workspaceId: z.string(),
  status: approvalStatusSchema,
  summary: z.string(),
  requestedActions: z.array(z.string()),
  createdAt: z.string(),
  resolvedAt: z.string().nullable(),
});

export const runSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  workspaceId: z.string(),
  agentId: z.string(),
  triggerType: triggerTypeSchema,
  status: runStatusSchema,
  summary: z.string(),
  plannedActions: z.array(z.string()),
  approvalRequirement: approvalRequirementSchema,
  approvalRequestId: z.string().nullable(),
  orchestration: orchestrationRefSchema,
  createdByUserId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const auditEventSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  workspaceId: z.string().nullable(),
  userId: z.string().nullable(),
  eventType: z.string(),
  entityType: z.string(),
  entityId: z.string(),
  payload: z.record(z.unknown()),
  createdAt: z.string(),
});

export const registerInputSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2),
  password: z.string().min(8),
  organizationName: z.string().min(2),
  workspaceName: z.string().min(2).optional(),
});

export const loginInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const magicLinkInputSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).optional(),
  organizationName: z.string().min(2).optional(),
});

export const createDraftInputSchema = z.object({
  title: z.string().min(2),
  brief: z.string().min(20),
});

export const updateDraftInputSchema = z.object({
  title: z.string().min(2).optional(),
  brief: z.string().min(20).optional(),
  generatedAgents: z.array(agentDraftSchema).optional(),
});

export const installIntegrationInputSchema = z.object({
  displayName: z.string().min(2),
  scopes: z.array(z.string()).default([]),
  metadata: z.record(z.unknown()).default({}),
});

export const createToolGrantInputSchema = z.object({
  organizationIntegrationId: z.string(),
  tools: z.array(z.string()).min(1),
});

export const createProgramFileInputSchema = z.object({
  name: z.string().min(2),
  description: z.string().nullable().optional(),
  agentId: z.string().nullable().optional(),
  sourceType: programFileSourceTypeSchema,
  content: z.string().min(1),
  tags: z.array(z.string()).default([]),
});

export const updateProgramFileInputSchema = z.object({
  name: z.string().min(2).optional(),
  description: z.string().nullable().optional(),
  agentId: z.string().nullable().optional(),
  sourceType: programFileSourceTypeSchema.optional(),
  content: z.string().min(1).optional(),
  tags: z.array(z.string()).optional(),
});

export const publishProgramFileInputSchema = z.object({
  organizationIntegrationId: z.string().nullable().optional(),
  metadata: z.record(z.unknown()).default({}),
});

export const runCreateInputSchema = z.object({
  agentId: z.string(),
  triggerType: triggerTypeSchema.default("manual"),
  prompt: z.string().min(3).optional(),
});

export type MembershipRole = z.infer<typeof membershipRoleSchema>;
export type DraftStatus = z.infer<typeof draftStatusSchema>;
export type AgentStatus = z.infer<typeof agentStatusSchema>;
export type RunStatus = z.infer<typeof runStatusSchema>;
export type TriggerType = z.infer<typeof triggerTypeSchema>;
export type ApprovalRequirement = z.infer<typeof approvalRequirementSchema>;
export type ApprovalStatus = z.infer<typeof approvalStatusSchema>;
export type IntegrationAuthType = z.infer<typeof integrationAuthTypeSchema>;
export type SetupMode = z.infer<typeof setupModeSchema>;
export type PublicationTarget = z.infer<typeof publicationTargetSchema>;
export type PublicationStatus = z.infer<typeof publicationStatusSchema>;
export type OrchestrationEngine = z.infer<typeof orchestrationEngineSchema>;
export type OrchestrationStatus = z.infer<typeof orchestrationStatusSchema>;
export type ProgramFileSourceType = z.infer<typeof programFileSourceTypeSchema>;
export type AgentDraft = z.infer<typeof agentDraftSchema>;
export type AgentTeamDraft = z.infer<typeof agentTeamDraftSchema>;
export type AgentSpec = z.infer<typeof agentSpecSchema>;
export type AgentSpecVersion = z.infer<typeof agentSpecVersionSchema>;
export type Organization = z.infer<typeof organizationSchema>;
export type Workspace = z.infer<typeof workspaceSchema>;
export type User = z.infer<typeof userSchema>;
export type Membership = z.infer<typeof membershipSchema>;
export type IntegrationProvider = z.infer<typeof integrationProviderSchema>;
export type OrganizationIntegration = z.infer<typeof organizationIntegrationSchema>;
export type ToolGrant = z.infer<typeof toolGrantSchema>;
export type OrchestrationRef = z.infer<typeof orchestrationRefSchema>;
export type ProgramFile = z.infer<typeof programFileSchema>;
export type PublicationRecord = z.infer<typeof publicationRecordSchema>;
export type RunStep = z.infer<typeof runStepSchema>;
export type ApprovalRequest = z.infer<typeof approvalRequestSchema>;
export type Run = z.infer<typeof runSchema>;
export type AuditEvent = z.infer<typeof auditEventSchema>;
export type RegisterInput = z.infer<typeof registerInputSchema>;
export type LoginInput = z.infer<typeof loginInputSchema>;
export type MagicLinkInput = z.infer<typeof magicLinkInputSchema>;
export type CreateDraftInput = z.infer<typeof createDraftInputSchema>;
export type UpdateDraftInput = z.infer<typeof updateDraftInputSchema>;
export type InstallIntegrationInput = z.infer<typeof installIntegrationInputSchema>;
export type CreateToolGrantInput = z.infer<typeof createToolGrantInputSchema>;
export type CreateProgramFileInput = z.infer<typeof createProgramFileInputSchema>;
export type UpdateProgramFileInput = z.infer<typeof updateProgramFileInputSchema>;
export type PublishProgramFileInput = z.infer<typeof publishProgramFileInputSchema>;
export type RunCreateInput = z.infer<typeof runCreateInputSchema>;
