-- =============================================================================
-- FUSE CAMPAIGN STUDIO — Complete Clean Schema
-- Replaces all prior migrations. Safe to apply to a freshly reset DB.
-- =============================================================================

-- ── Enums ────────────────────────────────────────────────────────────────────

CREATE TYPE app_role           AS ENUM ('admin', 'user');
CREATE TYPE project_status     AS ENUM ('queued', 'running', 'complete', 'failed');
CREATE TYPE step_status        AS ENUM ('queued', 'running', 'complete', 'failed');
CREATE TYPE credit_event_type  AS ENUM (
  'run_template', 'rerun_step', 'topup', 'monthly_grant', 'refund', 'adjustment'
);

-- ── Shared updated_at trigger ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── user_roles ────────────────────────────────────────────────────────────────

CREATE TABLE public.user_roles (
  id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role    app_role NOT NULL DEFAULT 'user',
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own_roles"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "admins_manage_roles"
  ON public.user_roles FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.user_roles r
    WHERE r.user_id = auth.uid() AND r.role = 'admin'
  ));

-- ── profiles ──────────────────────────────────────────────────────────────────

CREATE TABLE public.profiles (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email               TEXT NOT NULL,
  name                TEXT,
  stripe_customer_id  TEXT,
  plan                TEXT DEFAULT 'free',
  subscription_status TEXT DEFAULT 'inactive',
  credits_balance     INTEGER NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own_profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "users_update_own_profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "users_insert_own_profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "admins_read_all_profiles"
  ON public.profiles FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.user_roles r
    WHERE r.user_id = auth.uid() AND r.role = 'admin'
  ));

CREATE POLICY "admins_update_all_profiles"
  ON public.profiles FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.user_roles r
    WHERE r.user_id = auth.uid() AND r.role = 'admin'
  ));

CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Auto-create profile + role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email)
    VALUES (NEW.id, COALESCE(NEW.email, ''))
    ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'user')
    ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── templates ─────────────────────────────────────────────────────────────────

CREATE TABLE public.templates (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                      TEXT NOT NULL,
  description               TEXT,
  preview_url               TEXT,
  required_inputs           JSONB DEFAULT '{}',
  estimated_credits_per_run INTEGER NOT NULL DEFAULT 10,
  is_active                 BOOLEAN NOT NULL DEFAULT true,
  category                  TEXT,
  tags                      TEXT[],
  -- Pipeline
  weavy_flow_url            TEXT,
  weavy_recipe_id           TEXT,
  weavy_recipe_version      INTEGER,
  input_schema              JSONB DEFAULT '[]',
  output_type               TEXT DEFAULT 'video',
  expected_output_count     INTEGER DEFAULT 1,
  ai_prompt                 TEXT,
  raw_json                  JSONB,
  nodes_count               INTEGER DEFAULT 0,
  edges_count               INTEGER DEFAULT 0,
  -- Creator revenue
  owner_type                TEXT DEFAULT 'PLATFORM'
                              CHECK (owner_type IN ('PLATFORM', 'CREATOR')),
  creator_id                UUID,
  revenue_split_override    JSONB,
  created_at                TIMESTAMPTZ DEFAULT now(),
  updated_at                TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX idx_templates_weavy_recipe_id
  ON public.templates (weavy_recipe_id)
  WHERE weavy_recipe_id IS NOT NULL;

ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone_read_active_templates"
  ON public.templates FOR SELECT
  USING (is_active = true);

CREATE POLICY "admins_manage_templates"
  ON public.templates FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.user_roles r
    WHERE r.user_id = auth.uid() AND r.role = 'admin'
  ));

CREATE TRIGGER set_templates_updated_at
  BEFORE UPDATE ON public.templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── projects ──────────────────────────────────────────────────────────────────

