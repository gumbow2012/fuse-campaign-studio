/**
 * FUSE Cinema — model adapters.
 *
 * READ-ONLY mirror of the video model schemas defined in
 * supabase/functions/_shared/fal.ts (that file is neither imported nor modified
 * here — edge-function code must not be pulled into the browser bundle).
 *
 * Every capability below matches the LIVE fal schema the shared helpers submit:
 *   kling-3.0-pro / kling-3.0-standard  fal-ai/kling-video/v3/{pro,standard}/image-to-video
 *     native: duration (string "3".."15"), generate_audio, cfg_scale
 *     NO resolution / quality field, NO aspect_ratio field
 *   kling-2.5                           fal-ai/kling-video/v2.5-turbo/pro/image-to-video
 *     native: duration ONLY 5 | 10, aspect_ratio provider-fixed 9:16, no audio
 *   seedance-2.0                        bytedance/seedance-2.0/*
 *     native: resolution 480p|720p|1080p|4k, duration auto|4..15, aspect_ratio, generate_audio
 *   seedance-2.0-fast                   bytedance/seedance-2.0/fast/*
 *     native: resolution 480p|720p ONLY, duration auto|4..15, aspect_ratio, generate_audio
 *
 * Everything cinematographic (camera, lens, movement, composition, focus,
 * lighting, colour, optics, atmosphere, film setup) is PROMPT_BASED on every
 * model — none of these endpoints expose cinematography parameters.
 */

import type {
  ApertureSetup,
  AtmosphereSetup,
  CharacterConfig,
  CameraSetup,
  ColorPalette,
  CompositionSetup,
  DirectorConfigField,
  FilmSetup,
  FocusSetup,
  LensSetup,
  LightingSetup,
  MovementPreset,
  OpticsSetup,
} from "./types";

/** Mirror of VIDEO_MODELS keys in supabase/functions/_shared/fal.ts (read-only). */
export type CinemaVideoModelKey =
  | "kling-3.0-pro"
  | "kling-3.0-standard"
  | "kling-2.5"
  | "seedance-2.0"
  | "seedance-2.0-fast";

export type FieldSupport = "FULL_SUPPORT" | "PROMPT_BASED" | "UNSUPPORTED";

export type FieldResolution = {
  support: FieldSupport;
  nativeParam?: { key: string; value: unknown };
  promptText?: string;
};

/** What the bottom bar may offer for a model — requested === submitted. */
export type ModelCapabilities = {
  label: string;
  family: "kling" | "kling3" | "seedance";
  /** Empty = the model has NO resolution field; never offer one. */
  resolutions: string[];
  /** Empty = provider-fixed aspect; `fixedAspect` says what will be submitted. */
  aspectRatios: string[];
  fixedAspect?: string;
  /** Exact duration option list (strings, as submitted). */
  durations: string[];
  supportsAudio: boolean;
  /** Max prompt characters the compiler may emit for this model. */
  promptMaxChars: number;
};

const KLING3_DURATIONS = Array.from({ length: 13 }, (_, i) => String(i + 3)); // "3".."15"
const SEEDANCE_DURATIONS = ["auto", ...Array.from({ length: 12 }, (_, i) => String(i + 4))];

