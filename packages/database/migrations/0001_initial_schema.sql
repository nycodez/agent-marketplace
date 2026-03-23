begin;

create extension if not exists "pgcrypto";

create table if not exists users (
  id text primary key,
  email text not null unique,
  name text not null,
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists sessions (
  token text primary key,
  user_id text not null references users (id) on delete cascade,
  organization_id text not null,
  workspace_id text not null,
  created_at timestamptz not null default now()
);

create table if not exists organizations (
  id text primary key,
  name text not null,
  slug text not null unique,
  created_by_user_id text not null references users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists workspaces (
  id text primary key,
  organization_id text not null references organizations (id) on delete cascade,
  name text not null,
  slug text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, slug)
);

create table if not exists memberships (
  id text primary key,
  user_id text not null references users (id) on delete cascade,
  organization_id text not null references organizations (id) on delete cascade,
  workspace_id text not null references workspaces (id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'builder', 'operator', 'viewer')),
  created_at timestamptz not null default now(),
  unique (user_id, workspace_id)
);

create table if not exists agent_team_drafts (
  id text primary key,
  organization_id text not null references organizations (id) on delete cascade,
  workspace_id text not null references workspaces (id) on delete cascade,
  title text not null,
  brief text not null,
  status text not null check (status in ('draft', 'generated', 'published')),
  clarifications jsonb not null default '[]'::jsonb,
  generated_agents jsonb not null default '[]'::jsonb,
  created_by_user_id text not null references users (id),
  updated_by_user_id text not null references users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists agents (
  id text primary key,
  workspace_id text not null references workspaces (id) on delete cascade,
  organization_id text not null references organizations (id) on delete cascade,
  display_name text not null,
  mission text not null,
  responsibilities jsonb not null default '[]'::jsonb,
  allowed_tools jsonb not null default '[]'::jsonb,
  knowledge_sources jsonb not null default '[]'::jsonb,
  trigger_modes jsonb not null default '[]'::jsonb,
  approval_policy text not null check (approval_policy in ('not_required', 'required')),
  success_metrics jsonb not null default '[]'::jsonb,
  constraints jsonb not null default '[]'::jsonb,
  status text not null check (status in ('draft', 'active', 'paused', 'archived')),
  current_version_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists agent_spec_versions (
  id text primary key,
  agent_id text not null references agents (id) on delete cascade,
  workspace_id text not null references workspaces (id) on delete cascade,
  version integer not null check (version > 0),
  spec jsonb not null,
  created_by_user_id text not null references users (id),
  created_at timestamptz not null default now(),
  unique (agent_id, version)
);

alter table agents
  add constraint agents_current_version_fk
  foreign key (current_version_id) references agent_spec_versions (id) deferrable initially deferred;

create table if not exists organization_integrations (
  id text primary key,
  organization_id text not null references organizations (id) on delete cascade,
  provider_key text not null,
  display_name text not null,
  status text not null check (status in ('pending', 'connected', 'failed', 'revoked')),
  auth_type text not null check (auth_type in ('oauth', 'api_key', 'webhook', 'wallet')),
  scopes jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_by_user_id text not null references users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_validated_at timestamptz null
);

create table if not exists tool_grants (
  id text primary key,
  workspace_id text not null references workspaces (id) on delete cascade,
  agent_id text not null references agents (id) on delete cascade,
  organization_integration_id text not null references organization_integrations (id) on delete cascade,
  provider_key text not null,
  tools jsonb not null default '[]'::jsonb,
  created_by_user_id text not null references users (id),
  created_at timestamptz not null default now()
);

create table if not exists program_files (
  id text primary key,
  organization_id text not null references organizations (id) on delete cascade,
  workspace_id text not null references workspaces (id) on delete cascade,
  agent_id text null references agents (id) on delete set null,
  name text not null,
  description text null,
  source_type text not null check (source_type in ('typescript', 'javascript', 'json', 'markdown', 'solidity', 'text')),
  content text not null,
  tags jsonb not null default '[]'::jsonb,
  created_by_user_id text not null references users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists publication_records (
  id text primary key,
  organization_id text not null references organizations (id) on delete cascade,
  workspace_id text not null references workspaces (id) on delete cascade,
  program_file_id text not null references program_files (id) on delete cascade,
  target text not null check (target in ('base', 'arweave')),
  status text not null check (status in ('queued', 'processing', 'published', 'failed')),
  organization_integration_id text null references organization_integrations (id) on delete set null,
  summary text not null,
  transaction_id text null,
  gateway_url text null,
  metadata jsonb not null default '{}'::jsonb,
  orchestration jsonb not null,
  created_by_user_id text not null references users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists runs (
  id text primary key,
  organization_id text not null references organizations (id) on delete cascade,
  workspace_id text not null references workspaces (id) on delete cascade,
  agent_id text not null references agents (id) on delete cascade,
  trigger_type text not null check (trigger_type in ('manual', 'scheduled', 'webhook', 'integration_event')),
  status text not null check (status in ('queued', 'planning', 'awaiting_approval', 'running', 'completed', 'cancelled', 'failed')),
  summary text not null,
  planned_actions jsonb not null default '[]'::jsonb,
  approval_requirement text not null check (approval_requirement in ('not_required', 'required')),
  approval_request_id text null,
  orchestration jsonb not null,
  created_by_user_id text not null references users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists run_steps (
  id text primary key,
  run_id text not null references runs (id) on delete cascade,
  title text not null,
  status text not null check (status in ('queued', 'running', 'completed', 'failed', 'skipped')),
  output text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists approval_requests (
  id text primary key,
  run_id text not null unique references runs (id) on delete cascade,
  workspace_id text not null references workspaces (id) on delete cascade,
  status text not null check (status in ('pending', 'approved', 'rejected')),
  summary text not null,
  requested_actions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz null
);

alter table runs
  add constraint runs_approval_request_fk
  foreign key (approval_request_id) references approval_requests (id) deferrable initially deferred;

create table if not exists audit_events (
  id text primary key,
  organization_id text not null references organizations (id) on delete cascade,
  workspace_id text null references workspaces (id) on delete set null,
  user_id text null references users (id) on delete set null,
  event_type text not null,
  entity_type text not null,
  entity_id text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_sessions_user_id on sessions (user_id);
create index if not exists idx_sessions_organization_id on sessions (organization_id);
create index if not exists idx_workspaces_organization_id on workspaces (organization_id);
create index if not exists idx_memberships_user_id on memberships (user_id);
create index if not exists idx_memberships_workspace_id on memberships (workspace_id);
create index if not exists idx_agent_team_drafts_workspace_id on agent_team_drafts (workspace_id, updated_at desc);
create index if not exists idx_agents_workspace_id on agents (workspace_id, updated_at desc);
create index if not exists idx_agent_spec_versions_agent_id on agent_spec_versions (agent_id, version desc);
create index if not exists idx_organization_integrations_org_id on organization_integrations (organization_id, provider_key);
create index if not exists idx_tool_grants_agent_id on tool_grants (agent_id, workspace_id);
create index if not exists idx_program_files_workspace_id on program_files (workspace_id, updated_at desc);
create index if not exists idx_publication_records_workspace_id on publication_records (workspace_id, created_at desc);
create index if not exists idx_runs_workspace_id on runs (workspace_id, created_at desc);
create index if not exists idx_run_steps_run_id on run_steps (run_id, created_at asc);
create index if not exists idx_approval_requests_workspace_id on approval_requests (workspace_id, created_at desc);
create index if not exists idx_audit_events_org_id on audit_events (organization_id, created_at desc);
create index if not exists idx_audit_events_workspace_id on audit_events (workspace_id, created_at desc);

commit;
