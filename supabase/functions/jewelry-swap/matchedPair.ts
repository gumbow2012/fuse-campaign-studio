/**
 * MATCHED-PAIR MANUFACTURING (§29) — prompt building only.
 *
 * A matched pair is TWO images of the SAME physical piece in two different
 * MANUFACTURING STATES (e.g. FINISHED and PRE-SETTING / pre-stone), captured as
 * if nothing but the manufacturing stage changed between the two exposures:
 * identical camera, identical crop, identical composition, identical lighting,
 * identical object orientation, identical scale, identical background.
 *
 * This module ONLY composes prompt text. It:
 * - never classifies the product (identity comes from the Master Product Lock),
 * - contains no product-type or setting values of its own,
 * - never touches provider routing (the caller reuses the existing Nano path),
 * - never decides WHEN to generate (that is an explicit user action).
 *
 * The transform is universal: it works for any piece that carries stones,
 * because the ONLY thing it is allowed to change is the presence of the stones
 * and the exposure of their seats.
 */

import { type MasterProductLock, masterLockPromptLines } from "./masterLock.ts";
import {
  type MaterialAppearanceAuthority,
  materialAuthorityPromptLines,
} from "./materialAuthority.ts";

/** The manufacturing states a plate can represent. */
export const MANUFACTURING_STAGES = ["finished", "pre_setting"] as const;

export type ManufacturingStage = (typeof MANUFACTURING_STAGES)[number];

export function isManufacturingStage(value: unknown): value is ManufacturingStage {
  return MANUFACTURING_STAGES.includes(String(value ?? "") as ManufacturingStage);
}

export function manufacturingStageLabel(stage: ManufacturingStage): string {
  return stage === "pre_setting" ? "Pre-setting (no stones)" : "Finished (stones set)";
}

/** The other half of the pair. */
export function oppositeManufacturingStage(stage: ManufacturingStage): ManufacturingStage {
  return stage === "finished" ? "pre_setting" : "finished";
}

const clean = (value: unknown, max = 400): string | null => {
  const text = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!text) return null;
  if (/^(auto|unknown|null|n\/a|none)$/i.test(text)) return null;
  return text.slice(0, max);
};

/**
 * The state-specific transform. Everything else in the prompt is a HOLD rule,
 * so the model is only ever given ONE degree of freedom.
 */
const STAGE_TRANSFORM: Record<ManufacturingStage, string[]> = {
  pre_setting: [
    "TRANSFORM — FINISHED → PRE-SETTING (pre-stone manufacturing state). Change ONLY the manufacturing stage:",
    "- Remove EVERY stone from the piece. No gems, no crystals, no glass, no painted-in sparkle, no reflections of stones anywhere.",
    "- Expose the EXACT empty seats the removed stones sat in: drilled/cut seats, culet holes, bearing shoulders, girdle ledges — in the SAME positions, SAME count, SAME sizes and SAME spacing as the finished plate.",
    "- Keep every retention feature intact and unbent: prong tips stand open and un-tipped, bead grains remain as raised metal beads, channel walls / bezel rims / gallery rails stay exactly as constructed.",
    "- Preserve ALL metal geometry unchanged: silhouette, thickness, sidewalls, relief layers, bail/clasp/connector, gallery, back architecture, engraving, repeated modules and their count.",
    "- Metal surface reads as bench-finished raw metal in the same alloy colour: no stone fire, no rainbow dispersion, no stone-driven highlights.",
  ],
  finished: [
    "TRANSFORM — PRE-SETTING → FINISHED (stones set). Change ONLY the manufacturing stage:",
    "- Repopulate EVERY empty seat with its stone, one stone per existing seat: SAME seat positions, SAME count, SAME sizes, SAME orientation and SAME spacing already present in the source plate.",
    "- Do not move, resize, add or remove a single seat. No new stones anywhere there was no seat.",
    "- Close the retention exactly as the construction dictates: prong tips fold onto the stones, beads seat over the girdles, channel walls and bezel rims hold the stones — with no change to the metal geometry underneath.",
    "- Preserve ALL metal geometry unchanged: silhouette, thickness, sidewalls, relief layers, bail/clasp/connector, gallery, back architecture, engraving, repeated modules and their count.",
  ],
};

