/**
 * FUSE Cinema — adapters that surface builtin CODE presets in the shared
 * preset library UI (`PresetLibrarySection`) alongside user presets.
 */

import type { LibraryPreset } from "../presetLibrary";
import { CAMERA_PRESETS, CAMERA_PRESET_CATEGORIES } from "./cameraPresets";
import { LIGHTING_PRESETS, LIGHTING_PRESET_CATEGORIES } from "./lightingPresets";
import { COLOR_PRESETS, COLOR_PRESET_CATEGORIES } from "./colorPresets";
import { MOVEMENT_PRESETS, MOVEMENT_PRESET_CATEGORIES } from "./movementPresets";
import { FULL_PRESETS, FULL_PRESET_CATEGORIES } from "./fullPresets";

/** Builds a simple CSS gradient from palette swatches (no generated imagery). */
function swatchGradient(hexes: string[]): string | undefined {
  if (hexes.length < 2) return undefined;
  return `linear-gradient(135deg,${hexes.join(",")})`;
}

export const CAMERA_LIBRARY: LibraryPreset[] = CAMERA_PRESETS.map((p) => ({
  id: p.id,
  type: "camera",
  name: p.name,
  category: p.category,
  tags: p.tags,
  thumbnail: p.thumbnail,
  preview: p.preview,
  validation: p.validation,
  config: p.config,
  builtin: true,
}));

export const LIGHTING_LIBRARY: LibraryPreset[] = LIGHTING_PRESETS.map((p) => ({
  id: p.id,
  type: "lighting",
  name: p.name,
  category: p.category,
  tags: p.tags,
  thumbnail: p.thumbnail,
  preview: p.preview,
  validation: p.validation,
  subtitle: p.illuminationStyle,
  config: p.config,
  builtin: true,
}));

export const COLOR_LIBRARY: LibraryPreset[] = COLOR_PRESETS.map((p) => ({
  id: p.id,
  type: "color",
  name: p.name,
  category: p.category,
  tags: p.tags,
  thumbnail: swatchGradient(
    (p.config.color?.value.swatches ?? []).slice(0, 4).map((s) => s.hex),
  ),
  preview: p.preview,
  validation: p.validation,
  config: p.config,
  builtin: true,
}));

export const MOVEMENT_LIBRARY: LibraryPreset[] = MOVEMENT_PRESETS.map((p) => ({
  id: p.id,
  type: "movement",
  name: p.name,
  category: p.category,
  tags: p.tags,
  thumbnail: p.thumbnail,
  preview: p.preview,
  validation: p.validation,
  config: p.config,
  builtin: true,
}));

export const FULL_LIBRARY: LibraryPreset[] = FULL_PRESETS.map((p) => ({
  id: p.id,
  type: "full",
  name: p.name,
  category: p.category,
  tags: p.tags,
  thumbnail: p.thumbnail,
  preview: p.preview,
  validation: p.validation,
  subtitle: p.summary,
  config: p.config,
  builtin: true,
}));

export const CAMERA_LIBRARY_CATEGORIES: string[] = [...CAMERA_PRESET_CATEGORIES];
export const LIGHTING_LIBRARY_CATEGORIES: string[] = [...LIGHTING_PRESET_CATEGORIES];
export const COLOR_LIBRARY_CATEGORIES: string[] = [...COLOR_PRESET_CATEGORIES];
export const MOVEMENT_LIBRARY_CATEGORIES: string[] = [...MOVEMENT_PRESET_CATEGORIES];
export const FULL_LIBRARY_CATEGORIES: string[] = [...FULL_PRESET_CATEGORIES];
