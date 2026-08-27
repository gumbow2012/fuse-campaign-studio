ALTER TABLE public.referral_rewards
  ADD COLUMN IF NOT EXISTS attribution_id uuid REFERENCES public.referral_attributions(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS stripe_event_id text;

ALTER TABLE public.referral_rewards DROP CONSTRAINT IF EXISTS valid_reward_type;
ALTER TABLE public.referral_rewards
  ADD CONSTRAINT valid_reward_type CHECK (reward_type = ANY (ARRAY['CREDITS'::text, 'REVENUE_SHARE'::text, 'referrer_qualified'::text]));

CREATE UNIQUE INDEX IF NOT EXISTS referral_rewards_attribution_reward_type_key
  ON public.referral_rewards (attribution_id, reward_type)
  WHERE attribution_id IS NOT NULL;

GRANT SELECT ON public.referral_rewards TO authenticated;
GRANT ALL ON public.referral_rewards TO service_role;