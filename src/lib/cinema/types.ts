/**
 * FUSE Cinema — canonical schema.
 * Additive and isolated: nothing here is imported by Jewelry Swap, Outfit Swap,
 * Generation Studio, billing, or auth.
 */

export type ConfigSource =
  | "USER"
  | "DIRECTOR_AGENT"
  | "PRESET"
  | "REFERENCE_ANALYSIS"
  | "PROJECT_DEFAULT"
  | "SCENE_DEFAULT"
  | "SYSTEM_DEFAULT";

export type Sourced<T> = { value: T; source: ConfigSource };

/* ------------------------------------------------------------------ */
/* Supporting value types                                              */
/* ------------------------------------------------------------------ */

export type ColorSwatch = { hex: string; name?: string; weight?: number };

export type ColorPalette = {
  swatches: ColorSwatch[];
  shadowHue: string;
  midtoneHue: string;
  highlightHue: string;
  /** Kelvin-ish creative temperature, negative = cooler. */
  temperature: number;
  /** Green ↔ magenta tint. */
  tint: number;
  contrast: number;
  saturation: number;
  blackBehavior: "crushed" | "lifted" | "neutral" | "filmic";
  highlightBehavior: "clipped" | "rolled-off" | "bloomed" | "neutral";
  skinToneTreatment: "natural" | "warm" | "cool" | "desaturated" | "golden" | "porcelain";
  /* Additive grade controls (advanced mode + reference analysis). 0–100. */
  highlights?: number;
  shadows?: number;
  blacks?: number;
  whites?: number;
  fade?: number;
  grain?: number;
  sharpness?: number;
  halation?: number;
  /** Dominant hue names observed in the reference / preset. */
  dominantHues?: string[];

};

export type CinemaLightType =
  | "key"
  | "fill"
  | "rim"
  | "practical"
  | "bounce"
  | "ambient"
  | "background"
  | "kicker"
  // Additive fixture vocabulary (manual rig builder).
  | "softbox"
  | "strip"
  | "point"
  | "fresnel"
  | "spotlight"
  | "window"
  | "negative-fill"
  | "led-panel"
  | "tube"
  | "neon";

export type CinemaLight = {
  id: string;
  type: CinemaLightType;
  /** Clock/stage position, e.g. "camera left", "3/4 front". */
  position: string;
  /** Direction the light points, e.g. "toward subject", "raking". */
  direction: string;
  /** Height relative to subject eyeline. */
  height: "below" | "eye-level" | "above" | "top" | "overhead";
  /** Relative source size (drives softness). */
  size: number;
  intensity: number;
  temperature: number;
  tint: number;
  hardness: number;
  falloff: "fast" | "medium" | "slow";
};

export type LightingSetup = {
  lights: CinemaLight[];
  ratio?: string;
  mood?: string;
};

export type MovementPreset = {
  motionType:
    | "static"
    | "pan"
    | "tilt"
    | "dolly"
    | "truck"
    | "pedestal"
    | "orbit"
    | "crane"
    | "handheld"
    | "zoom"
    | "push-in"
    | "pull-out";
  direction: string;
  speed: "very-slow" | "slow" | "medium" | "fast";
  /** Normalized travel range 0..1 of the available stage. */
  range: number;
  maxDegrees: number;
  easing: "linear" | "ease-in" | "ease-out" | "ease-in-out";
  tracking: "none" | "subject" | "point-of-interest";
  parallax: number;
  roll: number;
  heightChange: number;
  focusBehavior: "locked" | "follow-focus" | "rack" | "breathing";
  endBehavior: "settle" | "continue" | "hard-cut";
  envelope: {
    maxOrbit: number;
    geometryRequirements: string[];
  };
};

export type FilmSetup = {
  format: string;
  stock?: string;
  grain?: number;
  gate?: string;
  frameRate?: number;
  shutterAngle?: number;
  /* Additive Film Setup selectors (CINEMA 9). */
  productionType?: string;
  genre?: string;
  era?: string;
  tempo?: string;
  productionValue?: string;
};