export const CINEMA_MODEL_CAPABILITIES: Record<CinemaVideoModelKey, ModelCapabilities> = {
  "kling-3.0-pro": {
    label: "Kling 3.0 Pro",
    family: "kling3",
    resolutions: [],
    aspectRatios: [],
    durations: KLING3_DURATIONS,
    supportsAudio: true,
    promptMaxChars: 2500,
  },
  "kling-3.0-standard": {
    label: "Kling 3.0 Standard",
    family: "kling3",
    resolutions: [],
    aspectRatios: [],
    durations: KLING3_DURATIONS,
    supportsAudio: true,
    promptMaxChars: 2500,
  },
  "kling-2.5": {
    label: "Kling 2.5",
    family: "kling",
    resolutions: [],
    aspectRatios: [],
    fixedAspect: "9:16",
    durations: ["5", "10"],
    supportsAudio: false,
    promptMaxChars: 2000,
  },
  "seedance-2.0": {
    label: "Seedance 2.0",
    family: "seedance",
    resolutions: ["480p", "720p", "1080p", "4k"],
    aspectRatios: ["9:16", "16:9", "1:1", "4:3", "3:4", "21:9"],
    durations: SEEDANCE_DURATIONS,
    supportsAudio: true,
    promptMaxChars: 2200,
  },
  "seedance-2.0-fast": {
    label: "Seedance 2.0 Fast",
    family: "seedance",
    // LIVE schema: the fast variant is 480p / 720p only.
    resolutions: ["480p", "720p"],
    aspectRatios: ["9:16", "16:9", "1:1", "4:3", "3:4", "21:9"],
    durations: SEEDANCE_DURATIONS,
    supportsAudio: true,
    promptMaxChars: 2200,
  },
};

export const CINEMA_MODEL_KEYS = Object.keys(
  CINEMA_MODEL_CAPABILITIES,
) as CinemaVideoModelKey[];

export function resolveCinemaModelKey(value: unknown): CinemaVideoModelKey {
  const key = typeof value === "string" ? value.trim() : "";
  return (key in CINEMA_MODEL_CAPABILITIES ? key : "kling-3.0-pro") as CinemaVideoModelKey;
}

export function cinemaModelCapabilities(model: unknown): ModelCapabilities {
  return CINEMA_MODEL_CAPABILITIES[resolveCinemaModelKey(model)];
}

/* ------------------------------------------------------------------ */
/* Prose writers — one per director field                              */
/* ------------------------------------------------------------------ */

const list = (...parts: Array<string | number | undefined | null | false>) =>
  parts.filter((p) => p !== undefined && p !== null && p !== false && `${p}`.trim() !== "")
    .join(", ");

function filmSetupText(v: FilmSetup): string {
  return list(
    v.productionType && `${v.productionType}`,
    v.genre && `${v.genre} genre`,
    v.era && `${v.era} era`,
    v.format && `shot on ${v.format}`,
    v.stock && `${v.stock} stock`,
    typeof v.frameRate === "number" && `${v.frameRate}fps`,
    typeof v.shutterAngle === "number" && `${v.shutterAngle}° shutter`,
    typeof v.grain === "number" && v.grain > 0 && `grain ${v.grain}/100`,
    v.tempo && tempoPromptText(v.tempo),
    v.productionValue && `${v.productionValue} production value`,
  );
}

function cameraText(v: CameraSetup): string {
  return list(
    v.body,
    v.sensor && `${v.sensor} sensor`,
    v.sensorNoise && `${v.sensorNoise} noise`,
    v.height && `${v.height} camera height`,
    v.angle && `${v.angle} angle`,
    v.distance && `${v.distance} distance`,
  );
}

function lensText(v: LensSetup, aperture?: ApertureSetup): string {
  return list(
    v.focalLengthMm && `${v.focalLengthMm}mm`,
    v.type && `${v.type} lens`,
    v.character,
    typeof v.breathing === "number" && v.breathing > 0 && `lens breathing ${v.breathing}/100`,
    aperture && `T/${aperture.fStop}`,
    aperture?.depthOfField && `${aperture.depthOfField} depth of field`,
    aperture?.bokeh && `${aperture.bokeh} bokeh`,
  );
}

function apertureText(v: ApertureSetup): string {
  return list(`T/${v.fStop}`, v.depthOfField && `${v.depthOfField} depth of field`, v.bokeh && `${v.bokeh} bokeh`);
}

