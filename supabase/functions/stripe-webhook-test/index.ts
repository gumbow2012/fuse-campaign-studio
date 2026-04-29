import { createStripeWebhookHandler } from "../_shared/stripe-billing.ts";

Deno.serve(createStripeWebhookHandler("test"));
