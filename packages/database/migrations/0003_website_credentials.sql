begin;

create table if not exists website_credentials (
  id text primary key,
  organization_id text not null references organizations (id) on delete cascade,
  workspace_id text not null references workspaces (id) on delete cascade,
  label text not null,
  origin text not null,
  login_url text not null,
  username text not null,
  secret_ciphertext text not null,
  secret_iv text not null,
  secret_auth_tag text not null,
  username_selector text not null,
  password_selector text not null,
  submit_selector text null,
  success_selector text null,
  notes text null,
  created_by_user_id text not null references users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_validated_at timestamptz null
);

create index if not exists idx_website_credentials_workspace_id
  on website_credentials (workspace_id, updated_at desc);

create index if not exists idx_website_credentials_origin
  on website_credentials (workspace_id, origin, username);

commit;
