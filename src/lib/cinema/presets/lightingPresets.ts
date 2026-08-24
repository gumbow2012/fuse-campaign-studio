/**
 * FUSE Cinema — builtin LIGHTING presets.
 *
 * Version-controlled CODE DATA fragments, not database rows. Nothing here is
 * seeded to Supabase. Thumbnails are simple CSS gradients (no generated
 * imagery, no credits spent).
 */

import type { CinemaLight, CinemaLightType, PartialDirectorConfig } from "../types";

import type { CinemaControlValidation, PreviewMedia } from "@/lib/cinema/previewTypes";
export type LightingPresetCategory =
  | "Portrait"
  | "Cinema"
  | "Commercial"
  | "Jewelry"
  | "Fashion"
  | "Music Video"
  | "Night"
  | "Natural"
  | "Practical"
  | "Dramatic"
  | "Experimental";

export type CinemaLightingPreset = {
  id: string;
  name: string;
  category: LightingPresetCategory;
  tags: string[];
  /** Short human description of the illumination style, shown on the card. */
  illuminationStyle: string;
  /** Simple representative gradient (no generated imagery, no credits spent). */
  thumbnail: string;
  config: PartialDirectorConfig;  /** CV1: optional standardized visual preview (gradients are fallback-only). */
  preview?: PreviewMedia;
  /** CV1: optional cross-model validation record. */
  validation?: CinemaControlValidation;
};

export const LIGHTING_PRESET_CATEGORIES: LightingPresetCategory[] = [
  "Portrait",
  "Cinema",
  "Commercial",
  "Jewelry",
  "Fashion",
  "Music Video",
  "Night",
  "Natural",
  "Practical",
  "Dramatic",
  "Experimental",
];

export const CINEMA_LIGHT_TYPES: CinemaLightType[] = [
  "key",
  "fill",
  "rim",
  "kicker",
  "background",
  "softbox",
  "strip",
  "point",
  "fresnel",
  "spotlight",
  "window",
  "practical",
  "bounce",
  "negative-fill",
  "ambient",
  "led-panel",
  "tube",
  "neon",
];

export const LIGHT_HEIGHTS: CinemaLight["height"][] = [
  "below",
  "eye-level",
  "above",
  "top",
  "overhead",
];

export const LIGHT_FALLOFFS: CinemaLight["falloff"][] = ["fast", "medium", "slow"];

/** Build a CinemaLight with sane defaults. */
export const makeLight = (
  id: string,
  type: CinemaLightType,
  overrides: Partial<CinemaLight> = {},
): CinemaLight => ({
  id,
  type,
  position: "camera left 45°",
  direction: "toward subject",
  height: "above",
  size: 0.6,
  intensity: 0.8,
  temperature: 5600,
  tint: 0,
  hardness: 0.35,
  falloff: "medium",
  ...overrides,
});

const l = makeLight;

const rig = (
  lights: CinemaLight[],
  ratio: string,
  mood: string,
): PartialDirectorConfig => ({
  lighting: { source: "PRESET", value: { lights, ratio, mood } },
});

const G = {
  soft: "linear-gradient(135deg,#2a2f3a,#8e97a8)",
  warm: "linear-gradient(135deg,#2a1c12,#d99a55)",
  cool: "linear-gradient(135deg,#101c2a,#4f86c6)",
  night: "linear-gradient(135deg,#070b14,#22406b)",
  hard: "linear-gradient(135deg,#0c0c0c,#f2f2f2)",
  jewel: "linear-gradient(135deg,#0b0b0f,#cfd6ff 45%,#f6e7c1)",
  neon: "linear-gradient(135deg,#1a0a2a,#ff3fa4 55%,#2ee9ff)",
  fashion: "linear-gradient(135deg,#1c1c22,#e8dcc9)",
  green: "linear-gradient(135deg,#101a12,#8fc7a1)",
  amber: "linear-gradient(135deg,#160d05,#ffb347)",
  spectral: "linear-gradient(120deg,#ff4d4d,#ffd24d,#4dff88,#4db8ff,#b84dff)",
};