CREATE TABLE public.projects (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- user_id nullable: service/API-key calls don't have a Supabase auth user
  user_id        UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  -- template_id nullable: V6 pipeline uses template_name from R2
  template_id    UUID REFERENCES public.templates(id),
  template_name  TEXT,
  status         project_status NOT NULL DEFAULT 'queued',
  progress       INTEGER NOT NULL DEFAULT 0,
  inputs         JSONB DEFAULT '{}',
  user_inputs    JSONB DEFAULT '{}',
  outputs        JSONB DEFAULT '{"items":[]}',
  logs           TEXT[] DEFAULT '{}',
  error          TEXT,
  debug_trace    JSONB,
  failed_source  TEXT,
  attempts       INTEGER NOT NULL DEFAULT 0,
  max_attempts   INTEGER NOT NULL DEFAULT 3,
  weavy_run_id   TEXT,
  started_at     TIMESTAMPTZ,
  completed_at   TIMESTAMPTZ,
  failed_at      TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_projects_user_id      ON public.projects(user_id);
CREATE INDEX idx_projects_template_name ON public.projects(template_name);
CREATE INDEX idx_projects_status       ON public.projects(status);
CREATE INDEX idx_projects_created_at   ON public.projects(created_at DESC);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- User policies
CREATE POLICY "users_read_own_projects"
  ON public.projects FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "users_update_own_projects"
  ON public.projects FOR UPDATE
  USING (auth.uid() = user_id);

-- Admin policies
CREATE POLICY "admins_manage_all_projects"
  ON public.projects FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.user_roles r
    WHERE r.user_id = auth.uid() AND r.role = 'admin'
  ));

-- Service role policies (Cloudflare Worker with SERVICE_ROLE key bypasses RLS,
-- but these exist as safety net when using anon key with X-Service-Call header)
CREATE POLICY "service_insert_projects"
  ON public.projects FOR INSERT
  WITH CHECK (true);

CREATE POLICY "service_update_projects"
  ON public.projects FOR UPDATE
  USING (true);

CREATE POLICY "service_select_projects"
  ON public.projects FOR SELECT
  USING (true);

CREATE TRIGGER set_projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── project_steps ─────────────────────────────────────────────────────────────

CREATE TABLE public.project_steps (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id            UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  step_key              TEXT NOT NULL,
  status                step_status DEFAULT 'queued',
  output_url            TEXT,
  last_run_cost_credits INTEGER DEFAULT 0,
  duration_ms           INTEGER,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.project_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own_steps"
  ON public.project_steps FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = project_steps.project_id AND p.user_id = auth.uid()
  ));

CREATE POLICY "admins_manage_all_steps"
  ON public.project_steps FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.user_roles r
    WHERE r.user_id = auth.uid() AND r.role = 'admin'
  ));

CREATE POLICY "service_manage_steps"
  ON public.project_steps FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE TRIGGER set_project_steps_updated_at
  BEFORE UPDATE ON public.project_steps
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── credit_ledger ─────────────────────────────────────────────────────────────

CREATE TABLE public.credit_ledger (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type        credit_event_type,
  amount      INTEGER,
  template_id UUID REFERENCES public.templates(id),
  project_id  UUID REFERENCES public.projects(id),
  step_id     UUID REFERENCES public.project_steps(id),
  description TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.credit_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own_ledger"
  ON public.credit_ledger FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "admins_manage_ledger"
  ON public.credit_ledger FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.user_roles r
    WHERE r.user_id = auth.uid() AND r.role = 'admin'
  ));

CREATE POLICY "service_insert_ledger"
  ON public.credit_ledger FOR INSERT
  WITH CHECK (true);

-- ── creators ──────────────────────────────────────────────────────────────────

