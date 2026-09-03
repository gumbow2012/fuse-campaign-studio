/**
 * FUSE editor adjustment engine — the SINGLE source of truth for how a clip's
 * non-destructive adjustments turn into pixels.
 *
 * Both the live preview (CSS) and the client-side export (OffscreenCanvas) consume
 * the same `RenderSpec`, so what you see is exactly what renders.
 */

/* ------------------------------- model ------------------------------- */

export type FramingAspect = "original" | "9:16" | "4:5" | "1:1" | "16:9";
export type FitMode = "fit" | "fill" | "stretch";
export type CropPreset = "none" | "full_body" | "waist_up" | "chest_up" | "product";

export type Framing = {
  aspect: FramingAspect;
  fit: FitMode;
  crop: CropPreset;
  scale: number; // 1 = 100%
  x: number; // -50..50 (% of frame)
  y: number; // -50..50
  rotate: number; // -15..15 deg
  flip: boolean;
  keepGarment: boolean;
};

export type ColorPresetId =
  | "match"
  | "original"
  | "clean_studio"
  | "soft_editorial"
  | "high_contrast"
  | "cool_streetwear"
  | "warm_film"
  | "night_flash";

export type Color = {
  preset: ColorPresetId;
  auto: boolean;
  exposure: number; // all -100..100
  contrast: number;
  highlights: number;
  shadows: number;
  whites: number;
  blacks: number;
  temperature: number;
  tint: number;
  saturation: number;
  vibrance: number;
  fade: number;
};

export type GrainPresetId = "none" | "fine_35mm" | "coarse_16mm" | "vhs" | "disposable";

export type Grain = {
  preset: GrainPresetId;
  sharpness: number; // 0..100
  clarity: number; // -100..100
  texture: number; // 0..100
  noiseReduction: number; // 0..100
  grainAmount: number; // 0..100
  grainSize: number; // 0..100
  grainSoftness: number; // 0..100
  vignette: number; // 0..100
  bloom: number; // 0..100
};

export type PanZoomMode = "none" | "in" | "out" | "left" | "right" | "up" | "down";

export type Motion = {
  speed: number; // 0.25..4 (1 = source speed)
  reverse: boolean;
  freezeMs: number; // hold the final frame, 0..3000
  fadeInMs: number; // 0..3000
  fadeOutMs: number;
  motionBlur: number; // 0..100
  panZoom: PanZoomMode;
  panZoomAmount: number; // 0..100
  ease: boolean; // ease the pan/zoom in and out
  stabilize: boolean; // gentle crop-in that hides handheld drift
};

export type Audio = {
  fadeInMs: number;
  fadeOutMs: number;
  musicDuck: number; // 0..100 — how much the music drops under this clip
  voiceEnhance: boolean;
  noiseReduction: number; // 0..100
  normalize: boolean;
  detached: boolean; // source audio detached (silent) but video kept
};

export type Adjustments = {
  framing: Framing;
  color: Color;
  grain: Grain;
  motion: Motion;
  audio: Audio;
};


export const DEFAULT_FRAMING: Framing = {
  aspect: "original",
  fit: "fit",
  crop: "none",
  scale: 1,
  x: 0,
  y: 0,
  rotate: 0,
  flip: false,
  keepGarment: false,
};

export const DEFAULT_COLOR: Color = {
  preset: "match",
  auto: false,
  exposure: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  whites: 0,
  blacks: 0,
  temperature: 0,
  tint: 0,
  saturation: 0,
  vibrance: 0,
  fade: 0,
};

/** Deliberately clean: heavy grain/sharpening destroys garment graphics. */
export const DEFAULT_GRAIN: Grain = {
  preset: "none",
  sharpness: 0,
  clarity: 0,
  texture: 0,
  noiseReduction: 0,
  grainAmount: 0,
  grainSize: 50,
  grainSoftness: 50,
  vignette: 0,
  bloom: 0,
};

/** Motion defaults are strictly neutral so exports can still stream-copy. */
export const DEFAULT_MOTION: Motion = {
  speed: 1,
  reverse: false,
  freezeMs: 0,
  fadeInMs: 0,
  fadeOutMs: 0,
  motionBlur: 0,
  panZoom: "none",
  panZoomAmount: 30,
  ease: true,
  stabilize: false,
};

