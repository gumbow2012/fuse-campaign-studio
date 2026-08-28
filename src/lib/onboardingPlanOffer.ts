/**
 * ONBOARDING PLAN OFFER — post-auth onboarding state (never part of auth).
 *
 * The decision is server-owned: `profiles.onboarding_plan_offer`
 * (unseen | shown | free | starter | capsule | dismissed), decided ONCE.
 * We no longer infer "new user" from plan=free / 0 credits / localStorage —
 * those also describe perfectly valid existing free users.
 */
import { supabase } from "@/integrations/supabase/client";

export type OnboardingPlanOfferState =
  | "unseen"
  | "shown"
  | "free"
  | "starter"
  | "capsule"
  | "dismissed";

export type OnboardingPlanChoice = "free" | "starter" | "capsule";

const STATES: OnboardingPlanOfferState[] = [
  "unseen",
  "shown",
  "free",
  "starter",
  "capsule",
  "dismissed",
];

export function normalizeOfferState(raw: unknown): OnboardingPlanOfferState {
  const value = typeof raw === "string" ? (raw.toLowerCase() as OnboardingPlanOfferState) : "unseen";
  return STATES.includes(value) ? value : "unseen";
}

/** Only an explicitly undecided account sees the onboarding offer. */
export function offerDecisionPending(state: OnboardingPlanOfferState): boolean {
  return state === "unseen" || state === "shown";
}

/** Persist the decision server-side. Failure is non-fatal (never blocks the app). */
export async function persistOfferState(state: OnboardingPlanOfferState): Promise<void> {
  try {
    await supabase.rpc("set_onboarding_plan_offer" as never, { _state: state } as never);
  } catch {
    /* best-effort — the modal still closes and the user continues */
  }
}

/** Paid subscription states that must never see an upgrade offer. */
export function hasActivePaidSubscription(plan: string | null, status: string | null): boolean {
  const normalizedPlan = (plan ?? "free").toLowerCase();
  const normalizedStatus = (status ?? "").toLowerCase();
  if (normalizedPlan !== "free" && normalizedPlan !== "") return true;
  return normalizedStatus === "active" || normalizedStatus === "trialing" || normalizedStatus === "past_due";
}
