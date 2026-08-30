create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  company text,
  message text not null,
  status text not null default 'new',
  source text not null default 'marketing_site',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  constraint contact_messages_status_check check (status in ('new', 'reviewed', 'resolved', 'spam'))
);

create index if not exists idx_contact_messages_created_at on public.contact_messages (created_at desc);
create index if not exists idx_contact_messages_status on public.contact_messages (status);

grant insert on public.contact_messages to anon;
grant select, insert, update on public.contact_messages to authenticated;
grant all on public.contact_messages to service_role;

alter table public.contact_messages enable row level security;

drop policy if exists "public_insert_contact_messages" on public.contact_messages;
create policy "public_insert_contact_messages"
  on public.contact_messages
  for insert
  to anon, authenticated
  with check (
    length(trim(name)) between 2 and 120
    and length(trim(email)) between 5 and 200
    and position('@' in email) > 1
    and length(trim(message)) between 10 and 4000
  );

drop policy if exists "service_role_manage_contact_messages" on public.contact_messages;
create policy "service_role_manage_contact_messages"
  on public.contact_messages
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "admins_select_contact_messages" on public.contact_messages;
create policy "admins_select_contact_messages"
  on public.contact_messages
  for select
  to authenticated
  using (public.has_role(auth.uid(), 'admin'));

drop policy if exists "admins_update_contact_messages" on public.contact_messages;
create policy "admins_update_contact_messages"
  on public.contact_messages
  for update
  to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));