export const DEFAULT_AUDIO: Audio = {
  fadeInMs: 0,
  fadeOutMs: 0,
  musicDuck: 0,
  voiceEnhance: false,
  noiseReduction: 0,
  normalize: false,
  detached: false,
};

export const DEFAULT_ADJUSTMENTS: Adjustments = {
  framing: DEFAULT_FRAMING,
  color: DEFAULT_COLOR,
  grain: DEFAULT_GRAIN,
  motion: DEFAULT_MOTION,
  audio: DEFAULT_AUDIO,
};


/* ------------------------------ presets ------------------------------ */

type ColorPatch = Partial<Omit<Color, "preset">>;

export const COLOR_PRESETS: { id: ColorPresetId; label: string; patch: ColorPatch }[] = [
  { id: "match", label: "Match source", patch: {} },
  { id: "original", label: "Original", patch: {} },
  {
    id: "clean_studio",
    label: "Clean studio",
    patch: { exposure: 6, contrast: 8, shadows: 8, whites: 6, saturation: 4, temperature: 2 },
  },
  {
    id: "soft_editorial",
    label: "Soft editorial",
    patch: { exposure: 4, contrast: -6, highlights: -10, shadows: 14, fade: 16, saturation: -4 },
  },
  {
    id: "high_contrast",
    label: "High contrast",
    patch: { contrast: 26, blacks: -14, whites: 10, vibrance: 10, fade: 0 },
  },
  {
    id: "cool_streetwear",
    label: "Cool streetwear",
    patch: { temperature: -18, tint: -4, contrast: 12, saturation: -6, shadows: 6 },
  },
  {
    id: "warm_film",
    label: "Warm film",
    patch: { temperature: 18, tint: 4, contrast: 6, fade: 10, highlights: -6, saturation: 6 },
  },
  {
    id: "night_flash",
    label: "Night flash",
    patch: { exposure: 10, contrast: 18, blacks: -18, temperature: -6, vibrance: 14 },
  },
];

type GrainPatch = Partial<Omit<Grain, "preset">>;

export const GRAIN_PRESETS: { id: GrainPresetId; label: string; patch: GrainPatch }[] = [
  { id: "none", label: "None", patch: {} },
  {
    id: "fine_35mm",
    label: "Fine 35mm",
    patch: { grainAmount: 14, grainSize: 32, grainSoftness: 60, clarity: 4, vignette: 8 },
  },
  {
    id: "coarse_16mm",
    label: "Coarse 16mm",
    patch: { grainAmount: 30, grainSize: 64, grainSoftness: 40, clarity: 8, vignette: 16 },
  },
  {
    id: "vhs",
    label: "VHS",
    patch: { grainAmount: 24, grainSize: 74, grainSoftness: 74, noiseReduction: 14, bloom: 18, vignette: 12 },
  },
  {
    id: "disposable",
    label: "Disposable camera",
    patch: { grainAmount: 22, grainSize: 46, grainSoftness: 30, bloom: 24, vignette: 22, sharpness: 12 },
  },
];

export const CROP_PRESETS: { id: CropPreset; label: string; scale: number; y: number }[] = [
  { id: "none", label: "Full frame", scale: 1, y: 0 },
  { id: "full_body", label: "Full body", scale: 1.05, y: 0 },
  { id: "waist_up", label: "Waist-up", scale: 1.35, y: -10 },
  { id: "chest_up", label: "Chest-up", scale: 1.7, y: -18 },
  { id: "product", label: "Product detail", scale: 2.1, y: -4 },
];

export const ASPECT_OPTIONS: { id: FramingAspect; label: string }[] = [
  { id: "original", label: "Original" },
  { id: "9:16", label: "9:16" },
  { id: "4:5", label: "4:5" },
  { id: "1:1", label: "1:1" },
  { id: "16:9", label: "16:9" },
];

export const ASPECT_RATIO_VALUES: Record<FramingAspect, number | null> = {
  original: null,
  "9:16": 9 / 16,
  "4:5": 4 / 5,
  "1:1": 1,
  "16:9": 16 / 9,
};

/** Auto-enhance is a fixed, gentle curve — predictable and reversible. */
export const AUTO_ENHANCE: ColorPatch = {
  exposure: 5,
  contrast: 10,
  shadows: 10,
  highlights: -6,
  vibrance: 8,
};