CREATE TABLE public.creators (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   UUID NOT NULL UNIQUE,
  display_name              TEXT NOT NULL,
  stripe_connect_account_id TEXT,
  connect_status            TEXT DEFAULT 'NOT_STARTED'
                              CHECK (connect_status IN (
                                'NOT_STARTED', 'PENDING', 'ACTIVE', 'RESTRICTED'
                              )),
  created_at                TIMESTAMPTZ DEFAULT now(),
  updated_at                TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.creators ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_manage_own_creator"
  ON public.creators FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "admins_manage_all_creators"
  ON public.creators FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.user_roles r
    WHERE r.user_id = auth.uid() AND r.role = 'admin'
  ));

CREATE TRIGGER set_creators_updated_at
  BEFORE UPDATE ON public.creators
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── platform_config ───────────────────────────────────────────────────────────

CREATE TABLE public.platform_config (
  id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_share_percent        NUMERIC(5,2) DEFAULT 70.00,
  creator_share_percent         NUMERIC(5,2) DEFAULT 30.00,
  affiliate_percent_of_platform NUMERIC(5,2) DEFAULT 5.00,
  hold_period_days              INTEGER DEFAULT 7,
  updated_at                    TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.platform_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_manage_platform_config"
  ON public.platform_config FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.user_roles r
    WHERE r.user_id = auth.uid() AND r.role = 'admin'
  ));

CREATE POLICY "authenticated_read_platform_config"
  ON public.platform_config FOR SELECT
  USING (auth.uid() IS NOT NULL);

INSERT INTO public.platform_config
  (platform_share_percent, creator_share_percent, affiliate_percent_of_platform, hold_period_days)
VALUES (70.00, 30.00, 5.00, 7);

CREATE TRIGGER set_platform_config_updated_at
  BEFORE UPDATE ON public.platform_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── usage_charges ─────────────────────────────────────────────────────────────

CREATE TABLE public.usage_charges (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID NOT NULL,
  template_id              UUID REFERENCES public.templates(id),
  project_id               UUID REFERENCES public.projects(id),
  step_id                  UUID REFERENCES public.project_steps(id),
  charge_type              TEXT CHECK (charge_type IN ('RUN_TEMPLATE', 'RERUN_STEP')),
  credits_spent            INTEGER DEFAULT 0,
  usd_cost_basis_cents     INTEGER DEFAULT 0,
  usd_price_cents          INTEGER DEFAULT 0,
  stripe_invoice_id        TEXT,
  stripe_payment_intent_id TEXT,
  created_at               TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.usage_charges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own_charges"
  ON public.usage_charges FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "admins_manage_charges"
  ON public.usage_charges FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.user_roles r
    WHERE r.user_id = auth.uid() AND r.role = 'admin'
  ));

CREATE POLICY "service_insert_charges"
  ON public.usage_charges FOR INSERT
  WITH CHECK (true);

-- ── revenue_allocations ───────────────────────────────────────────────────────

CREATE TABLE public.revenue_allocations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usage_charge_id  UUID NOT NULL REFERENCES public.usage_charges(id),
  beneficiary_type TEXT CHECK (beneficiary_type IN ('PLATFORM', 'CREATOR', 'AFFILIATE')),
  beneficiary_id   UUID,
  amount_cents     INTEGER DEFAULT 0,
  status           TEXT DEFAULT 'PENDING'
                     CHECK (status IN ('PENDING', 'AVAILABLE', 'PAID', 'REVERSED')),
  available_at     TIMESTAMPTZ,
  payout_id        UUID,
  created_at       TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.revenue_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "creators_read_own_allocations"
  ON public.revenue_allocations FOR SELECT
  USING (auth.uid() = beneficiary_id);

CREATE POLICY "admins_manage_allocations"
  ON public.revenue_allocations FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.user_roles r
    WHERE r.user_id = auth.uid() AND r.role = 'admin'
  ));

-- ── payouts ───────────────────────────────────────────────────────────────────

