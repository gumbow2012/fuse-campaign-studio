/**
 * ONE OFFER — the single site-wide promotion and the campaign-first plan
 * language used by the public CRO surfaces.
 *
 * Presentation only: nothing here changes prices, price IDs, credits or
 * checkout behaviour.
 */

/** The only offer that runs anywhere on the site. */
export const OFFER_LINE = "20% off your first month";

/** Campaign-page subline. */
export const CAMPAIGN_OFFER_SUBLINE = "Included in Starter — 20% off your first month.";

/** Shown under every plan card so credits stay an implementation detail. */
export const CREDITS_BEHIND_THE_SCENES =
  "Each campaign uses credits behind the scenes. Regenerations also use credits, so you stay in control.";

/** Free-sample block. Never rendered in the same viewport as a paid offer. */
export const FREE_SAMPLE = {
  title: "Try FUSE free",
  body: "Upload one product photo. Get one sample video. No card required.",
} as const;

/** Approximate campaigns per month, by plan key. */
const CAMPAIGNS_PER_MONTH: Record<string, number> = {
  starter: 3,
  pro: 19,
  studio: 58,
};

/** Approximate campaigns per month for a plan key, or null when unknown. */
export function campaignsPerMonth(plan: string | null | undefined): number | null {
  if (!plan) return null;
  return CAMPAIGNS_PER_MONTH[plan.trim().toLowerCase()] ?? null;
}

/** "About 3 campaigns/month", or null when the plan has no published figure. */
export function campaignCapacityLine(plan: string | null | undefined): string | null {
  const count = campaignsPerMonth(plan);
  return count == null ? null : `About ${count} campaigns/month`;
}