export const LIGHTING_PRESETS: CinemaLightingPreset[] = [
  /* ------------------------------- Portrait ------------------------------- */
  {
    id: "lgt-soft-cross",
    name: "Soft Cross",
    category: "Portrait",
    tags: ["soft", "two-source", "flattering"],
    illuminationStyle: "Two crossing softboxes wrapping both cheeks, gentle shadow seam",
    thumbnail: G.soft,
    config: rig(
      [
        l("key", "softbox", { position: "camera left 45°", size: 0.85, intensity: 0.9, hardness: 0.15 }),
        l("cross", "softbox", { position: "camera right 45°", size: 0.8, intensity: 0.55, hardness: 0.18 }),
      ],
      "2:1",
      "soft, editorial",
    ),
  },
  {
    id: "lgt-rembrandt",
    name: "Rembrandt",
    category: "Portrait",
    tags: ["classic", "triangle", "45°"],
    illuminationStyle: "45°/45° key producing the classic cheek light triangle",
    thumbnail: G.warm,
    config: rig(
      [
        l("key", "fresnel", { position: "camera left 45°", height: "above", size: 0.4, hardness: 0.55 }),
        l("fill", "bounce", { position: "camera right", intensity: 0.25, size: 0.9, hardness: 0.1 }),
      ],
      "4:1",
      "classical, painterly",
    ),
  },
  {
    id: "lgt-butterfly",
    name: "Butterfly",
    category: "Portrait",
    tags: ["beauty", "frontal", "symmetric"],
    illuminationStyle: "Frontal high key casting a small butterfly shadow under the nose",
    thumbnail: G.soft,
    config: rig(
      [
        l("key", "softbox", { position: "straight front", height: "top", size: 0.7, intensity: 0.95, hardness: 0.3 }),
        l("fill", "bounce", { position: "below front", height: "below", intensity: 0.3, hardness: 0.05 }),
      ],
      "3:1",
      "glamour, symmetrical",
    ),
  },
  {
    id: "lgt-clamshell",
    name: "Clamshell",
    category: "Portrait",
    tags: ["beauty", "sandwich", "even"],
    illuminationStyle: "Above/below sandwich for near shadowless beauty rendering",
    thumbnail: G.soft,
    config: rig(
      [
        l("top", "softbox", { position: "straight front", height: "top", size: 0.8, intensity: 0.95, hardness: 0.15 }),
        l("bottom", "bounce", { position: "straight front", height: "below", size: 0.9, intensity: 0.5, hardness: 0.05 }),
      ],
      "1.5:1",
      "clean beauty",
    ),
  },
  {
    id: "lgt-book-light",
    name: "Book Light",
    category: "Portrait",
    tags: ["double-diffused", "wrap", "soft"],
    illuminationStyle: "Bounced then diffused source — the softest possible wrap",
    thumbnail: G.soft,
    config: rig(
      [
        l("key", "softbox", { position: "camera left 30°", size: 1, intensity: 0.85, hardness: 0.05, falloff: "slow" }),
        l("negative", "negative-fill", { position: "camera right", intensity: 0.2, hardness: 0 }),
      ],
      "3:1",
      "luxurious soft",
    ),
  },
  {
    id: "lgt-loop-key",
    name: "Loop Key",
    category: "Portrait",
    tags: ["loop", "standard", "portrait"],
    illuminationStyle: "30° key creating a short nose-shadow loop",
    thumbnail: G.warm,
    config: rig(
      [
        l("key", "softbox", { position: "camera left 30°", size: 0.6, intensity: 0.85, hardness: 0.3 }),
        l("rim", "strip", { position: "back right", intensity: 0.4, hardness: 0.6 }),
      ],
      "3:1",
      "standard portrait",
    ),
  },
  {
    id: "lgt-split-portrait",
    name: "Split Portrait",
    category: "Portrait",
    tags: ["split", "half-face", "moody"],
    illuminationStyle: "Hard 90° side key splitting the face into light and dark halves",
    thumbnail: G.hard,
    config: rig(
      [
        l("key", "fresnel", { position: "camera left 90°", size: 0.25, intensity: 0.9, hardness: 0.8, falloff: "fast" }),
        l("negative", "negative-fill", { position: "camera right", intensity: 0.3 }),
      ],
      "8:1",
      "severe, sculpted",
    ),
  },
  {
    id: "lgt-halo-rim",
    name: "Halo Rim",
    category: "Portrait",
    tags: ["rim", "separation", "backlight"],
    illuminationStyle: "Twin back rims outlining the silhouette with a soft frontal base",
    thumbnail: G.cool,
    config: rig(
      [
        l("rim-l", "strip", { position: "back left", intensity: 0.75, hardness: 0.7, temperature: 6500 }),
        l("rim-r", "strip", { position: "back right", intensity: 0.75, hardness: 0.7, temperature: 6500 }),
        l("base", "softbox", { position: "straight front", intensity: 0.35, size: 0.9, hardness: 0.1 }),
      ],
      "2:1",
      "haloed",
    ),
  },

  /* -------------------------------- Cinema -------------------------------- */
  {
    id: "lgt-contre-jour",
    name: "Contre Jour",
    category: "Cinema",
    tags: ["backlit", "against-light", "glow"],
    illuminationStyle: "Strong backlight pushing through the subject, minimal frontal fill",
    thumbnail: G.warm,
    config: rig(
      [
        l("back", "fresnel", { position: "directly behind", intensity: 1, hardness: 0.7, temperature: 4800 }),
        l("fill", "bounce", { position: "straight front", intensity: 0.2, size: 0.9, hardness: 0.05 }),
      ],
      "6:1",
      "backlit, romantic",
    ),
  },
  {
    id: "lgt-silhouette",
    name: "Silhouette",
    category: "Cinema",
    tags: ["silhouette", "graphic", "shape"],
    illuminationStyle: "Background only — subject reads as pure shape",
    thumbnail: G.hard,
    config: rig(
      [
        l("bg", "led-panel", { position: "behind background", intensity: 1, size: 1, hardness: 0.1 }),
        l("negative", "negative-fill", { position: "camera front", intensity: 0.6 }),
      ],
      "12:1",
      "graphic silhouette",
    ),
  },
  {
    id: "lgt-overhead-fall",
    name: "Overhead Fall",
    category: "Cinema",
    tags: ["toplight", "falloff", "interrogation"],
    illuminationStyle: "Single overhead source falling off fast into darkness",
    thumbnail: G.hard,
    config: rig(
      [
        l("top", "spotlight", { position: "directly overhead", height: "overhead", size: 0.35, intensity: 0.95, hardness: 0.65, falloff: "fast" }),
      ],
      "10:1",
      "isolated, tense",
    ),
  },
  {
    id: "lgt-hard-side-key",
    name: "Hard Side Key",
    category: "Cinema",
    tags: ["hard", "side", "contrast"],
    illuminationStyle: "Small hard source raking from the side, deep unfilled shadow",
    thumbnail: G.hard,
    config: rig(
      [
        l("key", "fresnel", { position: "camera left 80°", size: 0.2, intensity: 0.95, hardness: 0.9, falloff: "fast" }),
      ],
      "10:1",
      "noir contrast",
    ),
  },
  {
    id: "lgt-negative-fill",
    name: "Negative Fill",
    category: "Cinema",
    tags: ["subtractive", "shape", "contrast"],
    illuminationStyle: "Ambient base carved by black flags on the shadow side",
    thumbnail: G.soft,
    config: rig(
      [
        l("ambient", "ambient", { position: "surround", intensity: 0.55, size: 1, hardness: 0 }),
        l("neg-l", "negative-fill", { position: "camera left", intensity: 0.5 }),
        l("neg-r", "negative-fill", { position: "camera right", intensity: 0.25 }),
      ],
      "5:1",
      "subtractive, sculpted",
    ),
  },
  {
    id: "lgt-day-interior",
    name: "Day Interior",
    category: "Cinema",
    tags: ["interior", "daylight", "naturalistic"],
    illuminationStyle: "Daylight window key with warm interior bounce",
    thumbnail: G.soft,
    config: rig(
      [
        l("window", "window", { position: "camera left 60°", size: 1, intensity: 0.9, temperature: 6200, hardness: 0.2 }),
        l("bounce", "bounce", { position: "camera right", intensity: 0.3, temperature: 4200, hardness: 0.05 }),
      ],
      "4:1",
      "naturalistic day",
    ),
  },
  {
    id: "lgt-firelight",
    name: "Firelight",
    category: "Cinema",
    tags: ["fire", "flicker", "warm"],
    illuminationStyle: "Low warm flickering source from below with dark surround",
    thumbnail: G.amber,
    config: rig(
      [
        l("fire", "practical", { position: "front low", height: "below", size: 0.4, intensity: 0.85, temperature: 2000, hardness: 0.5, falloff: "fast" }),
        l("ambient", "ambient", { position: "surround", intensity: 0.1, temperature: 3200 }),
      ],
      "8:1",
      "firelit, intimate",
    ),
  },
  {
    id: "lgt-cold-institution",
    name: "Cold Institution",
    category: "Cinema",
    tags: ["cold", "clinical", "overhead"],
    illuminationStyle: "Overhead cool panels with flat institutional coverage",
    thumbnail: G.cool,
    config: rig(
      [
        l("top-1", "led-panel", { position: "overhead front", height: "overhead", size: 0.9, intensity: 0.8, temperature: 6800, hardness: 0.2 }),
        l("top-2", "led-panel", { position: "overhead rear", height: "overhead", size: 0.9, intensity: 0.5, temperature: 6800, hardness: 0.2 }),
      ],
      "2:1",
      "cold, procedural",
    ),
  },

  /* ------------------------------ Commercial ------------------------------ */
  {
    id: "lgt-white-cyc",
    name: "White Cyc",
    category: "Commercial",
    tags: ["seamless", "bright", "product"],
    illuminationStyle: "Wrapped white environment with even shadowless coverage",
    thumbnail: G.soft,
    config: rig(
      [
        l("front", "softbox", { position: "straight front", size: 1, intensity: 0.9, hardness: 0.05 }),
        l("left", "softbox", { position: "camera left 70°", size: 1, intensity: 0.7, hardness: 0.05 }),
        l("right", "softbox", { position: "camera right 70°", size: 1, intensity: 0.7, hardness: 0.05 }),
        l("bg", "led-panel", { position: "background", size: 1, intensity: 1, hardness: 0 }),
      ],
      "1.2:1",
      "clean commercial",
    ),
  },
  {
    id: "lgt-product-tabletop",
    name: "Product Tabletop",
    category: "Commercial",
    tags: ["tabletop", "controlled", "specular"],
    illuminationStyle: "Overhead strip with side fill and controlled specular roll",
    thumbnail: G.soft,
    config: rig(
      [
        l("top", "strip", { position: "overhead lengthwise", height: "overhead", size: 0.7, intensity: 0.95, hardness: 0.25 }),
        l("fill", "bounce", { position: "camera front low", height: "below", intensity: 0.35, hardness: 0.05 }),
        l("rim", "strip", { position: "back left", intensity: 0.5, hardness: 0.55 }),
      ],
      "3:1",
      "crisp product",
    ),
  },
  {
    id: "lgt-beauty-commercial",
    name: "Beauty Commercial",
    category: "Commercial",
    tags: ["beauty", "glossy", "even"],
    illuminationStyle: "Large frontal source with bottom bounce for glossy skin",
    thumbnail: G.fashion,
    config: rig(
      [
        l("key", "softbox", { position: "straight front", size: 1, intensity: 1, hardness: 0.1 }),
        l("under", "bounce", { position: "front low", height: "below", intensity: 0.45, hardness: 0.05 }),
        l("hair", "strip", { position: "back top", height: "top", intensity: 0.5, hardness: 0.6 }),
      ],
      "1.5:1",
      "polished commercial",
    ),
  },
  {
    id: "lgt-glossy-black-table",
    name: "Glossy Black Table",
    category: "Commercial",
    tags: ["reflective", "premium", "dark"],
    illuminationStyle: "Dark reflective base with a single controlled overhead sweep",
    thumbnail: G.hard,
    config: rig(
      [
        l("sweep", "strip", { position: "overhead front", height: "overhead", size: 0.6, intensity: 0.9, hardness: 0.4 }),
        l("neg", "negative-fill", { position: "surround", intensity: 0.5 }),
      ],
      "6:1",
      "premium dark",
    ),
  },
  {
    id: "lgt-lifestyle-bright",
    name: "Lifestyle Bright",
    category: "Commercial",
    tags: ["airy", "bright", "lifestyle"],
    illuminationStyle: "Airy overexposed daylight with lifted shadows",
    thumbnail: G.soft,
    config: rig(
      [
        l("window", "window", { position: "camera right 45°", size: 1, intensity: 1, temperature: 6000, hardness: 0.15 }),
        l("bounce", "bounce", { position: "camera left", intensity: 0.55, hardness: 0.05, falloff: "slow" }),
      ],
      "1.5:1",
      "airy lifestyle",
    ),
  },

  /* ------------------------------- Jewelry -------------------------------- */
  {
    id: "lgt-jewelry-strip-sweep",
    name: "Jewelry Strip Sweep",
    category: "Jewelry",
    tags: ["strip", "sweep", "metal"],
    illuminationStyle: "Long strip sweeping across metal to draw a continuous highlight",
    thumbnail: G.jewel,
    config: rig(
      [
        l("sweep", "strip", { position: "overhead lengthwise", height: "overhead", size: 0.55, intensity: 0.95, hardness: 0.45 }),
        l("fill", "bounce", { position: "front low", height: "below", intensity: 0.25, hardness: 0.05 }),
        l("neg", "negative-fill", { position: "camera right", intensity: 0.35 }),
      ],
      "5:1",
      "metal highlight sweep",
    ),
  },
  {
    id: "lgt-diamond-fire-rig",
    name: "Diamond Fire Rig",
    category: "Jewelry",
    tags: ["fire", "points", "sparkle"],
    illuminationStyle: "Multiple small hard points to trigger dispersion and fire",
    thumbnail: G.spectral,
    config: rig(
      [
        l("pt-1", "point", { position: "camera left 60°", size: 0.08, intensity: 1, hardness: 0.95, falloff: "fast" }),
        l("pt-2", "point", { position: "camera right 60°", size: 0.08, intensity: 0.9, hardness: 0.95, falloff: "fast" }),
        l("pt-3", "point", { position: "overhead front", height: "overhead", size: 0.06, intensity: 0.85, hardness: 0.95, falloff: "fast" }),
        l("neg", "negative-fill", { position: "surround", intensity: 0.5 }),
      ],
      "8:1",
      "spectral fire points",
    ),
  },
  {
    id: "lgt-white-brilliance",
    name: "White Brilliance",
    category: "Jewelry",
    tags: ["brilliance", "white-light", "contrast"],
    illuminationStyle: "Bright neutral points maximizing white return over dispersion",
    thumbnail: G.jewel,
    config: rig(
      [
        l("pt-1", "point", { position: "camera front high", height: "top", size: 0.1, intensity: 1, temperature: 5800, hardness: 0.9 }),
        l("pt-2", "point", { position: "camera left 45°", size: 0.1, intensity: 0.85, temperature: 5800, hardness: 0.9 }),
        l("dark", "negative-fill", { position: "surround", intensity: 0.55 }),
      ],
      "7:1",
      "white brilliance",
    ),
  },
  {
    id: "lgt-spectral-fire",
    name: "Spectral Fire",
    category: "Jewelry",
    tags: ["rainbow", "dispersion", "macro"],
    illuminationStyle: "Raking pin-points at steep angles for maximum rainbow dispersion",
    thumbnail: G.spectral,
    config: rig(
      [
        l("rake-l", "point", { position: "camera left 85°", direction: "raking", size: 0.05, intensity: 1, hardness: 1, falloff: "fast" }),
        l("rake-r", "point", { position: "camera right 85°", direction: "raking", size: 0.05, intensity: 0.95, hardness: 1, falloff: "fast" }),
        l("neg", "negative-fill", { position: "front", intensity: 0.6 }),
      ],
      "10:1",
      "rainbow dispersion",
    ),
  },
  {
    id: "lgt-black-gloss-jewelry",
    name: "Black Gloss Jewelry",
    category: "Jewelry",
    tags: ["black", "reflection", "luxury"],
    illuminationStyle: "Black acrylic base, single soft top source, deep specular reflection",
    thumbnail: G.hard,
    config: rig(
      [
        l("top", "softbox", { position: "overhead front", height: "overhead", size: 0.7, intensity: 0.9, hardness: 0.2 }),
        l("edge", "strip", { position: "back left", intensity: 0.5, hardness: 0.7 }),
        l("neg", "negative-fill", { position: "surround", intensity: 0.45 }),
      ],
      "6:1",
      "luxury black gloss",
    ),
  },
  {
    id: "lgt-museum-jewelry",
    name: "Museum Jewelry",
    category: "Jewelry",
    tags: ["museum", "vitrine", "neutral"],
    illuminationStyle: "Neutral vitrine lighting, controlled reflections, no flare",
    thumbnail: G.soft,
    config: rig(
      [
        l("top", "led-panel", { position: "overhead", height: "overhead", size: 0.85, intensity: 0.8, temperature: 5200, hardness: 0.15 }),
        l("front", "softbox", { position: "straight front", size: 0.8, intensity: 0.45, hardness: 0.1 }),
      ],
      "3:1",
      "archival neutral",
    ),
  },
  {
    id: "lgt-auction-catalog",
    name: "Auction Catalog",
    category: "Jewelry",
    tags: ["catalog", "documentary", "even"],
    illuminationStyle: "Even documentary coverage for true-colour catalog reproduction",
    thumbnail: G.soft,
    config: rig(
      [
        l("l", "softbox", { position: "camera left 45°", size: 0.9, intensity: 0.75, temperature: 5500, hardness: 0.1 }),
        l("r", "softbox", { position: "camera right 45°", size: 0.9, intensity: 0.75, temperature: 5500, hardness: 0.1 }),
        l("top", "strip", { position: "overhead", height: "overhead", intensity: 0.5, hardness: 0.3 }),
      ],
      "1.5:1",
      "true-colour catalog",
    ),
  },
  {
    id: "lgt-macro-edge-light",
    name: "Macro Edge Light",
    category: "Jewelry",
    tags: ["macro", "edge", "raking"],
    illuminationStyle: "Raking edge source revealing micro surface geometry",
    thumbnail: G.jewel,
    config: rig(
      [
        l("rake", "strip", { position: "camera left 95°", direction: "raking across surface", size: 0.2, intensity: 0.9, hardness: 0.75, falloff: "fast" }),
        l("fill", "bounce", { position: "camera right", intensity: 0.2, hardness: 0.05 }),
      ],
      "8:1",
      "raking micro-detail",
    ),
  },
  {
    id: "lgt-pave-scintillation",
    name: "Pavé Scintillation",
    category: "Jewelry",
    tags: ["pave", "scintillation", "twinkle"],
    illuminationStyle: "Array of tiny hard points making pavé twinkle across the surface",
    thumbnail: G.spectral,
    config: rig(
      [
        l("pt-1", "point", { position: "camera left 40°", size: 0.04, intensity: 0.9, hardness: 1 }),
        l("pt-2", "point", { position: "camera right 40°", size: 0.04, intensity: 0.9, hardness: 1 }),
        l("pt-3", "point", { position: "overhead left", height: "overhead", size: 0.04, intensity: 0.8, hardness: 1 }),
        l("pt-4", "point", { position: "overhead right", height: "overhead", size: 0.04, intensity: 0.8, hardness: 1 }),
      ],
      "7:1",
      "multi-point scintillation",
    ),
  },
  {
    id: "lgt-baguette-step-facet",
    name: "Baguette Step-Facet",
    category: "Jewelry",
    tags: ["baguette", "step-cut", "flash"],
    illuminationStyle: "Broad flat panels to produce clean step-cut mirror flashes",
    thumbnail: G.jewel,
    config: rig(
      [
        l("panel-l", "led-panel", { position: "camera left 55°", size: 0.9, intensity: 0.9, hardness: 0.3 }),
        l("panel-r", "led-panel", { position: "camera right 55°", size: 0.9, intensity: 0.7, hardness: 0.3 }),
        l("neg", "negative-fill", { position: "overhead", intensity: 0.3 }),
      ],
      "4:1",
      "step-cut mirror flash",
    ),
  },
  {
    id: "lgt-gold-warmth",
    name: "Gold Warmth",
    category: "Jewelry",
    tags: ["gold", "warm", "metal"],
    illuminationStyle: "Warm-biased sources tuned for yellow gold saturation",
    thumbnail: G.amber,
    config: rig(
      [
        l("key", "softbox", { position: "camera left 40°", size: 0.7, intensity: 0.9, temperature: 4200, hardness: 0.3 }),
        l("kick", "strip", { position: "back right", intensity: 0.55, temperature: 3800, hardness: 0.65 }),
      ],
      "4:1",
      "warm gold render",
    ),
  },

  /* -------------------------------- Fashion ------------------------------- */
  {
    id: "lgt-editorial-hard",
    name: "Editorial Hard",
    category: "Fashion",
    tags: ["editorial", "hard", "graphic"],
    illuminationStyle: "Single hard frontal source with crisp graphic shadows",
    thumbnail: G.hard,
    config: rig(
      [
        l("key", "fresnel", { position: "straight front high", height: "top", size: 0.2, intensity: 1, hardness: 0.95, falloff: "medium" }),
      ],
      "6:1",
      "graphic editorial",
    ),
  },
  {
    id: "lgt-runway-wash",
    name: "Runway Wash",
    category: "Fashion",
    tags: ["runway", "wash", "even"],
    illuminationStyle: "Long overhead wash following the walk line",
    thumbnail: G.soft,
    config: rig(
      [
        l("wash-1", "strip", { position: "overhead front", height: "overhead", size: 0.8, intensity: 0.9, hardness: 0.25 }),
        l("wash-2", "strip", { position: "overhead rear", height: "overhead", size: 0.8, intensity: 0.6, hardness: 0.25 }),
      ],
      "2:1",
      "runway wash",
    ),
  },
  {
    id: "lgt-street-flash",
    name: "Street Flash",
    category: "Fashion",
    tags: ["flash", "paparazzi", "direct"],
    illuminationStyle: "Direct on-camera flash with hot falloff and dark surround",
    thumbnail: G.hard,
    config: rig(
      [
        l("flash", "point", { position: "at camera", size: 0.12, intensity: 1, hardness: 0.9, falloff: "fast" }),
        l("ambient", "ambient", { position: "surround", intensity: 0.15, temperature: 3600 }),
      ],
      "8:1",
      "direct flash",
    ),
  },
  {
    id: "lgt-fashion-rim-duo",
    name: "Fashion Rim Duo",
    category: "Fashion",
    tags: ["rim", "silhouette", "sculpt"],
    illuminationStyle: "Dual rims sculpting the garment edge, minimal front fill",
    thumbnail: G.cool,
    config: rig(
      [
        l("rim-l", "strip", { position: "back left 135°", intensity: 0.85, hardness: 0.75 }),
        l("rim-r", "strip", { position: "back right 135°", intensity: 0.85, hardness: 0.75 }),
        l("fill", "bounce", { position: "straight front", intensity: 0.2, hardness: 0.05 }),
      ],
      "5:1",
      "sculpted edges",
    ),
  },
  {
    id: "lgt-studio-gradient",
    name: "Studio Gradient",
    category: "Fashion",
    tags: ["gradient", "background", "studio"],
    illuminationStyle: "Graded backdrop behind a soft directional key",
    thumbnail: G.fashion,
    config: rig(
      [
        l("key", "softbox", { position: "camera left 35°", size: 0.85, intensity: 0.85, hardness: 0.15 }),
        l("bg", "spotlight", { position: "background center", size: 0.4, intensity: 0.7, hardness: 0.4, falloff: "fast" }),
      ],
      "3:1",
      "graded studio",
    ),
  },

  /* ------------------------------ Music Video ----------------------------- */
  {
    id: "lgt-rgb-club",
    name: "RGB Club",
    category: "Music Video",
    tags: ["rgb", "club", "saturated"],
    illuminationStyle: "Saturated opposing colour sources over a dark room",
    thumbnail: G.neon,
    config: rig(
      [
        l("magenta", "led-panel", { position: "camera left 70°", size: 0.7, intensity: 0.9, temperature: 4000, tint: 60, hardness: 0.4 }),
        l("cyan", "led-panel", { position: "camera right 70°", size: 0.7, intensity: 0.9, temperature: 8500, tint: -40, hardness: 0.4 }),
        l("haze", "ambient", { position: "surround", intensity: 0.15 }),
      ],
      "3:1",
      "saturated club",
    ),
  },
  {
    id: "lgt-neon-alley",
    name: "Neon Alley",
    category: "Music Video",
    tags: ["neon", "street", "night"],
    illuminationStyle: "Neon tubes as practicals with wet-street bounce",
    thumbnail: G.neon,
    config: rig(
      [
        l("neon-1", "neon", { position: "camera left rear", size: 0.5, intensity: 0.85, temperature: 7000, tint: 45, hardness: 0.5 }),
        l("neon-2", "neon", { position: "camera right front", size: 0.5, intensity: 0.7, temperature: 3000, tint: 20, hardness: 0.5 }),
        l("bounce", "bounce", { position: "ground", height: "below", intensity: 0.25, hardness: 0.1 }),
      ],
      "5:1",
      "neon nocturne",
    ),
  },
  {
    id: "lgt-strobe-pulse",
    name: "Strobe Pulse",
    category: "Music Video",
    tags: ["strobe", "pulse", "energy"],
    illuminationStyle: "Hard pulsing key against near-black ambience",
    thumbnail: G.hard,
    config: rig(
      [
        l("strobe", "spotlight", { position: "straight front", size: 0.15, intensity: 1, hardness: 1, falloff: "fast" }),
        l("ambient", "ambient", { position: "surround", intensity: 0.08 }),
      ],
      "12:1",
      "pulsing energy",
    ),
  },
  {
    id: "lgt-tube-portrait",
    name: "Tube Portrait",
    category: "Music Video",
    tags: ["tube", "linear", "modern"],
    illuminationStyle: "Vertical LED tubes flanking the subject",
    thumbnail: G.neon,
    config: rig(
      [
        l("tube-l", "tube", { position: "camera left 60° vertical", size: 0.35, intensity: 0.85, temperature: 6500, hardness: 0.5 }),
        l("tube-r", "tube", { position: "camera right 60° vertical", size: 0.35, intensity: 0.6, temperature: 3200, hardness: 0.5 }),
      ],
      "4:1",
      "linear modern",
    ),
  },
  {
    id: "lgt-underlit-bass",
    name: "Underlit Bass",
    category: "Music Video",
    tags: ["underlight", "menace", "low"],
    illuminationStyle: "Low frontal uplight throwing shadows upward",
    thumbnail: G.night,
    config: rig(
      [
        l("under", "led-panel", { position: "front floor", height: "below", size: 0.6, intensity: 0.9, hardness: 0.4 }),
        l("rim", "strip", { position: "back center", intensity: 0.5, hardness: 0.7 }),
      ],
      "7:1",
      "menacing uplight",
    ),
  },

  /* --------------------------------- Night -------------------------------- */
  {
    id: "lgt-moonlight",
    name: "Moonlight",
    category: "Night",
    tags: ["moon", "cool", "night"],
    illuminationStyle: "Single cool distant key with deep blue ambient",
    thumbnail: G.night,
    config: rig(
      [
        l("moon", "fresnel", { position: "back left 120° high", height: "top", size: 0.3, intensity: 0.7, temperature: 9000, hardness: 0.7, falloff: "slow" }),
        l("ambient", "ambient", { position: "surround", intensity: 0.12, temperature: 10000 }),
      ],
      "8:1",
      "cool moonlit",
    ),
  },
  {
    id: "lgt-sodium-street",
    name: "Sodium Street",
    category: "Night",
    tags: ["sodium", "street", "orange"],
    illuminationStyle: "Overhead orange sodium vapour with hard downward falloff",
    thumbnail: G.amber,
    config: rig(
      [
        l("lamp", "practical", { position: "overhead rear", height: "overhead", size: 0.25, intensity: 0.85, temperature: 2000, hardness: 0.6, falloff: "fast" }),
        l("ambient", "ambient", { position: "surround", intensity: 0.1, temperature: 2400 }),
      ],
      "9:1",
      "sodium orange",
    ),
  },
  {
    id: "lgt-headlights",
    name: "Headlights",
    category: "Night",
    tags: ["car", "beam", "hard"],
    illuminationStyle: "Low hard twin beams from front with black surround",
    thumbnail: G.hard,
    config: rig(
      [
        l("beam-l", "spotlight", { position: "front low left", height: "below", size: 0.15, intensity: 1, temperature: 6200, hardness: 0.9, falloff: "fast" }),
        l("beam-r", "spotlight", { position: "front low right", height: "below", size: 0.15, intensity: 1, temperature: 6200, hardness: 0.9, falloff: "fast" }),
      ],
      "12:1",
      "hard vehicle beams",
    ),
  },
  {
    id: "lgt-screen-glow",
    name: "Screen Glow",
    category: "Night",
    tags: ["screen", "monitor", "soft"],
    illuminationStyle: "Soft cool screen light from below eyeline",
    thumbnail: G.cool,
    config: rig(
      [
        l("screen", "led-panel", { position: "front low", height: "below", size: 0.5, intensity: 0.6, temperature: 7800, hardness: 0.15, falloff: "fast" }),
      ],
      "8:1",
      "screen-lit",
    ),
  },
  {
    id: "lgt-night-rain",
    name: "Night Rain",
    category: "Night",
    tags: ["rain", "backlight", "wet"],
    illuminationStyle: "Backlit rain with hard rim and reflective ground bounce",
    thumbnail: G.night,
    config: rig(
      [
        l("back", "spotlight", { position: "directly behind high", height: "top", size: 0.2, intensity: 1, temperature: 6800, hardness: 0.9 }),
        l("ground", "bounce", { position: "ground", height: "below", intensity: 0.25, hardness: 0.1 }),
      ],
      "10:1",
      "wet backlit night",
    ),
  },

  /* -------------------------------- Natural ------------------------------- */
  {
    id: "lgt-window-soft",
    name: "Window Soft",
    category: "Natural",
    tags: ["window", "overcast", "soft"],
    illuminationStyle: "Large diffuse window on an overcast day",
    thumbnail: G.soft,
    config: rig(
      [
        l("window", "window", { position: "camera left 60°", size: 1, intensity: 0.85, temperature: 6500, hardness: 0.1, falloff: "slow" }),
      ],
      "3:1",
      "overcast window",
    ),
  },
  {
    id: "lgt-window-hard",
    name: "Window Hard",
    category: "Natural",
    tags: ["window", "sun", "shafts"],
    illuminationStyle: "Direct sun through a window casting hard-edged shafts",
    thumbnail: G.warm,
    config: rig(
      [
        l("sun", "window", { position: "camera left 70°", size: 0.3, intensity: 1, temperature: 5200, hardness: 0.9, falloff: "medium" }),
        l("bounce", "bounce", { position: "camera right", intensity: 0.2, hardness: 0.05 }),
      ],
      "8:1",
      "hard sun shafts",
    ),
  },
  {
    id: "lgt-golden-hour",
    name: "Golden Hour",
    category: "Natural",
    tags: ["golden", "sunset", "warm"],
    illuminationStyle: "Low warm raking sun with long soft shadows",
    thumbnail: G.warm,
    config: rig(
      [
        l("sun", "fresnel", { position: "back left 140° low", height: "eye-level", size: 0.35, intensity: 0.95, temperature: 3000, hardness: 0.6, falloff: "slow" }),
        l("sky", "ambient", { position: "surround", intensity: 0.3, temperature: 7500 }),
      ],
      "5:1",
      "golden raking sun",
    ),
  },
  {
    id: "lgt-blue-hour",
    name: "Blue Hour",
    category: "Natural",
    tags: ["dusk", "blue", "even"],
    illuminationStyle: "Soft ambient dusk skylight with no visible key",
    thumbnail: G.cool,
    config: rig(
      [
        l("sky", "ambient", { position: "surround overhead", height: "overhead", size: 1, intensity: 0.55, temperature: 9500, hardness: 0 }),
      ],
      "2:1",
      "dusk skylight",
    ),
  },
  {
    id: "lgt-open-shade",
    name: "Open Shade",
    category: "Natural",
    tags: ["shade", "soft", "cool"],
    illuminationStyle: "Cool wraparound skylight in open shade",
    thumbnail: G.soft,
    config: rig(
      [
        l("sky", "ambient", { position: "overhead front", height: "overhead", size: 1, intensity: 0.75, temperature: 7800, hardness: 0.05, falloff: "slow" }),
        l("ground", "bounce", { position: "ground", height: "below", intensity: 0.2 }),
      ],
      "2:1",
      "open shade",
    ),
  },
  {
    id: "lgt-harsh-noon",
    name: "Harsh Noon",
    category: "Natural",
    tags: ["noon", "toplight", "harsh"],
    illuminationStyle: "Overhead midday sun, short hard shadows, no fill",
    thumbnail: G.hard,
    config: rig(
      [
        l("sun", "fresnel", { position: "directly overhead", height: "overhead", size: 0.15, intensity: 1, temperature: 5600, hardness: 1, falloff: "medium" }),
      ],
      "9:1",
      "harsh midday",
    ),
  },
  {
    id: "lgt-dappled-shade",
    name: "Dappled Shade",
    category: "Natural",
    tags: ["dappled", "foliage", "broken"],
    illuminationStyle: "Broken foliage light patterning the subject",
    thumbnail: G.green,
    config: rig(
      [
        l("dapple", "fresnel", { position: "overhead front", height: "overhead", size: 0.2, intensity: 0.9, temperature: 5400, hardness: 0.85 }),
        l("shade", "ambient", { position: "surround", intensity: 0.35, temperature: 7000 }),
      ],
      "6:1",
      "dappled foliage",
    ),
  },

  /* ------------------------------- Practical ------------------------------ */
  {
    id: "lgt-practicals",
    name: "Practicals",
    category: "Practical",
    tags: ["in-frame", "lamps", "motivated"],
    illuminationStyle: "In-frame lamps carry the scene, motivated and warm",
    thumbnail: G.amber,
    config: rig(
      [
        l("lamp-1", "practical", { position: "frame left", size: 0.3, intensity: 0.8, temperature: 2800, hardness: 0.4, falloff: "fast" }),
        l("lamp-2", "practical", { position: "frame right rear", size: 0.25, intensity: 0.5, temperature: 2800, hardness: 0.4, falloff: "fast" }),
      ],
      "5:1",
      "motivated practicals",
    ),
  },
  {
    id: "lgt-fluorescent-office",
    name: "Fluorescent Office",
    category: "Practical",
    tags: ["office", "green", "flat"],
    illuminationStyle: "Green-biased overhead tubes, flat and unflattering",
    thumbnail: G.green,
    config: rig(
      [
        l("tube-1", "tube", { position: "overhead front", height: "overhead", size: 0.85, intensity: 0.85, temperature: 4300, tint: -35, hardness: 0.2 }),
        l("tube-2", "tube", { position: "overhead rear", height: "overhead", size: 0.85, intensity: 0.6, temperature: 4300, tint: -35, hardness: 0.2 }),
      ],
      "1.8:1",
      "flat fluorescent",
    ),
  },
  {
    id: "lgt-candlelit",
    name: "Candlelit",
    category: "Practical",
    tags: ["candle", "warm", "small"],
    illuminationStyle: "Tiny warm in-frame flames with fast falloff",
    thumbnail: G.amber,
    config: rig(
      [
        l("candle", "practical", { position: "front low center", height: "below", size: 0.1, intensity: 0.7, temperature: 1800, hardness: 0.6, falloff: "fast" }),
      ],
      "10:1",
      "candle intimacy",
    ),
  },
  {
    id: "lgt-tv-flicker",
    name: "TV Flicker",
    category: "Practical",
    tags: ["tv", "flicker", "cool"],
    illuminationStyle: "Cool flickering television glow as the only key",
    thumbnail: G.cool,
    config: rig(
      [
        l("tv", "led-panel", { position: "front low", height: "below", size: 0.45, intensity: 0.65, temperature: 7200, hardness: 0.2, falloff: "fast" }),
      ],
      "9:1",
      "television flicker",
    ),
  },
  {
    id: "lgt-signage-spill",
    name: "Signage Spill",
    category: "Practical",
    tags: ["signage", "spill", "colour"],
    illuminationStyle: "Coloured shop signage spilling across the frame",
    thumbnail: G.neon,
    config: rig(
      [
        l("sign", "neon", { position: "camera right rear", size: 0.6, intensity: 0.75, temperature: 3600, tint: 30, hardness: 0.35 }),
        l("ambient", "ambient", { position: "surround", intensity: 0.12, temperature: 6000 }),
      ],
      "6:1",
      "signage spill",
    ),
  },

  /* -------------------------------- Dramatic ------------------------------ */
  {
    id: "lgt-hard-spotlight",
    name: "Hard Spotlight",
    category: "Dramatic",
    tags: ["spotlight", "theatrical", "pool"],
    illuminationStyle: "Single theatrical spot with a hard-edged pool of light",
    thumbnail: G.hard,
    config: rig(
      [
        l("spot", "spotlight", { position: "front high 45°", height: "top", size: 0.12, intensity: 1, hardness: 1, falloff: "fast" }),
      ],
      "14:1",
      "theatrical spot",
    ),
  },
  {
    id: "lgt-noir-venetian",
    name: "Noir Venetian",
    category: "Dramatic",
    tags: ["noir", "blinds", "pattern"],
    illuminationStyle: "Hard slatted pattern across the subject and wall",
    thumbnail: G.hard,
    config: rig(
      [
        l("slats", "fresnel", { position: "camera left 75°", size: 0.18, intensity: 0.95, hardness: 1, falloff: "medium" }),
        l("neg", "negative-fill", { position: "camera right", intensity: 0.4 }),
      ],
      "12:1",
      "noir pattern",
    ),
  },
  {
    id: "lgt-single-source-void",
    name: "Single Source Void",
    category: "Dramatic",
    tags: ["void", "minimal", "black"],
    illuminationStyle: "One source, total blackness elsewhere",
    thumbnail: G.hard,
    config: rig(
      [
        l("key", "softbox", { position: "camera left 55°", size: 0.5, intensity: 0.85, hardness: 0.35, falloff: "fast" }),
        l("neg", "negative-fill", { position: "surround", intensity: 0.7 }),
      ],
      "16:1",
      "void isolation",
    ),
  },
  {
    id: "lgt-god-rays",
    name: "God Rays",
    category: "Dramatic",
    tags: ["rays", "haze", "shafts"],
    illuminationStyle: "Volumetric shafts through haze from a high rear source",
    thumbnail: G.warm,
    config: rig(
      [
        l("shaft", "spotlight", { position: "back left 130° high", height: "top", size: 0.15, intensity: 1, temperature: 5000, hardness: 0.95 }),
        l("haze", "ambient", { position: "surround", intensity: 0.2, temperature: 5200 }),
      ],
      "10:1",
      "volumetric shafts",
    ),
  },
  {
    id: "lgt-low-key-interrogation",
    name: "Low Key Interrogation",
    category: "Dramatic",
    tags: ["low-key", "tense", "top"],
    illuminationStyle: "Overhead practical with harsh top-down modelling",
    thumbnail: G.hard,
    config: rig(
      [
        l("top", "practical", { position: "directly overhead", height: "overhead", size: 0.2, intensity: 0.9, temperature: 3800, hardness: 0.8, falloff: "fast" }),
        l("neg", "negative-fill", { position: "surround", intensity: 0.55 }),
      ],
      "12:1",
      "interrogation top-light",
    ),
  },

  /* ------------------------------ Experimental ---------------------------- */
  {
    id: "lgt-split-tone-duo",
    name: "Split Tone Duo",
    category: "Experimental",
    tags: ["split-tone", "colour", "opposing"],
    illuminationStyle: "Warm and cool keys on opposing sides, no neutral fill",
    thumbnail: G.neon,
    config: rig(
      [
        l("warm", "led-panel", { position: "camera left 65°", size: 0.6, intensity: 0.85, temperature: 2800, hardness: 0.35 }),
        l("cool", "led-panel", { position: "camera right 65°", size: 0.6, intensity: 0.85, temperature: 9500, hardness: 0.35 }),
      ],
      "1.5:1",
      "opposing colour temps",
    ),
  },
  {
    id: "lgt-mirror-bounce-chaos",
    name: "Mirror Bounce Chaos",
    category: "Experimental",
    tags: ["mirror", "chaos", "specular"],
    illuminationStyle: "Multiple specular bounces creating unpredictable highlights",
    thumbnail: G.spectral,
    config: rig(
      [
        l("src", "point", { position: "camera left 50°", size: 0.08, intensity: 1, hardness: 0.95 }),
        l("mirror-1", "bounce", { position: "camera right high", intensity: 0.5, hardness: 0.85 }),
        l("mirror-2", "bounce", { position: "ground right", height: "below", intensity: 0.4, hardness: 0.85 }),
      ],
      "7:1",
      "chaotic speculars",
    ),
  },
  {
    id: "lgt-uv-blacklight",
    name: "UV Blacklight",
    category: "Experimental",
    tags: ["uv", "violet", "glow"],
    illuminationStyle: "Deep violet wash making surfaces glow against black",
    thumbnail: "linear-gradient(135deg,#0a0016,#6a29ff)",
    config: rig(
      [
        l("uv", "tube", { position: "camera front high", height: "top", size: 0.7, intensity: 0.8, temperature: 12000, tint: 80, hardness: 0.25 }),
        l("neg", "negative-fill", { position: "surround", intensity: 0.5 }),
      ],
      "8:1",
      "ultraviolet glow",
    ),
  },
  {
    id: "lgt-projection-pattern",
    name: "Projection Pattern",
    category: "Experimental",
    tags: ["projection", "gobo", "texture"],
    illuminationStyle: "Projected texture as the primary light source",
    thumbnail: G.spectral,
    config: rig(
      [
        l("projector", "spotlight", { position: "camera front 20°", size: 0.3, intensity: 0.85, hardness: 0.7 }),
        l("ambient", "ambient", { position: "surround", intensity: 0.08 }),
      ],
      "9:1",
      "projected texture",
    ),
  },
  {
    id: "lgt-liquid-caustics",
    name: "Liquid Caustics",
    category: "Experimental",
    tags: ["caustics", "water", "ripple"],
    illuminationStyle: "Rippling water caustics dancing over the subject",
    thumbnail: G.cool,
    config: rig(
      [
        l("caustic", "point", { position: "overhead front", height: "overhead", size: 0.1, intensity: 0.9, temperature: 7200, hardness: 0.9 }),
        l("fill", "ambient", { position: "surround", intensity: 0.2, temperature: 8000 }),
      ],
      "7:1",
      "water caustics",
    ),
  },
  {
    id: "lgt-overexposed-bloom",
    name: "Overexposed Bloom",
    category: "Experimental",
    tags: ["bloom", "blown", "dreamy"],
    illuminationStyle: "Deliberately blown-out source blooming into the frame",
    thumbnail: G.soft,
    config: rig(
      [
        l("blow", "window", { position: "behind subject", size: 1, intensity: 1, temperature: 6500, hardness: 0.2, falloff: "slow" }),
        l("fill", "bounce", { position: "front", intensity: 0.3, hardness: 0.05 }),
      ],
      "2:1",
      "blown bloom",
    ),
  },
];
