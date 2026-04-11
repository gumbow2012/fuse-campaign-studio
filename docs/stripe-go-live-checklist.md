# Stripe Go-Live Checklist

This project already contains the core Stripe subscription flow:

- Checkout session function: `create-checkout`
- Billing portal function: `customer-portal`
- Webhook function: `stripe-webhook`
- Subscription status check: `check-subscription`
- Membership state: `public.profiles`
- Billing event log: `public.billing_events`
- Monthly credit grants: `public.subscription_period_grants`
- Credit usage ledger: `public.credit_ledger`

## Current webhook URL

Use this Stripe webhook endpoint:

`https://ykrrwgkxgidoavtzcumk.supabase.co/functions/v1/stripe-webhook`

## Supabase secrets required

Set these project secrets in Supabase before testing live billing:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

## Stripe dashboard configuration required

1. Create or confirm the three recurring prices used by the app.
2. Confirm the product and price IDs match both files below:
   - `src/lib/stripe-config.ts`
   - `supabase/functions/_shared/stripe-plans.ts`
3. Enable the Stripe Customer Portal.
4. Add the webhook endpoint above.
5. Subscribe the webhook to these events:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.paid`
   - `invoice.payment_failed`

## Current price mapping in code

- Starter
  - Product: `prod_U3o88Rn0fn4P2w`
  - Price: `price_1T5gW5AWgNdlZ1x0Qkr6636B`
  - Monthly credits: `500`
- Pro
  - Product: `prod_U3o9Beo3BdMnId`
  - Price: `price_1T5gXSAWgNdlZ1x0ME7M4q3N`
  - Monthly credits: `2000`
- Studio
  - Product: `prod_U3oAl1dM2orh9D`
  - Price: `price_1T5gXmAWgNdlZ1x05tVYQLqb`
  - Monthly credits: `6000`

## Expected billing data flow

1. Authenticated user opens billing page.
2. Frontend calls `create-checkout` with a Stripe `priceId`.
3. Stripe creates the subscription checkout session.
4. Stripe sends lifecycle events to `stripe-webhook`.
5. Webhook updates `public.profiles` with:
   - `stripe_customer_id`
   - `stripe_subscription_id`
   - `stripe_price_id`
   - `plan`
   - `subscription_status`
   - billing period timestamps
6. `invoice.paid` calls `grant_subscription_credits(...)`.
7. Credits are written into:
   - `public.subscription_period_grants`
   - `public.credit_ledger`
8. Template execution checks subscription state and credits before allowing runs.

## Blocking issue outside Stripe

The Supabase project is currently restricted with:

- `exceed_cached_egress_quota`
- `exceed_storage_size_quota`

Until that restriction is removed, live edge function calls can still fail with `402` even if Stripe itself is configured correctly.
