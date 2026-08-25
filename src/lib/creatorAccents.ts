/**
 * FUSE Creator profiles — the 6 curated accents.
 *
 * An accent ONLY tints accent surfaces: glow, badge, button highlight and the
 * portfolio divider. The base FUSE dark shell is never re-themed.
 */

export type CreatorAccentId =
  | "fuse-cyan"
  | "electric-blue"
  | "electric-violet"
  | "acid-lime"
  | "hot-pink"
  | "silver";

export type CreatorAccent = {
  id: CreatorAccentId;
  label: string;
  /** Raw hex, used for glow / divider / swatch only. */
  hex: string;
  /** rgb triplet for translucent accent layers. */
  rgb: string;
};

export const CREATOR_ACCENTS: CreatorAccent[] = [
  { id: "fuse-cyan", label: "FUSE Cyan", hex: "#22d3ee", rgb: "34, 211, 238" },
  { id: "electric-blue", label: "Electric Blue", hex: "#3b82f6", rgb: "59, 130, 246" },
  { id: "electric-violet", label: "Electric Violet", hex: "#8b5cf6", rgb: "139, 92, 246" },
  { id: "acid-lime", label: "Acid Lime", hex: "#a3e635", rgb: "163, 230, 53" },
  { id: "hot-pink", label: "Hot Pink", hex: "#ec4899", rgb: "236, 72, 153" },
  { id: "silver", label: "Silver", hex: "#cbd5e1", rgb: "203, 213, 225" },
];

export const DEFAULT_ACCENT: CreatorAccentId = "fuse-cyan";

export function resolveAccent(accent: string | null | undefined): CreatorAccent {
  return CREATOR_ACCENTS.find((entry) => entry.id === accent) ?? CREATOR_ACCENTS[0];
}

/** Inline style vars consumed by accent-only surfaces. */
export function accentStyle(accent: CreatorAccent): React.CSSProperties {
  return {
    ["--creator-accent" as string]: accent.hex,
    ["--creator-accent-rgb" as string]: accent.rgb,
  };
}

export const CREATOR_SPECIALTIES = [
  "Streetwear",
  "Jewelry",
  "Music",
  "Product",
  "Cinematic",
  "Fashion",
  "UGC",
  "Automotive",
  "Beauty",
  "Surreal",
  "Editorial",
] as const;

export type CreatorSpecialty = (typeof CREATOR_SPECIALTIES)[number];