/** The HOLD contract — what must be pixel-identical between the two plates. */
const HOLD_RULES = [
  "HOLD IDENTICAL — this is a matched pair of the SAME physical object photographed in the SAME session. The two plates must be overlay-compatible (as pixel-aligned as possible):",
  "- Camera: identical focal length, identical camera distance, identical optical axis, identical perspective, identical angle. Do not re-frame, re-shoot or re-compose.",
  "- Crop & composition: identical framing, identical margins, identical position of the product inside the frame, identical aspect ratio and identical output size.",
  "- Object orientation & scale: identical rotation, identical tilt, identical pose, identical size on the sensor. The product must not move by even a pixel.",
  "- Lighting: identical light positions, identical softness, identical direction, identical intensity, identical colour temperature, identical shadow shape and identical shadow position.",
  "- Background & surface: identical background, identical tone, identical gradient, identical contact shadow, identical reflections in the surface.",
  "- Material appearance: identical metal alloy colour, identical polish level, identical texture and identical exposure.",
  "- Nothing else may change: no restyling, no cleanup, no redesign, no added props, no branding, no text, no watermark, no crop drift, no zoom.",
];

/**
 * The matched-pair prompt: the source plate is the geometric and photographic
 * authority, the Master Product Lock is the product-identity authority, and the
 * manufacturing stage is the ONLY thing the render is allowed to change.
 */
export function buildMatchedPairPrompt(args: {
  targetStage: ManufacturingStage;
  sourceStage: ManufacturingStage;
  /** What the source plate is (e.g. "Front", "Macro (setting)") — audit/context. */
  sourceLabel?: unknown;
  masterLock: MasterProductLock | null;
  materialAuthority?: MaterialAppearanceAuthority | null;
  extra?: unknown;
}): string {
  const lockLines = masterLockPromptLines(args.masterLock, { compact: true });
  const materialLines = materialAuthorityPromptLines(args.materialAuthority ?? null);
  const sourceLabel = clean(args.sourceLabel, 80);
  const extra = clean(args.extra);

  const sections: (string | null)[] = [
    "TASK — MATCHED-PAIR MANUFACTURING PLATE. The FIRST supplied image is the SOURCE PLATE. Reproduce that exact photograph of that exact object, changing ONLY the manufacturing stage described below. This is a controlled manufacturing-state transform, not a new photograph.",

    `SOURCE PLATE — ${manufacturingStageLabel(args.sourceStage)}${
      sourceLabel ? ` · ${sourceLabel}` : ""
    }. Treat it as the authority for camera, crop, composition, lighting, orientation, scale and background.`,

    STAGE_TRANSFORM[args.targetStage].join("\n"),

    HOLD_RULES.join("\n"),

    lockLines.length
      ? lockLines.join("\n")
      : "PRODUCT IDENTITY: the source plate is the only product authority — invent nothing.",

    materialLines.length ? materialLines.join("\n") : null,

    [
      "HARD RULES:",
      "- ONE product only, the one in the source plate. Any additional supplied images are construction evidence for the seats/retention only — never a new camera, crop, pose or lighting.",
      "- If the transform and the hold rules ever appear to conflict, obey the hold rules and apply the minimum stage change.",
      "- Output a single clean image at the same framing as the source plate.",
    ].join("\n"),

    extra ? `ADDITIONAL DIRECTION: ${extra}` : null,
  ];

  return sections.filter(Boolean).join("\n\n").slice(0, 12000);
}

/** Short audit line stored on the generation row. */
export function matchedPairSummaryLine(args: {
  sourceStage: ManufacturingStage;
  targetStage: ManufacturingStage;
  sourceLabel?: unknown;
}): string {
  const label = clean(args.sourceLabel, 60);
  return [
    `${manufacturingStageLabel(args.sourceStage)} → ${manufacturingStageLabel(args.targetStage)}`,
    label ? `from ${label}` : null,
    "camera/crop/lighting/orientation held identical",
  ].filter(Boolean).join(" · ");
}