function movementText(v: MovementPreset): string {
  if (v.motionType === "static") return "locked-off static frame, no camera movement";
  return list(
    `${v.speed} ${v.motionType}`,
    v.direction && v.direction !== "none" && `${v.direction}`,
    v.maxDegrees > 0 && `up to ${v.maxDegrees}°`,
    v.range > 0 && `travel ${Math.round(v.range * 100)}% of stage`,
    v.easing && `${v.easing} easing`,
    v.tracking !== "none" && `tracking ${v.tracking}`,
    v.parallax > 0 && `parallax ${v.parallax}/100`,
    v.roll !== 0 && `roll ${v.roll}°`,
    v.heightChange !== 0 && `height change ${v.heightChange}`,
    v.focusBehavior && `${v.focusBehavior} focus`,
    v.endBehavior && `ends ${v.endBehavior}`,
  );
}

function compositionText(v: CompositionSetup): string {
  return list(
    v.framing,
    v.rule && `${v.rule} composition`,
    v.subjectPlacement && `subject ${v.subjectPlacement}`,
    v.headroom && `${v.headroom} headroom`,
    v.leadRoom && `${v.leadRoom} lead room`,
    v.horizon && `${v.horizon} horizon`,
    typeof v.negativeSpace === "number" && v.negativeSpace > 0 &&
      `negative space ${v.negativeSpace}/100`,
    typeof v.tiltDegrees === "number" && v.tiltDegrees !== 0 &&
      `${v.tiltDegrees}° dutch tilt`,
  );
}

function focusText(v: FocusSetup): string {
  return list(
    `focus on ${v.focusTarget}`,
    `${v.focusMode} focus`,
    v.rackDirection && v.rackDirection !== "none" && `rack ${v.rackDirection}`,
    v.focusPlaneDepth,
    typeof v.depthOfFieldTightness === "number" &&
      `depth-of-field tightness ${v.depthOfFieldTightness}/100`,
    v.focusStack && "focus-stacked sharpness",
  );
}

function lightingText(v: LightingSetup): string {
  const rig = (v.lights ?? []).slice(0, 6).map((l) =>
    list(
      `${l.type}`,
      l.position,
      l.direction && `pointing ${l.direction}`,
      l.height && `${l.height} height`,
      `intensity ${l.intensity}/100`,
      `${l.temperature}K`,
      `hardness ${l.hardness}/100`,
      `${l.falloff} falloff`,
    )
  );
  return list(
    v.mood && `${v.mood} lighting`,
    v.ratio && `${v.ratio} key-to-fill ratio`,
    rig.length > 0 && `rig: ${rig.join(" | ")}`,
  );
}

function colorText(v: ColorPalette): string {
  const swatches = (v.swatches ?? []).slice(0, 5).map((s) => s.name ? `${s.hex} (${s.name})` : s.hex);
  return list(
    swatches.length > 0 && `palette ${swatches.join(" ")}`,
    v.shadowHue && `${v.shadowHue} shadows`,
    v.midtoneHue && `${v.midtoneHue} midtones`,
    v.highlightHue && `${v.highlightHue} highlights`,
    `contrast ${v.contrast}/100`,
    `saturation ${v.saturation}/100`,
    v.blackBehavior && `${v.blackBehavior} blacks`,
    v.highlightBehavior && `${v.highlightBehavior} highlight roll-off`,
    v.skinToneTreatment && `${v.skinToneTreatment} skin tones`,
    typeof v.fade === "number" && v.fade > 0 && `fade ${v.fade}/100`,
  );
}

function opticsText(v: OpticsSetup): string {
  const jewelry = v.jewelry
    ? list(
      `sparkle ${v.jewelry.sparkle}/100`,
      `white brilliance ${v.jewelry.whiteBrilliance}/100`,
      `rainbow fire ${v.jewelry.rainbowFire}/100`,
      `glint size ${v.jewelry.glintSize}/100`,
      `bloom ${v.jewelry.bloom}/100`,
      `starburst ${v.jewelry.starburst}/100`,
    )
    : "";
  return list(
    v.flare && v.flare !== "none" && `${v.flare} flare`,
    v.diffusion > 0 && `diffusion ${v.diffusion}/100`,
    v.halation > 0 && `halation ${v.halation}/100`,
    v.chromaticAberration > 0 && `chromatic aberration ${v.chromaticAberration}/100`,
    v.vignette > 0 && `vignette ${v.vignette}/100`,
    v.distortion > 0 && `distortion ${v.distortion}/100`,
    typeof v.bloom === "number" && v.bloom > 0 && `bloom ${v.bloom}/100`,
    jewelry && `jewelry sparkle behaviour: ${jewelry}`,
  );
}

