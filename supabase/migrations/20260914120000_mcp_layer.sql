-- FUSE MCP / API layer: clean template metadata for AI clients, upload sessions,
-- run idempotency, and tool-call observability. All tables are service-role only
-- (RLS enabled, no policies) — the edge function is the only writer/reader.

create table if not exists public.template_ai_metadata (
  template_id uuid primary key references public.fuse_templates(id) on delete cascade,
  public_name text not null,
  one_sentence_description text not null,
  long_description text,
  product_types text[] not null default '{}',
  industries text[] not null default '{}',
  use_cases text[] not null default '{}',
  style_tags text[] not null default '{}',
  visibility text not null default 'public' check (visibility in ('public','hidden')),
  internal_notes text,
  updated_at timestamptz not null default now()
);
alter table public.template_ai_metadata enable row level security;

create table if not exists public.mcp_upload_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  template_id uuid not null references public.fuse_templates(id) on delete cascade,
  version_id uuid not null,
  campaign_name text,
  slots jsonb not null default '[]'::jsonb,
  attached jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open','attached','consumed','expired')),
  idempotency_key text,
  expires_at timestamptz not null default now() + interval '2 hours',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists mcp_upload_sessions_idem
  on public.mcp_upload_sessions(user_id, idempotency_key) where idempotency_key is not null;
create index if not exists mcp_upload_sessions_user on public.mcp_upload_sessions(user_id, created_at desc);
alter table public.mcp_upload_sessions enable row level security;

create table if not exists public.mcp_run_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  idempotency_key text not null,
  confirmation_hash text not null,
  job_id uuid,
  response jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);
create unique index if not exists mcp_run_requests_confirmation on public.mcp_run_requests(confirmation_hash);
alter table public.mcp_run_requests enable row level security;

create table if not exists public.mcp_tool_calls (
  id bigint generated always as identity primary key,
  tool text not null,
  surface text not null,
  client text,
  auth_kind text,
  user_id uuid,
  api_key_id uuid,
  template_slug text,
  run_id uuid,
  credits integer,
  ok boolean not null,
  error_code text,
  latency_ms integer,
  idempotency_key text,
  created_at timestamptz not null default now()
);
create index if not exists mcp_tool_calls_created on public.mcp_tool_calls(created_at desc);
create index if not exists mcp_tool_calls_user on public.mcp_tool_calls(user_id, created_at desc);
alter table public.mcp_tool_calls enable row level security;

-- One-time HMAC secret for confirmation tokens (never leaves the database/edge fn).
insert into public.service_config(key, value)
values ('mcp_signing_secret', encode(gen_random_bytes(32), 'hex'))
on conflict (key) do nothing;

-- Customer-facing campaign names for runs (execution_jobs is owned by the runner).
create table if not exists public.campaign_names (
  job_id uuid primary key references public.execution_jobs(id) on delete cascade,
  user_id uuid not null,
  name text not null check (char_length(name) between 2 and 80),
  updated_at timestamptz not null default now()
);
alter table public.campaign_names enable row level security;
