create or replace function public.get_my_roles()
returns table(role public.app_role)
language sql
stable
security definer
set search_path = public
as $$
  select ur.role
  from public.user_roles ur
  where ur.user_id = auth.uid()
  order by case ur.role
    when 'admin' then 0
    when 'dev' then 1
    when 'user' then 2
    else 3
  end;
$$;

revoke all on function public.get_my_roles() from public;
grant execute on function public.get_my_roles() to authenticated;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    where ur.user_id = _user_id
      and ur.role = _role
  );
$$;

revoke all on function public.has_role(uuid, public.app_role) from public;
grant execute on function public.has_role(uuid, public.app_role) to authenticated;