function atmosphereText(v: AtmosphereSetup): string {
  return list(
    v.timeOfDay && v.timeOfDay !== "unspecified" && `${v.timeOfDay}`,
    v.weather && v.weather !== "clear" && `${v.weather} weather`,
    v.haze > 0 && `atmospheric haze ${v.haze}/100`,
    v.smoke > 0 && `smoke ${v.smoke}/100`,
    v.particles && v.particles !== "none" && `${v.particles} in the air`,
    typeof v.intensity === "number" && `atmosphere intensity ${v.intensity}/100`,
  );
}

function characterText(v: CharacterConfig): string {
  const level = (label: string, value: unknown) =>
    typeof value === "number" ? `${label} ${value}/100` : "";
  return list(
    v.emotion && `performance reads ${v.emotion}`,
    v.expression,
    v.emotion && level("emotion intensity", v.emotionIntensity),
    v.eyeLine && `eye line ${v.eyeLine}`,
    v.bodyLanguage && `${v.bodyLanguage} body language`,
    v.blocking,
    v.motion && `${v.motion} movement`,
    level("energy", v.energy),
    level("eye contact", v.eyeContact),
    level("head movement", v.headMovement),
    level("gesture level", v.gestureLevel),
    level("body tension", v.bodyTension),
    level("walking speed", v.walkingSpeed),
    level("performance intensity", v.performanceIntensity),
    level("stillness", v.stillness),
    level("interaction level", v.interactionLevel),
    v.identityReferenceIds?.length &&
      `identity locked to ${v.identityReferenceIds.length} character reference${
        v.identityReferenceIds.length === 1 ? "" : "s"
      }`,
    v.wardrobeAuthority && `wardrobe ${v.wardrobeAuthority}`,
  );
}

/** Prose for one director field — model-independent; routing decides the use. */
export function describeDirectorField(
  field: DirectorConfigField,
  value: unknown,
  extras?: { aperture?: ApertureSetup },
): string {
  if (value == null) return "";
  switch (field) {
    case "filmSetup":
      return filmSetupText(value as FilmSetup);
    case "camera":
      return cameraText(value as CameraSetup);
    case "lens":
      return lensText(value as LensSetup, extras?.aperture);
    case "aperture":
      return apertureText(value as ApertureSetup);
    case "movement":
      return movementText(value as MovementPreset);
    case "composition":
      return compositionText(value as CompositionSetup);
    case "focus":
      return focusText(value as FocusSetup);
    case "lighting":
      return lightingText(value as LightingSetup);
    case "color":
      return colorText(value as ColorPalette);
    case "optics":
      return opticsText(value as OpticsSetup);
    case "atmosphere":
      return atmosphereText(value as AtmosphereSetup);
    case "character":
      return characterText(value as CharacterConfig);
    default:
      return "";
  }
}

/* ------------------------------------------------------------------ */
/* Adapters                                                            */
/* ------------------------------------------------------------------ */

export interface ModelAdapter {
  model: CinemaVideoModelKey;
  capabilities: ModelCapabilities;
  /** How a director field reaches this model. */
  resolveField(field: DirectorConfigField, value: unknown, extras?: { aperture?: ApertureSetup }): FieldResolution;
  /**
   * Native bottom-bar params. Throws when a requested option the model cannot
   * do is passed in — requested === submitted, never a silent downgrade.
   */
  resolveNativeParams(request: {
    resolution?: string | null;
    aspectRatio?: string | null;
    duration?: string | number | null;
    generateAudio?: boolean | null;
  }): Record<string, unknown>;
}

