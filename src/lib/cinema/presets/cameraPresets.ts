/**
 * FUSE Cinema — builtin CAMERA BODY presets.
 *
 * These are version-controlled CODE DATA fragments, not database rows.
 * Each preset is an IMAGE-CHARACTER preset (how the picture looks/feels),
 * NOT a claim about hardware used. Nothing here is seeded to Supabase.
 */

import type { PartialDirectorConfig } from "../types";

export type CameraPresetCategory =
  | "Digital Cinema"
  | "Commercial / Medium Format"
  | "Film"
  | "Found Footage"
  | "Specialty";

export type CinemaCameraPreset = {
  id: string;
  name: string;
  category: CameraPresetCategory;
  tags: string[];
  /** Simple representative gradient (no generated imagery, no credits spent). */
  thumbnail: string;
  config: PartialDirectorConfig;
};

const camera = (
  body: string,
  sensor: string,
  extra?: Partial<PartialDirectorConfig>,
): PartialDirectorConfig => ({
  camera: {
    source: "PRESET",
    value: {
      body,
      sensor,
      aspectRatio: "9:16",
      height: "eye-level",
      angle: "straight-on",
      distance: "medium",
    },
  },
  ...extra,
});

export const CAMERA_PRESET_CATEGORIES: CameraPresetCategory[] = [
  "Digital Cinema",
  "Commercial / Medium Format",
  "Film",
  "Found Footage",
  "Specialty",
];

