/**
 * FUSE Cinema — builtin LENS presets + focal length / aperture option data.
 *
 * Version-controlled CODE DATA fragments, not database rows. Each preset
 * describes optical CHARACTER, not a hardware claim. No DB seeding.
 */

import type { ApertureSetup, LensSetup, PartialDirectorConfig } from "../types";

export type LensPresetCategory =
  | "Auto"
  | "Spherical"
  | "Vintage"
  | "Anamorphic"
  | "Macro"
  | "Specialty";

export type CinemaLensPreset = {
  id: string;
  name: string;
  category: LensPresetCategory;
  tags: string[];
  /** Simple representative gradient (no generated imagery, no credits spent). */
  thumbnail: string;
  config: PartialDirectorConfig;
};

const lens = (
  value: LensSetup,
  optics?: PartialDirectorConfig["optics"],
): PartialDirectorConfig => ({
  lens: { source: "PRESET", value },
  ...(optics ? { optics } : {}),
});

export const LENS_PRESET_CATEGORIES: LensPresetCategory[] = [
  "Auto",
  "Spherical",
  "Vintage",
  "Anamorphic",
  "Macro",
  "Specialty",
];

export const LENS_PRESETS: CinemaLensPreset[] = [
  {
    id: "lens-auto",
    name: "Auto",
    category: "Auto",
    tags: ["auto", "neutral"],
    thumbnail: "linear-gradient(135deg,#1a1d21,#3f464d)",
    config: lens({ focalLengthMm: 50, type: "spherical", character: "auto", breathing: 0 }),
  },
  {
    id: "lens-clean-spherical",
    name: "Clean / Clinical Spherical",
    category: "Spherical",
    tags: ["clean", "sharp", "commercial"],
    thumbnail: "linear-gradient(135deg,#181c20,#48525c)",
    config: lens(
      { focalLengthMm: 50, type: "spherical", character: "clean, clinical, high micro-contrast", breathing: 0 },
      { source: "PRESET", value: { flare: "none", diffusion: 0, halation: 0, chromaticAberration: 0, vignette: 0, distortion: 0 } },
    ),
  },
  {
    id: "lens-cooke-warm",
    name: "Cooke Warm",
    category: "Spherical",
    tags: ["warm", "flattering", "skin"],
    thumbnail: "linear-gradient(135deg,#221a15,#6d5238)",
    config: lens({ focalLengthMm: 65, type: "spherical", character: "warm, gentle falloff, flattering skin", breathing: 10 }),
  },
  {
    id: "lens-zeiss",
    name: "Zeiss",
    category: "Spherical",
    tags: ["neutral", "contrast", "precise"],
    thumbnail: "linear-gradient(135deg,#151a1f,#3f4f60)",
    config: lens({ focalLengthMm: 35, type: "spherical", character: "neutral, high contrast, precise", breathing: 5 }),
  },
  {
    id: "lens-leica",
    name: "Leica",
    category: "Spherical",
    tags: ["crisp", "three-dimensional", "editorial"],
    thumbnail: "linear-gradient(135deg,#1b1618,#5d3a40)",
    config: lens({ focalLengthMm: 50, type: "spherical", character: "crisp with dimensional rendering", breathing: 6 }),
  },
  {
    id: "lens-vintage-warm",
    name: "Vintage Warm / Haze",
    category: "Vintage",
    tags: ["vintage", "haze", "soft"],
    thumbnail: "linear-gradient(135deg,#241c14,#8a6a42)",
    config: lens(
      { focalLengthMm: 58, type: "spherical", character: "vintage warm with veiling haze", breathing: 18 },
      { source: "PRESET", value: { flare: "soft warm", diffusion: 40, halation: 35, chromaticAberration: 18, vignette: 30, distortion: 8 } },
    ),
  },
  {
    id: "lens-canon-fd",
    name: "Canon FD",
    category: "Vintage",
    tags: ["vintage", "warm", "soft-corners"],
    thumbnail: "linear-gradient(135deg,#221b17,#7a5b3c)",
    config: lens({ focalLengthMm: 55, type: "spherical", character: "vintage FD warmth, soft corners", breathing: 20 }),
  },
  {
    id: "lens-helios-swirl",
    name: "Helios Swirl",
    category: "Vintage",
    tags: ["swirly-bokeh", "vintage", "character"],
    thumbnail: "linear-gradient(135deg,#1c1a24,#5f4a7a)",
    config: lens({ focalLengthMm: 58, type: "spherical", character: "swirly bokeh, low contrast edges", breathing: 22 }),
  },
  {
    id: "lens-halation-vintage",
    name: "Halation Vintage",
    category: "Vintage",
    tags: ["halation", "bloom", "film"],
    thumbnail: "linear-gradient(135deg,#251612,#93472f)",
    config: lens(
      { focalLengthMm: 40, type: "spherical", character: "vintage glass with strong halation bloom", breathing: 16 },
      { source: "PRESET", value: { flare: "warm bloom", diffusion: 30, halation: 70, chromaticAberration: 22, vignette: 35, distortion: 10 } },
    ),
  },
  {
    id: "lens-clean-anamorphic",
    name: "Clean Anamorphic",
    category: "Anamorphic",
    tags: ["anamorphic", "oval-bokeh", "modern"],
    thumbnail: "linear-gradient(135deg,#141b26,#39597f)",
    config: lens({ focalLengthMm: 40, type: "anamorphic", character: "clean anamorphic, oval bokeh", breathing: 12 }),
  },
  {
    id: "lens-vintage-anamorphic",
    name: "Vintage Anamorphic",
    category: "Anamorphic",
    tags: ["anamorphic", "soft", "character"],
    thumbnail: "linear-gradient(135deg,#191d28,#4d5f88)",
    config: lens({ focalLengthMm: 50, type: "anamorphic", character: "vintage anamorphic, soft edges, breathing", breathing: 26 }),
  },
  {
    id: "lens-blue-flare-anamorphic",
    name: "Blue-Flare Anamorphic",
    category: "Anamorphic",
    tags: ["anamorphic", "blue-streak", "cinematic"],
    thumbnail: "linear-gradient(135deg,#101a2c,#2c62b5)",
    config: lens(
      { focalLengthMm: 35, type: "anamorphic", character: "anamorphic with horizontal blue streak flare", breathing: 14 },
      { source: "PRESET", value: { flare: "blue horizontal streak", diffusion: 18, halation: 30, chromaticAberration: 14, vignette: 28, distortion: 6 } },
    ),
  },
  {
    id: "lens-amber-flare-anamorphic",
    name: "Amber-Flare Anamorphic",
    category: "Anamorphic",
    tags: ["anamorphic", "amber-streak", "warm"],
    thumbnail: "linear-gradient(135deg,#2a1a0f,#c07a2a)",
    config: lens(
      { focalLengthMm: 40, type: "anamorphic", character: "anamorphic with amber streak flare", breathing: 14 },
      { source: "PRESET", value: { flare: "amber horizontal streak", diffusion: 20, halation: 40, chromaticAberration: 16, vignette: 26, distortion: 6 } },
    ),
  },
  {
    id: "lens-extreme-macro",
    name: "Extreme Macro",
    category: "Macro",
    tags: ["macro", "detail", "razor-dof"],
    thumbnail: "linear-gradient(135deg,#151a1a,#3a6e63)",
    config: lens({ focalLengthMm: 100, type: "macro", character: "extreme macro, razor depth of field", breathing: 4 }),
  },
  {
    id: "lens-probe-macro",
    name: "Probe Macro",
    category: "Macro",
    tags: ["probe", "immersive", "macro"],
    thumbnail: "linear-gradient(135deg,#171423,#584589)",
    config: lens({ focalLengthMm: 24, type: "macro", character: "probe macro, deep wide macro perspective", breathing: 8 }),
  },
  {
    id: "lens-jewelry-macro",
    name: "Jewelry Macro",
    category: "Macro",
    tags: ["jewelry", "sparkle", "product"],
    thumbnail: "linear-gradient(135deg,#1a1a1e,#8f8a6a)",
    config: lens({ focalLengthMm: 120, type: "macro", character: "jewelry macro, crisp facet rendering", breathing: 2 }),
  },
  {
    id: "lens-tilt-shift",
    name: "Tilt Shift",
    category: "Specialty",
    tags: ["tilt-shift", "plane-of-focus", "miniature"],
    thumbnail: "linear-gradient(135deg,#1a1c17,#5f7a3f)",
    config: lens({ focalLengthMm: 45, type: "tilt-shift", character: "tilted focus plane, selective sharpness", breathing: 6 }),
  },
  {
    id: "lens-fisheye",
    name: "Fisheye",
    category: "Specialty",
    tags: ["fisheye", "distortion", "wide"],
    thumbnail: "linear-gradient(135deg,#141d1f,#2f7a7f)",
    config: lens(
      { focalLengthMm: 8, type: "spherical", character: "fisheye, extreme barrel distortion", breathing: 0 },
      { source: "PRESET", value: { flare: "none", diffusion: 0, halation: 0, chromaticAberration: 20, vignette: 40, distortion: 95 } },
    ),
  },
  {
    id: "lens-soft-fx",
    name: "Soft FX",
    category: "Specialty",
    tags: ["diffusion", "glow", "beauty"],
    thumbnail: "linear-gradient(135deg,#231d22,#8a6f83)",
    config: lens(
      { focalLengthMm: 85, type: "spherical", character: "soft-FX diffusion, glowing highlights", breathing: 10 },
      { source: "PRESET", value: { flare: "soft glow", diffusion: 65, halation: 45, chromaticAberration: 6, vignette: 20, distortion: 2 } },
    ),
  },
];

