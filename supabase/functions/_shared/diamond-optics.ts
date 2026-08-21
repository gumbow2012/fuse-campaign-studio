/**
 * DIAMOND OPTICS PROFILE — pure logic (no provider imports).
 *
 * ANALYSIS → NUMBERS → PROMPT LINES. This module never calls Gemini and never
 * generates media. It normalizes an analysed optical profile, applies the user's
 * Sparkle / Rainbow-Fire multipliers, and synthesises concise physical prompt
 * lines that are APPENDED to the existing swap prompt.
 *
 * HARD SEPARATION OF OPTICAL TERMS (never collapsed into "sparkle"):
 *   BRILLIANCE      white light return
 *   FIRE/DISPERSION spectral rainbow separation
 *   SCINTILLATION   moving bright/dark facet flashes
 *   SPECULAR GLINT  localized bright highlight
 *   BLOOM           soft halo around a blown highlight
 *   STARBURST       diffraction spikes from a bright point
 *   LENS FLARE      camera artifact beyond the stone
 *
 * EVIDENCE FIREWALL:
 *   SOURCE video/frame  = LIGHTING + OPTICAL RESPONSE authority ONLY.
 *   REPLACEMENT refs    = stone character (cut behaviour, density, ratio).
 *   Final look = REPLACEMENT STONE CHARACTER × SOURCE LIGHTING (source wins
 *   for the scene's light hardness, exposure, bloom and flare style).
 */

export const DIAMOND_OPTICS_VERSION = "diamond-optics-v1";

/* ------------------------------------------------------------------ *
 * Profile shape
 * ------------------------------------------------------------------ */

export type OpticsHueDistribution = {
  red?: number;
  orange?: number;
  yellow?: number;
  green?: number;
  cyan?: number;
  blue?: number;
  violet?: number;
};

/** All 0..1 unless stated. Sizes are multiples of visible stone diameter. */
export type DiamondOpticsProfile = {
  version?: string;
  scope?: "global" | "frame";
  /** Non-diamond stones are described in their own terms, not diamond terms. */
  stoneFamily?: string | null;
  brilliance?: {
    intensity?: number;
    /** Share of total highlight energy returned as WHITE light. */
    whiteHighlightRatio?: number;
    peakBrightness?: number;
    contrast?: number;
  };
  fire?: {
    intensity?: number;
    /** Share of total highlight energy that reads as spectral dispersion. */
    rainbowRatio?: number;
    saturation?: number;
    hueDistribution?: OpticsHueDistribution;
  };
  glints?: {
    density?: number;
    /** Multiple of visible stone diameter / jewelry width — never pixels. */
    averageSize?: number;
    maximumSize?: number;
    /** Fraction of the visible stone field actively sparkling at once. */
    spatialCoverage?: number;
    sharpness?: number;
    persistence?: number;
  };
  bloom?: { intensity?: number; radius?: number };
  starburst?: {
    frequency?: number;
    intensity?: number;
    /** Multiples of stone diameter. */
    averageRayLength?: number;
    maximumRayLength?: number;
  };
  lighting?: {
    dominantDirection?: string | null;
    hardness?: number;
    exposure?: number;
    contrast?: number;
    environmentTemperature?: string | null;
  };
  /** Camera-side artifact observed in the SOURCE capture (never intrinsic). */
  lensFlare?: { presence?: number; style?: string | null };
  confidence?: number;
  notes?: string[];
};

/* ------------------------------------------------------------------ *
 * User controls
 * ------------------------------------------------------------------ */

/** AUTO = reproduce the analysed source optics. A number 0–100 modifies it. */
export type OpticsControl = "auto" | number;

export type DiamondOpticsControls = {
  sparkle: OpticsControl;
  fire: OpticsControl;
  /** Advanced. */
  whiteBrilliance: OpticsControl;
  glintSize: OpticsControl;
  glintCoverage: OpticsControl;
  bloom: OpticsControl;
  starburst: OpticsControl;
  fireSaturation: OpticsControl;
};

export const AUTO_OPTICS_CONTROLS: DiamondOpticsControls = {
  sparkle: "auto",
  fire: "auto",
  whiteBrilliance: "auto",
  glintSize: "auto",
  glintCoverage: "auto",
  bloom: "auto",
  starburst: "auto",
  fireSaturation: "auto",
};

