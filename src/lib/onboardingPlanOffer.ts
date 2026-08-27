/**
 * CONVERSION PASS — P3: post-auth plan-offer state.
 *
 * The durable eligibility truth is server-derived (free plan + no
 * welcome_credit_grants row + no active paid subscription). These local flags
 * only stop an X-dismiss from reopening the modal on every render/session and
 * remember which option the user picked.
 */
const SEEN_KEY = "fuse.onboardingPlanOfferSeen.";
const CHOICE_KEY = "fuse.onboardingPlanChoice.";

export type OnboardingPlanChoice = "free" | "starter" | "capsule";

function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* storage unavailable — the server-side gate still applies */
  }
}

export function planOfferSeen(userId: string): boolean {
  return safeGet(`${SEEN_KEY}${userId}`) === "1";
}

export function markPlanOfferSeen(userId: string) {
  safeSet(`${SEEN_KEY}${userId}`, "1");
}

export function readPlanChoice(userId: string): OnboardingPlanChoice | null {
  const value = safeGet(`${CHOICE_KEY}${userId}`);
  return value === "free" || value === "starter" || value === "capsule" ? value : null;
}

export function writePlanChoice(userId: string, choice: OnboardingPlanChoice) {
  safeSet(`${CHOICE_KEY}${userId}`, choice);
}

/** Paid subscription states that must never see an upgrade offer. */
export function hasActivePaidSubscription(plan: string | null, status: string | null): boolean {
  const normalizedPlan = (plan ?? "free").toLowerCase();
  const normalizedStatus = (status ?? "").toLowerCase();
  if (normalizedPlan !== "free" && normalizedPlan !== "") return true;
  return normalizedStatus === "active" || normalizedStatus === "trialing" || normalizedStatus === "past_due";
}
