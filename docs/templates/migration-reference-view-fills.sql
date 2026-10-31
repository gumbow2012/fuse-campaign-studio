-- Applied to production 2026-10-31 via Supabase MCP (apply_migration "reference_view_fills").
-- One row per AI-generated missing product view. Written only by the fill-reference-view edge function.
create table if not exists public.reference_view_fills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  view text not null check (view in ('back', 'left', 'right', 'inside')),
  request_id text,
  status text not null default 'pending' check (status in ('pending', 'complete', 'failed')),
  charged_credits integer not null default 0,
  credits_refunded boolean not null default false,
  result_url text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.reference_view_fills enable row level security;
drop policy if exists "Users read their own view fills" on public.reference_view_fills;
create policy "Users read their own view fills" on public.reference_view_fills for select using (auth.uid() = user_id);
create index if not exists reference_view_fills_user_idx on public.reference_view_fills (user_id, created_at desc);
comment on table public.reference_view_fills is 'AI-generated missing product views (back/sides/inside) built from the customer''s own photos. Written only by the fill-reference-view edge function; credits charged at start, refunded once on failure.';
