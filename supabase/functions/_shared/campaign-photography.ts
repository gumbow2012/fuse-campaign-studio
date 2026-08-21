/**
 * CAMPAIGN PHOTOGRAPHY PROFILE — pure logic (no provider imports).
 *
 * WHAT THIS IS
 *   A structured description of HOW a product should be PHOTOGRAPHED: lens
 *   character, camera placement, lighting family, exposure, surface, depth of
 *   field, negative space. It is a LOOK profile, nothing else.
 *
 * HARD SEPARATION FROM PRODUCT IDENTITY
 *   The MASTER PRODUCT LOCK owns WHAT the product is (geometry, stone layout,
 *   setting, components, proportions, identity). This profile owns only HOW it
 *   is shot. Photography references are therefore PHOTOGRAPHY authority ONLY:
 *   they contribute ZERO product geometry, stone layout, setting, component
 *   topology, materials or identity. Nothing in this module may describe the
 *   product itself.
 *
 * SCOPE (this commit)
 *   Analysis + storage only. It is NOT wired into any generation prompt yet.
 */

export const CAMPAIGN_PHOTOGRAPHY_VERSION = "campaign-photography-v1";

/** Every field is free-form text so any product category is describable. */
export type CampaignPhotographyProfile = {
  version?: string;
  /** Focal-length feel, rendering character, bokeh signature, optical flaws. */
  lensCharacter?: string | null;
  /** Macro magnification / how tightly the product fills the frame. */
  macroMagnification?: string | null;
  /** Camera height relative to the product (above, level, below). */
  cameraHeight?: string | null;
  /** Camera distance / working distance. */
  cameraDistance?: string | null;
  /** Perspective compression vs. wide-angle exaggeration. */
  lensCompression?: string | null;
  /** Lighting family (soft box, hard specular, window, mixed practicals …). */
  lightingFamily?: string | null;
  exposure?: string | null;
  contrast?: string | null;
  whiteBalance?: string | null;
  /** Surface the product sits on and the surrounding environment. */
  surfaceEnvironment?: string | null;
  depthOfField?: string | null;
  /** What is held in focus and how focus falls off. */
  focusBehavior?: string | null;
  negativeSpace?: string | null;
  /** 0..1 — how well the references supported the profile. */
  confidence?: number | null;
  notes?: string[];
};

const TEXT_KEYS = [
  "lensCharacter",
  "macroMagnification",
  "cameraHeight",
  "cameraDistance",
  "lensCompression",
  "lightingFamily",
  "exposure",
  "contrast",
  "whiteBalance",
  "surfaceEnvironment",
  "depthOfField",
  "focusBehavior",
  "negativeSpace",
] as const;

export type CampaignPhotographyField = (typeof TEXT_KEYS)[number];

export const CAMPAIGN_PHOTOGRAPHY_FIELDS: readonly CampaignPhotographyField[] = TEXT_KEYS;

function text(value: unknown, max = 320): string | null {
  const next = String(value ?? "").trim();
  if (!next || /^(unknown|n\/a|none|null)$/i.test(next)) return null;
  return next.slice(0, max);
}

/**
 * Normalizes an analysed profile. Unsupported fields stay null — the profile
 * never guesses, and it never carries product-identity claims.
 */
export function normalizeCampaignPhotographyProfile(
  raw: unknown,
): CampaignPhotographyProfile | null {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as Record<string, unknown>;

  const profile: CampaignPhotographyProfile = { version: CAMPAIGN_PHOTOGRAPHY_VERSION };
  let populated = 0;
  for (const key of TEXT_KEYS) {
    const value = text(source[key]);
    profile[key] = value;
    if (value) populated += 1;
  }
  if (!populated) return null;

  const confidence = Number(source.confidence);
  profile.confidence = Number.isFinite(confidence)
    ? Math.min(1, Math.max(0, confidence))
    : null;
  profile.notes = Array.isArray(source.notes)
    ? source.notes.map((note) => text(note, 200)).filter((note): note is string => Boolean(note)).slice(0, 6)
    : [];

  return profile;
}

/** Compact one-line summary for logs and the engineering surface. */
export function campaignPhotographySummaryLine(
  profile: CampaignPhotographyProfile | null,
): string | null {
  if (!profile) return null;
  const parts = [profile.lensCharacter, profile.lightingFamily, profile.depthOfField]
    .map((part) => (part ? String(part).split(/[.;]/)[0].trim() : null))
    .filter(Boolean);
  const filled = TEXT_KEYS.filter((key) => Boolean(profile[key])).length;
  return [...parts, `${filled}/${TEXT_KEYS.length} fields`].join(" · ");
}
