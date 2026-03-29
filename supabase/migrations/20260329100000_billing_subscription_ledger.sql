-- =============================================================================
-- Fuse MVP billing hardening for the live fuse-codex graph schema
-- - Adds subscription fields to profiles
-- - Adds a lightweight credit ledger tied to fuse_templates
-- - Adds Stripe event logging + subscription credit grants
-- - Adds atomic credit transaction helpers
-- =============================================================================

DO $$
BEGIN
  CREATE TYPE public.credit_event_type AS ENUM (
    'run_template',
    'rerun_step',
    'topup',
    'monthly_grant',
    'refund',
    'adjustment'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_price_id TEXT,
  ADD COLUMN IF NOT EXISTS subscription_period_start TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS subscription_period_end TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS subscription_cycle_credits INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.credit_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type public.credit_event_type NOT NULL,
  amount INTEGER NOT NULL,
  template_id UUID REFERENCES public.fuse_templates(id) ON DELETE SET NULL,
  project_id UUID,
  step_id UUID,
  description TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.credit_ledger ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'credit_ledger' AND policyname = 'users_read_own_credit_ledger'
  ) THEN
    CREATE POLICY "users_read_own_credit_ledger"
      ON public.credit_ledger FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'credit_ledger' AND policyname = 'admins_manage_credit_ledger'
  ) THEN
    CREATE POLICY "admins_manage_credit_ledger"
      ON public.credit_ledger FOR ALL
      USING (EXISTS (
        SELECT 1 FROM public.user_roles r
        WHERE r.user_id = auth.uid() AND r.role = 'admin'
      ));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'credit_ledger' AND policyname = 'service_insert_credit_ledger'
  ) THEN
    CREATE POLICY "service_insert_credit_ledger"
      ON public.credit_ledger FOR INSERT
      WITH CHECK (true);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.billing_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  stripe_invoice_id TEXT,
  stripe_price_id TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.billing_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'billing_events' AND policyname = 'admins_manage_billing_events'
  ) THEN
    CREATE POLICY "admins_manage_billing_events"
      ON public.billing_events FOR ALL
      USING (EXISTS (
        SELECT 1 FROM public.user_roles r
        WHERE r.user_id = auth.uid() AND r.role = 'admin'
      ));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'billing_events' AND policyname = 'service_insert_billing_events'
  ) THEN
    CREATE POLICY "service_insert_billing_events"
      ON public.billing_events FOR INSERT
      WITH CHECK (true);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.subscription_period_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_event_id TEXT NOT NULL UNIQUE,
  stripe_customer_id TEXT NOT NULL,
  stripe_subscription_id TEXT NOT NULL,
  stripe_invoice_id TEXT,
  stripe_price_id TEXT NOT NULL,
  billing_period_start TIMESTAMPTZ NOT NULL,
  billing_period_end TIMESTAMPTZ NOT NULL,
  credits_granted INTEGER NOT NULL,
  ledger_id UUID REFERENCES public.credit_ledger(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.subscription_period_grants ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'subscription_period_grants' AND policyname = 'users_read_own_subscription_period_grants'
  ) THEN
    CREATE POLICY "users_read_own_subscription_period_grants"
      ON public.subscription_period_grants FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'subscription_period_grants' AND policyname = 'admins_manage_subscription_period_grants'
  ) THEN
    CREATE POLICY "admins_manage_subscription_period_grants"
      ON public.subscription_period_grants FOR ALL
      USING (EXISTS (
        SELECT 1 FROM public.user_roles r
        WHERE r.user_id = auth.uid() AND r.role = 'admin'
      ));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'subscription_period_grants' AND policyname = 'service_insert_subscription_period_grants'
  ) THEN
    CREATE POLICY "service_insert_subscription_period_grants"
      ON public.subscription_period_grants FOR INSERT
      WITH CHECK (true);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.get_my_roles()
RETURNS TABLE(role app_role)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.role
  FROM public.user_roles r
  WHERE r.user_id = auth.uid()
  ORDER BY r.role;
$$;

