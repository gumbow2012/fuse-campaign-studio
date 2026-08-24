/**
 * FUSE Cinema — the ONLY place cinematography inheritance lives.
 *
 * Per-field precedence: SHOT override ▸ SCENE default ▸ PROJECT default ▸ SYSTEM default.
 * A director-agent proposal merges ONLY where the current source is not "USER".
 */

import type {
  ColorPalette,
  DirectorConfig,
  DirectorConfigField,
  PartialDirectorConfig,
  CinemaProject,
  Sourced,
} from "./types";

export type ResolvedDirectorConfig = DirectorConfig;

const DIRECTOR_FIELDS: DirectorConfigField[] = [
  "filmSetup",
  "camera",
  "lens",
  "aperture",
  "movement",
  "composition",
  "focus",
  "lighting",
  "color",
  "optics",
  "atmosphere",
];

const SYSTEM_PALETTE: ColorPalette = {
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
};

export const SYSTEM_DEFAULT_CONFIG: DirectorConfig = {
  filmSetup: {
    source: "SYSTEM_DEFAULT",
    value: { format: "digital", grain: 0, frameRate: 24, shutterAngle: 180 },
  },
  camera: {
    source: "SYSTEM_DEFAULT",
    value: {
      body: "modern cinema camera",
      sensor: "super35",
      aspectRatio: "9:16",
      height: "eye-level",
      angle: "straight-on",
      distance: "medium",
    },
  },
  lens: {
    source: "SYSTEM_DEFAULT",
    value: { focalLengthMm: 50, type: "spherical", character: "clean, neutral", breathing: 0 },
  },
  aperture: {
    source: "SYSTEM_DEFAULT",
    value: { fStop: 2.8, depthOfField: "medium", bokeh: "round, neutral" },
  },
  movement: {
    source: "SYSTEM_DEFAULT",
    value: {
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
    },
  },
  composition: {
    source: "SYSTEM_DEFAULT",
    value: {
      framing: "medium shot",
      rule: "centered",
      subjectPlacement: "center",
    },
  },
  focus: {
    source: "SYSTEM_DEFAULT",
    value: { focusTarget: "subject", focusMode: "locked" },
  },
  lighting: {
    source: "SYSTEM_DEFAULT",
    value: { lights: [], ratio: "2:1", mood: "neutral" },
  },
  color: { source: "SYSTEM_DEFAULT", value: SYSTEM_PALETTE },
  optics: {
    source: "SYSTEM_DEFAULT",
    value: { flare: "none", diffusion: 0, halation: 0, chromaticAberration: 0, vignette: 0, distortion: 0 },
  },
  atmosphere: {
    source: "SYSTEM_DEFAULT",
    value: { haze: 0, smoke: 0, particles: "none", weather: "clear", timeOfDay: "unspecified" },
  },
};

function pick(
  field: DirectorConfigField,
  layers: Array<PartialDirectorConfig | undefined>,
): Sourced<unknown> {
  for (const layer of layers) {
    const entry = layer?.[field] as Sourced<unknown> | undefined;
    if (entry && entry.value !== undefined && entry.value !== null) return entry;
  }
  return SYSTEM_DEFAULT_CONFIG[field] as Sourced<unknown>;
}

/**
 * Resolve the effective director config for one shot.
 * `directorProposal` never overwrites a field whose resolved source is "USER".
 */
export function resolveCinemaConfig(
  project: CinemaProject,
  sceneId: string,
  shotId: string,
  directorProposal?: PartialDirectorConfig,
): ResolvedDirectorConfig {
  const scene = project.scenes.find((s) => s.id === sceneId);
  const shot = scene?.shots.find((s) => s.id === shotId);

  const layers: Array<PartialDirectorConfig | undefined> = [
    shot?.directorOverrides,
    scene?.sceneDefaults,
    project.projectDefaults,
  ];

  const resolved = {} as Record<DirectorConfigField, Sourced<unknown>>;

  for (const field of DIRECTOR_FIELDS) {
    const current = pick(field, layers);
    const proposed = directorProposal?.[field] as Sourced<unknown> | undefined;

    if (proposed && current.source !== "USER") {
      resolved[field] = { value: proposed.value, source: proposed.source ?? "DIRECTOR_AGENT" };
    } else {
      resolved[field] = current;
    }
  }

  return resolved as unknown as ResolvedDirectorConfig;
}
