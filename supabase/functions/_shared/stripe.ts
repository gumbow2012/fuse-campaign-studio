import Stripe from "https://esm.sh/stripe@18.5.0";

export const STRIPE_API_VERSION = "2026-02-25.clover";

export function createStripeClient(apiKey: string) {
  return new Stripe(apiKey, {
    apiVersion: STRIPE_API_VERSION,
  });
}