CREATE TABLE public.payouts (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  beneficiary_type   TEXT CHECK (beneficiary_type IN ('CREATOR', 'AFFILIATE')),
  beneficiary_id     UUID NOT NULL,
  amount_cents       INTEGER DEFAULT 0,
  stripe_transfer_id TEXT,
  status             TEXT DEFAULT 'PENDING'
                       CHECK (status IN ('PENDING', 'PAID', 'FAILED')),
  created_at         TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.payouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "beneficiaries_read_own_payouts"
  ON public.payouts FOR SELECT
  USING (auth.uid() = beneficiary_id);

CREATE POLICY "admins_manage_payouts"
  ON public.payouts FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.user_roles r
    WHERE r.user_id = auth.uid() AND r.role = 'admin'
  ));

-- ── refund_events ─────────────────────────────────────────────────────────────

CREATE TABLE public.refund_events (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_charge_id         TEXT,
  stripe_payment_intent_id TEXT,
  stripe_invoice_id        TEXT,
  amount_cents             INTEGER DEFAULT 0,
  reason                   TEXT,
  created_at               TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.refund_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_manage_refunds"
  ON public.refund_events FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.user_roles r
    WHERE r.user_id = auth.uid() AND r.role = 'admin'
  ));

-- ── analytics_events ──────────────────────────────────────────────────────────

CREATE TABLE public.analytics_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID,
  template_id UUID REFERENCES public.templates(id),
  project_id  UUID REFERENCES public.projects(id),
  event_type  TEXT CHECK (event_type IN (
    'PROJECT_CREATED', 'PROJECT_STARTED', 'PROJECT_COMPLETED', 'PROJECT_FAILED',
    'STEP_RERUN', 'CREDITS_DEDUCTED', 'CREDITS_GRANTED',
    'DOWNLOAD', 'SUBSCRIPTION_CREATED', 'SUBSCRIPTION_UPDATED',
    'TOPUP_PURCHASED', 'REFUND_CREATED'
  )),
  metadata    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_analytics_event_type  ON public.analytics_events(event_type);
CREATE INDEX idx_analytics_user_id     ON public.analytics_events(user_id);
CREATE INDEX idx_analytics_template_id ON public.analytics_events(template_id);
CREATE INDEX idx_analytics_created_at  ON public.analytics_events(created_at DESC);

ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own_events"
  ON public.analytics_events FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "admins_manage_events"
  ON public.analytics_events FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.user_roles r
    WHERE r.user_id = auth.uid() AND r.role = 'admin'
  ));

CREATE POLICY "service_insert_events"
  ON public.analytics_events FOR INSERT
  WITH CHECK (true);

-- ── referral_program_config ───────────────────────────────────────────────────

CREATE TABLE public.referral_program_config (
  id                                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enabled                             BOOLEAN DEFAULT true,
  signup_bonus_credits                INTEGER DEFAULT 50,
  referrer_bonus_credits_on_paid      INTEGER DEFAULT 100,
  paid_trigger                        TEXT DEFAULT 'FIRST_SUBSCRIPTION_PAYMENT'
                                        CHECK (paid_trigger IN (
                                          'FIRST_SUBSCRIPTION_PAYMENT',
                                          'FIRST_TOPUP',
                                          'EITHER'
                                        )),
  affiliate_percent_of_platform_share NUMERIC(5,2) DEFAULT 5.00,
  updated_at                          TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.referral_program_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_manage_referral_config"
  ON public.referral_program_config FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.user_roles r
    WHERE r.user_id = auth.uid() AND r.role = 'admin'
  ));

CREATE POLICY "authenticated_read_referral_config"
  ON public.referral_program_config FOR SELECT
  USING (auth.uid() IS NOT NULL);

INSERT INTO public.referral_program_config
  (enabled, signup_bonus_credits, referrer_bonus_credits_on_paid,
   paid_trigger, affiliate_percent_of_platform_share)
VALUES (true, 50, 100, 'FIRST_SUBSCRIPTION_PAYMENT', 5.00);

