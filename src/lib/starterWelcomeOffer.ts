/**
 * STARTER welcome offer — 20% off the first month for first-time subscribers.
 *
 * Display-only helpers. The actual discount is attached server-side to the
 * Stripe Checkout Session (see the Starter welcome coupon in stripe-billing).
 * No prices, credit grants or plan definitions are changed here.
 */

export const STARTER_WELCOME_DISCOUNT_RATE = 0.2;

export const STARTER_WELCOME_BADGE = "20% OFF FIRST MONTH — NEW CUSTOMERS";

type MembershipLike = {
  plan?: string | null;
  subscriptionStatus?: string | null;
} | null | undefined;

const PRIOR_PAID_STATUSES = new Set([
  "active",
  "trialing",
  "past_due",
  "unpaid",
  "canceled",
  "paused",
  "incomplete",
  "incomplete_expired",
]);

/**
 * Guests and signed-in users with no paid membership history are eligible.
 * Anyone on a paid plan (or with a prior subscription status) is not.
 */
export function isStarterWelcomeOfferEligible(membership: MembershipLike): boolean {
  if (!membership) return true;
  const plan = (membership.plan ?? "").trim().toLowerCase();
  if (plan && plan !== "free") return false;
  const status = (membership.subscriptionStatus ?? "").trim().toLowerCase();
  if (status && PRIOR_PAID_STATUSES.has(status)) return false;
  return true;
}

/** 20%-off price for display next to the struck-through original. */
export function starterWelcomePrice(price: number): number {
  return Math.round(price * (1 - STARTER_WELCOME_DISCOUNT_RATE) * 100) / 100;
}
