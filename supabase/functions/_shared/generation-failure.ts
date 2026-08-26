/**
 * P0 — professional generation failure taxonomy.
 *
 * Single source of truth for turning raw provider/moderation/infrastructure
 * errors into a customer-safe failure contract. Raw provider strings are an
 * implementation detail and must NEVER reach a customer payload — every
 * customer surface renders `publicGenerationFailure(code)` copy only.
 *
 * Pure TypeScript, zero imports: safe to consume from Deno edge functions AND
 * from the frontend test suite.
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

export type ClassifyProviderFailureInput = {
  rawError?: string | null;
  httpStatus?: number | null;
  provider?: string | null;
};

/**
 * Explicit policy/safety evidence. A failure is ONLY POLICY_REJECTED when the
 * provider's own words positively indicate a content-policy decision — a bare
 * 400/422, "generation failed" or any other ambiguous text is NEVER policy.
 * (Keep this list tight: broadening it mislabels ordinary provider failures.)
 */
const POLICY_SIGNALS = [
  "content checker",
  "content_policy",
  "content policy",
  "moderation",
  "nsfw",
  "safety system",
  "safety checker",
  "safety filter",
  "safety detector",
  "policy violation",
  "violates our",
  "violated content",
  "flagged as",
  "flagged by",
  "content was flagged",
  "material flagged",
  "prohibited content",
  "blocked by safety",
  "blocked due to content",
  "sensitive content",
  "inappropriate content",
  "explicit content",
  "sexual content",
  "violent content",
  "responsible ai",
  "usage policy",
  "content_filter",
  "content management policy",
];

const TIMEOUT_SIGNALS = [
  "timed out",
  "timeout",
  "deadline exceeded",
  "deadline_exceeded",
  "time limit",
  "took too long",
  "etimedout",
  "gateway time-out",
];

const NETWORK_SIGNALS = [
  "econnrefused",
  "econnreset",
  "econnaborted",
  "enotfound",
  "ehostunreach",
  "enetunreach",
  "fetch failed",
  "network error",
  "networkerror",
  "connection refused",
  "connection reset",
  "socket hang up",
  "dns",
  "service unavailable",
  "unavailable",
  "overloaded",
  "capacity",
  "bad gateway",
  "upstream",
];

const CREDIT_SIGNALS = [
  "insufficient credits",
  "not enough credits",
  "credit balance",
  "out of credits",
  "payment required",
  "insufficient balance",
  "insufficient funds",
];

const UPLOAD_SIGNALS = [
  "upload failed",
  "failed to upload",
  "upload error",
  "could not upload",
  "storage error",
  "signed url",
];

/** Reference could not be fetched/read at all (dead link, unreachable URL). */
const REFERENCE_UNAVAILABLE_SIGNALS = [
  "failed to fetch image",
  "failed to fetch the image",
  "failed to download",
  "could not download",
  "unable to fetch",
  "unable to download",
  "unable to retrieve",
  "could not retrieve",
  "could not load image",
  "could not load the image",
  "failed to load image",
  "failed to load the image",
  "image not found",
  "url not found",
  "404",
  "dead link",
  "unreachable url",
  "unable to access",
  "could not access",
  "access denied",
  "forbidden url",
];

/** Reference was fetched but is malformed/unsupported/unreadable. */
const INVALID_INPUT_SIGNALS = [
  "invalid image",
  "invalid input",
  "invalid url",
  "invalid file",
  "invalid format",
  "unsupported format",
  "unsupported media",
  "unsupported image",
  "unsupported file",
  "not a valid image",
  "not an image",
  "corrupt",
  "malformed",
  "unreadable",
  "could not decode",
  "failed to decode",
  "cannot decode",
  "decode error",
  "invalid aspect",
  "resolution not supported",
  "unsupported resolution",
  "file too large",
  "exceeds the maximum",
  "empty file",
  "validation error",
  "invalid_request",
];

function matchesAny(text: string, signals: string[]): boolean {
  return signals.some((signal) => text.includes(signal));
}

