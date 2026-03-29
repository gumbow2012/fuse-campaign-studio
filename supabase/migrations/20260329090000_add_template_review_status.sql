alter table public.template_versions
  add column if not exists review_status text not null default 'Unreviewed';

alter table public.template_versions
  add column if not exists reviewed_at timestamptz;

alter table public.template_versions
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'template_versions_review_status_check'
  ) then
    alter table public.template_versions
      add constraint template_versions_review_status_check
      check (review_status in (
        'Unreviewed',
        'Structurally Correct',
        'Prompt Drift',
        'Blocked by Provider',
        'Approved'
      ));
  end if;
end
$$;

