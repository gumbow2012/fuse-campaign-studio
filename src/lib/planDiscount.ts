/**
 * SHARED DISCOUNT CALCULATOR — the single source of every crossed-out price,
 * "% OFF" badge and "Save $X" line in the pricing UI.
 *
 * Prices come exclusively from PLAN_LADDER (the same definitions checkout uses).
 * Nothing here is hardcoded, and no percentage is ever typed by hand.
 *
 * Only MONTHLY and ANNUAL exist. Monthly is the undiscounted reference, so it
 * never produces a discount. Annual has no Stripe price yet — the savings are
 * real (derived from annualPrice) but the CTA must stay on the gated flow.
 */

import { planPrice, type PlanLadderEntry } from "@/lib/planLadder";

export type BillingPeriod = "monthly" | "annual";

export const PERIOD_MONTHS: Record<BillingPeriod, number> = {
  monthly: 1,
  annual: 12,
};

export type PlanDiscount = {
  period: BillingPeriod;
  months: number;
  /** Monthly list price (the undiscounted reference). */
  monthlyPrice: number;
  /** What the period would cost at the monthly rate. */
  normalPeriodCost: number;
  /** What the period actually costs on this plan. */
  actualPeriodPrice: number;
  /** normalPeriodCost - actualPeriodPrice (never negative). */
  savings: number;
  /** Whole-number percent off, computed from the money above. */
  percentOff: number;
  /** actualPeriodPrice / months. */
  equivalentMonthly: number;
  /** True only when the math is real (savings > 0 and at least 1% off). */
  hasDiscount: boolean;
};

/** Money rounding — cents, half-up, no floating-point drift. */
export function roundMoney(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** "$25" / "$23.50" — trims pointless cents. */
export function formatMoney(value: number) {
  const amount = roundMoney(value);
  const hasCents = Math.abs(amount % 1) > 0.001;
  return `$${amount.toLocaleString(undefined, {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: hasCents ? 2 : 0,
  })}`;
}

export function computePlanDiscount(entry: PlanLadderEntry, period: BillingPeriod): PlanDiscount {
  const months = PERIOD_MONTHS[period] ?? 1;
  const monthlyPrice = roundMoney(planPrice(entry, "monthly"));
  const equivalentMonthlyListed = roundMoney(planPrice(entry, period));

  const normalPeriodCost = roundMoney(monthlyPrice * months);
  const actualPeriodPrice = roundMoney(equivalentMonthlyListed * months);
  const savings = roundMoney(Math.max(0, normalPeriodCost - actualPeriodPrice));
  const percentOff = normalPeriodCost > 0 ? Math.round((savings / normalPeriodCost) * 100) : 0;
  const equivalentMonthly = months > 0 ? roundMoney(actualPeriodPrice / months) : actualPeriodPrice;

  return {
    period,
    months,
    monthlyPrice,
    normalPeriodCost,
    actualPeriodPrice,
    savings,
    percentOff,
    equivalentMonthly,
    hasDiscount: savings > 0 && percentOff >= 1,
  };
}

/** "Save $120/year" — only ever rendered when hasDiscount is true. */
export function savingsLabel(discount: PlanDiscount) {
  if (!discount.hasDiscount) return null;
  return discount.period === "annual"
    ? `Save ${formatMoney(discount.savings)}/year`
    : `Save ${formatMoney(discount.savings)} compared to monthly`;
}