/** Clickable focal length presets, 8–200mm. */
export const FOCAL_LENGTH_PRESETS = [8, 14, 18, 24, 28, 35, 40, 50, 65, 85, 100, 135, 200];

export const FOCAL_LENGTH_MIN = 8;
export const FOCAL_LENGTH_MAX = 200;

export type ApertureOption = {
  id: string;
  label: string;
  value: ApertureSetup;
};

export const APERTURE_OPTIONS: ApertureOption[] = [
  { id: "f095", label: "f/0.95", value: { fStop: 0.95, depthOfField: "razor", bokeh: "huge, creamy" } },
  { id: "f12", label: "f/1.2", value: { fStop: 1.2, depthOfField: "razor", bokeh: "large, creamy" } },
  { id: "f14", label: "f/1.4", value: { fStop: 1.4, depthOfField: "shallow", bokeh: "large, round" } },
  { id: "f2", label: "f/2", value: { fStop: 2, depthOfField: "shallow", bokeh: "round, smooth" } },
  { id: "f28", label: "f/2.8", value: { fStop: 2.8, depthOfField: "medium", bokeh: "round, neutral" } },
  { id: "f4", label: "f/4", value: { fStop: 4, depthOfField: "medium", bokeh: "defined edges" } },
  { id: "f56", label: "f/5.6", value: { fStop: 5.6, depthOfField: "medium", bokeh: "tight" } },
  { id: "f8", label: "f/8", value: { fStop: 8, depthOfField: "deep", bokeh: "minimal" } },
  { id: "f11", label: "f/11", value: { fStop: 11, depthOfField: "deep", bokeh: "minimal" } },
  { id: "f16", label: "f/16", value: { fStop: 16, depthOfField: "deep", bokeh: "none, diffraction softening" } },
  {
    id: "focus-stacked",
    label: "Focus Stacked",
    value: { fStop: 8, depthOfField: "deep", bokeh: "focus-stacked, uniformly sharp" },
  },
];
