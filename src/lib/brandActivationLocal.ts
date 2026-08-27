/**
 * Nudge CADENCE state for users who have no brand row yet.
 *
 * This is not critical data — it only decides whether we show the welcome modal
 * again. Once a brand row exists, cadence lives on brand.metadata.activation.
 */
import type { BrandActivationState } from "@/lib/brandActivation";

const key = (userId: string) => `fuse_brand_activation_${userId}`;
const SESSION_SHOWN_KEY = "fuse_brand_welcome_shown";

export function readLocalActivationState(userId: string | null | undefined): BrandActivationState {
  if (!userId) return {};
  try {
    const raw = window.localStorage.getItem(key(userId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as BrandActivationState;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function writeLocalActivationState(
  userId: string | null | undefined,
  change: Partial<BrandActivationState>,
): void {
  if (!userId) return;
  try {
    const next = { ...readLocalActivationState(userId), ...change };
    window.localStorage.setItem(key(userId), JSON.stringify(next));
  } catch {
    /* cadence state is best-effort */
  }
}

/** Once-per-session guard for the welcome modal. */
export function welcomeShownThisSession(): boolean {
  try {
    return window.sessionStorage.getItem(SESSION_SHOWN_KEY) === "1";
  } catch {
    return false;
  }
}

export function markWelcomeShownThisSession(): void {
  try {
    window.sessionStorage.setItem(SESSION_SHOWN_KEY, "1");
  } catch {
    /* ignore */
  }
}