const CONTROL_KEYS: (keyof DiamondOpticsControls)[] = [
  "sparkle",
  "fire",
  "whiteBrilliance",
  "glintSize",
  "glintCoverage",
  "bloom",
  "starburst",
  "fireSaturation",
];

export function readOpticsControls(raw: unknown): DiamondOpticsControls {
  const source = (raw ?? {}) as Record<string, unknown>;
  const controls = { ...AUTO_OPTICS_CONTROLS };
  for (const key of CONTROL_KEYS) {
    const value = source[key];
    if (value === "auto" || value === null || value === undefined) continue;
    const num = Number(value);
    if (!Number.isFinite(num)) continue;
    controls[key] = Math.min(100, Math.max(0, Math.round(num)));
  }
  return controls;
}

export function opticsControlsAreAuto(controls: DiamondOpticsControls) {
  return CONTROL_KEYS.every((key) => controls[key] === "auto");
}

/** 50 = source-matched. 0 → 0.15×, 100 → 1.85× — the analysis is never discarded. */
function multiplier(control: OpticsControl) {
  if (control === "auto") return 1;
  const value = Math.min(100, Math.max(0, Number(control)));
  return 0.15 + (value / 50) * 0.85;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

function num(value: unknown, fallback: number) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

/* ------------------------------------------------------------------ *
 * Normalization
 * ------------------------------------------------------------------ */

export function normalizeOpticsProfile(raw: unknown): DiamondOpticsProfile | null {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as any;

  const white = clamp01(num(source?.brilliance?.whiteHighlightRatio, 0.75));
  const rainbowRaw = source?.fire?.rainbowRatio;
  // white + fire describe ONE mixture: the pair is renormalized, never summed >1.
  const rainbow = clamp01(num(rainbowRaw, clamp01(1 - white)));
  const total = white + rainbow || 1;

  const hues = (source?.fire?.hueDistribution ?? {}) as Record<string, unknown>;
  const hueDistribution: OpticsHueDistribution = {};
  for (const hue of ["red", "orange", "yellow", "green", "cyan", "blue", "violet"] as const) {
    const value = Number(hues?.[hue]);
    if (Number.isFinite(value)) hueDistribution[hue] = clamp01(value);
  }

  return {
    version: DIAMOND_OPTICS_VERSION,
    scope: source?.scope === "frame" ? "frame" : "global",
    stoneFamily: typeof source?.stoneFamily === "string" ? source.stoneFamily : null,
    brilliance: {
      intensity: clamp01(num(source?.brilliance?.intensity, 0.6)),
      whiteHighlightRatio: clamp01(white / total),
      peakBrightness: clamp01(num(source?.brilliance?.peakBrightness, 0.7)),
      contrast: clamp01(num(source?.brilliance?.contrast, 0.6)),
    },
    fire: {
      intensity: clamp01(num(source?.fire?.intensity, 0.3)),
      rainbowRatio: clamp01(rainbow / total),
      saturation: clamp01(num(source?.fire?.saturation, 0.4)),
      hueDistribution,
    },
    glints: {
      density: clamp01(num(source?.glints?.density, 0.4)),
      averageSize: Math.max(0, Math.min(1.5, num(source?.glints?.averageSize, 0.18))),
      maximumSize: Math.max(0, Math.min(3, num(source?.glints?.maximumSize, 0.35))),
      spatialCoverage: clamp01(num(source?.glints?.spatialCoverage, 0.2)),
      sharpness: clamp01(num(source?.glints?.sharpness, 0.7)),
      persistence: clamp01(num(source?.glints?.persistence, 0.4)),
    },
    bloom: {
      intensity: clamp01(num(source?.bloom?.intensity, 0.25)),
      radius: Math.max(0, Math.min(3, num(source?.bloom?.radius, 0.3))),
    },
    starburst: {
      frequency: clamp01(num(source?.starburst?.frequency, 0.15)),
      intensity: clamp01(num(source?.starburst?.intensity, 0.25)),
      averageRayLength: Math.max(0, Math.min(6, num(source?.starburst?.averageRayLength, 0.6))),
      maximumRayLength: Math.max(0, Math.min(10, num(source?.starburst?.maximumRayLength, 1.2))),
    },
    lighting: {
      dominantDirection: typeof source?.lighting?.dominantDirection === "string"
        ? source.lighting.dominantDirection
        : null,
      hardness: clamp01(num(source?.lighting?.hardness, 0.6)),
      exposure: clamp01(num(source?.lighting?.exposure, 0.5)),
      contrast: clamp01(num(source?.lighting?.contrast, 0.6)),
      environmentTemperature: typeof source?.lighting?.environmentTemperature === "string"
        ? source.lighting.environmentTemperature
        : null,
    },
    lensFlare: {
      presence: clamp01(num(source?.lensFlare?.presence, 0.1)),
      style: typeof source?.lensFlare?.style === "string" ? source.lensFlare.style : null,
    },
    confidence: clamp01(num(source?.confidence, 0.5)),
    notes: Array.isArray(source?.notes)
      ? source.notes.map((note: unknown) => String(note ?? "").trim()).filter(Boolean).slice(0, 6)
      : [],
  };
}

/**
 * Merges a lightweight per-frame refinement onto the global profile: the frame
 * carries the deltas it actually measured, the global carries everything else.
 */
export function mergeFrameOptics(
  global: DiamondOpticsProfile | null,
  frame: DiamondOpticsProfile | null,
): DiamondOpticsProfile | null {
  if (!global) return frame ? { ...frame, scope: "frame" } : null;
  if (!frame) return global;
  const merged: DiamondOpticsProfile = {
    ...global,
    ...frame,
    scope: "frame",
    brilliance: { ...global.brilliance, ...frame.brilliance },
    fire: {
      ...global.fire,
      ...frame.fire,
      hueDistribution: {
        ...(global.fire?.hueDistribution ?? {}),
        ...(frame.fire?.hueDistribution ?? {}),
      },
    },
    glints: { ...global.glints, ...frame.glints },
    bloom: { ...global.bloom, ...frame.bloom },
    starburst: { ...global.starburst, ...frame.starburst },
    lighting: { ...global.lighting, ...frame.lighting },
    lensFlare: { ...global.lensFlare, ...frame.lensFlare },
  };
  return merged;
}

/* ------------------------------------------------------------------ *
 * finalOptics = analyzedOptics × userMultiplier (clamped)
 * ------------------------------------------------------------------ */

export function applyOpticsControls(
  profile: DiamondOpticsProfile | null,
  controls: DiamondOpticsControls,
): DiamondOpticsProfile | null {
  const base = normalizeOpticsProfile(profile);
  if (!base) return null;

  const sparkle = multiplier(controls.sparkle);
  const fire = multiplier(controls.fire);
  const white = multiplier(controls.whiteBrilliance === "auto" ? controls.sparkle : controls.whiteBrilliance);
  const glintSize = multiplier(controls.glintSize);
  const coverage = multiplier(controls.glintCoverage === "auto" ? controls.sparkle : controls.glintCoverage);
  const bloom = multiplier(controls.bloom === "auto" ? controls.sparkle : controls.bloom);
  const starburst = multiplier(controls.starburst === "auto" ? controls.sparkle : controls.starburst);
  const fireSat = multiplier(controls.fireSaturation === "auto" ? controls.fire : controls.fireSaturation);

  const whiteRatio = clamp01((base.brilliance?.whiteHighlightRatio ?? 0.75) * white);
  const rainbowRatio = clamp01((base.fire?.rainbowRatio ?? 0.25) * fire);
  const mixTotal = whiteRatio + rainbowRatio || 1;

  return {
    ...base,
    scope: base.scope,
    brilliance: {
      intensity: clamp01((base.brilliance?.intensity ?? 0.6) * sparkle),
      whiteHighlightRatio: clamp01(whiteRatio / mixTotal),
      peakBrightness: clamp01((base.brilliance?.peakBrightness ?? 0.7) * sparkle),
      contrast: clamp01((base.brilliance?.contrast ?? 0.6) * sparkle),
    },
    fire: {
      intensity: clamp01((base.fire?.intensity ?? 0.3) * fire),
      rainbowRatio: clamp01(rainbowRatio / mixTotal),
      saturation: clamp01((base.fire?.saturation ?? 0.4) * fireSat),
      hueDistribution: base.fire?.hueDistribution ?? {},
    },
    glints: {
      density: clamp01((base.glints?.density ?? 0.4) * sparkle),
      averageSize: Math.min(1.5, Math.max(0.02, (base.glints?.averageSize ?? 0.18) * glintSize)),
      maximumSize: Math.min(3, Math.max(0.04, (base.glints?.maximumSize ?? 0.35) * glintSize)),
      spatialCoverage: Math.min(0.85, clamp01((base.glints?.spatialCoverage ?? 0.2) * coverage)),
      sharpness: base.glints?.sharpness,
      persistence: base.glints?.persistence,
    },
    bloom: {
      intensity: clamp01((base.bloom?.intensity ?? 0.25) * bloom),
      radius: Math.min(3, Math.max(0, (base.bloom?.radius ?? 0.3) * bloom)),
    },
    starburst: {
      frequency: clamp01((base.starburst?.frequency ?? 0.15) * starburst),
      intensity: clamp01((base.starburst?.intensity ?? 0.25) * starburst),
      averageRayLength: Math.min(6, Math.max(0, (base.starburst?.averageRayLength ?? 0.6) * starburst)),
      maximumRayLength: Math.min(10, Math.max(0, (base.starburst?.maximumRayLength ?? 1.2) * starburst)),
    },
  };
}

/* ------------------------------------------------------------------ *
 * Prompt synthesis — short physical instructions, never JSON
 * ------------------------------------------------------------------ */

function band(value: number, words: [string, string, string, string, string]) {
  if (value < 0.12) return words[0];
  if (value < 0.32) return words[1];
  if (value < 0.55) return words[2];
  if (value < 0.78) return words[3];
  return words[4];
}

function pct(value: number) {
  return `${Math.round(clamp01(value) * 100)}%`;
}

function dominantHues(distribution: OpticsHueDistribution | undefined) {
  const entries = Object.entries(distribution ?? {})
    .map(([hue, value]) => [hue, Number(value) || 0] as const)
    .filter(([, value]) => value > 0.08)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([hue]) => hue);
  return entries;
}