/* ---------------------------- normalisation ---------------------------- */

const num = (value: unknown, fallback: number, min: number, max: number) => {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
};

const PAN_ZOOM_MODES: PanZoomMode[] = ["none", "in", "out", "left", "right", "up", "down"];

export function normalizeMotion(raw: unknown): Motion {
  const motion = (raw ?? {}) as Record<string, unknown>;
  return {
    speed: num(motion.speed, 1, 0.25, 4),
    reverse: !!motion.reverse,
    freezeMs: num(motion.freezeMs, 0, 0, 3000),
    fadeInMs: num(motion.fadeInMs, 0, 0, 3000),
    fadeOutMs: num(motion.fadeOutMs, 0, 0, 3000),
    motionBlur: num(motion.motionBlur, 0, 0, 100),
    panZoom: PAN_ZOOM_MODES.includes(motion.panZoom as PanZoomMode)
      ? (motion.panZoom as PanZoomMode)
      : "none",
    panZoomAmount: num(motion.panZoomAmount, 30, 0, 100),
    ease: motion.ease === undefined ? true : !!motion.ease,
    stabilize: !!motion.stabilize,
  };
}

export function normalizeAudio(raw: unknown): Audio {
  const audio = (raw ?? {}) as Record<string, unknown>;
  return {
    fadeInMs: num(audio.fadeInMs, 0, 0, 5000),
    fadeOutMs: num(audio.fadeOutMs, 0, 0, 5000),
    musicDuck: num(audio.musicDuck, 0, 0, 100),
    voiceEnhance: !!audio.voiceEnhance,
    noiseReduction: num(audio.noiseReduction, 0, 0, 100),
    normalize: !!audio.normalize,
    detached: !!audio.detached,
  };
}


export function normalizeAdjustments(raw: unknown): Adjustments {
  const source = (raw ?? {}) as Record<string, Record<string, unknown> | undefined>;
  const framing = source.framing ?? {};
  const color = source.color ?? {};
  const grain = source.grain ?? {};

  return {
    framing: {
      aspect: (["original", "9:16", "4:5", "1:1", "16:9"] as FramingAspect[]).includes(
        framing.aspect as FramingAspect,
      )
        ? (framing.aspect as FramingAspect)
        : "original",
      fit: (["fit", "fill", "stretch"] as FitMode[]).includes(framing.fit as FitMode)
        ? (framing.fit as FitMode)
        : "fit",
      crop: CROP_PRESETS.some((preset) => preset.id === framing.crop)
        ? (framing.crop as CropPreset)
        : "none",
      scale: num(framing.scale, 1, 0.5, 4),
      x: num(framing.x, 0, -50, 50),
      y: num(framing.y, 0, -50, 50),
      rotate: num(framing.rotate, 0, -15, 15),
      flip: !!framing.flip,
      keepGarment: !!framing.keepGarment,
    },
    color: {
      preset: COLOR_PRESETS.some((preset) => preset.id === color.preset)
        ? (color.preset as ColorPresetId)
        : "match",
      auto: !!color.auto,
      exposure: num(color.exposure, 0, -100, 100),
      contrast: num(color.contrast, 0, -100, 100),
      highlights: num(color.highlights, 0, -100, 100),
      shadows: num(color.shadows, 0, -100, 100),
      whites: num(color.whites, 0, -100, 100),
      blacks: num(color.blacks, 0, -100, 100),
      temperature: num(color.temperature, 0, -100, 100),
      tint: num(color.tint, 0, -100, 100),
      saturation: num(color.saturation, 0, -100, 100),
      vibrance: num(color.vibrance, 0, -100, 100),
      fade: num(color.fade, 0, 0, 100),
    },
    grain: {
      preset: GRAIN_PRESETS.some((preset) => preset.id === grain.preset)
        ? (grain.preset as GrainPresetId)
        : "none",
      sharpness: num(grain.sharpness, 0, 0, 100),
      clarity: num(grain.clarity, 0, -100, 100),
      texture: num(grain.texture, 0, 0, 100),
      noiseReduction: num(grain.noiseReduction, 0, 0, 100),
      grainAmount: num(grain.grainAmount, 0, 0, 100),
      grainSize: num(grain.grainSize, 50, 0, 100),
      grainSoftness: num(grain.grainSoftness, 50, 0, 100),
      vignette: num(grain.vignette, 0, 0, 100),
      bloom: num(grain.bloom, 0, 0, 100),
    },
    motion: normalizeMotion(source.motion),
    audio: normalizeAudio(source.audio),

  };
}

