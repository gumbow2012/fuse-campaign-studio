-- Grant subscription credits for the successful invoice event Stripe actually sends,
-- and make invoice grants idempotent across multiple event names for the same invoice.

CREATE UNIQUE INDEX IF NOT EXISTS subscription_period_grants_stripe_invoice_id_key
  ON public.subscription_period_grants (stripe_invoice_id)
  WHERE stripe_invoice_id IS NOT NULL;

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
  ON CONFLICT DO NOTHING
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