/**
 * Classify a raw provider failure into a public code. Order matters:
 * credits → timeout → policy (explicit evidence only) → reference/input →
 * network/unavailable → provider failed → unknown.
 *
 * IMPORTANT: a bare numeric status (400/422/500) is NEVER enough evidence for
 * POLICY_REJECTED — ambiguous input is PROVIDER_FAILED by contract.
 */
export function classifyProviderFailure(
  input: ClassifyProviderFailureInput,
): GenerationFailureCode {
  const raw = String(input.rawError ?? "").trim();
  const text = raw.toLowerCase();
  const status = typeof input.httpStatus === "number" ? input.httpStatus : null;

  if (!raw && status == null) return "UNKNOWN";

  if (status === 402 || matchesAny(text, CREDIT_SIGNALS)) return "INSUFFICIENT_CREDITS";

  if (
    status === 408 ||
    status === 504 ||
    matchesAny(text, TIMEOUT_SIGNALS)
  ) {
    return "PROVIDER_TIMEOUT";
  }

  // Policy requires POSITIVE textual evidence — never inferred from a status.
  if (matchesAny(text, POLICY_SIGNALS)) return "POLICY_REJECTED";

  if (matchesAny(text, UPLOAD_SIGNALS)) return "UPLOAD_FAILED";

  if (matchesAny(text, REFERENCE_UNAVAILABLE_SIGNALS)) return "REFERENCE_UNAVAILABLE";
  if (matchesAny(text, INVALID_INPUT_SIGNALS)) return "INVALID_INPUT";

  // Explicit unavailability: network-level failures or a literal 503. A bare
  // 500 (or any other bare status) is ambiguous → PROVIDER_FAILED.
  if (status === 503 || matchesAny(text, NETWORK_SIGNALS)) return "PROVIDER_UNAVAILABLE";

  // Any remaining evidence — raw text or a bare ambiguous status (400/422/500)
  // — is a provider failure. UNKNOWN is reserved for total absence of evidence.
  if (raw || status != null) return "PROVIDER_FAILED";
  return "UNKNOWN";
}

const PUBLIC_FAILURE_COPY: Record<GenerationFailureCode, Omit<PublicGenerationFailure, "code">> = {
  PROVIDER_FAILED: {
    title: "Generation couldn't be completed",
    message: "Something interrupted this generation. Try again or adjust your inputs.",
    retryable: true,
  },
  UNKNOWN: {
    title: "Generation couldn't be completed",
    message: "Something interrupted this generation. Try again or adjust your inputs.",
    retryable: true,
  },
  PROVIDER_UNAVAILABLE: {
    title: "Generation interrupted",
    message: "The generation service didn't finish this request. You can try again.",
    retryable: true,
  },
  PROVIDER_TIMEOUT: {
    title: "Generation took too long",
    message: "This generation didn't finish in time.",
    retryable: true,
  },
  INVALID_INPUT: {
    title: "This input couldn't be used",
    message: "Check your uploaded references and try again.",
    retryable: true,
  },
  REFERENCE_UNAVAILABLE: {
    title: "This input couldn't be used",
    message: "Check your uploaded references and try again.",
    retryable: true,
  },
  UPLOAD_FAILED: {
    title: "This input couldn't be used",
    message: "Check your uploaded references and try again.",
    retryable: true,
  },
  POLICY_REJECTED: {
    title: "This request couldn't be generated",
    message:
      "One of the submitted inputs or instructions may not meet the generation guidelines. Review the content and try again.",
    retryable: true,
  },
  INSUFFICIENT_CREDITS: {
    title: "Not enough credits",
    message: "Add credits and try again.",
    retryable: false,
  },
};

/** Customer-safe failure presentation. Contains NO provider language. */
export function publicGenerationFailure(code: GenerationFailureCode): PublicGenerationFailure {
  return { code, ...PUBLIC_FAILURE_COPY[code] };
}

/** Convenience: raw provider evidence → customer-safe failure in one step. */
export function toPublicGenerationFailure(
  input: ClassifyProviderFailureInput,
): PublicGenerationFailure {
  return publicGenerationFailure(classifyProviderFailure(input));
}
