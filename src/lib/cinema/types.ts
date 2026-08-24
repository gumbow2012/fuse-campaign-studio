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
};

export type CinemaLightType =
  | "key"
  | "fill"
  | "rim"
  | "practical"
  | "bounce"
  | "ambient"
  | "background"
  | "kicker";

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
};

export type FocusSetup = {
  focusTarget: string;
  focusMode: "locked" | "rack" | "follow";
  focusPlaneDepth?: string;
};

export type OpticsSetup = {
  flare: string;
  diffusion: number;
  halation: number;
  chromaticAberration: number;
  vignette: number;
  distortion: number;
};

export type AtmosphereSetup = {
  haze: number;
  smoke: number;
  particles: string;
  weather: string;
  timeOfDay: string;
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
  prompt: string;
  directorOverrides?: PartialDirectorConfig;
  modelConfig: CinemaModelConfig;
  references: CinemaReference[];
  generations: CinemaGeneration[];
};

export type CinemaScene = {
  id: string;
  name: string;
  sceneDefaults?: PartialDirectorConfig;
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
