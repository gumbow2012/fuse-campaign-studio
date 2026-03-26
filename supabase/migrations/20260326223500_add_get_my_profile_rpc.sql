create or replace function public.get_my_profile()
returns table (
  id uuid,
  user_id uuid,
  email text,
  name text,
  plan text,
  subscription_status text,
  credits_balance integer,
  stripe_customer_id text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    p.id,
    p.user_id,
    p.email,
    p.name,
    p.plan,
    p.subscription_status,
    p.credits_balance,
    p.stripe_customer_id,
    p.created_at,
    p.updated_at
  from public.profiles p
  where p.user_id = auth.uid()
  limit 1;
$$;

revoke all on function public.get_my_profile() from public;
grant execute on function public.get_my_profile() to authenticated;

