alter table public.execution_jobs add column if not exists template_id uuid references public.fuse_templates(id);
alter table public.execution_jobs add column if not exists input_payload jsonb not null default '{}'::jsonb;
alter table public.execution_jobs add column if not exists result_payload jsonb not null default '{}'::jsonb;
alter table public.execution_jobs add column if not exists error_log text;
alter table public.execution_jobs add column if not exists progress integer not null default 0;

alter table public.execution_steps add column if not exists provider text;
alter table public.execution_steps add column if not exists provider_model text;
alter table public.execution_steps add column if not exists provider_request_id text;
alter table public.execution_steps add column if not exists output_asset_id uuid references public.assets(id);
alter table public.execution_steps add column if not exists started_at timestamptz;
alter table public.execution_steps add column if not exists completed_at timestamptz;

create index if not exists idx_execution_jobs_template_id on public.execution_jobs(template_id);
create unique index if not exists idx_execution_steps_provider_request_id on public.execution_steps(provider_request_id) where provider_request_id is not null;
