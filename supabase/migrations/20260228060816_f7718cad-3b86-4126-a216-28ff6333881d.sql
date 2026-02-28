
-- ============================================
-- 1) REVENUE SPLIT SYSTEM
-- ============================================

-- Platform config (single-row, global settings)
CREATE TABLE public.platform_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_share_percent numeric(5,2) NOT NULL DEFAULT 70.00,
  creator_share_percent numeric(5,2) NOT NULL DEFAULT 30.00,
  affiliate_percent_of_platform numeric(5,2) NOT NULL DEFAULT 5.00,
  hold_period_days integer NOT NULL DEFAULT 7,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage platform config"
  ON public.platform_config FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated can read platform config"
  ON public.platform_config FOR SELECT
  TO authenticated
  USING (true);

-- Insert default config
INSERT INTO public.platform_config (platform_share_percent, creator_share_percent, affiliate_percent_of_platform, hold_period_days)
VALUES (70.00, 30.00, 5.00, 7);

-- Creators table
CREATE TABLE public.creators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  display_name text NOT NULL,
  stripe_connect_account_id text,
  connect_status text NOT NULL DEFAULT 'NOT_STARTED',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id),
  CONSTRAINT valid_connect_status CHECK (connect_status IN ('NOT_STARTED','PENDING','ACTIVE','RESTRICTED'))
);

ALTER TABLE public.creators ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own creator profile"
  ON public.creators FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own creator profile"
  ON public.creators FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own creator profile"
  ON public.creators FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all creators"
  ON public.creators FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Add creator fields to templates
ALTER TABLE public.templates
  ADD COLUMN IF NOT EXISTS owner_type text NOT NULL DEFAULT 'PLATFORM',
  ADD COLUMN IF NOT EXISTS creator_id uuid REFERENCES public.creators(id),
  ADD COLUMN IF NOT EXISTS revenue_split_override jsonb;

-- Add constraint
ALTER TABLE public.templates
  ADD CONSTRAINT valid_owner_type CHECK (owner_type IN ('PLATFORM','CREATOR'));

-- Usage charges
CREATE TABLE public.usage_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  template_id uuid REFERENCES public.templates(id),
  project_id uuid REFERENCES public.projects(id),
  step_id uuid REFERENCES public.project_steps(id),
  charge_type text NOT NULL,
  credits_spent integer NOT NULL DEFAULT 0,
  usd_cost_basis_cents integer NOT NULL DEFAULT 0,
  usd_price_cents integer NOT NULL DEFAULT 0,
  stripe_invoice_id text,
  stripe_payment_intent_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT valid_charge_type CHECK (charge_type IN ('RUN_TEMPLATE','RERUN_STEP'))
);

ALTER TABLE public.usage_charges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own usage charges"
  ON public.usage_charges FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all usage charges"
  ON public.usage_charges FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Revenue allocations
CREATE TABLE public.revenue_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usage_charge_id uuid NOT NULL REFERENCES public.usage_charges(id),
  beneficiary_type text NOT NULL,
  beneficiary_id uuid,
  amount_cents integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'PENDING',
  available_at timestamptz,
  payout_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT valid_beneficiary_type CHECK (beneficiary_type IN ('PLATFORM','CREATOR','AFFILIATE')),
  CONSTRAINT valid_alloc_status CHECK (status IN ('PENDING','AVAILABLE','PAID','REVERSED'))
);

ALTER TABLE public.revenue_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Creators can read own allocations"
  ON public.revenue_allocations FOR SELECT
  TO authenticated
  USING (
    beneficiary_id IN (SELECT id FROM public.creators WHERE user_id = auth.uid())
    OR beneficiary_type = 'AFFILIATE' AND beneficiary_id = auth.uid()
  );

CREATE POLICY "Admins can manage all allocations"
  ON public.revenue_allocations FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Payouts
CREATE TABLE public.payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beneficiary_type text NOT NULL,
  beneficiary_id uuid NOT NULL,
  amount_cents integer NOT NULL DEFAULT 0,
  stripe_transfer_id text,
  status text NOT NULL DEFAULT 'PENDING',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT valid_payout_beneficiary CHECK (beneficiary_type IN ('CREATOR','AFFILIATE')),
  CONSTRAINT valid_payout_status CHECK (status IN ('PENDING','PAID','FAILED'))
);

ALTER TABLE public.payouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Creators can read own payouts"
  ON public.payouts FOR SELECT
  TO authenticated
  USING (
    beneficiary_id IN (SELECT id FROM public.creators WHERE user_id = auth.uid())
    OR (beneficiary_type = 'AFFILIATE' AND beneficiary_id = auth.uid())
  );

CREATE POLICY "Admins can manage all payouts"
  ON public.payouts FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Refund events
CREATE TABLE public.refund_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_charge_id text,
  stripe_payment_intent_id text,
  stripe_invoice_id text,
  amount_cents integer NOT NULL DEFAULT 0,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.refund_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage refund events"
  ON public.refund_events FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- ============================================