function fieldResolution(
  field: DirectorConfigField,
  value: unknown,
  extras?: { aperture?: ApertureSetup },
): FieldResolution {
  const promptText = describeDirectorField(field, value, extras);
  // Camera aspect ratio is the only cinematography value some models take
  // natively; it is handled by resolveNativeParams, not here.
  if (!promptText) return { support: "UNSUPPORTED" };
  return { support: "PROMPT_BASED", promptText };
}

function createAdapter(model: CinemaVideoModelKey): ModelAdapter {
  const capabilities = CINEMA_MODEL_CAPABILITIES[model];

  return {
    model,
    capabilities,
    resolveField: (field, value, extras) => fieldResolution(field, value, extras),
    resolveNativeParams(request) {
      const params: Record<string, unknown> = {};

      /* Resolution ---------------------------------------------------- */
      const requestedResolution = String(request.resolution ?? "").trim().toLowerCase();
      if (requestedResolution) {
        if (capabilities.resolutions.length === 0) {
          throw new Error(
            `${capabilities.label} has no resolution setting — its output size is provider-fixed`,
          );
        }
        if (!capabilities.resolutions.includes(requestedResolution)) {
          throw new Error(
            `${capabilities.label} cannot render ${requestedResolution.toUpperCase()} — supported: ${
              capabilities.resolutions.map((r) => r.toUpperCase()).join(", ")
            }`,
          );
        }
        params.resolution = requestedResolution;
      }

      /* Aspect ratio -------------------------------------------------- */
      const requestedAspect = String(request.aspectRatio ?? "").trim();
      if (requestedAspect) {
        if (capabilities.fixedAspect) {
          if (requestedAspect !== capabilities.fixedAspect) {
            throw new Error(
              `${capabilities.label} always renders ${capabilities.fixedAspect} — ${requestedAspect} is not available`,
            );
          }
          params.aspect_ratio = capabilities.fixedAspect;
        } else if (capabilities.aspectRatios.length === 0) {
          throw new Error(
            `${capabilities.label} has no aspect-ratio setting — frame it through the prompt instead`,
          );
        } else if (!capabilities.aspectRatios.includes(requestedAspect)) {
          throw new Error(
            `${capabilities.label} cannot render ${requestedAspect} — supported: ${
              capabilities.aspectRatios.join(", ")
            }`,
          );
        } else {
          params.aspect_ratio = requestedAspect;
        }
      } else if (capabilities.fixedAspect) {
        params.aspect_ratio = capabilities.fixedAspect;
      }

      /* Duration ------------------------------------------------------ */
      const requestedDuration = String(request.duration ?? "").trim().toLowerCase();
      if (requestedDuration) {
        if (!capabilities.durations.includes(requestedDuration)) {
          throw new Error(
            `${capabilities.label} cannot render ${requestedDuration}s — supported: ${
              capabilities.durations.join(", ")
            }`,
          );
        }
        params.duration = requestedDuration;
      }

      /* Audio --------------------------------------------------------- */
      if (capabilities.supportsAudio && request.generateAudio != null) {
        params.generate_audio = request.generateAudio === true;
      }

      return params;
    },
  };
}

export const kling3ProAdapter = createAdapter("kling-3.0-pro");
export const kling3StandardAdapter = createAdapter("kling-3.0-standard");
export const kling25Adapter = createAdapter("kling-2.5");
export const seedanceAdapter = createAdapter("seedance-2.0");
export const seedanceFastAdapter = createAdapter("seedance-2.0-fast");

export const CINEMA_MODEL_ADAPTERS: Record<CinemaVideoModelKey, ModelAdapter> = {
  "kling-3.0-pro": kling3ProAdapter,
  "kling-3.0-standard": kling3StandardAdapter,
  "kling-2.5": kling25Adapter,
  "seedance-2.0": seedanceAdapter,
  "seedance-2.0-fast": seedanceFastAdapter,
};

export function getCinemaModelAdapter(model: unknown): ModelAdapter {
  return CINEMA_MODEL_ADAPTERS[resolveCinemaModelKey(model)];
}
