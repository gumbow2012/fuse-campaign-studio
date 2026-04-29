# Stripe Test Mode Runbook

## Current state

The recurring billing smoke harness exists, but Stripe test clocks only work when the Supabase project is configured with a Stripe test-mode secret key. The current deployed project is using a live-mode key, so test clocks fail before any subscription is created.

## Required secrets in the current Supabase project

Set these in the same Supabase project that serves production traffic:

- `STRIPE_SECRET_KEY_LIVE`
- `STRIPE_WEBHOOK_SECRET_LIVE`
- `STRIPE_PORTAL_CONFIGURATION_ID_LIVE` optional
- `STRIPE_STARTER_PRICE_ID_LIVE` optional if you keep the current fallback live IDs
- `STRIPE_PRO_PRICE_ID_LIVE` optional if you keep the current fallback live IDs
- `STRIPE_STUDIO_PRICE_ID_LIVE` optional if you keep the current fallback live IDs
- `STRIPE_STARTER_PRODUCT_ID_LIVE` optional if you keep the current fallback live IDs
- `STRIPE_PRO_PRODUCT_ID_LIVE` optional if you keep the current fallback live IDs
- `STRIPE_STUDIO_PRODUCT_ID_LIVE` optional if you keep the current fallback live IDs
- `STRIPE_SECRET_KEY_TEST`
- `STRIPE_WEBHOOK_SECRET_TEST`
- `STRIPE_PORTAL_CONFIGURATION_ID_TEST` optional
- `STRIPE_STARTER_PRICE_ID_TEST`
- `STRIPE_PRO_PRICE_ID_TEST`
- `STRIPE_STUDIO_PRICE_ID_TEST`
- `STRIPE_STARTER_PRODUCT_ID_TEST`
- `STRIPE_PRO_PRODUCT_ID_TEST`
- `STRIPE_STUDIO_PRODUCT_ID_TEST`
- `BILLING_SMOKE_SECRET`

## Why the app changed

The client no longer sends raw Stripe price IDs. Checkout now sends a `planKey`, and the edge function resolves the actual Stripe price ID from environment-backed plan config. Live and test now resolve independently, so one Supabase project can serve live users and still run Stripe test clocks against internal test users in the same database.

## Endpoints

Configure Stripe to deliver events to separate endpoints:

- Live: `https://ykrrwgkxgidoavtzcumk.supabase.co/functions/v1/stripe-webhook-live`
- Test: `https://ykrrwgkxgidoavtzcumk.supabase.co/functions/v1/stripe-webhook-test`

Legacy compatibility remains on `stripe-webhook`, which maps to live mode.

## Smoke test flow

Run the recurring billing smoke after test-mode Stripe secrets and test price/product IDs are present:

`BILLING_SMOKE_SECRET=... npm run billing:recurring-smoke`

The smoke verifies:

- initial subscription charge
- `invoice.paid` webhook delivery
- profile activation
- subscription credit grant row creation
- credit ledger row creation
- renewal via Stripe test clock advance
- failed renewal via failing payment method
- optional subscription cancellation

## Expected outcome

A passing run returns a JSON report with the Stripe test clock ID, customer ID, subscription ID, and snapshots for initial charge, renewal, failure, and cancellation.