-- 2) ANALYTICS EVENTS
-- ============================================

CREATE TABLE public.analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  template_id uuid REFERENCES public.templates(id),
  project_id uuid REFERENCES public.projects(id),
  event_type text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT valid_event_type CHECK (event_type IN (
    'PROJECT_CREATED','PROJECT_STARTED','PROJECT_COMPLETED','PROJECT_FAILED',
    'STEP_RERUN','CREDITS_DEDUCTED','CREDITS_GRANTED',
    'DOWNLOAD','SUBSCRIPTION_CREATED','SUBSCRIPTION_UPDATED',
    'TOPUP_PURCHASED','REFUND_CREATED'
  ))
);

CREATE INDEX idx_analytics_events_type ON public.analytics_events(event_type);
CREATE INDEX idx_analytics_events_user ON public.analytics_events(user_id);
CREATE INDEX idx_analytics_events_template ON public.analytics_events(template_id);
CREATE INDEX idx_analytics_events_created ON public.analytics_events(created_at);

ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own analytics"
  ON public.analytics_events FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all analytics"
  ON public.analytics_events FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Add timing columns to projects and steps
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS failed_at timestamptz;

ALTER TABLE public.project_steps
  ADD COLUMN IF NOT EXISTS duration_ms integer;

-- ============================================
-- 3) REFERRAL SYSTEM
-- ============================================

-- Referral program config (single row)
CREATE TABLE public.referral_program_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enabled boolean NOT NULL DEFAULT true,
  signup_bonus_credits integer NOT NULL DEFAULT 50,
  referrer_bonus_credits_on_paid integer NOT NULL DEFAULT 100,
  paid_trigger text NOT NULL DEFAULT 'FIRST_SUBSCRIPTION_PAYMENT',
  affiliate_percent_of_platform_share numeric(5,2) DEFAULT 5.00,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT valid_paid_trigger CHECK (paid_trigger IN ('FIRST_SUBSCRIPTION_PAYMENT','FIRST_TOPUP','EITHER'))
);

ALTER TABLE public.referral_program_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage referral config"
  ON public.referral_program_config FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated can read referral config"
  ON public.referral_program_config FOR SELECT
  TO authenticated
  USING (true);

INSERT INTO public.referral_program_config (enabled, signup_bonus_credits, referrer_bonus_credits_on_paid, paid_trigger)
VALUES (true, 50, 100, 'FIRST_SUBSCRIPTION_PAYMENT');

-- Referral codes
CREATE TABLE public.referral_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  owner_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_referral_codes_owner ON public.referral_codes(owner_user_id);

ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own referral codes"
  ON public.referral_codes FOR SELECT
  TO authenticated
  USING (auth.uid() = owner_user_id);

CREATE POLICY "Users can create own referral codes"
  ON public.referral_codes FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = owner_user_id);

CREATE POLICY "Admins can manage all referral codes"
  ON public.referral_codes FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Referral attributions
CREATE TABLE public.referral_attributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referred_user_id uuid NOT NULL UNIQUE,
  referrer_user_id uuid NOT NULL,
  code_used text NOT NULL,
  status text NOT NULL DEFAULT 'ATTRIBUTED',
  attributed_at timestamptz NOT NULL DEFAULT now(),
  qualified_at timestamptz,
  rewarded_at timestamptz,
  CONSTRAINT valid_referral_status CHECK (status IN ('ATTRIBUTED','QUALIFIED','REWARDED','INVALID')),
  CONSTRAINT no_self_referral CHECK (referred_user_id != referrer_user_id)
);

ALTER TABLE public.referral_attributions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own referral attributions"
  ON public.referral_attributions FOR SELECT
  TO authenticated
  USING (auth.uid() = referrer_user_id OR auth.uid() = referred_user_id);

CREATE POLICY "Admins can manage all referral attributions"
  ON public.referral_attributions FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Referral rewards
CREATE TABLE public.referral_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_user_id uuid NOT NULL,
  referred_user_id uuid NOT NULL,
  reward_type text NOT NULL,
  credits_amount integer,
  revenue_allocation_id uuid REFERENCES public.revenue_allocations(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT valid_reward_type CHECK (reward_type IN ('CREDITS','REVENUE_SHARE'))
);

ALTER TABLE public.referral_rewards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own rewards"
  ON public.referral_rewards FOR SELECT
  TO authenticated
  USING (auth.uid() = referrer_user_id);

CREATE POLICY "Admins can manage all rewards"
  ON public.referral_rewards FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- ============================================
-- Triggers for updated_at
-- ============================================

CREATE TRIGGER update_creators_updated_at BEFORE UPDATE ON public.creators
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_platform_config_updated_at BEFORE UPDATE ON public.platform_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_referral_config_updated_at BEFORE UPDATE ON public.referral_program_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