REVOKE ALL ON FUNCTION public.get_my_roles() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_roles() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS TABLE (
  id UUID,
  user_id UUID,
  email TEXT,
  name TEXT,
  plan TEXT,
  subscription_status TEXT,
  credits_balance INTEGER,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  stripe_price_id TEXT,
  subscription_period_start TIMESTAMPTZ,
  subscription_period_end TIMESTAMPTZ,
  subscription_cycle_credits INTEGER,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.user_id,
    p.email,
    p.name,
    p.plan,
    p.subscription_status,
    p.credits_balance,
    p.stripe_customer_id,
    p.stripe_subscription_id,
    p.stripe_price_id,
    p.subscription_period_start,
    p.subscription_period_end,
    p.subscription_cycle_credits,
    p.created_at,
    p.updated_at
  FROM public.profiles p
  WHERE p.user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.get_my_profile() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated;

CREATE OR REPLACE FUNCTION public.apply_credit_transaction(
  p_user_id UUID,
  p_amount INTEGER,
  p_type public.credit_event_type,
  p_description TEXT DEFAULT NULL,
  p_template_id UUID DEFAULT NULL,
  p_project_id UUID DEFAULT NULL,
  p_step_id UUID DEFAULT NULL
)
RETURNS TABLE (new_balance INTEGER, ledger_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_balance INTEGER;
BEGIN
  SELECT credits_balance
  INTO current_balance
  FROM public.profiles
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF current_balance IS NULL THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  IF current_balance + p_amount < 0 THEN
    RAISE EXCEPTION 'Insufficient credits';
  END IF;

  UPDATE public.profiles
  SET credits_balance = current_balance + p_amount,
      updated_at = now()
  WHERE user_id = p_user_id
  RETURNING credits_balance INTO new_balance;

  INSERT INTO public.credit_ledger (
    user_id,
    type,
    amount,
    template_id,
    project_id,
    step_id,
    description
  )
  VALUES (
    p_user_id,
    p_type,
    p_amount,
    p_template_id,
    p_project_id,
    p_step_id,
    p_description
  )
  RETURNING id INTO ledger_id;

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_credit_transaction(UUID, INTEGER, public.credit_event_type, TEXT, UUID, UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_credit_transaction(UUID, INTEGER, public.credit_event_type, TEXT, UUID, UUID, UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.grant_subscription_credits(
  p_user_id UUID,
  p_stripe_event_id TEXT,
  p_stripe_customer_id TEXT,
  p_stripe_subscription_id TEXT,
  p_stripe_invoice_id TEXT,
  p_stripe_price_id TEXT,
  p_billing_period_start TIMESTAMPTZ,
  p_billing_period_end TIMESTAMPTZ,
  p_credits_granted INTEGER,
  p_description TEXT DEFAULT NULL
)
RETURNS TABLE (granted BOOLEAN, new_balance INTEGER, grant_id UUID, ledger_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  txn RECORD;
BEGIN
  INSERT INTO public.subscription_period_grants (
    user_id,
    stripe_event_id,
    stripe_customer_id,
    stripe_subscription_id,
    stripe_invoice_id,
    stripe_price_id,
    billing_period_start,
    billing_period_end,
    credits_granted
  )
  VALUES (
    p_user_id,
    p_stripe_event_id,
    p_stripe_customer_id,
    p_stripe_subscription_id,
    p_stripe_invoice_id,
    p_stripe_price_id,
    p_billing_period_start,
    p_billing_period_end,
    p_credits_granted
  )
  ON CONFLICT (stripe_event_id) DO NOTHING
  RETURNING id INTO grant_id;

  IF grant_id IS NULL THEN
    granted := false;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT * INTO txn
  FROM public.apply_credit_transaction(
    p_user_id,
    p_credits_granted,
    'monthly_grant',
    COALESCE(p_description, 'Subscription credit grant'),
    NULL,
    NULL,
    NULL
  );

  UPDATE public.subscription_period_grants
  SET ledger_id = txn.ledger_id
  WHERE id = grant_id;

  granted := true;
  new_balance := txn.new_balance;
  ledger_id := txn.ledger_id;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.grant_subscription_credits(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.grant_subscription_credits(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.decrement_credits(
  p_user_id UUID,
  p_amount INTEGER,
  p_template_id UUID DEFAULT NULL,
  p_project_id UUID DEFAULT NULL,
  p_step_id UUID DEFAULT NULL,
  p_description TEXT DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  txn RECORD;
BEGIN
  SELECT * INTO txn
  FROM public.apply_credit_transaction(
    p_user_id,
    -ABS(p_amount),
    'run_template',
    p_description,
    p_template_id,
    p_project_id,
    p_step_id
  );

  RETURN txn.new_balance;
END;
$$;

REVOKE ALL ON FUNCTION public.decrement_credits(UUID, INTEGER, UUID, UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decrement_credits(UUID, INTEGER, UUID, UUID, UUID, TEXT) TO service_role;