export type CameraSetup = {
  body: string;
  sensor: string;
  /** Advanced-only: ISO / sensor-noise character ("auto" when unset). */
  sensorNoise?: string;
  aspectRatio: string;
  height: string;
  angle: string;
  distance: string;
};

export type LensSetup = {
  focalLengthMm: number;
  type: "spherical" | "anamorphic" | "macro" | "tilt-shift";
  character: string;
  breathing?: number;
};

export type ApertureSetup = {
  fStop: number;
  depthOfField: "deep" | "medium" | "shallow" | "razor";
  bokeh: string;
};

export type CompositionSetup = {
  framing: string;
  rule: string;
  headroom?: string;
  leadRoom?: string;
  subjectPlacement: string;
  horizon?: string;
  /* Additive advanced controls (0–100 normalized unless noted). */
  subjectX?: number;
  subjectY?: number;
  horizonPosition?: number;
  headroomAmount?: number;
  leadRoomAmount?: number;
  negativeSpace?: number;
  framingScale?: number;
  cameraHeight?: number;
  /** Dutch tilt in degrees, negative = counter-clockwise. */
  tiltDegrees?: number;
};

export type FocusSetup = {
  focusTarget: string;
  focusMode: "locked" | "rack" | "follow";
  focusPlaneDepth?: string;
  /** Additive: id/name of the selected Cinema focus preset. */
  presetId?: string;
  presetName?: string;
  /** Rack direction when focusMode is "rack". */
  rackDirection?: "near-to-far" | "far-to-near" | "none";
  /** 0–100 depth-of-field tightness hint. */
  depthOfFieldTightness?: number;
  /** 0–100 lens breathing character. */
  breathing?: number;
  focusStack?: boolean;
};

export type CinemaJewelryOptics = {
  sparkle: number;
  whiteBrilliance: number;
  rainbowFire: number;
  glintSize: number;
  glintCoverage: number;
  bloom: number;
  starburst: number;
  fireSaturation: number;
};

export type OpticsSetup = {
  flare: string;
  diffusion: number;
  halation: number;
  chromaticAberration: number;
  vignette: number;
  distortion: number;
  /* Additive general optics. */
  bloom?: number;
  bokeh?: string;
  highlightBehavior?: "clipped" | "rolled-off" | "bloomed" | "neutral";
  /**
   * Cinema-LOCAL jewelry optics. Deliberately separate from the Jewelry Swap
   * Diamond Optics profile — no shared code or imports.
   */
  jewelry?: CinemaJewelryOptics;
};

export type AtmosphereSetup = {
  haze: number;
  smoke: number;
  particles: string;
  weather: string;
  timeOfDay: string;
  /* Additive: selected atmosphere preset + its intensity (0–100). */
  presetId?: string;
  presetName?: string;
  intensity?: number;
};

/**
 * CHARACTER / PERFORMANCE direction (CV5).
 * Every field is PROMPT_BASED on every current model — no model exposes native
 * performance controls, so this compiles to model-safe prose only.
 */
export type CharacterConfig = {
  /** Ids of CinemaReferences carrying the "Character" role that drive identity. */
  identityReferenceIds: string[];
  /** Face/performance description (usually seeded by the chosen emotion). */
  expression: string;
  /** Emotion preset id, e.g. "confident". */
  emotion: string;
  /** 0–100 */
  emotionIntensity: number;
  eyeLine: string;
  bodyLanguage: string;
  /** Overall performance energy, 0–100. */
  energy: number;
  blocking: string;
  motion: string;
  /** How much the subject engages other subjects / the product, 0–100. */
  interactionLevel: number;
  wardrobeAuthority: string;
  /* Performance parameters — all 0–100. */
  eyeContact: number;
  headMovement: number;
  gestureLevel: number;
  bodyTension: number;
  walkingSpeed: number;
  performanceIntensity: number;
  stillness: number;
};




