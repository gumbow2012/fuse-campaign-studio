/**
 * Single source of truth for "is this account on a paid plan?".
 * Presentation/gating only — never used for credit math or billing.
 */
export const PAID_PLANS = ["starter", "pro", "studio"] as const;

export function isPaidPlan(plan: string | null | undefined): boolean {
  if (!plan) return false;
  return (PAID_PLANS as readonly string[]).includes(plan.trim().toLowerCase());
}
