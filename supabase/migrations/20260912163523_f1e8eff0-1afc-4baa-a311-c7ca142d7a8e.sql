CREATE TABLE public.creator_connect_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  livemode boolean NOT NULL DEFAULT false,
  stripe_account_id text NOT NULL UNIQUE,
  account_type text NOT NULL DEFAULT 'recipient',
  country text,
  default_currency text,
  onboarding_status text NOT NULL DEFAULT 'not_started',
  charges_enabled boolean NOT NULL DEFAULT false,
  payouts_enabled boolean NOT NULL DEFAULT false,
  details_submitted boolean NOT NULL DEFAULT false,
  disabled_reason text,
  requirements jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, livemode)
);

CREATE TABLE public.creator_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  livemode boolean NOT NULL DEFAULT false,
  currency text NOT NULL DEFAULT 'usd',
  amount_cents integer NOT NULL DEFAULT 0,
  earning_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  idempotency_key text UNIQUE,
  period_start timestamptz,
  period_end timestamptz,
  stripe_transfer_id text,
  transfer_created_at timestamptz,
  stripe_payout_id text,
  paid_at timestamptz,
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.creator_earnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_id uuid,
  template_id uuid,
  campaign_run_id uuid UNIQUE,
  base_run_credits integer NOT NULL DEFAULT 0,
  marketplace_surcharge_credits integer NOT NULL DEFAULT 0,
  total_customer_credits integer NOT NULL DEFAULT 0,
  creator_share_bps integer NOT NULL DEFAULT 0,
  fuse_share_bps integer NOT NULL DEFAULT 0,
  creator_royalty_target_cents integer NOT NULL DEFAULT 0,
  creator_earning_cents integer NOT NULL DEFAULT 0,
  fuse_marketplace_revenue_cents integer NOT NULL DEFAULT 0,
  economics_version text,
  status text NOT NULL DEFAULT 'pending',
  available_at timestamptz NOT NULL DEFAULT now(),
  payout_id uuid REFERENCES public.creator_payouts(id) ON DELETE SET NULL,
  paid_at timestamptz,
  reversed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_creator_earnings_creator ON public.creator_earnings (creator_id, status, available_at);
CREATE INDEX idx_creator_earnings_payout ON public.creator_earnings (payout_id);
CREATE INDEX idx_creator_payouts_creator ON public.creator_payouts (creator_id, created_at DESC);

GRANT SELECT ON public.creator_connect_accounts TO authenticated;
GRANT ALL ON public.creator_connect_accounts TO service_role;
GRANT SELECT ON public.creator_earnings TO authenticated;
GRANT ALL ON public.creator_earnings TO service_role;
GRANT SELECT ON public.creator_payouts TO authenticated;
GRANT ALL ON public.creator_payouts TO service_role;

ALTER TABLE public.creator_connect_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_earnings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_payouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Creators view own connect account" ON public.creator_connect_accounts
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Creators view own earnings" ON public.creator_earnings
  FOR SELECT TO authenticated USING (creator_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Creators view own payouts" ON public.creator_payouts
  FOR SELECT TO authenticated USING (creator_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_creator_connect_accounts_updated_at BEFORE UPDATE ON public.creator_connect_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_creator_earnings_updated_at BEFORE UPDATE ON public.creator_earnings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_creator_payouts_updated_at BEFORE UPDATE ON public.creator_payouts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();