/* ------------------------------ render spec ------------------------------ */

export type TintOverlay = {
  color: [number, number, number];
  alpha: number;
  blend: "soft-light" | "screen" | "overlay" | "multiply";
};

export type RenderSpec = {
  /** CSS/canvas filter chain — identical string on both sides. */
  filter: string;
  transform: {
    scale: number;
    offsetX: number; // percent of frame width
    offsetY: number;
    rotate: number;
    flip: boolean;
    fit: "contain" | "cover" | "fill";
    /** Per-clip aspect box (w/h) inside the export frame, null = use the frame. */
    aspect: number | null;
  };
  overlays: {
    tints: TintOverlay[];
    vignette: number; // 0..1
    grain: { alpha: number; tile: number; softness: number } | null;
  };
  /** Time-based motion, resolved per frame by `frameMotionAt`. */
  motion: {
    speed: number;
    reverse: boolean;
    freezeMs: number;
    fadeInMs: number;
    fadeOutMs: number;
    blurPx: number;
    panZoom: PanZoomMode;
    panZoomAmount: number;
    ease: boolean;
    stabilizeScale: number;
  };
  /** Audio treatment for the mixer / encoder. */
  audio: {
    fadeInMs: number;
    fadeOutMs: number;
    musicDuck: number;
    voiceEnhance: boolean;
    noiseReduction: number;
    normalize: boolean;
    detached: boolean;
  };
  /** Neutral spec → the exporter can stream-copy instead of re-encoding. */
  identity: boolean;
};


const round = (value: number, places = 4) => Number(value.toFixed(places));

export function buildRenderSpec(adjustments: Adjustments): RenderSpec {
  const { color, grain, framing, motion, audio } = adjustments;


  const brightness =
    1 + (color.exposure / 100) * 0.55 + (color.highlights / 100) * 0.08 + (color.shadows / 100) * 0.07;
  const contrast =
    1 +
    (color.contrast / 100) * 0.55 +
    (grain.clarity / 100) * 0.22 +
    (color.whites / 100) * 0.1 -
    (color.blacks / 100) * 0.12 +
    (grain.sharpness / 100) * 0.1 +
    (grain.texture / 100) * 0.06 -
    (color.fade / 100) * 0.3;
  const saturate = Math.max(
    0,
    1 + (color.saturation / 100) * 0.8 + (color.vibrance / 100) * 0.45 - (color.fade / 100) * 0.12,
  );
  const blur = (grain.noiseReduction / 100) * 0.9;

  const parts = [
    `brightness(${round(Math.max(0.2, brightness))})`,
    `contrast(${round(Math.max(0.2, contrast))})`,
    `saturate(${round(saturate)})`,
  ];
  if (blur > 0.01) parts.push(`blur(${round(blur, 2)}px)`);

  const tints: TintOverlay[] = [];
  if (Math.abs(color.temperature) > 1) {
    tints.push({
      color: color.temperature > 0 ? [255, 168, 92] : [92, 168, 255],
      alpha: round((Math.abs(color.temperature) / 100) * 0.3),
      blend: "soft-light",
    });
  }
  if (Math.abs(color.tint) > 1) {
    tints.push({
      color: color.tint > 0 ? [255, 110, 214] : [126, 255, 150],
      alpha: round((Math.abs(color.tint) / 100) * 0.22),
      blend: "soft-light",
    });
  }
  if (color.fade > 1) {
    tints.push({ color: [236, 240, 248], alpha: round((color.fade / 100) * 0.14), blend: "screen" });
  }
  if (grain.bloom > 1) {
    tints.push({ color: [255, 252, 240], alpha: round((grain.bloom / 100) * 0.16), blend: "screen" });
  }

  const cropPreset = CROP_PRESETS.find((preset) => preset.id === framing.crop) ?? CROP_PRESETS[0];
  let scale = framing.scale * cropPreset.scale;
  let offsetY = framing.y + cropPreset.y;
  // "Keep garment visible": bias the crop down so tops/graphics never leave frame.
  if (framing.keepGarment) {
    scale = Math.min(scale, 1.6);
    offsetY = Math.min(6, Math.max(-8, offsetY + 5));
  }

  const spec: RenderSpec = {
    filter: parts.join(" "),
    transform: {
      scale: round(scale),
      offsetX: round(framing.x),
      offsetY: round(offsetY),
      rotate: round(framing.rotate, 2),
      flip: framing.flip,
      fit: framing.fit === "fill" ? "cover" : framing.fit === "stretch" ? "fill" : "contain",
      aspect: ASPECT_RATIO_VALUES[framing.aspect] ?? null,
    },
    overlays: {
      tints,
      vignette: round((grain.vignette / 100) * 0.75),
      grain:
        grain.grainAmount > 0.5
          ? {
              alpha: round((grain.grainAmount / 100) * 0.28),
              tile: Math.round(24 + (grain.grainSize / 100) * 120),
              softness: round(grain.grainSoftness / 100),
            }
          : null,
    },
    identity: false,
  };

  spec.identity =
    spec.filter === "brightness(1) contrast(1) saturate(1)" &&
    !tints.length &&
    spec.overlays.vignette === 0 &&
    !spec.overlays.grain &&
    spec.transform.scale === 1 &&
    spec.transform.offsetX === 0 &&
    spec.transform.offsetY === 0 &&
    spec.transform.rotate === 0 &&
    !spec.transform.flip &&
    spec.transform.fit === "contain" &&
    spec.transform.aspect === null;

  return spec;
}

