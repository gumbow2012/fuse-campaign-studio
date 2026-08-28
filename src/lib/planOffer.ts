/**
 * CANONICAL PLAN OFFER — the single pricing object every pricing surface reads.
 *
 * Prices/credits come exclusively from PLAN_LADDER (the same definitions checkout
 * uses). NOTHING here invents a number.
 *
 * There is currently NO active Stripe promotion, so `activePromotion` is null on
 * every caller: `discountedAmount === regularAmount`, `percentOff === 0`,
 * `savingsPerCycle === 0`, `promoDuration === null`. The UI must therefore render
 * no crossed-out price, no "% OFF" badge, no "Save $X" and no countdown.
 *
 * When a real Stripe promotion exists later, passing it in here makes the
 * discounted treatment appear automatically with zero card rebuild.
 */

import { PLAN_LADDER, planPrice, type PlanLadderEntry } from "@/lib/planLadder";

export type BillingPeriod = "monthly" | "annual";

export const PERIOD_MONTHS: Record<BillingPeriod, number> = {
  monthly: 1,
  annual: 12,
};

/**
 * Shape of a REAL Stripe promotion (coupon) once one exists.
 * Only one of percentOff / amountOffPerCycle should be set.
 */
export type ActivePromotion = {
  /** Stripe coupon/promotion code id — never displayed as a price. */
  id?: string;
  percentOff?: number | null;
  /** Flat amount off, in USD, per billing cycle. */
  amountOffPerCycle?: number | null;
  /** e.g. "first 3 months" / "forever". Displayed only when a promo is active. */
  duration?: string | null;
  /** Restrict the promo to specific plan keys. Empty/undefined = all plans. */
  appliesToPlanKeys?: string[] | null;
};

export type PlanOffer = {
  planKey: string;
  billingPeriod: BillingPeriod;
  /** Months covered by one billing cycle. */
  cycleMonths: number;
  /** List price for one billing cycle, before any promotion. */
  regularAmount: number;
  /** Actual charge for one billing cycle. Equals regularAmount with no promo. */
  discountedAmount: number;
  /** Whole percent off — 0 when there is no promotion. */
  percentOff: number;
  /** regularAmount - discountedAmount, never negative. 0 with no promo. */
  savingsPerCycle: number;
  /** e.g. "first 3 months" — null when there is no promotion. */
  promoDuration: string | null;
  /** discountedAmount / cycleMonths — the "/month" figure on the card. */
  effectiveMonthly: number;
  /** Monthly credits (fuel). Null when the plan uses a shared pool (Team). */
  monthlyCredits: number | null;
  /** True ONLY when a real promotion produced real savings. */
  hasDiscount: boolean;
  /** True when this plan+period can actually be purchased via Stripe today. */
  purchasable: boolean;
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

function resolveEntry(plan: PlanLadderEntry | string): PlanLadderEntry | null {
  if (typeof plan !== "string") return plan;
  return PLAN_LADDER.find((entry) => entry.key === plan) ?? null;
}

/**
 * THE pricing source for every card, modal and comparison row.
 * `activePromotion` is null today — see the file header.
 */
export function getPlanOffer(
  plan: PlanLadderEntry | string,
  billingPeriod: BillingPeriod = "monthly",
  activePromotion: ActivePromotion | null = null,
): PlanOffer {
  const entry = resolveEntry(plan);
  const cycleMonths = PERIOD_MONTHS[billingPeriod] ?? 1;

  if (!entry) {
    return {
      planKey: typeof plan === "string" ? plan : "unknown",
      billingPeriod,
      cycleMonths,
      regularAmount: 0,
      discountedAmount: 0,
      percentOff: 0,
      savingsPerCycle: 0,
      promoDuration: null,
      effectiveMonthly: 0,
      monthlyCredits: null,
      hasDiscount: false,
      purchasable: false,
    };
  }

  // Monthly is the only real, purchasable interval today. The designed annual
  // rate is NOT a Stripe price, so it never becomes a discount claim.
  const monthlyRate = roundMoney(planPrice(entry, "monthly"));
  const regularAmount = roundMoney(monthlyRate * cycleMonths);

  const applies =
    !!activePromotion &&
    (!activePromotion.appliesToPlanKeys?.length ||
      activePromotion.appliesToPlanKeys.includes(entry.key)) &&
    regularAmount > 0;

  let discountedAmount = regularAmount;
  if (applies && activePromotion) {
    if (activePromotion.percentOff && activePromotion.percentOff > 0) {
      discountedAmount = roundMoney(regularAmount * (1 - activePromotion.percentOff / 100));
    } else if (activePromotion.amountOffPerCycle && activePromotion.amountOffPerCycle > 0) {
      discountedAmount = roundMoney(Math.max(0, regularAmount - activePromotion.amountOffPerCycle));
    }
  }

  const savingsPerCycle = roundMoney(Math.max(0, regularAmount - discountedAmount));
  const percentOff =
    regularAmount > 0 && savingsPerCycle > 0
      ? Math.round((savingsPerCycle / regularAmount) * 100)
      : 0;
  const hasDiscount = savingsPerCycle > 0 && percentOff >= 1;

  return {
    planKey: entry.key,
    billingPeriod,
    cycleMonths,
    regularAmount,
    discountedAmount,
    percentOff,
    savingsPerCycle,
    promoDuration: hasDiscount ? (activePromotion?.duration ?? null) : null,
    effectiveMonthly: cycleMonths > 0 ? roundMoney(discountedAmount / cycleMonths) : discountedAmount,
    monthlyCredits: entry.monthlyCredits,
    hasDiscount,
    purchasable: entry.checkout === "live" && billingPeriod === "monthly",
  };
}
