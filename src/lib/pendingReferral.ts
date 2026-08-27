/**
 * Pending referral code capture.
 *
 * A referral code arrives on a public link (/join/:code, /r/:code, /auth?ref=CODE)
 * long before the user has a session. We persist it in localStorage so it survives
 * the email OTP round-trip, the Google OAuth redirect, and any reload/navigation.
 */

export const PENDING_REFERRAL_KEY = "fuse.pendingReferralCode";
const HANDLED_KEY = "fuse.pendingReferralHandled";

export function normalizeReferralCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const code = raw.trim().toUpperCase();
  if (!code || code.length > 64) return null;
  return code;
}

export function storePendingReferralCode(raw: string | null | undefined): string | null {
  const code = normalizeReferralCode(raw);
  if (!code || typeof window === "undefined") return null;
  try {
    // A newly captured code always gets a fresh chance to apply.
    if (window.localStorage.getItem(HANDLED_KEY) === code) return code;
    window.localStorage.setItem(PENDING_REFERRAL_KEY, code);
    window.localStorage.removeItem(HANDLED_KEY);
  } catch {
    return code;
  }
  return code;
}

export function readPendingReferralCode(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return normalizeReferralCode(window.localStorage.getItem(PENDING_REFERRAL_KEY));
  } catch {
    return null;
  }
}

/** Clear the pending code and remember it as handled so it never retries on login. */
export function clearPendingReferralCode(code?: string | null) {
  if (typeof window === "undefined") return;
  try {
    const handled = normalizeReferralCode(code) ?? readPendingReferralCode();
    window.localStorage.removeItem(PENDING_REFERRAL_KEY);
    if (handled) window.localStorage.setItem(HANDLED_KEY, handled);
  } catch {
    /* storage unavailable — nothing to clear */
  }
}
