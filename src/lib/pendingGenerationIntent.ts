/**
 * PENDING GENERATION INTENT (P6b — durable)
 *
 * What the visitor had configured when the generate auth gate opened, stored
 * sanitized in localStorage so it survives an OAuth round-trip (Google / Apple
 * / Microsoft) and the email OTP step.
 *
 * Uploaded assets are referenced by their P6a `anon-temp/` PUBLIC URLs — raw
 * file bytes are never stored here.
 */
import { sanitizeReturnTo } from "@/lib/pendingAuthIntent";

const KEY = "fuse.pendingGenerationIntent";
const CONSUMED_KEY = "fuse.pendingGenerationIntent.consumed";
/** Temp assets are short-lived; a stale intent must never auto-run later. */
const TTL_MS = 6 * 60 * 60 * 1000;

export type PendingGenerationInput = {
  /** Template input key (slot) the asset belongs to. */
  slotKey: string;
  /** Public URL of the anon-temp upload. */
  tempUrl: string;
};

export type PendingGenerationIntent = {
  templateId: string;
  versionId?: string | null;
  /** Uploaded assets as public URLs (no bytes). */
  inputs: PendingGenerationInput[];
  /** Editable text field values keyed by input key. */
  textOverrides: Record<string, string>;
  /** Non-file selections (options, toggles) keyed by input key. */
  selectedOptions: Record<string, string>;
  /** Cast selection by slot. */
  selectedCast: Record<string, string>;
  /** Validated internal path to return to after auth. */
  returnTo: string;
  /** Credits the configured run would cost (0 when unknown). */
  creditCost?: number;
  createdAt: number;
};

function sanitizeId(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const value = raw.trim();
  if (!value || value.length > 128) return undefined;
  return /^[a-zA-Z0-9._:-]+$/.test(value) ? value : undefined;
}

function sanitizeUrl(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const value = raw.trim();
  if (!/^https:\/\//i.test(value) || value.length > 2048) return undefined;
  return value;
}

function sanitizeRecord(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== "string") continue;
    if (!/^[a-zA-Z0-9._:-]{1,128}$/.test(key)) continue;
    if (value.length > 4000) continue;
    out[key] = value;
  }
  return out;
}

function sanitize(raw: unknown): PendingGenerationIntent | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const templateId = sanitizeId(value.templateId);
  const returnTo = sanitizeReturnTo(typeof value.returnTo === "string" ? value.returnTo : null);
  if (!templateId || !returnTo) return null;

  const createdAt = typeof value.createdAt === "number" ? value.createdAt : 0;
  if (!createdAt || Date.now() - createdAt > TTL_MS) return null;

  const inputs = Array.isArray(value.inputs)
    ? value.inputs
        .map((entry) => {
          const item = (entry ?? {}) as Record<string, unknown>;
          const slotKey = sanitizeId(item.slotKey);
          const tempUrl = sanitizeUrl(item.tempUrl);
          return slotKey && tempUrl ? { slotKey, tempUrl } : null;
        })
        .filter((entry): entry is PendingGenerationInput => !!entry)
        .slice(0, 24)
    : [];

  return {
    templateId,
    versionId: sanitizeId(value.versionId) ?? null,
    inputs,
    textOverrides: sanitizeRecord(value.textOverrides),
    selectedOptions: sanitizeRecord(value.selectedOptions),
    selectedCast: sanitizeRecord(value.selectedCast),
    returnTo,
    creditCost: typeof value.creditCost === "number" && value.creditCost >= 0 ? value.creditCost : 0,
    createdAt,
  };
}

/** A stable fingerprint so one intent can never auto-run twice. */
export function intentSignature(intent: PendingGenerationIntent) {
  return `${intent.templateId}:${intent.createdAt}`;
}

export function setPendingGenerationIntent(
  intent: Omit<PendingGenerationIntent, "createdAt"> & { createdAt?: number },
) {
  const next = sanitize({ ...intent, createdAt: intent.createdAt ?? Date.now() });
  if (!next) return null;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
    // A brand new capture is not consumed yet.
    window.localStorage.removeItem(CONSUMED_KEY);
  } catch {
    /* storage unavailable — restoration is best-effort */
  }
  return next;
}

export function getPendingGenerationIntent(): PendingGenerationIntent | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = sanitize(JSON.parse(raw));
    if (!parsed) {
      window.localStorage.removeItem(KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearPendingGenerationIntent() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
    window.localStorage.removeItem(CONSUMED_KEY);
  } catch {
    /* nothing to clear */
  }
}

/** Marks an intent as already restored + started (idempotency guard). */
export function markPendingGenerationConsumed(intent: PendingGenerationIntent) {
  try {
    window.localStorage.setItem(CONSUMED_KEY, intentSignature(intent));
  } catch {
    /* best effort */
  }
}

export function pendingGenerationConsumed(intent: PendingGenerationIntent) {
  try {
    return window.localStorage.getItem(CONSUMED_KEY) === intentSignature(intent);
  } catch {
    return false;
  }
}
