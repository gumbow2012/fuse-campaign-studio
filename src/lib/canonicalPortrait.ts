/**
 * FT14b — Canonical identity portrait standard for FUSE avatars.
 * Read-only helpers: the neutral portrait standard + READY derivation.
 * No provider logic here — generation reuses the existing generate-studio pipeline.
 */

export const NEUTRAL_PORTRAIT_STANDARD =
  "Photorealistic identity-reference portrait of an adult subject — an ORIGINAL SYNTHETIC CHARACTER, NOT a real person, NOT resembling any public figure or celebrity. THIS IS AN IDENTITY REFERENCE IMAGE ONLY, NOT CAMPAIGN ART. Chest-up, straight-on to camera, subject looking directly into the lens. 85mm portrait-lens rendering, realistic facial proportions. Neutral charcoal-gray seamless background. Large soft frontal key light with subtle fill; extremely neutral, even lighting — no dramatic shadows, no colored light, no cinematic color grade. Natural realistic skin texture with visible pores; realistic hair texture. Neutral expression, mouth naturally closed. Wearing a simple plain black crewneck. No branding, hat, sunglasses, headphones, environmental objects, or jewelry.";

/** The single image model allowed for canonical portraits. */
export const CANONICAL_PORTRAIT_MODEL = "nano-banana-pro";
export const CANONICAL_PORTRAIT_RESOLUTION = "2K";
export const CANONICAL_PORTRAIT_ASPECT = "3:4";

type CanonicalAvatarLike = {
  visual_description?: string | null;
  thumbnail_url?: string | null;
  reference_assets?: string[];
  consistency_profile?: Record<string, unknown> | null;
};

export function buildCanonicalPrompt(avatar: CanonicalAvatarLike): string {
  const identity = String(avatar.visual_description ?? "").trim();
  return identity ? `${NEUTRAL_PORTRAIT_STANDARD}\n\nIdentity: ${identity}` : NEUTRAL_PORTRAIT_STANDARD;
}

/** READY is derived, never stored: has a reference AND no pending canonical flag. */
export function isCanonicalReady(avatar: CanonicalAvatarLike): boolean {
  const hasReference = Boolean(avatar.thumbnail_url || (avatar.reference_assets ?? []).length);
  const pending = (avatar.consistency_profile ?? {})["needs_canonical_assets"] === true;
  return hasReference && !pending;
}

export const CANONICAL_REQUIRED_LABEL = "CANONICAL ASSET REQUIRED";