export const CAMERA_PRESETS: CinemaCameraPreset[] = [
  /* ---------------- Digital Cinema ---------------- */
  {
    id: "cam-alexa-35",
    name: "Alexa 35 Character",
    category: "Digital Cinema",
    tags: ["clean", "filmic", "high-dynamic-range"],
    thumbnail: "linear-gradient(135deg,#1b2430,#3d4b5c)",
    config: camera("alexa 35 image character", "super35", {
      filmSetup: {
        source: "PRESET",
        value: { format: "digital", grain: 4, frameRate: 24, shutterAngle: 180 },
      },
    }),
  },
  {
    id: "cam-alexa-mini-lf",
    name: "Alexa Mini LF Character",
    category: "Digital Cinema",
    tags: ["large-format", "soft-highlights", "filmic"],
    thumbnail: "linear-gradient(135deg,#1d2733,#4a5a6b)",
    config: camera("alexa mini lf image character", "large-format"),
  },
  {
    id: "cam-venice-2",
    name: "Venice 2 Character",
    category: "Digital Cinema",
    tags: ["full-frame", "rich-color", "clean"],
    thumbnail: "linear-gradient(135deg,#161f2b,#2f4a63)",
    config: camera("venice 2 image character", "full-frame"),
  },
  {
    id: "cam-red-v-raptor",
    name: "V-Raptor Character",
    category: "Digital Cinema",
    tags: ["crisp", "high-resolution", "punchy"],
    thumbnail: "linear-gradient(135deg,#221820,#5c2f3a)",
    config: camera("v-raptor image character", "large-format"),
  },
  {
    id: "cam-clean-digital",
    name: "Clean Digital",
    category: "Digital Cinema",
    tags: ["neutral", "clinical", "no-grain"],
    thumbnail: "linear-gradient(135deg,#1a1d21,#41474d)",
    config: camera("clean modern digital", "full-frame", {
      filmSetup: {
        source: "PRESET",
        value: { format: "digital", grain: 0, frameRate: 24, shutterAngle: 180 },
      },
    }),
  },

  /* ---------------- Commercial / Medium Format ---------------- */
  {
    id: "cam-phase-one",
    name: "Phase One Character",
    category: "Commercial / Medium Format",
    tags: ["product", "ultra-detail", "commercial"],
    thumbnail: "linear-gradient(135deg,#1c1c1f,#4d4a44)",
    config: camera("phase one medium format character", "medium-format"),
  },
  {
    id: "cam-hasselblad",
    name: "Hasselblad Character",
    category: "Commercial / Medium Format",
    tags: ["editorial", "smooth-tonality", "natural-color"],
    thumbnail: "linear-gradient(135deg,#1e2022,#57544c)",
    config: camera("hasselblad medium format character", "medium-format"),
  },
  {
    id: "cam-gfx",
    name: "GFX Character",
    category: "Commercial / Medium Format",
    tags: ["fashion", "gentle-contrast", "medium-format"],
    thumbnail: "linear-gradient(135deg,#20222a,#5a5568)",
    config: camera("gfx medium format character", "medium-format"),
  },

  /* ---------------- Film ---------------- */
  {
    id: "cam-35mm-fine",
    name: "35mm Fine Grain",
    category: "Film",
    tags: ["film", "fine-grain", "halation"],
    thumbnail: "linear-gradient(135deg,#241d18,#6b563f)",
    config: camera("35mm motion picture film", "super35", {
      filmSetup: {
        source: "PRESET",
        value: { format: "35mm film", stock: "fine grain daylight", grain: 25, gate: "academy", frameRate: 24, shutterAngle: 180 },
      },
    }),
  },
  {
    id: "cam-35mm-raw",
    name: "35mm Raw Grain",
    category: "Film",
    tags: ["film", "gritty", "pushed"],
    thumbnail: "linear-gradient(135deg,#221a15,#7a5c3c)",
    config: camera("35mm pushed film", "super35", {
      filmSetup: {
        source: "PRESET",
        value: { format: "35mm film", stock: "pushed tungsten", grain: 60, gate: "academy", frameRate: 24, shutterAngle: 180 },
      },
    }),
  },
  {
    id: "cam-super-16",
    name: "Super 16",
    category: "Film",
    tags: ["film", "coarse-grain", "documentary"],
    thumbnail: "linear-gradient(135deg,#1f1d1a,#6a6248)",
    config: camera("super 16 film", "super16", {
      filmSetup: {
        source: "PRESET",
        value: { format: "super 16 film", stock: "16mm negative", grain: 72, gate: "s16", frameRate: 24, shutterAngle: 180 },
      },
    }),
  },
  {
    id: "cam-8mm",
    name: "8mm",
    category: "Film",
    tags: ["film", "nostalgic", "gate-weave"],
    thumbnail: "linear-gradient(135deg,#241c12,#8a6b3a)",
    config: camera("8mm home movie film", "8mm", {
      filmSetup: {
        source: "PRESET",
        value: { format: "8mm film", stock: "reversal", grain: 88, gate: "8mm", frameRate: 18, shutterAngle: 180 },
      },
    }),
  },
  {
    id: "cam-vistavision",
    name: "VistaVision",
    category: "Film",
    tags: ["film", "epic", "large-negative"],
    thumbnail: "linear-gradient(135deg,#1b1e26,#5f6b7d)",
    config: camera("vistavision large-negative film", "vistavision", {
      filmSetup: {
        source: "PRESET",
        value: { format: "vistavision", stock: "large negative", grain: 14, gate: "8-perf", frameRate: 24, shutterAngle: 180 },
      },
    }),
  },

  /* ---------------- Found Footage ---------------- */
  {
    id: "cam-dv",
    name: "DV",
    category: "Found Footage",
    tags: ["lo-fi", "interlaced", "2000s"],
    thumbnail: "linear-gradient(135deg,#12201c,#3c6b56)",
    config: camera("dv camcorder", "1/3-inch video", {
      filmSetup: { source: "PRESET", value: { format: "dv video", grain: 30, frameRate: 30, shutterAngle: 180 } },
    }),
  },
  {
    id: "cam-minidv",
    name: "MiniDV",
    category: "Found Footage",
    tags: ["lo-fi", "handheld", "home-video"],
    thumbnail: "linear-gradient(135deg,#141f21,#3f6a6d)",
    config: camera("minidv camcorder", "1/4-inch video"),
  },
  {
    id: "cam-vhs",
    name: "VHS",
    category: "Found Footage",
    tags: ["tape", "smear", "tracking-noise"],
    thumbnail: "linear-gradient(135deg,#1d1424,#6b3a72)",
    config: camera("vhs tape transfer", "tape video", {
      filmSetup: { source: "PRESET", value: { format: "vhs", grain: 55, frameRate: 30, shutterAngle: 180 } },
    }),
  },
  {
    id: "cam-hi8",
    name: "Hi8",
    category: "Found Footage",
    tags: ["tape", "warm-noise", "90s"],
    thumbnail: "linear-gradient(135deg,#221722,#74436a)",
    config: camera("hi8 tape", "tape video"),
  },
  {
    id: "cam-phone",
    name: "Phone",
    category: "Found Footage",
    tags: ["contemporary", "wide", "sharp"],
    thumbnail: "linear-gradient(135deg,#181c22,#4c5866)",
    config: camera("modern phone camera", "phone sensor"),
  },
  {
    id: "cam-webcam",
    name: "Webcam",
    category: "Found Footage",
    tags: ["lo-fi", "compressed", "frontal"],
    thumbnail: "linear-gradient(135deg,#161a1e,#41505c)",
    config: camera("webcam capture", "small video sensor"),
  },
  {
    id: "cam-bodycam",
    name: "Bodycam",
    category: "Found Footage",
    tags: ["wide", "documentary", "distorted"],
    thumbnail: "linear-gradient(135deg,#14181b,#3c4a4f)",
    config: camera("bodycam capture", "small video sensor"),
  },
  {
    id: "cam-security",
    name: "Security Cam",
    category: "Found Footage",
    tags: ["surveillance", "high-angle", "noisy"],
    thumbnail: "linear-gradient(135deg,#101416,#33454a)",
    config: camera("security camera", "surveillance sensor", {
      camera: {
        source: "PRESET",
        value: {
          body: "security camera",
          sensor: "surveillance sensor",
          aspectRatio: "9:16",
          height: "above",
          angle: "high-angle",
          distance: "wide",
        },
      },
    }),
  },
  {
    id: "cam-dashcam",
    name: "Dashcam",
    category: "Found Footage",
    tags: ["wide", "vehicle", "flat"],
    thumbnail: "linear-gradient(135deg,#131719,#3a4a52)",
    config: camera("dashcam capture", "small video sensor"),
  },

  /* ---------------- Specialty ---------------- */
  {
    id: "cam-high-speed",
    name: "High Speed",
    category: "Specialty",
    tags: ["slow-motion", "crisp", "liquid"],
    thumbnail: "linear-gradient(135deg,#101b26,#2f6480)",
    config: camera("high speed camera", "super35", {
      filmSetup: { source: "PRESET", value: { format: "digital", grain: 0, frameRate: 240, shutterAngle: 180 } },
    }),
  },
  {
    id: "cam-probe-macro",
    name: "Probe Macro",
    category: "Specialty",
    tags: ["macro", "jewelry", "immersive"],
    thumbnail: "linear-gradient(135deg,#191622,#5b4a86)",
    config: camera("probe macro rig", "full-frame", {
      camera: {
        source: "PRESET",
        value: {
          body: "probe macro rig",
          sensor: "full-frame",
          aspectRatio: "9:16",
          height: "eye-level",
          angle: "straight-on",
          distance: "extreme close-up",
        },
      },
    }),
  },
  {
    id: "cam-aerial",
    name: "Aerial",
    category: "Specialty",
    tags: ["drone", "wide", "smooth"],
    thumbnail: "linear-gradient(135deg,#111e2b,#37718f)",
    config: camera("aerial drone", "1-inch sensor", {
      camera: {
        source: "PRESET",
        value: {
          body: "aerial drone",
          sensor: "1-inch sensor",
          aspectRatio: "9:16",
          height: "top",
          angle: "high-angle",
          distance: "wide",
        },
      },
    }),
  },
  {
    id: "cam-underwater",
    name: "Underwater",
    category: "Specialty",
    tags: ["submerged", "diffused", "caustics"],
    thumbnail: "linear-gradient(135deg,#0d1c22,#227a86)",
    config: camera("underwater housing", "super35"),
  },
];

export function findCameraPresetByBody(body: string | undefined): CinemaCameraPreset | undefined {
  if (!body) return undefined;
  return CAMERA_PRESETS.find((p) => {
    const value = p.config.camera?.value;
    return value ? value.body === body : false;
  });
}