/** Stable short signature for export cache keys. */
export function renderSignature(spec: RenderSpec) {
  if (spec.identity) return "id";
  return JSON.stringify([spec.filter, spec.transform, spec.overlays]);
}

/* ------------------------------ grain tile ------------------------------ */

/**
 * Deterministic noise tile so preview and export show the SAME grain.
 * Returns raw RGBA bytes; callers paint it into a canvas.
 */
export function noiseTileBytes(size: number, softness: number) {
  const dimension = Math.max(8, Math.min(256, Math.round(size)));
  const bytes = new Uint8ClampedArray(dimension * dimension * 4);
  let seed = 0x5eed1234;
  const rand = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return ((seed >>> 0) % 10_000) / 10_000;
  };
  const smooth = Math.min(0.9, Math.max(0, softness));
  let previous = 0.5;
  for (let index = 0; index < dimension * dimension; index += 1) {
    const raw = rand();
    const value = previous * smooth + raw * (1 - smooth);
    previous = value;
    const level = Math.round(value * 255);
    const offset = index * 4;
    bytes[offset] = level;
    bytes[offset + 1] = level;
    bytes[offset + 2] = level;
    bytes[offset + 3] = 255;
  }
  return { bytes, dimension };
}

/* --------------------------- preset application --------------------------- */

export function applyColorPreset(color: Color, presetId: ColorPresetId): Color {
  const preset = COLOR_PRESETS.find((item) => item.id === presetId);
  if (!preset) return color;
  if (presetId === "match" || presetId === "original") {
    return { ...DEFAULT_COLOR, preset: presetId };
  }
  return { ...DEFAULT_COLOR, ...preset.patch, preset: presetId, auto: color.auto };
}

export function applyGrainPreset(grain: Grain, presetId: GrainPresetId): Grain {
  const preset = GRAIN_PRESETS.find((item) => item.id === presetId);
  if (!preset) return grain;
  return { ...DEFAULT_GRAIN, ...preset.patch, preset: presetId };
}

/** Averages the exposure/white-balance/contrast/grain family across clips. */
export function matchAllAdjustments(list: Adjustments[]): { color: Partial<Color>; grain: Partial<Grain> } {
  if (!list.length) return { color: {}, grain: {} };
  const mean = (pick: (item: Adjustments) => number) =>
    Math.round(list.reduce((sum, item) => sum + pick(item), 0) / list.length);
  return {
    color: {
      exposure: mean((item) => item.color.exposure),
      contrast: mean((item) => item.color.contrast),
      temperature: mean((item) => item.color.temperature),
      tint: mean((item) => item.color.tint),
      whites: mean((item) => item.color.whites),
      blacks: mean((item) => item.color.blacks),
    },
    grain: {
      grainAmount: mean((item) => item.grain.grainAmount),
      grainSize: mean((item) => item.grain.grainSize),
      vignette: mean((item) => item.grain.vignette),
    },
  };
}
