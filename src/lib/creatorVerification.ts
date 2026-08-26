/**
 * FUSE creator verification (public, additive).
 *
 * Verification is separate from creator level / plan / achievements.
 * `verification_reason` is ADMIN-ONLY and never reaches the client.
 */

export const VERIFICATION_STATUSES = ["creator", "verified", "featured", "partner"] as const;

export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

const LABELS: Record<Exclude<VerificationStatus, "creator">, string> = {
  verified: "Verified FUSE Creator",
  featured: "Featured FUSE Creator",
  partner: "FUSE Partner",
};

export function normalizeVerificationStatus(value: unknown): VerificationStatus {
  const status = String(value ?? "creator").trim().toLowerCase();
  return (VERIFICATION_STATUSES as readonly string[]).includes(status)
    ? (status as VerificationStatus)
    : "creator";
}

/** Plain creators get no badge. */
export function isBadgedVerification(value: unknown): boolean {
  return normalizeVerificationStatus(value) !== "creator";
}

export function verificationLabel(value: unknown): string | null {
  const status = normalizeVerificationStatus(value);
  if (status === "creator") return null;
  return LABELS[status];
}
