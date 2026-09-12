ALTER TABLE public.creator_payout_policy
  ADD COLUMN IF NOT EXISTS auto_payouts_enabled boolean NOT NULL DEFAULT false;