CREATE TRIGGER set_referral_config_updated_at
  BEFORE UPDATE ON public.referral_program_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── referral_codes ────────────────────────────────────────────────────────────

CREATE TABLE public.referral_codes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code          TEXT NOT NULL UNIQUE,
  owner_user_id UUID NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_referral_codes_owner ON public.referral_codes(owner_user_id);

ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_manage_own_codes"
  ON public.referral_codes FOR ALL
  USING (auth.uid() = owner_user_id);

CREATE POLICY "admins_manage_all_codes"
  ON public.referral_codes FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.user_roles r
    WHERE r.user_id = auth.uid() AND r.role = 'admin'
  ));

-- ── referral_attributions ─────────────────────────────────────────────────────

CREATE TABLE public.referral_attributions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referred_user_id UUID NOT NULL UNIQUE,
  referrer_user_id UUID NOT NULL,
  code_used        TEXT NOT NULL,
  status           TEXT DEFAULT 'ATTRIBUTED'
                     CHECK (status IN ('ATTRIBUTED', 'QUALIFIED', 'REWARDED', 'INVALID')),
  attributed_at    TIMESTAMPTZ DEFAULT now(),
  qualified_at     TIMESTAMPTZ,
  rewarded_at      TIMESTAMPTZ,
  CONSTRAINT no_self_referral CHECK (referred_user_id != referrer_user_id)
);

ALTER TABLE public.referral_attributions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own_attribution"
  ON public.referral_attributions FOR SELECT
  USING (auth.uid() = referred_user_id OR auth.uid() = referrer_user_id);

CREATE POLICY "admins_manage_attributions"
  ON public.referral_attributions FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.user_roles r
    WHERE r.user_id = auth.uid() AND r.role = 'admin'
  ));

-- ── referral_rewards ──────────────────────────────────────────────────────────

CREATE TABLE public.referral_rewards (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_user_id      UUID NOT NULL,
  referred_user_id      UUID NOT NULL,
  reward_type           TEXT CHECK (reward_type IN ('CREDITS', 'REVENUE_SHARE')),
  credits_amount        INTEGER,
  revenue_allocation_id UUID REFERENCES public.revenue_allocations(id),
  created_at            TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.referral_rewards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "referrers_read_own_rewards"
  ON public.referral_rewards FOR SELECT
  USING (auth.uid() = referrer_user_id);

CREATE POLICY "admins_manage_rewards"
  ON public.referral_rewards FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.user_roles r
    WHERE r.user_id = auth.uid() AND r.role = 'admin'
  ));

-- ── Storage buckets ───────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public)
  VALUES ('project-assets', 'project-assets', false)
  ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
  VALUES ('template-inputs', 'template-inputs', false)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY "users_upload_template_inputs"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'template-inputs'
    AND auth.uid()::text = (string_to_array(name, '/'))[1]
  );

CREATE POLICY "users_read_template_inputs"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'template-inputs'
    AND auth.uid()::text = (string_to_array(name, '/'))[1]
  );

CREATE POLICY "users_delete_template_inputs"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'template-inputs'
    AND auth.uid()::text = (string_to_array(name, '/'))[1]
  );

CREATE POLICY "service_upload_project_assets"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'project-assets');

CREATE POLICY "users_read_project_assets"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'project-assets'
    AND auth.uid()::text = (string_to_array(name, '/'))[1]
  );

CREATE POLICY "users_delete_project_assets"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'project-assets'
    AND auth.uid()::text = (string_to_array(name, '/'))[1]
  );

-- ── RPC: decrement_credits ────────────────────────────────────────────────────
-- Called by Cloudflare Worker to atomically decrement a user's credit balance.

CREATE OR REPLACE FUNCTION public.decrement_credits(p_user_id UUID, p_amount INTEGER)
RETURNS void AS $$
BEGIN
  UPDATE public.profiles
  SET credits_balance = GREATEST(0, credits_balance - p_amount)
  WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