/* ------------------------------------------------------------------ */
/* Director config                                                     */
/* ------------------------------------------------------------------ */

export interface DirectorConfig {
  filmSetup: Sourced<FilmSetup>;
  camera: Sourced<CameraSetup>;
  lens: Sourced<LensSetup>;
  aperture: Sourced<ApertureSetup>;
  movement: Sourced<MovementPreset>;
  composition: Sourced<CompositionSetup>;
  focus: Sourced<FocusSetup>;
  lighting: Sourced<LightingSetup>;
  color: Sourced<ColorPalette>;
  optics: Sourced<OpticsSetup>;
  atmosphere: Sourced<AtmosphereSetup>;
  character: Sourced<CharacterConfig>;

}

export type DirectorConfigField = keyof DirectorConfig;

export type PartialDirectorConfig = Partial<DirectorConfig>;

/* ------------------------------------------------------------------ */
/* References / presets / generations                                  */
/* ------------------------------------------------------------------ */

export type ReferenceRole =
  | "Character"
  | "Location"
  | "Product"
  | "Camera"
  | "Composition"
  | "Lighting"
  | "Palette"
  | "Environment"
  | "Texture"
  | "Motion";

export type CinemaReference = {
  id: string;
  url: string;
  roles: ReferenceRole[];
  strengths: Partial<Record<ReferenceRole, number>>;
  roleSource: ConfigSource;
  /** Storage path (fuse-assets) and display name. Order carries NO authority. */
  path?: string;
  name?: string;
};

/** Persisted Cinema workspace (cinema_projects.project_state). */
export type CinemaProjectState = {
  version: 1;
  prompt: string;
  config: DirectorConfig;
  references: CinemaReference[];
  scenes: CinemaScene[];
  shots: CinemaShot[];
  advanced: boolean;
  /**
   * FINISH metadata per generation id — non-destructive grade only.
   * Never implies the generation was re-rendered.
   */
  finishes?: Record<string, import("./finish").CinemaFinish>;
};


export type CinemaProjectSummary = {
  id: string;
  name: string;
  updatedAt: string;
};

export type CinemaPresetType = "camera" | "lighting" | "color" | "movement" | "full";

export type CinemaPreset = {
  id: string;
  type: CinemaPresetType;
  name: string;
  category: string;
  tags: string[];
  thumbnail: string;
  config: PartialDirectorConfig;
  builtin: boolean;
  userId?: string;
};

export type CinemaModelConfig = {
  model: string;
  /** Model-native parameters exactly as submitted to the provider. */
  nativeParams: Record<string, unknown>;
};

export type CinemaGenerationStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export type CinemaGeneration = {
  id: string;
  createdAt: string;
  outputUrl: string | null;
  status: CinemaGenerationStatus;
  snapshot: {
    prompt: string;
    model: string;
    nativeParams: Record<string, unknown>;
    resolvedConfig: DirectorConfig;
    references: CinemaReference[];
    presetIds: string[];
    directorAgentState: Record<string, unknown> | null;
  };
};

export type CinemaShot = {
  id: string;
  /** Optional display label; the board falls back to SHOT 01, SHOT 02, … */
  name?: string;
  prompt: string;
  directorOverrides?: PartialDirectorConfig;
  modelConfig?: CinemaModelConfig;
  references: CinemaReference[];
  generations: CinemaGeneration[];
  /** Ids of generations belonging to THIS shot (history is stored server-side). */
  generationIds?: string[];
};

export type CinemaScene = {
  id: string;
  name: string;
  sceneDefaults?: PartialDirectorConfig;
  /** CV8 — LOCK SCENE CONTINUITY: pins continuity fields at scene level. */
  continuityLock?: boolean;
  shots: CinemaShot[];
};


export type CinemaProject = {
  id: string;
  userId: string;
  name: string;
  projectDefaults: DirectorConfig;
  references: CinemaReference[];
  scenes: CinemaScene[];
  brief?: string;
};