function coverageWord(coverage: number) {
  if (coverage < 0.1) return "sparse";
  if (coverage < 0.25) return "distributed";
  if (coverage < 0.5) return "dense";
  return "near-blown";
}

/**
 * Converts the (analysed × user) optics into a handful of concise lines that are
 * appended to the swap prompt. Colorless stones are protected: fire lives in the
 * dispersion only, never in the stone body.
 */
export function opticsPromptLines(args: {
  profile: DiamondOpticsProfile | null;
  controls?: DiamondOpticsControls;
  /** True when the confirmed spec says the stones are colorless (e.g. D–F). */
  colorlessStones?: boolean;
  /** Non-diamond stone family, when the piece is not set with diamonds. */
  stoneFamily?: string | null;
  /** Adds the temporal consistency rule (video rebuild stages). */
  temporal?: boolean;
}): string[] {
  const controls = args.controls ?? AUTO_OPTICS_CONTROLS;
  const optics = applyOpticsControls(args.profile, controls);
  if (!optics) return [];

  const family = (args.stoneFamily ?? optics.stoneFamily ?? "").trim();
  const stoneWord = family && !/diamond/i.test(family) ? family.toLowerCase() : "diamond";

  const brillianceIntensity = optics.brilliance?.intensity ?? 0.6;
  const fireIntensity = optics.fire?.intensity ?? 0.3;
  const glintDensity = optics.glints?.density ?? 0.4;
  const glintSize = optics.glints?.averageSize ?? 0.18;
  const coverage = optics.glints?.spatialCoverage ?? 0.2;
  const bloomIntensity = optics.bloom?.intensity ?? 0.25;
  const starburstFrequency = optics.starburst?.frequency ?? 0.15;
  const hues = dominantHues(optics.fire?.hueDistribution);

  const lines: string[] = [];

  const lightHardness = optics.lighting?.hardness ?? 0.6;
  const direction = optics.lighting?.dominantDirection;
  const temperature = optics.lighting?.environmentTemperature;
  lines.push(
    `OPTICS — LIGHT RESPONSE (matches the source lighting, ${
      band(lightHardness, ["very soft", "soft", "moderately directional", "hard directional", "hard specular"])
    } light${direction ? ` from ${direction}` : ""}${temperature ? `, ${temperature} environment` : ""}): keep the source scene's exposure and highlight behaviour; the replacement stones react to THAT light.`,
  );

  lines.push(
    `BRILLIANCE (white light return): ${
      band(brillianceIntensity, ["minimal", "restrained", "moderate", "strong", "intense"])
    } white ${stoneWord} brilliance, ${
      band(optics.brilliance?.contrast ?? 0.6, ["flat", "gentle", "balanced", "high-contrast", "very high-contrast"])
    } bright/dark facet contrast. Light/dark mixture roughly white ${pct(optics.brilliance?.whiteHighlightRatio ?? 0.75)} / spectral fire ${pct(optics.fire?.rainbowRatio ?? 0.25)}.`,
  );

  lines.push(
    fireIntensity < 0.18
      ? "FIRE (spectral dispersion): almost none — occasional restrained dispersion only; highlights read as white, never rainbow."
      : `FIRE (spectral dispersion): ${
        band(fireIntensity, ["very restrained", "restrained", "balanced", "pronounced", "pronounced and frequent"])
      } physically-plausible ${hues.length ? `${hues.join("/")} ` : ""}dispersion tied to actual facet angles, ${
        band(optics.fire?.saturation ?? 0.4, ["desaturated", "muted", "moderately saturated", "saturated", "vivid"])
      }. Dispersion appears as separated spectral flashes on facets, never as a rainbow wash.`,
  );

  lines.push(
    `SCINTILLATION & GLINTS: ${
      band(glintDensity, ["very few", "few", "moderate", "many", "very many"])
    } discrete specular glints, median highlight about ${glintSize.toFixed(2)}× the visible stone diameter (largest ~${
      (optics.glints?.maximumSize ?? 0.35).toFixed(2)
    }×), ${coverageWord(coverage)} coverage — roughly ${pct(coverage)} of the visible stone field carries an active highlight at once. Highlights vary stone to stone; never every stone flashing together.`,
  );

  lines.push(
    `BLOOM & STARBURST: ${
      band(bloomIntensity, ["no bloom", "minimal bloom", "controlled bloom", "noticeable bloom", "strong bloom"])
    } and only on the brightest reflections; ${
      band(starburstFrequency, [
        "no diffraction spikes",
        "very limited starburst",
        "occasional short starburst",
        "frequent starburst",
        "frequent long starburst",
      ])
    }${
      starburstFrequency >= 0.12
        ? ` (rays about ${(optics.starburst?.averageRayLength ?? 0.6).toFixed(1)}× stone diameter)`
        : ""
    }. Any lens flare stays a camera artifact consistent with the source capture.`,
  );

  lines.push(
    args.colorlessStones
      ? `STONE BODY COLOR IS NOT OPTICS: the ${stoneWord}s stay visually colorless/white at every fire level. Color exists only in dispersion and reflection — never as blue, purple, green or multicolor stone bodies, never as a coating, tint or chromatic haze.`
      : `STONE BODY COLOR IS NOT OPTICS: keep the specified stone body color exactly; dispersion and reflected environment color never change it, and never add coatings, tints or chromatic haze.`,
  );

  lines.push(
    "OPTICAL CONTAMINATION FIREWALL: reflected metal, skin, gloves, environment LEDs, chromatic flare, dispersion and sensor bloom are CAPTURED light, not intrinsic stone color — do not bake them into the stones.",
  );

  lines.push(
    "OPTICS REALISM GUARD: every flash must be optically motivated by a real facet. No floating glitter particles, no uniform stamped sparkle, no all-stones-flashing-at-once, no rainbow texture painted on stones, no giant flares unrelated to a lit stone, no emissive or liquid-looking stones.",
  );

  if (args.temporal) {
    lines.push(
      "TEMPORAL OPTICS: individual highlights travel across facets as the camera, jewelry and light move, but the overall brilliance level, fire level, white/fire mixture, bloom and flare style stay consistent for the whole clip.",
    );
  }

  return lines;
}

/** Compact human-readable summary for the engineering (dev) surface only. */
export function opticsSummaryLine(profile: DiamondOpticsProfile | null) {
  const optics = normalizeOpticsProfile(profile);
  if (!optics) return null;
  return [
    `white ${pct(optics.brilliance?.whiteHighlightRatio ?? 0)}`,
    `fire ${pct(optics.fire?.rainbowRatio ?? 0)}`,
    `glints ${pct(optics.glints?.density ?? 0)}`,
    `coverage ${pct(optics.glints?.spatialCoverage ?? 0)}`,
  ].join(" · ");
}
