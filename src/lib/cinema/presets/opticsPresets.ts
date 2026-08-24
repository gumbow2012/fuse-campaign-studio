/**
 * FUSE Cinema — OPTICS look presets (no DB).
 *
 * Each optics look is a previewable control: one canonical-scene still proves
 * what the flare / bokeh character actually does.
 */

import type { CinemaControlValidation, PreviewMedia } from "@/lib/cinema/previewTypes";

export type OpticsPreset = {
  id: string;
  /** Value written into `optics.flare`. */
  flare: string;
  name: string;
  tags?: string[];
  /** CV1: optional standardized visual preview (gradients are fallback-only). */
  preview?: PreviewMedia;
  /** CV1: optional cross-model validation record. */
  validation?: CinemaControlValidation;
};

export const OPTICS_PRESETS: OpticsPreset[] = [
  { id: "optics-none", flare: "none", name: "None" },
  { id: "optics-subtle", flare: "subtle", name: "Subtle" },
  { id: "optics-anamorphic-streak", flare: "anamorphic streak", name: "Anamorphic Streak" },
  { id: "optics-warm-veiling", flare: "warm veiling", name: "Warm Veiling" },
  { id: "optics-blue-streak", flare: "blue streak", name: "Blue Streak" },
  { id: "optics-spherical-starburst", flare: "spherical starburst", name: "Spherical Starburst" },
  { id: "optics-heavy-vintage", flare: "heavy vintage", name: "Heavy Vintage" },
];

/** Flare option strings, kept in sync with OPTICS_PRESETS. */
export const OPTICS_FLARE_OPTIONS: string[] = OPTICS_PRESETS.map((preset) => preset.flare);
