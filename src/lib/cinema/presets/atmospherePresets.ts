/**
 * FUSE Cinema — atmosphere preset code data (no DB).
 */

import type { AtmosphereSetup } from "@/lib/cinema/types";

import type { CinemaControlValidation, PreviewMedia } from "@/lib/cinema/previewTypes";
export type AtmospherePreset = {
  id: string;
  name: string;
  hint: string;
  /** Default intensity 0–100 when first selected. */
  defaultIntensity: number;
  value: Omit<AtmosphereSetup, "presetId" | "presetName" | "intensity">;  /** CV1: optional standardized visual preview (gradients are fallback-only). */
  preview?: PreviewMedia;
  /** CV1: optional cross-model validation record. */
  validation?: CinemaControlValidation;
};

export const ATMOSPHERE_PRESETS: AtmospherePreset[] = [
  {
    id: "clean",
    name: "Clean",
    hint: "No atmospherics, crisp air",
    defaultIntensity: 0,
    value: { haze: 0, smoke: 0, particles: "none", weather: "clear", timeOfDay: "any" },
  },
  {
    id: "dust",
    name: "Dust",
    hint: "Dry airborne dust in the beams",
    defaultIntensity: 35,
    value: { haze: 20, smoke: 0, particles: "fine dust", weather: "dry", timeOfDay: "any" },
  },
  {
    id: "light-haze",
    name: "Light Haze",
    hint: "Subtle atmospheric separation",
    defaultIntensity: 25,
    value: { haze: 25, smoke: 0, particles: "none", weather: "clear", timeOfDay: "any" },
  },
  {
    id: "heavy-haze",
    name: "Heavy Haze",
    hint: "Thick air, strong depth falloff",
    defaultIntensity: 70,
    value: { haze: 70, smoke: 10, particles: "none", weather: "hazy", timeOfDay: "any" },
  },
  {
    id: "smoke",
    name: "Smoke",
    hint: "Rolling smoke, defined tendrils",
    defaultIntensity: 60,
    value: { haze: 30, smoke: 65, particles: "smoke", weather: "still", timeOfDay: "night" },
  },
  {
    id: "fog",
    name: "Fog",
    hint: "Dense ground fog, low visibility",
    defaultIntensity: 75,
    value: { haze: 80, smoke: 15, particles: "fog", weather: "foggy", timeOfDay: "dawn" },
  },
  {
    id: "mist",
    name: "Mist",
    hint: "Fine suspended moisture",
    defaultIntensity: 40,
    value: { haze: 45, smoke: 0, particles: "mist", weather: "damp", timeOfDay: "dawn" },
  },
  {
    id: "rain",
    name: "Rain",
    hint: "Steady rainfall, wet surfaces",
    defaultIntensity: 45,
    value: { haze: 25, smoke: 0, particles: "raindrops", weather: "rain", timeOfDay: "any" },
  },
  {
    id: "heavy-rain",
    name: "Heavy Rain",
    hint: "Downpour, spray and streaks",
    defaultIntensity: 85,
    value: { haze: 40, smoke: 0, particles: "heavy rain", weather: "storm", timeOfDay: "night" },
  },
  {
    id: "snow",
    name: "Snow",
    hint: "Falling snowflakes, cold air",
    defaultIntensity: 50,
    value: { haze: 30, smoke: 0, particles: "snowflakes", weather: "snow", timeOfDay: "any" },
  },
  {
    id: "steam",
    name: "Steam",
    hint: "Rising steam plumes",
    defaultIntensity: 55,
    value: { haze: 35, smoke: 40, particles: "steam", weather: "humid", timeOfDay: "night" },
  },
  {
    id: "club-haze",
    name: "Club Haze",
    hint: "Nightclub haze, beam-friendly",
    defaultIntensity: 65,
    value: { haze: 60, smoke: 45, particles: "haze", weather: "indoor", timeOfDay: "night" },
  },
  {
    id: "volumetric-rays",
    name: "Volumetric Rays",
    hint: "God rays cutting the atmosphere",
    defaultIntensity: 60,
    value: { haze: 55, smoke: 20, particles: "light shafts", weather: "clear", timeOfDay: "golden hour" },
  },
  {
    id: "floating-particulates",
    name: "Floating Particulates",
    hint: "Glinting motes drifting in air",
    defaultIntensity: 45,
    value: { haze: 30, smoke: 0, particles: "floating particulates", weather: "still", timeOfDay: "any" },
  },
];
