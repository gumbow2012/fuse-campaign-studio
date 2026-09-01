/**
 * Credit top-up quick amounts (display data only).
 *
 * Every amount below is purchasable — there are no gated / early-access sizes.
 * Prices come from the shared authoritative pricing module; the client never
 * sends a price to checkout, only the credits integer.
 */

import { STRIPE_TIERS } from "@/lib/stripe-config";
import { quoteCreditTopUp } from "@/lib/creditPricing";

/** Quick-pick chips shown in the top-up module. */
export const QUICK_TOP_UP_AMOUNTS = [200, 500, 1000, 1500, 2000, 4000, 6000, 10000, 20000] as const;

export const DEFAULT_TOP_UP_AMOUNT = 1500;

/** "500" / "1K" / "1.5K" / "20K" */
export function topUpChipLabel(credits: number) {
  if (credits < 1000) return String(credits);
  const thousands = credits / 1000;
  return `${Number.isInteger(thousands) ? thousands : thousands.toFixed(1)}K`;
}

export function costPer1kCredits(price: number, credits: number) {
  return (price / credits) * 1000;
}

/** Cheapest subscription cost per 1,000 credits — used for the honest "plans are cheaper" note. */
export const BEST_PLAN_COST_PER_1K = Math.min(
  ...Object.values(STRIPE_TIERS).map((tier) => costPer1kCredits(tier.price, tier.monthlyCredits)),
);

/** Lowest real top-up cost per 1,000 across the quick amounts — computed, never a label. */
export const BEST_TOP_UP_COST_PER_1K = Math.min(
  ...QUICK_TOP_UP_AMOUNTS.map((credits) => quoteCreditTopUp(credits).costPer1000),
);
