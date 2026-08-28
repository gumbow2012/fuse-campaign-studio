ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_plan_offer text NOT NULL DEFAULT 'unseen';

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_onboarding_plan_offer_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_onboarding_plan_offer_check
  CHECK (onboarding_plan_offer IN ('unseen','shown','free','starter','capsule','dismissed'));

-- Existing accounts (created before this onboarding step) are never "new users".
UPDATE public.profiles
SET onboarding_plan_offer = 'dismissed'
WHERE onboarding_plan_offer = 'unseen'
  AND created_at < now() - interval '1 day';

DROP FUNCTION IF EXISTS public.get_my_profile();

CREATE FUNCTION public.get_my_profile()
 RETURNS TABLE(id uuid, user_id uuid, email text, name text, avatar_url text, plan text, subscription_status text, credits_balance integer, stripe_customer_id text, stripe_subscription_id text, stripe_price_id text, subscription_period_start timestamp with time zone, subscription_period_end timestamp with time zone, subscription_cycle_credits integer, onboarding_plan_offer text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p.id, p.user_id, p.email, p.name, p.avatar_url, p.plan, p.subscription_status,
         p.credits_balance, p.stripe_customer_id,
         NULL::text, NULL::text, NULL::timestamptz, NULL::timestamptz, 0::integer,
         coalesce(p.onboarding_plan_offer, 'unseen')
  FROM public.profiles p
  WHERE p.user_id = auth.uid()
  LIMIT 1
$function$;

REVOKE ALL ON FUNCTION public.get_my_profile() FROM public;
GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated;

CREATE OR REPLACE FUNCTION public.set_onboarding_plan_offer(_state text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_state text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  v_state := lower(coalesce(_state, ''));
  IF v_state NOT IN ('unseen','shown','free','starter','capsule','dismissed') THEN
    RAISE EXCEPTION 'Invalid onboarding state';
  END IF;
  UPDATE public.profiles
  SET onboarding_plan_offer = v_state
  WHERE user_id = auth.uid();
  RETURN v_state;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_onboarding_plan_offer(text) FROM public;
GRANT EXECUTE ON FUNCTION public.set_onboarding_plan_offer(text) TO authenticated;