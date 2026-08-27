/**
 * PENDING AUTH INTENT
 *
 * One sanitized record of "where the user was going and why" that must survive
 * an OAuth round-trip (Google / Apple / Microsoft) and the email OTP step.
 *
 * Referral codes stay mirrored into the existing `fuse.pendingReferralCode`
 * storage so usePendingReferral() keeps working unchanged.
 */
import { normalizeReferralCode, readPendingReferralCode, storePendingReferralCode } from "@/lib/pendingReferral";

export const PENDING_AUTH_INTENT_KEY = "fuse.pendingAuthIntent";

export type PendingAuthIntent = {
  returnTo?: string;
  templateId?: string;
  referralCode?: string;
};

/** Internal paths only — never allow an attacker-supplied open redirect. */
export function sanitizeReturnTo(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const value = raw.trim();
  if (!value.startsWith("/")) return undefined;
  // Block protocol-relative ("//evil.com") and backslash tricks.
  if (value.startsWith("//") || value.startsWith("/\\")) return undefined;
  if (value.length > 512) return undefined;
  return value;
}

function sanitizeTemplateId(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const value = raw.trim();
  if (!value || value.length > 128) return undefined;
  return /^[a-zA-Z0-9._:-]+$/.test(value) ? value : undefined;
}

export function readPendingAuthIntent(): PendingAuthIntent {
  if (typeof window === "undefined") return {};
  let parsed: PendingAuthIntent = {};
  try {
    const raw = window.localStorage.getItem(PENDING_AUTH_INTENT_KEY);
    if (raw) parsed = JSON.parse(raw) as PendingAuthIntent;
  } catch {
    parsed = {};
  }
  return {
    returnTo: sanitizeReturnTo(parsed.returnTo),
    templateId: sanitizeTemplateId(parsed.templateId),
    referralCode: normalizeReferralCode(parsed.referralCode) ?? readPendingReferralCode() ?? undefined,
  };
}

/** Merge-write: a later visit never wipes an earlier captured field. */
export function writePendingAuthIntent(patch: PendingAuthIntent): PendingAuthIntent {
  const current = readPendingAuthIntent();
  const next: PendingAuthIntent = {
    returnTo: sanitizeReturnTo(patch.returnTo) ?? current.returnTo,
    templateId: sanitizeTemplateId(patch.templateId) ?? current.templateId,
    referralCode: normalizeReferralCode(patch.referralCode) ?? current.referralCode,
  };
  if (next.referralCode) storePendingReferralCode(next.referralCode);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(PENDING_AUTH_INTENT_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable — intent is best-effort */
    }
  }
  return next;
}

export function clearPendingAuthIntent() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(PENDING_AUTH_INTENT_KEY);
  } catch {
    /* nothing to clear */
  }
}

/** Where to land after a successful auth. */
export function resolveIntentDestination(intent: PendingAuthIntent): string {
  if (intent.returnTo) return intent.returnTo;
  if (intent.templateId) return `/app/templates?template=${encodeURIComponent(intent.templateId)}`;
  return "/app/templates";
}
