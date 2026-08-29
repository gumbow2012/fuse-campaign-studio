/**
 * P0 — professional generation failure taxonomy (frontend contract).
 *
 * The backend classifies raw provider failures and sends a customer-safe
 * `publicFailure` object. This module is the frontend mirror: types, the
 * fallback copy used when a payload predates the field, and a guard that
 * proves a string never contains raw provider/moderation language before it
 * is rendered. Customer surfaces must NEVER render raw provider errors.
 *
 * Mirrors supabase/functions/_shared/generation-failure.ts — keep in sync.
 */

export type GenerationFailureCode =
  | "POLICY_REJECTED"
  | "INVALID_INPUT"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_TIMEOUT"
  | "PROVIDER_FAILED"
  | "REFERENCE_UNAVAILABLE"
  | "UPLOAD_FAILED"
  | "INSUFFICIENT_CREDITS"
  | "UNKNOWN";

export type PublicGenerationFailure = {
  code: GenerationFailureCode;
  title: string;
  message: string;
  retryable: boolean;
};

/** Privileged (admin/dev) diagnostics — never rendered for customers. */
export type ProviderFailureDetail = {
  rawError: string | null;
  provider: string | null;
  requestId: string | null;
  endpoint: string | null;
};

export const FALLBACK_FAILURE: PublicGenerationFailure = {
  code: "UNKNOWN",
  title: "Generation couldn't be completed",
  message: "Something interrupted this generation. Try again or adjust your inputs.",
  retryable: true,
};

/** Customer-safe failure for any payload — falls back when the field is absent. */
export function readPublicFailure(value: unknown): PublicGenerationFailure {
  const candidate = (value ?? null) as Partial<PublicGenerationFailure> | null;
  if (
    candidate &&
    typeof candidate.title === "string" &&
    candidate.title &&
    typeof candidate.message === "string" &&
    candidate.message
  ) {
    return {
      code: (candidate.code as GenerationFailureCode) ?? "UNKNOWN",
      title: candidate.title,
      message: candidate.message,
      retryable: candidate.retryable !== false,
    };
  }
  return FALLBACK_FAILURE;
}

/** Substrings that must never appear in customer-facing failure copy. */
const FORBIDDEN_CUSTOMER_LANGUAGE = [
  "flagged",
  "content checker",
  "moderation",
  "safety detector",
  "violation",
  "provider error",
  "technical details",
  "nsfw",
  "fal.ai",
  "kling",
  "seedance",
];

/**
 * Dev/assertion helper: true when a string is safe to show a customer.
 * Surfaces use this to guarantee raw provider text never leaks through.
 */
export function isCustomerSafeFailureText(text: string): boolean {
  const lower = text.toLowerCase();
  return !FORBIDDEN_CUSTOMER_LANGUAGE.some((term) => lower.includes(term));
}
