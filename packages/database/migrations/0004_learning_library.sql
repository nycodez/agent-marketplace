begin;

create table if not exists learning_library_sources (
  id text primary key,
  organization_id text not null references organizations (id) on delete cascade,
  workspace_id text not null references workspaces (id) on delete cascade,
  source_type text not null check (source_type in ('manual_note', 'program_file', 'agent_run', 'chat_message', 'integration_artifact', 'uploaded_document')),
  source_id text not null,
  title text not null,
  summary text null,
  status text not null check (status in ('pending', 'indexed', 'failed')),
  visibility text not null check (visibility in ('workspace', 'agent')),
  metadata jsonb not null default '{}'::jsonb,
  indexed_at timestamptz null,
  index_error text null,
  deleted_at timestamptz null,
  created_by_user_id text null references users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, source_type, source_id)
);

create table if not exists learning_library_chunks (
  id text primary key,
  source_id text not null references learning_library_sources (id) on delete cascade,
  organization_id text not null references organizations (id) on delete cascade,
  workspace_id text not null references workspaces (id) on delete cascade,
  chunk_index integer not null check (chunk_index >= 0),
  content text not null,
  content_hash text not null,
  metadata jsonb not null default '{}'::jsonb,
  search_vector tsvector generated always as (to_tsvector('english', coalesce(content, ''))) stored,
  created_at timestamptz not null default now(),
  unique (source_id, chunk_index),
  unique (source_id, content_hash)
);

create index if not exists idx_learning_library_sources_workspace
  on learning_library_sources (workspace_id, status, updated_at desc)
  where deleted_at is null;

create index if not exists idx_learning_library_sources_type
  on learning_library_sources (workspace_id, source_type, updated_at desc)
  where deleted_at is null;

create index if not exists idx_learning_library_chunks_workspace
  on learning_library_chunks (workspace_id, source_id, chunk_index);

create index if not exists idx_learning_library_chunks_search
  on learning_library_chunks using gin (search_vector);

commit;
