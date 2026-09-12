CREATE TABLE IF NOT EXISTS public.service_config (
  key text PRIMARY KEY,
  value text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_config TO authenticated;
GRANT ALL ON public.service_config TO service_role;

ALTER TABLE public.service_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage service config"
ON public.service_config FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_service_config_updated_at
BEFORE UPDATE ON public.service_config
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.creator_payout_policy (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  min_payout_cents integer NOT NULL DEFAULT 2500,
  currency text NOT NULL DEFAULT 'usd',
  auto_payouts_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.creator_payout_policy TO authenticated;
GRANT ALL ON public.creator_payout_policy TO service_role;

ALTER TABLE public.creator_payout_policy ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage payout policy"
ON public.creator_payout_policy FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_creator_payout_policy_updated_at
BEFORE UPDATE ON public.creator_payout_policy
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.creator_payout_policy (id) VALUES (true) ON CONFLICT (id) DO NOTHING;