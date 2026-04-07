begin;

alter table publication_records
  add column if not exists explorer_url text null,
  add column if not exists content_hash text null,
  add column if not exists network text null,
  add column if not exists receipt jsonb null;

alter table run_steps
  add column if not exists tool text null,
  add column if not exists assigned_agent_id text null references agents (id) on delete set null,
  add column if not exists attempt integer not null default 0,
  add column if not exists error_code text null,
  add column if not exists started_at timestamptz null,
  add column if not exists finished_at timestamptz null,
  add column if not exists receipt jsonb null,
  add column if not exists input_snapshot jsonb null;

alter table approval_requests
  drop constraint if exists approval_requests_run_id_key;

alter table approval_requests
  add column if not exists run_step_id text null references run_steps (id) on delete cascade,
  add column if not exists tool text null,
  add column if not exists target_label text null,
  add column if not exists payload jsonb not null default '{}'::jsonb;

create index if not exists idx_run_steps_run_id_status on run_steps (run_id, status, created_at asc);
create index if not exists idx_approval_requests_run_id_status on approval_requests (run_id, status, created_at desc);
create index if not exists idx_approval_requests_run_step_id on approval_requests (run_step_id, created_at desc);

commit;
