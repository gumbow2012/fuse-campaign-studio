CREATE TABLE IF NOT EXISTS public.credit_pack_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pack_key TEXT NOT NULL,
  credits INTEGER NOT NULL CHECK (credits > 0),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL DEFAULT 'usd',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'fulfilled', 'failed')),
  billing_mode TEXT NOT NULL DEFAULT 'live' CHECK (billing_mode IN ('live', 'test')),
  stripe_checkout_session_id TEXT NOT NULL UNIQUE,
  stripe_payment_intent_id TEXT UNIQUE,
  stripe_customer_id TEXT,
  stripe_event_id TEXT UNIQUE,
  ledger_id UUID REFERENCES public.credit_ledger(id),
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  fulfilled_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.credit_pack_purchases ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_credit_pack_purchases_user_created
  ON public.credit_pack_purchases (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_credit_pack_purchases_status
  ON public.credit_pack_purchases (status, created_at DESC);

DROP TRIGGER IF EXISTS set_credit_pack_purchases_updated_at ON public.credit_pack_purchases;
CREATE TRIGGER set_credit_pack_purchases_updated_at
  BEFORE UPDATE ON public.credit_pack_purchases
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'credit_pack_purchases'
      AND policyname = 'users_read_own_credit_pack_purchases'
  ) THEN
    CREATE POLICY "users_read_own_credit_pack_purchases"
      ON public.credit_pack_purchases FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'credit_pack_purchases'
      AND policyname = 'admins_manage_credit_pack_purchases'
  ) THEN
    CREATE POLICY "admins_manage_credit_pack_purchases"
      ON public.credit_pack_purchases FOR ALL
      USING (EXISTS (
        SELECT 1 FROM public.user_roles r
        WHERE r.user_id = auth.uid() AND r.role = 'admin'
      ))
      WITH CHECK (EXISTS (
        SELECT 1 FROM public.user_roles r
        WHERE r.user_id = auth.uid() AND r.role = 'admin'
      ));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'credit_pack_purchases'
      AND policyname = 'service_manage_credit_pack_purchases'
  ) THEN
    CREATE POLICY "service_manage_credit_pack_purchases"
      ON public.credit_pack_purchases FOR ALL
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;
