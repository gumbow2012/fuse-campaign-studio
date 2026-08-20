create table if not exists public.jewelry_still_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  fingerprint text not null,
  version text not null default 'jewelry-still-analysis-v1',
  analysis jsonb not null,
  analyzed_at timestamptz not null default now(),
  unique (user_id, fingerprint)
);

create index if not exists jewelry_still_analyses_user_idx
  on public.jewelry_still_analyses (user_id, analyzed_at desc);

grant select, insert, update, delete on public.jewelry_still_analyses to authenticated;
grant all on public.jewelry_still_analyses to service_role;

alter table public.jewelry_still_analyses enable row level security;

create policy "Users read their own jewelry analyses"
  on public.jewelry_still_analyses for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users insert their own jewelry analyses"
  on public.jewelry_still_analyses for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users update their own jewelry analyses"
  on public.jewelry_still_analyses for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users delete their own jewelry analyses"
  on public.jewelry_still_analyses for delete
  to authenticated
  using (auth.uid() = user_id);