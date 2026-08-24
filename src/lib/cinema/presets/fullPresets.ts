/**
 * FUSE Cinema — builtin COMBINATION (full director) presets.
 *
 * Version-controlled CODE DATA, never database rows and never seeded to
 * Supabase. Each entry spans several DirectorConfig fields so it can be applied
 * whole ("Apply All") or partially ("Camera Only", "Lighting Only", …).
 */

import type {
  ApertureSetup,
  AtmosphereSetup,
  CameraSetup,
  CinemaLight,
  CinemaLightType,
  ColorPalette,
  CompositionSetup,
  FilmSetup,
  LensSetup,
  LightingSetup,
  MovementPreset,
  OpticsSetup,
  PartialDirectorConfig,
} from "../types";

export type FullPresetCategory =
  | "Jewelry"
  | "Luxury"
  | "Streetwear"
  | "Music Video"
  | "Fashion"
  | "Beauty"
  | "Documentary"
  | "Narrative"
  | "Blockbuster";

export type CinemaFullPreset = {
  id: string;
  name: string;
  category: FullPresetCategory;
  tags: string[];
  /** Simple representative gradient (no generated imagery, no credits spent). */
  thumbnail: string;
  /** Short card line. */
  summary: string;
  config: PartialDirectorConfig;
};

export const FULL_PRESET_CATEGORIES: FullPresetCategory[] = [
  "Jewelry",
  "Luxury",
  "Streetwear",
  "Music Video",
  "Fashion",
  "Beauty",
  "Documentary",
  "Narrative",
  "Blockbuster",
];

/* ------------------------------------------------------------------ */
/* Builders — keep every fragment fully typed                          */
/* ------------------------------------------------------------------ */

const camera = (patch: Partial<CameraSetup>): CameraSetup => ({
  body: "modern cinema camera",
  sensor: "super35",
  aspectRatio: "9:16",
  height: "eye-level",
  angle: "straight-on",
  distance: "medium",
  ...patch,
});

const lens = (patch: Partial<LensSetup>): LensSetup => ({
  focalLengthMm: 50,
  type: "spherical",
  character: "clean, neutral",
  breathing: 0,
  ...patch,
});

const aperture = (patch: Partial<ApertureSetup>): ApertureSetup => ({
  fStop: 2.8,
  depthOfField: "medium",
  bokeh: "round, neutral",
  ...patch,
});

const film = (patch: Partial<FilmSetup>): FilmSetup => ({
  format: "digital",
  grain: 0,
  frameRate: 24,
  shutterAngle: 180,
  ...patch,
});

const move = (patch: Partial<MovementPreset>): MovementPreset => ({
  motionType: "static",
  direction: "none",
  speed: "slow",
  range: 0,
  maxDegrees: 0,
  easing: "ease-in-out",
  tracking: "none",
  parallax: 0,
  roll: 0,
  heightChange: 0,
  focusBehavior: "locked",
  endBehavior: "settle",
  envelope: { maxOrbit: 0, geometryRequirements: [] },
  ...patch,
});

const comp = (patch: Partial<CompositionSetup>): CompositionSetup => ({
  framing: "medium shot",
  rule: "centered",
  subjectPlacement: "center",
  ...patch,
});

let lightSeq = 0;
const light = (type: CinemaLightType, patch: Partial<CinemaLight>): CinemaLight => ({
  id: `full-light-${(lightSeq += 1)}`,
  type,
  position: "camera left",
  direction: "toward subject",
  height: "above",
  size: 60,
  intensity: 70,
  temperature: 5600,
  tint: 0,
  hardness: 40,
  falloff: "medium",
  ...patch,
});

const rig = (mood: string, ratio: string, lights: CinemaLight[]): LightingSetup => ({
  lights,
  ratio,
  mood,
});

const palette = (patch: Partial<ColorPalette>): ColorPalette => ({
  swatches: [],
  shadowHue: "neutral",
  midtoneHue: "neutral",
  highlightHue: "neutral",
  temperature: 0,
  tint: 0,
  contrast: 0,
  saturation: 0,
  blackBehavior: "neutral",
  highlightBehavior: "neutral",
  skinToneTreatment: "natural",
  ...patch,
});

const optics = (patch: Partial<OpticsSetup>): OpticsSetup => ({
  flare: "none",
  diffusion: 0,
  halation: 0,
  chromaticAberration: 0,
  vignette: 0,
  distortion: 0,
  ...patch,
});

const air = (patch: Partial<AtmosphereSetup>): AtmosphereSetup => ({
  haze: 0,
  smoke: 0,
  particles: "none",
  weather: "clear",
  timeOfDay: "unspecified",
  ...patch,
});

