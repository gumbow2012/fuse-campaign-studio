-- Applied to production 2026-10-31 via Supabase MCP (apply_migration "template_visibility").
-- Who can see and run a published template. Enforced server-side in
-- lab-template-catalog, template-detail-page and start-template-run.
alter table public.fuse_templates add column if not exists visibility text not null default 'public';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'fuse_templates_visibility_check') then
    alter table public.fuse_templates add constraint fuse_templates_visibility_check check (visibility in ('public', 'creators', 'admins'));
  end if;
end $$;
comment on column public.fuse_templates.visibility is 'Who can see and run a published template: public (everyone), creators (creators + admins/devs), admins (admins/devs only). Enforced in lab-template-catalog, template-detail-page and start-template-run.';
