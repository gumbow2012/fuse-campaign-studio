CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS TABLE (
  id uuid,
  user_id uuid,
  email text,
  name text,
  plan text,
  subscription_status text,
  credits_balance integer,
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_price_id text,
  subscription_period_start timestamptz,
  subscription_period_end timestamptz,
  subscription_cycle_credits integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.user_id, p.email, p.name, p.plan, p.subscription_status,
         p.credits_balance, p.stripe_customer_id,
         NULL::text, NULL::text, NULL::timestamptz, NULL::timestamptz, 0::integer
  FROM public.profiles p
  WHERE p.user_id = auth.uid()
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.get_my_roles()
RETURNS TABLE (role app_role)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ur.role FROM public.user_roles ur WHERE ur.user_id = auth.uid()
$$;

GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_roles() TO authenticated;