type FragmentInput = {
  filmSetup?: FilmSetup;
  camera?: CameraSetup;
  lens?: LensSetup;
  aperture?: ApertureSetup;
  movement?: MovementPreset;
  composition?: CompositionSetup;
  lighting?: LightingSetup;
  color?: ColorPalette;
  optics?: OpticsSetup;
  atmosphere?: AtmosphereSetup;
};

const fragment = (input: FragmentInput): PartialDirectorConfig => {
  const out: Record<string, unknown> = {};
  (Object.keys(input) as Array<keyof FragmentInput>).forEach((field) => {
    const value = input[field];
    if (value === undefined) return;
    out[field] = { value, source: "PRESET" };
  });
  return out as PartialDirectorConfig;
};

/* ------------------------------------------------------------------ */
/* The curated set                                                     */
/* ------------------------------------------------------------------ */

export const FULL_PRESETS: CinemaFullPreset[] = [
  {
    id: "full-luxury-jewelry-macro",
    name: "Luxury Jewelry Macro",
    category: "Jewelry",
    tags: ["jewelry", "macro", "luxury", "diamond", "product", "sparkle", "tabletop"],
    thumbnail: "linear-gradient(135deg,#1b1b22 0%,#4a4030 55%,#e8d7a8 100%)",
    summary: "Macro tabletop, razor DOF, controlled sparkle, warm metal highlights.",
    config: fragment({
      filmSetup: film({ format: "digital", productionType: "Jewelry Commercial", productionValue: "High-End", tempo: "Slow" }),
      camera: camera({ body: "high-resolution digital cinema", sensor: "full-frame", distance: "extreme close-up", angle: "slight high" }),
      lens: lens({ focalLengthMm: 100, type: "macro", character: "clinical macro, flat field", breathing: 5 }),
      aperture: aperture({ fStop: 5.6, depthOfField: "razor", bokeh: "tight, creamy" }),
      movement: move({ motionType: "orbit", direction: "clockwise", speed: "very-slow", range: 0.12, maxDegrees: 8, tracking: "subject", envelope: { maxOrbit: 10, geometryRequirements: ["turntable"] } }),
      composition: comp({ framing: "extreme close-up", rule: "centered", subjectPlacement: "center", negativeSpace: 35 }),
      lighting: rig("precise, jewel-forward", "3:1", [
        light("softbox", { position: "3/4 front camera left", size: 80, intensity: 85, hardness: 20 }),
        light("strip", { position: "camera right raking", direction: "raking", size: 30, intensity: 55, hardness: 65 }),
        light("point", { position: "top center", height: "overhead", size: 8, intensity: 95, hardness: 95, falloff: "fast" }),
        light("negative-fill", { position: "camera left low", intensity: 25, hardness: 10 }),
      ]),
      color: palette({ shadowHue: "cool neutral", midtoneHue: "warm", highlightHue: "champagne", contrast: 30, saturation: 8, temperature: 8, blackBehavior: "filmic", highlightBehavior: "bloomed", dominantHues: ["champagne", "graphite"] }),
      optics: optics({ flare: "subtle 4-point", diffusion: 12, halation: 18, vignette: 20, jewelry: { sparkle: 78, whiteBrilliance: 72, rainbowFire: 45, glintSize: 30, glintCoverage: 40, bloom: 25, starburst: 35, fireSaturation: 40 } }),
      atmosphere: air({ haze: 5, timeOfDay: "studio" }),
    }),
  },
  {
    id: "full-frosted-jewelry-showroom",
    name: "Frosted Jewelry Showroom",
    category: "Jewelry",
    tags: ["jewelry", "showroom", "soft", "clean", "retail", "white", "diffused"],
    thumbnail: "linear-gradient(135deg,#f4f6f8 0%,#dbe3ea 60%,#a9b7c4 100%)",
    summary: "Bright frosted acrylic showroom — soft wrap, clean whites, gentle glints.",
    config: fragment({
      filmSetup: film({ productionType: "Product Macro", productionValue: "Commercial", tempo: "Slow" }),
      camera: camera({ body: "commercial medium format digital", sensor: "medium-format", distance: "close-up" }),
      lens: lens({ focalLengthMm: 85, type: "macro", character: "clean, high micro-contrast" }),
      aperture: aperture({ fStop: 8, depthOfField: "medium", bokeh: "smooth" }),
      movement: move({ motionType: "push-in", direction: "forward", speed: "very-slow", range: 0.15, tracking: "subject", focusBehavior: "follow-focus" }),
      composition: comp({ framing: "close-up", rule: "centered", negativeSpace: 45 }),
      lighting: rig("airy, frosted", "2:1", [
        light("softbox", { position: "overhead front", height: "top", size: 95, intensity: 80, hardness: 10 }),
        light("window", { position: "camera left", size: 90, intensity: 60, hardness: 15 }),
        light("bounce", { position: "camera right", size: 85, intensity: 45, hardness: 5 }),
      ]),
      color: palette({ shadowHue: "cool", midtoneHue: "neutral", highlightHue: "clean white", contrast: 12, saturation: -5, temperature: -6, blackBehavior: "lifted", highlightBehavior: "rolled-off", skinToneTreatment: "porcelain" }),
      optics: optics({ flare: "none", diffusion: 20, vignette: 8, jewelry: { sparkle: 55, whiteBrilliance: 80, rainbowFire: 25, glintSize: 22, glintCoverage: 55, bloom: 30, starburst: 12, fireSaturation: 20 } }),
      atmosphere: air({ timeOfDay: "studio" }),
    }),
  },
  {
    id: "full-black-void-diamond",
    name: "Black Void Diamond",
    category: "Jewelry",
    tags: ["jewelry", "diamond", "black", "dramatic", "contrast", "void", "fire"],
    thumbnail: "linear-gradient(135deg,#000000 0%,#101018 60%,#7f8cff 100%)",
    summary: "Pure black field, single hard specular, maximum fire and starburst.",
    config: fragment({
      filmSetup: film({ productionType: "Jewelry Commercial", productionValue: "High-End", tempo: "Very Slow" }),
      camera: camera({ body: "high-resolution digital cinema", sensor: "full-frame", distance: "extreme close-up" }),
      lens: lens({ focalLengthMm: 120, type: "macro", character: "long macro, compressed" }),
      aperture: aperture({ fStop: 4, depthOfField: "razor", bokeh: "tight" }),
      movement: move({ motionType: "orbit", direction: "counter-clockwise", speed: "very-slow", range: 0.1, maxDegrees: 6, tracking: "subject", envelope: { maxOrbit: 8, geometryRequirements: ["turntable"] } }),
      composition: comp({ framing: "extreme close-up", rule: "centered", negativeSpace: 65 }),
      lighting: rig("void specular", "8:1", [
        light("point", { position: "3/4 front camera right", size: 5, intensity: 100, hardness: 100, falloff: "fast" }),
        light("strip", { position: "behind rim", direction: "raking", size: 20, intensity: 40, hardness: 80 }),
        light("negative-fill", { position: "surround", intensity: 5, hardness: 0 }),
      ]),
      color: palette({ shadowHue: "pure black", midtoneHue: "cool", highlightHue: "icy blue", contrast: 55, saturation: 15, temperature: -12, blackBehavior: "crushed", highlightBehavior: "clipped", dominantHues: ["black", "ice blue"] }),
      optics: optics({ flare: "hard 6-point", diffusion: 5, halation: 25, chromaticAberration: 12, vignette: 45, jewelry: { sparkle: 95, whiteBrilliance: 85, rainbowFire: 90, glintSize: 40, glintCoverage: 30, bloom: 40, starburst: 80, fireSaturation: 80 } }),
      atmosphere: air({ haze: 0, timeOfDay: "night" }),
    }),
  },
  {
    id: "full-auction-catalog",
    name: "Auction Catalog",
    category: "Luxury",
    tags: ["catalog", "documentation", "neutral", "archival", "auction", "even", "truthful"],
    thumbnail: "linear-gradient(135deg,#e9e6df 0%,#cfc9bd 55%,#8d8578 100%)",
    summary: "Neutral archival documentation — even light, honest color, zero styling.",
    config: fragment({
      filmSetup: film({ productionType: "Editorial", productionValue: "Standard", tempo: "Static" }),
      camera: camera({ body: "commercial medium format digital", sensor: "medium-format", distance: "medium close-up", angle: "straight-on" }),
      lens: lens({ focalLengthMm: 80, type: "spherical", character: "corrected, distortion-free" }),
      aperture: aperture({ fStop: 11, depthOfField: "deep", bokeh: "neutral" }),
      movement: move({ motionType: "static" }),
      composition: comp({ framing: "product plate", rule: "centered", negativeSpace: 30 }),
      lighting: rig("even documentation", "1.5:1", [
        light("softbox", { position: "camera left 45°", size: 90, intensity: 75, hardness: 15 }),
        light("softbox", { position: "camera right 45°", size: 90, intensity: 60, hardness: 15 }),
        light("background", { position: "behind", size: 100, intensity: 50, hardness: 5 }),
      ]),
      color: palette({ contrast: 0, saturation: 0, temperature: 0, blackBehavior: "neutral", highlightBehavior: "neutral" }),
      optics: optics({ flare: "none", diffusion: 0, vignette: 0 }),
      atmosphere: air({ timeOfDay: "studio" }),
    }),
  },
  {
    id: "full-y2k-digicam",
    name: "Y2K Digicam",
    category: "Streetwear",
    tags: ["y2k", "digicam", "2000s", "flash", "lofi", "nostalgic", "compact"],
    thumbnail: "linear-gradient(135deg,#2b2f3a 0%,#7d8ea1 55%,#f0e6c8 100%)",
    summary: "Small-sensor compact look — hard on-camera flash, crunchy lo-fi color.",
    config: fragment({
      filmSetup: film({ format: "early digital compact", grain: 35, productionType: "UGC", era: "2000s", productionValue: "Lo-Fi", tempo: "Fast" }),
      camera: camera({ body: "early digital compact", sensor: "small sensor", sensorNoise: "high, blotchy", distance: "medium", angle: "handheld eye-level" }),
      lens: lens({ focalLengthMm: 28, type: "spherical", character: "soft corners, slight barrel", breathing: 25 }),
      aperture: aperture({ fStop: 4, depthOfField: "deep", bokeh: "busy" }),
      movement: move({ motionType: "handheld", direction: "drift", speed: "medium", range: 0.3, easing: "linear", tracking: "subject", parallax: 20, roll: 6 }),
      composition: comp({ framing: "medium shot", rule: "snapshot", subjectPlacement: "off-center", tiltDegrees: 4 }),
      lighting: rig("hard on-camera flash", "4:1", [
        light("point", { position: "on camera", size: 10, intensity: 100, hardness: 90, falloff: "fast", temperature: 6200 }),
        light("practical", { position: "background", size: 25, intensity: 30, hardness: 60, temperature: 3000 }),
      ]),
      color: palette({ shadowHue: "green", midtoneHue: "cyan", highlightHue: "warm", contrast: 35, saturation: 30, temperature: 5, tint: -10, blackBehavior: "crushed", highlightBehavior: "clipped", grain: 40, sharpness: 65 }),
      optics: optics({ flare: "none", diffusion: 0, chromaticAberration: 25, vignette: 30, distortion: 15 }),
      atmosphere: air({ timeOfDay: "night" }),
    }),
  },
  {
    id: "full-nyc-street-flash",
    name: "NYC Street Flash",
    category: "Streetwear",
    tags: ["street", "flash", "nyc", "night", "urban", "documentary", "harsh"],
    thumbnail: "linear-gradient(135deg,#0d0f14 0%,#243044 55%,#ffd9a0 100%)",
    summary: "Direct flash against sodium-lit streets — harsh subject, falling-off city.",
    config: fragment({
      filmSetup: film({ format: "digital", grain: 20, productionType: "Streetwear Campaign", tempo: "Fast", productionValue: "Guerrilla" }),
      camera: camera({ body: "modern mirrorless", sensor: "full-frame", distance: "medium close-up", angle: "handheld" }),
      lens: lens({ focalLengthMm: 35, type: "spherical", character: "punchy, mild distortion" }),
      aperture: aperture({ fStop: 5.6, depthOfField: "medium", bokeh: "nervous" }),
      movement: move({ motionType: "handheld", direction: "follow", speed: "medium", range: 0.4, tracking: "subject", parallax: 30, roll: 4, endBehavior: "continue" }),
      composition: comp({ framing: "medium shot", rule: "off-center", subjectPlacement: "left third", leadRoomAmount: 60 }),
      lighting: rig("direct flash, city falloff", "6:1", [
        light("point", { position: "on camera", size: 12, intensity: 100, hardness: 85, falloff: "fast", temperature: 5800 }),
        light("practical", { position: "street background", size: 40, intensity: 45, hardness: 55, temperature: 2600 }),
        light("neon", { position: "background left", size: 30, intensity: 40, hardness: 70, temperature: 4200, tint: 40 }),
      ]),
      color: palette({ shadowHue: "cyan", midtoneHue: "neutral", highlightHue: "sodium amber", contrast: 40, saturation: 22, temperature: 10, blackBehavior: "crushed", highlightBehavior: "clipped", dominantHues: ["amber", "teal"] }),
      optics: optics({ flare: "streak", diffusion: 8, halation: 22, chromaticAberration: 10, vignette: 25 }),
      atmosphere: air({ haze: 20, particles: "light drizzle", weather: "wet streets", timeOfDay: "night" }),
    }),
  },
  {
    id: "full-90s-music-video",
    name: "90s Music Video",
    category: "Music Video",
    tags: ["90s", "music video", "film", "wide", "energetic", "retro", "anamorphic"],
    thumbnail: "linear-gradient(135deg,#1a1420 0%,#5a3b6b 55%,#f2b45c 100%)",
    summary: "Anamorphic 90s energy — hard key, saturated film stock, roving camera.",
    config: fragment({
      filmSetup: film({ format: "35mm film", stock: "high-saturation negative", grain: 45, productionType: "Music Video", era: "1990s", tempo: "High Energy" }),
      camera: camera({ body: "35mm film camera", sensor: "35mm", distance: "wide", angle: "low" }),
      lens: lens({ focalLengthMm: 32, type: "anamorphic", character: "oval bokeh, blue streak", breathing: 15 }),
      aperture: aperture({ fStop: 2.8, depthOfField: "medium", bokeh: "oval" }),
      movement: move({ motionType: "orbit", direction: "clockwise", speed: "fast", range: 0.6, maxDegrees: 180, tracking: "subject", parallax: 55, roll: 10, envelope: { maxOrbit: 200, geometryRequirements: ["open floor"] } }),
      composition: comp({ framing: "wide shot", rule: "dynamic", subjectPlacement: "center", tiltDegrees: 6 }),
      lighting: rig("hard theatrical", "5:1", [
        light("fresnel", { position: "3/4 front camera right", size: 25, intensity: 95, hardness: 85 }),
        light("rim", { position: "back left", size: 20, intensity: 70, hardness: 80, temperature: 7000 }),
        light("background", { position: "cyc", size: 100, intensity: 45, hardness: 20, temperature: 3200 }),
      ]),
      color: palette({ shadowHue: "magenta", midtoneHue: "warm", highlightHue: "amber", contrast: 45, saturation: 40, temperature: 12, blackBehavior: "filmic", highlightBehavior: "bloomed", grain: 50, halation: 40 }),
      optics: optics({ flare: "anamorphic streak", diffusion: 25, halation: 40, vignette: 30 }),
      atmosphere: air({ haze: 30, smoke: 35, particles: "atmospheric smoke", timeOfDay: "night" }),
    }),
  },
  {
    id: "full-2000s-dvd",
    name: "2000s DVD",
    category: "Music Video",
    tags: ["2000s", "dvd", "interlaced", "video", "sharp", "shiny", "retro"],
    thumbnail: "linear-gradient(135deg,#101820 0%,#2f5d7c 55%,#d8e6f0 100%)",
    summary: "Interlaced video sheen — over-sharp, cool highlights, glossy surfaces.",
    config: fragment({
      filmSetup: film({ format: "standard-def video", grain: 15, frameRate: 30, shutterAngle: 180, productionType: "Music Video", era: "2000s", tempo: "Fast" }),
      camera: camera({ body: "prosumer video camcorder", sensor: "2/3-inch", sensorNoise: "fine video noise", distance: "medium" }),
      lens: lens({ focalLengthMm: 24, type: "spherical", character: "video-sharp, wide" }),
      aperture: aperture({ fStop: 4, depthOfField: "deep", bokeh: "harsh" }),
      movement: move({ motionType: "zoom", direction: "in-out", speed: "fast", range: 0.5, easing: "ease-out", tracking: "subject", focusBehavior: "breathing" }),
      composition: comp({ framing: "medium wide", rule: "centered", subjectPlacement: "center" }),
      lighting: rig("bright glossy", "3:1", [
        light("led-panel", { position: "front camera left", size: 60, intensity: 90, hardness: 45, temperature: 6500 }),
        light("kicker", { position: "back right", size: 20, intensity: 65, hardness: 75, temperature: 7200 }),
        light("background", { position: "behind", size: 80, intensity: 55, hardness: 30, temperature: 8000 }),
      ]),
      color: palette({ shadowHue: "blue", midtoneHue: "cool", highlightHue: "white", contrast: 30, saturation: 25, temperature: -14, blackBehavior: "lifted", highlightBehavior: "clipped", sharpness: 85 }),
      optics: optics({ flare: "small polygonal", diffusion: 0, chromaticAberration: 8, vignette: 5, bloom: 25 }),
      atmosphere: air({ timeOfDay: "studio" }),
    }),
  },
  {
    id: "full-gritty-documentary",
    name: "Gritty Documentary",
    category: "Documentary",
    tags: ["documentary", "verite", "handheld", "natural", "gritty", "available light"],
    thumbnail: "linear-gradient(135deg,#1f2020 0%,#4c4a42 55%,#b6ad97 100%)",
    summary: "Available-light vérité — handheld, desaturated, honest and unglamorous.",
    config: fragment({
      filmSetup: film({ format: "digital", grain: 30, productionType: "Documentary", tempo: "Observational", productionValue: "Run-and-Gun" }),
      camera: camera({ body: "documentary digital camera", sensor: "super35", distance: "medium", angle: "handheld eye-level" }),
      lens: lens({ focalLengthMm: 24, type: "spherical", character: "unremarkable, honest" }),
      aperture: aperture({ fStop: 2, depthOfField: "medium", bokeh: "plain" }),
      movement: move({ motionType: "handheld", direction: "reactive", speed: "medium", range: 0.35, easing: "linear", tracking: "subject", parallax: 25, roll: 3, focusBehavior: "follow-focus", endBehavior: "continue" }),
      composition: comp({ framing: "medium shot", rule: "reactive", subjectPlacement: "off-center", headroomAmount: 40 }),
      lighting: rig("available light", "3:1", [
        light("window", { position: "camera right", size: 85, intensity: 65, hardness: 35, temperature: 6000 }),
        light("ambient", { position: "room", size: 100, intensity: 30, hardness: 10, temperature: 3400 }),
      ]),
      color: palette({ shadowHue: "green", midtoneHue: "neutral", highlightHue: "neutral", contrast: 18, saturation: -22, temperature: -2, blackBehavior: "lifted", highlightBehavior: "rolled-off", skinToneTreatment: "desaturated", grain: 35 }),
      optics: optics({ flare: "none", diffusion: 0, vignette: 12 }),
      atmosphere: air({ haze: 10, timeOfDay: "day" }),
    }),
  },
  {
    id: "full-neon-club",
    name: "Neon Club",
    category: "Music Video",
    tags: ["neon", "club", "night", "smoke", "magenta", "cyan", "party"],
    thumbnail: "linear-gradient(135deg,#0a0512 0%,#7a15a5 55%,#18d7e0 100%)",
    summary: "Magenta/cyan club haze — practical neon, smoke beams, hot rim light.",
    config: fragment({
      filmSetup: film({ format: "digital", grain: 22, productionType: "Music Video", tempo: "High Energy" }),
      camera: camera({ body: "low-light digital cinema", sensor: "full-frame", distance: "medium close-up", angle: "low" }),
      lens: lens({ focalLengthMm: 40, type: "anamorphic", character: "flarey, dreamy" }),
      aperture: aperture({ fStop: 1.8, depthOfField: "shallow", bokeh: "oval, swirly" }),
      movement: move({ motionType: "dolly", direction: "lateral", speed: "medium", range: 0.45, tracking: "subject", parallax: 45, roll: 5 }),
      composition: comp({ framing: "medium close-up", rule: "off-center", subjectPlacement: "right third", negativeSpace: 40 }),
      lighting: rig("neon practicals", "4:1", [
        light("neon", { position: "background left", size: 45, intensity: 80, hardness: 60, temperature: 4000, tint: 70 }),
        light("neon", { position: "background right", size: 45, intensity: 70, hardness: 60, temperature: 8500, tint: -40 }),
        light("rim", { position: "back center", size: 18, intensity: 85, hardness: 85, temperature: 9000 }),
        light("fill", { position: "front camera left", size: 70, intensity: 25, hardness: 20, temperature: 3000 }),
      ]),
      color: palette({ shadowHue: "cyan", midtoneHue: "magenta", highlightHue: "hot pink", contrast: 42, saturation: 48, temperature: -6, tint: 25, blackBehavior: "crushed", highlightBehavior: "bloomed", dominantHues: ["magenta", "cyan"] }),
      optics: optics({ flare: "anamorphic blue streak", diffusion: 35, halation: 45, chromaticAberration: 15, vignette: 35, bloom: 45 }),
      atmosphere: air({ haze: 45, smoke: 60, particles: "haze beams", timeOfDay: "night" }),
    }),
  },
  {
    id: "full-fashion-editorial",
    name: "Fashion Editorial",
    category: "Fashion",
    tags: ["fashion", "editorial", "graphic", "clean", "hard light", "magazine"],
    thumbnail: "linear-gradient(135deg,#efe9e3 0%,#c8b6ab 55%,#3c332f 100%)",
    summary: "Graphic editorial hard key on seamless — sculpted shadow, muted skin.",
    config: fragment({
      filmSetup: film({ format: "digital", productionType: "Fashion Film", productionValue: "High-End", tempo: "Deliberate" }),
      camera: camera({ body: "commercial medium format digital", sensor: "medium-format", distance: "medium", angle: "straight-on" }),
      lens: lens({ focalLengthMm: 85, type: "spherical", character: "crisp, flattering" }),
      aperture: aperture({ fStop: 8, depthOfField: "medium", bokeh: "clean" }),
      movement: move({ motionType: "pedestal", direction: "up", speed: "slow", range: 0.2, tracking: "subject" }),
      composition: comp({ framing: "full shot", rule: "graphic symmetry", subjectPlacement: "center", negativeSpace: 50 }),
      lighting: rig("hard editorial key", "6:1", [
        light("fresnel", { position: "front high", height: "top", size: 20, intensity: 95, hardness: 90, falloff: "medium" }),
        light("negative-fill", { position: "both sides", intensity: 10, hardness: 0 }),
        light("background", { position: "seamless wall", size: 100, intensity: 40, hardness: 15 }),
      ]),
      color: palette({ shadowHue: "cool taupe", midtoneHue: "neutral", highlightHue: "bone", contrast: 32, saturation: -12, temperature: -3, blackBehavior: "filmic", highlightBehavior: "rolled-off", skinToneTreatment: "cool" }),
      optics: optics({ flare: "none", diffusion: 10, vignette: 10 }),
      atmosphere: air({ timeOfDay: "studio" }),
    }),
  },
  {
    id: "full-commercial-beauty",
    name: "Commercial Beauty",
    category: "Beauty",
    tags: ["beauty", "commercial", "glow", "soft", "skin", "flawless", "ring light"],
    thumbnail: "linear-gradient(135deg,#fff2ec 0%,#f3cfc2 55%,#c98c86 100%)",
    summary: "Wrapped beauty glow — big soft frontal source, luminous flawless skin.",
    config: fragment({
      filmSetup: film({ format: "digital", productionType: "Beauty Commercial", productionValue: "High-End", tempo: "Slow" }),
      camera: camera({ body: "high-resolution digital cinema", sensor: "full-frame", distance: "close-up" }),
      lens: lens({ focalLengthMm: 100, type: "macro", character: "flattering, low distortion" }),
      aperture: aperture({ fStop: 4, depthOfField: "shallow", bokeh: "creamy round" }),
      movement: move({ motionType: "push-in", direction: "forward", speed: "very-slow", range: 0.12, tracking: "subject", focusBehavior: "follow-focus" }),
      composition: comp({ framing: "close-up", rule: "centered", subjectPlacement: "center", headroomAmount: 35 }),
      lighting: rig("wrapped beauty glow", "1.5:1", [
        light("softbox", { position: "front above", height: "above", size: 100, intensity: 90, hardness: 8 }),
        light("bounce", { position: "front below", height: "below", size: 90, intensity: 55, hardness: 5 }),
        light("kicker", { position: "back both sides", size: 25, intensity: 45, hardness: 60, temperature: 6500 }),
      ]),
      color: palette({ shadowHue: "warm neutral", midtoneHue: "peach", highlightHue: "cream", contrast: 10, saturation: 8, temperature: 6, blackBehavior: "lifted", highlightBehavior: "bloomed", skinToneTreatment: "golden", highlights: 65, fade: 12 }),
      optics: optics({ flare: "soft glow", diffusion: 40, halation: 20, vignette: 12, bloom: 40 }),
      atmosphere: air({ timeOfDay: "studio" }),
    }),
  },
  {
    id: "full-horror-fluorescent",
    name: "Horror Fluorescent",
    category: "Narrative",
    tags: ["horror", "fluorescent", "green", "cold", "unsettling", "institutional"],
    thumbnail: "linear-gradient(135deg,#050806 0%,#1d3326 55%,#a9d8a0 100%)",
    summary: "Institutional overhead fluorescents — sickly green, top-down dread.",
    config: fragment({
      filmSetup: film({ format: "digital", grain: 28, productionType: "Narrative Film", genre: "Horror", tempo: "Slow" }),
      camera: camera({ body: "digital cinema camera", sensor: "super35", distance: "medium wide", angle: "slight low" }),
      lens: lens({ focalLengthMm: 21, type: "spherical", character: "wide, uneasy" }),
      aperture: aperture({ fStop: 2.8, depthOfField: "deep", bokeh: "hard-edged" }),
      movement: move({ motionType: "dolly", direction: "forward", speed: "very-slow", range: 0.3, easing: "linear", tracking: "point-of-interest", endBehavior: "continue" }),
      composition: comp({ framing: "medium wide", rule: "centered corridor", subjectPlacement: "center", negativeSpace: 55 }),
      lighting: rig("overhead fluorescent", "5:1", [
        light("tube", { position: "overhead run", height: "overhead", size: 70, intensity: 85, hardness: 45, temperature: 4300, tint: 45 }),
        light("practical", { position: "far end", size: 25, intensity: 30, hardness: 65, temperature: 3000 }),
        light("negative-fill", { position: "sides", intensity: 5, hardness: 0 }),
      ]),
      color: palette({ shadowHue: "green", midtoneHue: "sickly green", highlightHue: "cold white", contrast: 38, saturation: -8, temperature: -8, tint: 35, blackBehavior: "crushed", highlightBehavior: "clipped", skinToneTreatment: "desaturated", grain: 35 }),
      optics: optics({ flare: "none", diffusion: 5, chromaticAberration: 8, vignette: 40, distortion: 10 }),
      atmosphere: air({ haze: 25, particles: "dust", timeOfDay: "night" }),
    }),
  },
  {
    id: "full-crime-noir",
    name: "Crime Noir",
    category: "Narrative",
    tags: ["noir", "crime", "shadow", "hard light", "venetian", "moody", "chiaroscuro"],
    thumbnail: "linear-gradient(135deg,#000000 0%,#1c2430 55%,#d9c58a 100%)",
    summary: "Chiaroscuro noir — hard slashes of light, deep blacks, smoke in the air.",
    config: fragment({
      filmSetup: film({ format: "35mm film", stock: "high-contrast", grain: 40, productionType: "Narrative Film", genre: "Crime", tempo: "Deliberate" }),
      camera: camera({ body: "35mm film camera", sensor: "35mm", distance: "medium close-up", angle: "low" }),
      lens: lens({ focalLengthMm: 40, type: "spherical", character: "vintage, gentle falloff" }),
      aperture: aperture({ fStop: 2, depthOfField: "shallow", bokeh: "soft vintage" }),
      movement: move({ motionType: "truck", direction: "lateral", speed: "slow", range: 0.25, tracking: "subject", parallax: 35 }),
      composition: comp({ framing: "medium close-up", rule: "off-center", subjectPlacement: "left third", tiltDegrees: 2 }),
      lighting: rig("hard chiaroscuro", "8:1", [
        light("fresnel", { position: "side camera right", size: 15, intensity: 95, hardness: 95, falloff: "fast" }),
        light("rim", { position: "back left", size: 12, intensity: 60, hardness: 90, temperature: 6800 }),
        light("negative-fill", { position: "camera left", intensity: 3, hardness: 0 }),
      ]),
      color: palette({ shadowHue: "blue-black", midtoneHue: "cool", highlightHue: "tungsten gold", contrast: 55, saturation: -18, temperature: -5, blackBehavior: "crushed", highlightBehavior: "rolled-off", grain: 45, halation: 30 }),
      optics: optics({ flare: "none", diffusion: 15, halation: 30, vignette: 50 }),
      atmosphere: air({ haze: 35, smoke: 45, particles: "cigarette smoke", weather: "rain outside", timeOfDay: "night" }),
    }),
  },
  {
    id: "full-epic-blockbuster",
    name: "Epic Blockbuster",
    category: "Blockbuster",
    tags: ["epic", "blockbuster", "teal orange", "anamorphic", "scale", "hero"],
    thumbnail: "linear-gradient(135deg,#0b1b26 0%,#1f5b6e 55%,#f09a4a 100%)",
    summary: "Teal-and-orange scale — anamorphic wide, backlit hero, big crane move.",
    config: fragment({
      filmSetup: film({ format: "large-format digital", grain: 12, productionType: "Narrative Film", productionValue: "Blockbuster", tempo: "Building" }),
      camera: camera({ body: "large-format digital cinema", sensor: "large-format", aspectRatio: "9:16", distance: "wide", angle: "low hero" }),
      lens: lens({ focalLengthMm: 35, type: "anamorphic", character: "wide anamorphic, oval highlights", breathing: 10 }),
      aperture: aperture({ fStop: 2.8, depthOfField: "medium", bokeh: "oval, smooth" }),
      movement: move({ motionType: "crane", direction: "up-and-forward", speed: "medium", range: 0.7, maxDegrees: 45, easing: "ease-in-out", tracking: "subject", parallax: 60, heightChange: 50, envelope: { maxOrbit: 60, geometryRequirements: ["open exterior"] } }),
      composition: comp({ framing: "wide shot", rule: "rule of thirds", subjectPlacement: "lower third", horizonPosition: 65, negativeSpace: 55 }),
      lighting: rig("backlit epic", "4:1", [
        light("key", { position: "back 3/4", size: 90, intensity: 100, hardness: 70, temperature: 5200 }),
        light("bounce", { position: "front", size: 100, intensity: 40, hardness: 10, temperature: 4800 }),
        light("ambient", { position: "sky", size: 100, intensity: 55, hardness: 5, temperature: 7500 }),
      ]),
      color: palette({ shadowHue: "teal", midtoneHue: "neutral", highlightHue: "orange", contrast: 40, saturation: 25, temperature: 4, blackBehavior: "filmic", highlightBehavior: "rolled-off", skinToneTreatment: "warm", dominantHues: ["teal", "orange"] }),
      optics: optics({ flare: "anamorphic streak", diffusion: 22, halation: 30, vignette: 25, bloom: 30 }),
      atmosphere: air({ haze: 40, particles: "dust and embers", weather: "dust in air", timeOfDay: "golden hour" }),
    }),
  },
];
