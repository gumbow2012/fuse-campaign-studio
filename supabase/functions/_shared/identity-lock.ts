/**
 * AVATAR HARD IDENTITY-LOCK — canonical identity model + prompt authority block.
 *
 * FUSE avatars are owned synthetic characters. The uploaded master image is the
 * immutable identity source of truth. Everything here is READ-ONLY plumbing over
 * `avatar_profiles.consistency_profile` (jsonb) — no schema migration, and any
 * avatar without a canonical master keeps behaving exactly as before via the
 * documented fallback order.
 *
 * consistency_profile shape (all fields optional / additive):
 *   canonical_master : { url, uploaded_at, locked: true }
 *   approved         : { front, left_3_4, right_3_4, left_profile, right_profile, full_body }
 *   production_ready : boolean
 *   identity_status  : "IDENTITY_PASS" | "NEEDS_REVIEW" | "IDENTITY_FAIL"
 */

export type IdentityStatus = "IDENTITY_PASS" | "NEEDS_REVIEW" | "IDENTITY_FAIL";

export type CanonicalMaster = {
  url: string;
  uploaded_at?: string | null;
  locked?: boolean;
};

/** Ordered angle slots — the order below is the reference-pack order. */
export const APPROVED_ANGLE_KEYS = [
  "front",
  "left_3_4",
  "right_3_4",
  "left_profile",
  "right_profile",
  "full_body",
] as const;

export type ApprovedAngleKey = typeof APPROVED_ANGLE_KEYS[number];

export type ConsistencyProfile = {
  canonical_master?: CanonicalMaster | null;
  approved?: Partial<Record<ApprovedAngleKey, string | null>> | null;
  production_ready?: boolean;
  identity_status?: IdentityStatus;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function trimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Reads consistency_profile off an avatar_profiles row. Never throws. */
export function readConsistencyProfile(row: unknown): ConsistencyProfile {
  const record = asRecord(row);
  const profile = asRecord(record?.consistency_profile);
  return (profile ?? {}) as ConsistencyProfile;
}

export function canonicalMaster(row: unknown): CanonicalMaster | null {
  const master = asRecord(readConsistencyProfile(row).canonical_master);
  const url = trimmed(master?.url);
  if (!url) return null;
  return {
    url,
    uploaded_at: typeof master?.uploaded_at === "string" ? master.uploaded_at : null,
    locked: master?.locked === true,
  };
}

/**
 * Identity master URL. Fallback order (never guesses beyond this):
 * canonical_master.url → thumbnail_url → first reference_assets entry.
 */
export function canonicalMasterUrl(row: unknown): string | null {
  const master = canonicalMaster(row);
  if (master) return master.url;

  const record = asRecord(row);
  if (!record) return null;
  const thumb = trimmed(record.thumbnail_url);
  if (thumb) return thumb;
  const refs = Array.isArray(record.reference_assets) ? record.reference_assets : [];
  const first = refs.map((entry) => trimmed(entry)).find(Boolean);
  return first ?? null;
}

/** Ordered, non-null approved angle URLs. */
export function approvedAngleUrls(row: unknown): string[] {
  const approved = asRecord(readConsistencyProfile(row).approved);
  if (!approved) return [];
  const urls: string[] = [];
  for (const key of APPROVED_ANGLE_KEYS) {
    const url = trimmed(approved[key]);
    if (url) urls.push(url);
  }
  return urls;
}

/**
 * FUTURE multi-reference source: master first, then approved angles, deduped.
 * Callers today still condition on a SINGLE image.
 */
export function identityReferencePack(row: unknown): string[] {
  const pack: string[] = [];
  const master = canonicalMasterUrl(row);
  if (master) pack.push(master);
  for (const url of approvedAngleUrls(row)) pack.push(url);
  return Array.from(new Set(pack));
}

export function identityStatus(row: unknown): IdentityStatus | null {
  const status = trimmed(readConsistencyProfile(row).identity_status);
  return status === "IDENTITY_PASS" || status === "NEEDS_REVIEW" || status === "IDENTITY_FAIL"
    ? status
    : null;
}

/** A canonical master + at least one approved angle + explicit production_ready. */
export function isProductionReady(row: unknown): boolean {
  const profile = readConsistencyProfile(row);
  return Boolean(canonicalMaster(row)?.url) &&
    approvedAngleUrls(row).length >= 1 &&
    profile.production_ready === true;
}

/**
 * Server-owned identity authority instruction. Never exposed to customers.
 */
export const IDENTITY_AUTHORITY_BLOCK = [
  "IDENTITY AUTHORITY (ABSOLUTE, NON-NEGOTIABLE):",
  "The supplied identity reference image is the single source of truth for this character.",
  "Reproduce that exact same person: preserve the exact face, facial proportions and bone structure, skin tone and undertone, eye color and eye shape, eyebrow shape, nose, lips, jawline, and the exact hairline.",
  "Do NOT drift toward, average with, idealize, beautify, age, de-age, restyle or blend in any other face. Do not substitute a similar-looking person. No face morphing, no identity interpolation.",
  "Wardrobe, styling, props, pose, expression, camera angle, framing, lens, lighting, scene and background MAY change freely as directed below.",
  "If any styling, scene or prompt instruction conflicts with the identity reference, IDENTITY WINS. Identity outranks style, scene, aesthetic and prompt.",
].join("\n");

/** Prepends the identity authority block to a resolved prompt. */
export function buildIdentityLockedPrompt(basePrompt: string): string {
  const base = typeof basePrompt === "string" ? basePrompt : "";
  if (!base.trim()) return base;
  return `${IDENTITY_AUTHORITY_BLOCK}\n\n${base}`;
}
