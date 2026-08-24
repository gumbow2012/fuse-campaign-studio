/**
 * FUSE Cinema — VISUAL PROOF preview manifest (CV1).
 *
 * Computes, from the ACTUAL preset data, how many standardized preview assets
 * each control category needs and which ones are still missing media.
 *
 * This module NEVER generates media and NEVER calls a provider — it only counts.
 */

import {
  FOCAL_LENGTH_STRIP_MM,
  defaultCanonicalScene,
  needsMedia,
  primaryPreviewKind,
  resolvePreviewMedia,
  type CanonicalScene,
  type CinemaPreviewCategory,
  type PreviewKind,
  type PreviewMedia,
} from "./previewTypes";
import { CAMERA_PRESETS } from "./presets/cameraPresets";
import {
  APERTURE_OPTIONS,
  FOCAL_LENGTH_PRESETS,
  LENS_PRESETS,
} from "./presets/lensPresets";
import { LIGHTING_PRESETS } from "./presets/lightingPresets";
import { COLOR_PRESETS } from "./presets/colorPresets";
import { COMPOSITION_PRESETS, FOCUS_PRESETS } from "./presets/compositionPresets";
import { ATMOSPHERE_PRESETS } from "./presets/atmospherePresets";
import { OPTICS_PRESETS } from "./presets/opticsPresets";
import { MOVEMENT_PRESETS } from "./presets/movementPresets";
import { FULL_PRESETS } from "./presets/fullPresets";
import { EMOTION_PRESETS } from "./presets/characterPresets";

export type PreviewManifestEntry = {
  presetId: string;
  category: CinemaPreviewCategory;
  canonicalScene: CanonicalScene;
  kind: PreviewKind;
  /** True when a real media asset still has to be produced. */
  missing: boolean;
};

export type PreviewCategoryCount = {
  category: CinemaPreviewCategory;
  kind: PreviewKind;
  /** Total assets required for this category (incl. extra strip assets). */
  required: number;
  /** Assets already present. */
  present: number;
  /** Assets still needing media. */
  missing: number;
};

export type PreviewManifest = {
  counts: PreviewCategoryCount[];
  totalRequired: number;
  totalMissing: number;
  /** Flat list of every entry still needing media. */
  pending: PreviewManifestEntry[];
  /** Every entry, present or not. */
  entries: PreviewManifestEntry[];
};

type SourcePreset = {
  id: string;
  category?: string;
  tags?: string[];
  thumbnail?: string;
  preview?: PreviewMedia;
};

function toEntry(category: CinemaPreviewCategory, preset: SourcePreset): PreviewManifestEntry {
  const media = resolvePreviewMedia({ category, preset });
  return {
    presetId: preset.id,
    category,
    canonicalScene: media.canonicalScene,
    kind: media.kind,
    missing: needsMedia(media),
  };
}

/** All preset sources, normalized to the manifest's minimal shape. */
function collectSources(): Array<{ category: CinemaPreviewCategory; presets: SourcePreset[] }> {
  return [
    { category: "CAMERA", presets: CAMERA_PRESETS },
    { category: "LENS", presets: LENS_PRESETS },
    {
      category: "FOCAL_LENGTH",
      presets: FOCAL_LENGTH_PRESETS.map((mm) => ({ id: `focal-${mm}mm` })),
    },
    { category: "APERTURE", presets: APERTURE_OPTIONS },
    { category: "LIGHTING", presets: LIGHTING_PRESETS },
    { category: "COLOR", presets: COLOR_PRESETS },
    { category: "COMPOSITION", presets: COMPOSITION_PRESETS },
    { category: "FOCUS", presets: FOCUS_PRESETS },
    { category: "ATMOSPHERE", presets: ATMOSPHERE_PRESETS },
    { category: "OPTICS", presets: OPTICS_PRESETS },
    { category: "MOVEMENT", presets: MOVEMENT_PRESETS },
    { category: "CHARACTER", presets: EMOTION_PRESETS },
    { category: "FULL", presets: FULL_PRESETS },
  ];
}

/** The single FOCAL_LENGTH comparison strip (18/24/35/50/85/135). */
export const FOCAL_LENGTH_STRIP_ENTRY: PreviewManifestEntry = {
  presetId: `focal-strip-${FOCAL_LENGTH_STRIP_MM.join("-")}`,
  category: "FOCAL_LENGTH",
  canonicalScene: defaultCanonicalScene("FOCAL_LENGTH"),
  kind: "strip",
  missing: true,
};

export function buildPreviewManifest(): PreviewManifest {
  const entries: PreviewManifestEntry[] = [];
  const counts: PreviewCategoryCount[] = [];

  collectSources().forEach(({ category, presets }) => {
    const categoryEntries = presets.map((preset) => toEntry(category, preset));
    if (category === "FOCAL_LENGTH") categoryEntries.push({ ...FOCAL_LENGTH_STRIP_ENTRY });
    entries.push(...categoryEntries);
    const missing = categoryEntries.filter((entry) => entry.missing).length;
    counts.push({
      category,
      kind: primaryPreviewKind(category),
      required: categoryEntries.length,
      present: categoryEntries.length - missing,
      missing,
    });
  });

  return {
    counts,
    totalRequired: entries.length,
    totalMissing: entries.filter((entry) => entry.missing).length,
    pending: entries.filter((entry) => entry.missing),
    entries,
  };
}

/** Compact one-line-per-category readout for dev/admin surfaces. */
export function formatPreviewManifest(manifest = buildPreviewManifest()): string[] {
  return manifest.counts.map((count) => {
    const label = count.kind === "still-swatches" ? "swatch sets" : `${count.kind}s`;
    return `${count.category}: ${count.required} ${label} required · ${count.missing} missing`;
  });
}
