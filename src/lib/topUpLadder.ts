/**
 * Buy-Credits top-up ladder (display data only).
 *
 * `checkout: "live"` sizes map 1:1 to an EXISTING Stripe credit pack price and use the
 * existing credit-pack checkout handler unchanged (`startCreditCheckout(packKey)`).
 *
 * `checkout: "gated"` sizes have NO Stripe product yet. They must NEVER call checkout and
 * must never be silently mapped to another pack — they use the graceful early-access action.
 *
 * STRIPE PRODUCTS STILL TO BE CREATED (not done here, intentionally):
 *   - $45  → 1,000 credits
 *   - $80  → 2,000 credits
 *   - $325 → 10,000 credits
 */

import { CREDIT_PACKS, STRIPE_TIERS, type CreditPackKey } from "@/lib/stripe-config";

export type TopUpStop =
  | { credits: number; price: number; checkout: "live"; packKey: CreditPackKey }
  | { credits: number; price: number; checkout: "gated"; packKey?: undefined };

export const TOP_UP_LADDER: TopUpStop[] = [
  { credits: 500, price: CREDIT_PACKS.boost.price, checkout: "live", packKey: "boost" },
  { credits: 1000, price: 45, checkout: "gated" },
  { credits: 1500, price: CREDIT_PACKS.growth.price, checkout: "live", packKey: "growth" },
  { credits: 2000, price: 80, checkout: "gated" },
  { credits: 4000, price: CREDIT_PACKS.bulk.price, checkout: "live", packKey: "bulk" },
  { credits: 10000, price: 325, checkout: "gated" },
];

export const TOP_UP_STOPS = TOP_UP_LADDER.map((stop) => stop.credits);

export function costPer1kCredits(price: number, credits: number) {
  return (price / credits) * 1000;
}

export function findTopUpStop(credits: number) {
  return TOP_UP_LADDER.find((stop) => stop.credits === credits) ?? null;
}

/** Lowest real cost per 1,000 across the whole ladder — computed, never a marketing label. */
export const BEST_VALUE_STOP = TOP_UP_LADDER.reduce((best, stop) =>
  costPer1kCredits(stop.price, stop.credits) < costPer1kCredits(best.price, best.credits) ? stop : best,
);

/** Cheapest subscription cost per 1,000 credits — used for the honest "plans are cheaper" note. */
export const BEST_PLAN_COST_PER_1K = Math.min(
  ...Object.values(STRIPE_TIERS).map((tier) => costPer1kCredits(tier.price, tier.monthlyCredits)),
);
