begin;

create table if not exists agent_chat_threads (
  id text primary key,
  organization_id text not null references organizations (id) on delete cascade,
  workspace_id text not null references workspaces (id) on delete cascade,
  title text not null,
  status text not null check (status in ('active', 'archived')),
  created_by_user_id text not null references users (id) on delete cascade,
  archived_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists agent_chat_messages (
  id text primary key,
  thread_id text not null references agent_chat_threads (id) on delete cascade,
  organization_id text not null references organizations (id) on delete cascade,
  workspace_id text not null references workspaces (id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  memory_context jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_agent_chat_threads_workspace
  on agent_chat_threads (workspace_id, status, updated_at desc);

create index if not exists idx_agent_chat_messages_thread
  on agent_chat_messages (thread_id, created_at asc);

commit;
