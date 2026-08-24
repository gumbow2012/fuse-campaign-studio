/**
 * FUSE Cinema — builtin MOVEMENT presets.
 *
 * Version-controlled CODE DATA fragments (same shape as cameraPresets.ts):
 * { id, name, category, tags[], thumbnail, config: PartialDirectorConfig }.
 * Nothing here is seeded to or read from the database.
 *
 * ENVELOPE CONTRACT: every preset's `envelope.maxOrbit` bounds the motion it is
 * allowed to compile to. `maxDegrees` is the authored amount, `envelope.maxOrbit`
 * is the hard ceiling — a "Micro Orbit 8°" can never expand into a big orbit.
 */

import type { MovementPreset, PartialDirectorConfig } from "../types";

export type MovementPresetCategory =
  | "Static"
  | "Dolly"
  | "Slider"
  | "Orbit"
  | "Macro"
  | "Tracking"
  | "Handheld"
  | "Crane"
  | "Aerial"
  | "High Energy"
  | "Impossible"
  | "Transition";

export type CinemaMovementPreset = {
  id: string;
  name: string;
  category: MovementPresetCategory;
  tags: string[];
  /** Simple representative gradient placeholder (no generated imagery, no credits). */
  thumbnail: string;
  config: PartialDirectorConfig;
};

export const MOVEMENT_PRESET_CATEGORIES: MovementPresetCategory[] = [
  "Static",
  "Dolly",
  "Slider",
  "Orbit",
  "Macro",
  "Tracking",
  "Handheld",
  "Crane",
  "Aerial",
  "High Energy",
  "Impossible",
  "Transition",
];

const GRADIENTS: Record<MovementPresetCategory, string> = {
  Static: "linear-gradient(135deg,#171a1d,#3c4348)",
  Dolly: "linear-gradient(135deg,#141c26,#2f5a80)",
  Slider: "linear-gradient(135deg,#151f22,#2f6f74)",
  Orbit: "linear-gradient(135deg,#181626,#4d3f8a)",
  Macro: "linear-gradient(135deg,#1a1a1e,#7f7a5c)",
  Tracking: "linear-gradient(135deg,#131f1a,#2f7a58)",
  Handheld: "linear-gradient(135deg,#221b16,#7a5636)",
  Crane: "linear-gradient(135deg,#171d2a,#40608f)",
  Aerial: "linear-gradient(135deg,#101d2b,#3277a0)",
  "High Energy": "linear-gradient(135deg,#241318,#a3323f)",
  Impossible: "linear-gradient(135deg,#1b1224,#7a2f92)",
  Transition: "linear-gradient(135deg,#1c1c1c,#6a6a6a)",
};

/** Defaults keep every preset a COMPLETE MovementPreset, envelope included. */
const BASE: MovementPreset = {
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
};

function preset(
  id: string,
  name: string,
  category: MovementPresetCategory,
  tags: string[],
  movement: Partial<MovementPreset> & { envelope: MovementPreset["envelope"] },
): CinemaMovementPreset {
  return {
    id,
    name,
    category,
    tags,
    thumbnail: GRADIENTS[category],
    config: {
      movement: {
        source: "PRESET",
        value: { ...BASE, ...movement },
      },
    },
  };
}

export const MOVEMENT_PRESETS: CinemaMovementPreset[] = [
  /* ------------------------------- Static ------------------------------- */
  preset("mv-locked-off", "Locked Off", "Static", ["static", "tripod", "stable"], {
    motionType: "static",
    envelope: { maxOrbit: 0, geometryRequirements: [] },
  }),
  preset("mv-silent-machine", "Silent Machine", "Static", ["static", "precision", "product"], {
    motionType: "static",
    speed: "very-slow",
    range: 0.02,
    focusBehavior: "locked",
    envelope: { maxOrbit: 1, geometryRequirements: ["stable subject", "clean background"] },
  }),
  preset("mv-breathing-static", "Breathing Static", "Static", ["static", "subtle", "alive"], {
    motionType: "static",
    speed: "very-slow",
    range: 0.04,
    parallax: 2,
    envelope: { maxOrbit: 2, geometryRequirements: [] },
  }),
  preset("mv-pedestal-hold", "Pedestal Hold", "Static", ["static", "vertical", "settle"], {
    motionType: "pedestal",
    direction: "up",
    speed: "very-slow",
    range: 0.05,
    heightChange: 4,
    envelope: { maxOrbit: 0, geometryRequirements: [] },
  }),
  preset("mv-locked-macro-hold", "Locked Macro Hold", "Static", ["static", "macro", "detail"], {
    motionType: "static",
    speed: "very-slow",
    range: 0.01,
    focusBehavior: "locked",
    envelope: { maxOrbit: 1, geometryRequirements: ["macro working distance"] },
  }),

  /* -------------------------------- Dolly ------------------------------- */
  preset("mv-precision-hero-push", "Precision Hero Push", "Dolly", ["push-in", "hero", "product"], {
    motionType: "push-in",
    direction: "toward subject",
    speed: "very-slow",
    range: 0.18,
    easing: "ease-in-out",
    tracking: "subject",
    parallax: 12,
    focusBehavior: "follow-focus",
    envelope: { maxOrbit: 3, geometryRequirements: ["clear path to subject", "centered subject"] },
  }),
  preset("mv-slow-push", "Slow Push", "Dolly", ["push-in", "tension", "classic"], {
    motionType: "push-in",
    direction: "forward",
    speed: "slow",
    range: 0.3,
    parallax: 18,
    focusBehavior: "follow-focus",
    envelope: { maxOrbit: 2, geometryRequirements: ["clear path"] },
  }),
  preset("mv-slow-pull", "Slow Pull", "Dolly", ["pull-out", "reveal", "context"], {
    motionType: "pull-out",
    direction: "backward",
    speed: "slow",
    range: 0.32,
    parallax: 20,
    envelope: { maxOrbit: 2, geometryRequirements: ["clear path behind camera"] },
  }),
  preset("mv-reveal-pull", "Reveal Pull", "Dolly", ["pull-out", "reveal", "environment"], {
    motionType: "pull-out",
    direction: "backward",
    speed: "medium",
    range: 0.5,
    parallax: 28,
    endBehavior: "settle",
    envelope: { maxOrbit: 3, geometryRequirements: ["depth behind camera"] },
  }),
  preset("mv-dolly-left", "Dolly Left", "Dolly", ["lateral", "parallax"], {
    motionType: "truck",
    direction: "left",
    speed: "slow",
    range: 0.28,
    parallax: 30,
    envelope: { maxOrbit: 4, geometryRequirements: ["lateral clearance"] },
  }),
  preset("mv-dolly-right", "Dolly Right", "Dolly", ["lateral", "parallax"], {
    motionType: "truck",
    direction: "right",
    speed: "slow",
    range: 0.28,
    parallax: 30,
    envelope: { maxOrbit: 4, geometryRequirements: ["lateral clearance"] },
  }),
  preset("mv-infinite-dolly", "Infinite Dolly", "Dolly", ["endless", "hypnotic", "loop"], {
    motionType: "dolly",
    direction: "forward",
    speed: "medium",
    range: 0.9,
    easing: "linear",
    parallax: 45,
    endBehavior: "continue",
    envelope: { maxOrbit: 2, geometryRequirements: ["long unobstructed corridor"] },
  }),
  preset("mv-creep-in", "Creep In", "Dolly", ["push-in", "unsettling", "slow"], {
    motionType: "push-in",
    direction: "forward",
    speed: "very-slow",
    range: 0.12,
    easing: "ease-in",
    envelope: { maxOrbit: 1, geometryRequirements: [] },
  }),

  /* -------------------------------- Slider ------------------------------ */
  preset("mv-edge-glide", "Edge Glide", "Slider", ["slider", "edge", "product"], {
    motionType: "truck",
    direction: "along subject edge",
    speed: "very-slow",
    range: 0.2,
    parallax: 22,
    tracking: "point-of-interest",
    focusBehavior: "follow-focus",
    envelope: { maxOrbit: 6, geometryRequirements: ["defined product edge", "raking light"] },
  }),
  preset("mv-surface-scan", "Surface Scan", "Slider", ["slider", "texture", "material"], {
    motionType: "truck",
    direction: "across surface",
    speed: "very-slow",
    range: 0.16,
    parallax: 10,
    focusBehavior: "follow-focus",
    envelope: { maxOrbit: 4, geometryRequirements: ["flat-ish surface", "consistent lighting"] },
  }),
  preset("mv-slider-past-foreground", "Slider Past Foreground", "Slider", ["slider", "parallax", "layered"], {
    motionType: "truck",
    direction: "left to right",
    speed: "slow",
    range: 0.35,
    parallax: 60,
    envelope: { maxOrbit: 5, geometryRequirements: ["foreground occluder"] },
  }),
  preset("mv-slider-reveal", "Slider Reveal", "Slider", ["slider", "reveal", "occlusion"], {
    motionType: "truck",
    direction: "right",
    speed: "slow",
    range: 0.4,
    parallax: 50,
    endBehavior: "settle",
    envelope: { maxOrbit: 5, geometryRequirements: ["occluding element"] },
  }),
  preset("mv-vertical-slide", "Vertical Slide", "Slider", ["slider", "vertical", "graphic"], {
    motionType: "pedestal",
    direction: "up",
    speed: "slow",
    range: 0.3,
    heightChange: 28,
    envelope: { maxOrbit: 2, geometryRequirements: ["vertical clearance"] },
  }),
  preset("mv-slider-with-rack", "Slider + Rack", "Slider", ["slider", "rack-focus", "layered"], {
    motionType: "truck",
    direction: "left",
    speed: "slow",
    range: 0.26,
    parallax: 35,
    focusBehavior: "rack",
    envelope: { maxOrbit: 5, geometryRequirements: ["two depth planes"] },
  }),

  /* -------------------------------- Orbit ------------------------------- */
  preset("mv-micro-orbit-3", "Micro Orbit 3°", "Orbit", ["orbit", "micro", "jewelry"], {
    motionType: "orbit",
    direction: "clockwise",
    speed: "very-slow",
    range: 0.05,
    maxDegrees: 3,
    tracking: "subject",
    parallax: 6,
    focusBehavior: "follow-focus",
    envelope: { maxOrbit: 3, geometryRequirements: ["single hero subject", "no seams behind subject"] },
  }),
  preset("mv-micro-orbit-8", "Micro Orbit 8°", "Orbit", ["orbit", "micro", "product"], {
    motionType: "orbit",
    direction: "clockwise",
    speed: "very-slow",
    range: 0.1,
    maxDegrees: 8,
    tracking: "subject",
    parallax: 12,
    focusBehavior: "follow-focus",
    envelope: { maxOrbit: 8, geometryRequirements: ["single hero subject", "consistent background"] },
  }),
  preset("mv-orbit-15", "Orbit 15°", "Orbit", ["orbit", "subtle"], {
    motionType: "orbit",
    direction: "counter-clockwise",
    speed: "slow",
    range: 0.18,
    maxDegrees: 15,
    tracking: "subject",
    parallax: 20,
    envelope: { maxOrbit: 15, geometryRequirements: ["360° usable background"] },
  }),
  preset("mv-quarter-orbit", "Quarter Orbit", "Orbit", ["orbit", "90-degree", "reveal"], {
    motionType: "orbit",
    direction: "clockwise",
    speed: "slow",
    range: 0.5,
    maxDegrees: 90,
    tracking: "subject",
    parallax: 40,
    envelope: { maxOrbit: 90, geometryRequirements: ["subject resolved from all covered angles"] },
  }),
  preset("mv-half-orbit", "Half Orbit", "Orbit", ["orbit", "180-degree", "showcase"], {
    motionType: "orbit",
    direction: "clockwise",
    speed: "medium",
    range: 0.75,
    maxDegrees: 180,
    tracking: "subject",
    parallax: 55,
    envelope: { maxOrbit: 180, geometryRequirements: ["full front and side coverage"] },
  }),
  preset("mv-full-orbit", "Full Orbit", "Orbit", ["orbit", "turntable", "360"], {
    motionType: "orbit",
    direction: "clockwise",
    speed: "medium",
    range: 1,
    maxDegrees: 360,
    tracking: "subject",
    parallax: 70,
    endBehavior: "continue",
    envelope: { maxOrbit: 360, geometryRequirements: ["full 360° subject coverage", "seamless background"] },
  }),
  preset("mv-low-orbit", "Low Orbit", "Orbit", ["orbit", "low-angle", "heroic"], {
    motionType: "orbit",
    direction: "counter-clockwise",
    speed: "slow",
    range: 0.3,
    maxDegrees: 30,
    heightChange: -12,
    tracking: "subject",
    envelope: { maxOrbit: 30, geometryRequirements: ["low camera clearance"] },
  }),
  preset("mv-rising-orbit", "Rising Orbit", "Orbit", ["orbit", "rise", "reveal"], {
    motionType: "orbit",
    direction: "clockwise",
    speed: "slow",
    range: 0.4,
    maxDegrees: 45,
    heightChange: 30,
    tracking: "subject",
    envelope: { maxOrbit: 45, geometryRequirements: ["vertical clearance", "clean top angle"] },
  }),

  /* -------------------------------- Macro ------------------------------- */
  preset("mv-macro-descent", "Macro Descent", "Macro", ["macro", "descend", "detail"], {
    motionType: "pedestal",
    direction: "down toward surface",
    speed: "very-slow",
    range: 0.12,
    heightChange: -18,
    focusBehavior: "follow-focus",
    envelope: { maxOrbit: 2, geometryRequirements: ["macro working distance", "flat approach"] },
  }),
  preset("mv-macro-push", "Macro Push", "Macro", ["macro", "push-in", "facet"], {
    motionType: "push-in",
    direction: "toward detail",
    speed: "very-slow",
    range: 0.08,
    focusBehavior: "follow-focus",
    envelope: { maxOrbit: 2, geometryRequirements: ["macro lens clearance"] },
  }),
  preset("mv-facet-crawl", "Facet Crawl", "Macro", ["macro", "jewelry", "sparkle"], {
    motionType: "truck",
    direction: "across facets",
    speed: "very-slow",
    range: 0.06,
    maxDegrees: 2,
    focusBehavior: "follow-focus",
    envelope: { maxOrbit: 2, geometryRequirements: ["faceted surface", "specular light source"] },
  }),
  preset("mv-macro-tilt-reveal", "Macro Tilt Reveal", "Macro", ["macro", "tilt", "reveal"], {
    motionType: "tilt",
    direction: "up",
    speed: "very-slow",
    range: 0.1,
    maxDegrees: 6,
    envelope: { maxOrbit: 3, geometryRequirements: ["macro subject fills frame"] },
  }),
  preset("mv-rack-focus", "Rack Focus", "Macro", ["focus", "rack", "reveal"], {
    motionType: "static",
    speed: "slow",
    range: 0,
    focusBehavior: "rack",
    envelope: { maxOrbit: 0, geometryRequirements: ["two clear depth planes"] },
  }),
  preset("mv-focus-breath", "Focus Breath", "Macro", ["focus", "breathing", "organic"], {
    motionType: "static",
    speed: "very-slow",
    range: 0.02,
    focusBehavior: "breathing",
    envelope: { maxOrbit: 1, geometryRequirements: [] },
  }),

  /* ------------------------------- Tracking ----------------------------- */
  preset("mv-link-track", "Link Track", "Tracking", ["tracking", "chain", "jewelry"], {
    motionType: "truck",
    direction: "along chain links",
    speed: "very-slow",
    range: 0.22,
    tracking: "point-of-interest",
    parallax: 16,
    focusBehavior: "follow-focus",
    envelope: { maxOrbit: 5, geometryRequirements: ["linear repeating element", "macro clearance"] },
  }),
  preset("mv-follow-subject", "Follow Subject", "Tracking", ["tracking", "walk", "subject"], {
    motionType: "truck",
    direction: "with subject",
    speed: "medium",
    range: 0.6,
    tracking: "subject",
    parallax: 45,
    focusBehavior: "follow-focus",
    envelope: { maxOrbit: 10, geometryRequirements: ["walking path", "lateral clearance"] },
  }),
  preset("mv-lead-subject", "Lead Subject", "Tracking", ["tracking", "front", "subject"], {
    motionType: "dolly",
    direction: "backward ahead of subject",
    speed: "medium",
    range: 0.55,
    tracking: "subject",
    focusBehavior: "follow-focus",
    envelope: { maxOrbit: 8, geometryRequirements: ["clear path behind camera"] },
  }),
  preset("mv-trail-subject", "Trail Subject", "Tracking", ["tracking", "behind", "follow"], {
    motionType: "dolly",
    direction: "forward behind subject",
    speed: "medium",
    range: 0.55,
    tracking: "subject",
    envelope: { maxOrbit: 8, geometryRequirements: ["clear forward path"] },
  }),
  preset("mv-side-track", "Side Track", "Tracking", ["tracking", "profile", "lateral"], {
    motionType: "truck",
    direction: "parallel to subject",
    speed: "medium",
    range: 0.5,
    tracking: "subject",
    parallax: 50,
    envelope: { maxOrbit: 6, geometryRequirements: ["parallel track space"] },
  }),
  preset("mv-one-take", "One Take", "Tracking", ["long-take", "continuous", "immersive"], {
    motionType: "dolly",
    direction: "through space",
    speed: "medium",
    range: 1,
    tracking: "subject",
    parallax: 60,
    focusBehavior: "follow-focus",
    endBehavior: "continue",
    envelope: { maxOrbit: 20, geometryRequirements: ["navigable continuous space"] },
  }),

  /* ------------------------------- Handheld ----------------------------- */
  preset("mv-intimate-observer", "Intimate Observer", "Handheld", ["handheld", "intimate", "soft"], {
    motionType: "handheld",
    direction: "drifting",
    speed: "slow",
    range: 0.12,
    maxDegrees: 4,
    roll: 2,
    tracking: "subject",
    focusBehavior: "follow-focus",
    envelope: { maxOrbit: 6, geometryRequirements: ["close subject"] },
  }),
  preset("mv-documentary-handheld", "Documentary Handheld", "Handheld", ["handheld", "doc", "reactive"], {
    motionType: "handheld",
    direction: "reactive",
    speed: "medium",
    range: 0.3,
    maxDegrees: 12,
    roll: 5,
    tracking: "subject",
    focusBehavior: "follow-focus",
    envelope: { maxOrbit: 15, geometryRequirements: ["room to reframe"] },
  }),
  preset("mv-raw-chaos", "Raw Chaos", "Handheld", ["handheld", "chaotic", "energy"], {
    motionType: "handheld",
    direction: "erratic",
    speed: "fast",
    range: 0.7,
    maxDegrees: 40,
    roll: 18,
    parallax: 40,
    focusBehavior: "breathing",
    endBehavior: "hard-cut",
    envelope: { maxOrbit: 45, geometryRequirements: ["forgiving background"] },
  }),
  preset("mv-shoulder-walk", "Shoulder Walk", "Handheld", ["handheld", "walking", "natural"], {
    motionType: "handheld",
    direction: "forward",
    speed: "medium",
    range: 0.5,
    maxDegrees: 10,
    roll: 4,
    heightChange: 6,
    envelope: { maxOrbit: 12, geometryRequirements: ["walkable path"] },
  }),
  preset("mv-nervous-drift", "Nervous Drift", "Handheld", ["handheld", "tension", "drift"], {
    motionType: "handheld",
    direction: "wandering",
    speed: "slow",
    range: 0.2,
    maxDegrees: 8,
    roll: 3,
    envelope: { maxOrbit: 10, geometryRequirements: [] },
  }),

  /* --------------------------------- Crane ------------------------------ */
  preset("mv-crane-reveal", "Crane Reveal", "Crane", ["crane", "reveal", "grand"], {
    motionType: "crane",
    direction: "up and back",
    speed: "medium",
    range: 0.7,
    heightChange: 60,
    parallax: 50,
    endBehavior: "settle",
    envelope: { maxOrbit: 15, geometryRequirements: ["tall clearance", "wide environment"] },
  }),
  preset("mv-crane-down", "Crane Down", "Crane", ["crane", "descend", "arrival"], {
    motionType: "crane",
    direction: "down toward subject",
    speed: "medium",
    range: 0.6,
    heightChange: -55,
    tracking: "subject",
    envelope: { maxOrbit: 12, geometryRequirements: ["vertical clearance above subject"] },
  }),
  preset("mv-jib-arc", "Jib Arc", "Crane", ["crane", "arc", "sweep"], {
    motionType: "crane",
    direction: "arcing left",
    speed: "medium",
    range: 0.55,
    maxDegrees: 40,
    heightChange: 25,
    tracking: "subject",
    envelope: { maxOrbit: 40, geometryRequirements: ["arc clearance"] },
  }),
  preset("mv-top-down-descend", "Top Down Descend", "Crane", ["crane", "overhead", "graphic"], {
    motionType: "crane",
    direction: "down from overhead",
    speed: "slow",
    range: 0.45,
    heightChange: -45,
    envelope: { maxOrbit: 5, geometryRequirements: ["clean overhead angle"] },
  }),

  /* -------------------------------- Aerial ------------------------------ */
  preset("mv-drone-rise", "Drone Rise", "Aerial", ["aerial", "rise", "epic"], {
    motionType: "crane",
    direction: "vertical rise",
    speed: "medium",
    range: 0.8,
    heightChange: 85,
    parallax: 65,
    envelope: { maxOrbit: 10, geometryRequirements: ["open sky", "wide environment"] },
  }),
  preset("mv-drone-flyover", "Drone Flyover", "Aerial", ["aerial", "flyover", "landscape"], {
    motionType: "dolly",
    direction: "forward high",
    speed: "fast",
    range: 0.95,
    easing: "linear",
    parallax: 75,
    endBehavior: "continue",
    envelope: { maxOrbit: 8, geometryRequirements: ["open aerial path"] },
  }),
  preset("mv-drone-orbit", "Drone Orbit", "Aerial", ["aerial", "orbit", "showcase"], {
    motionType: "orbit",
    direction: "clockwise high",
    speed: "medium",
    range: 0.7,
    maxDegrees: 120,
    heightChange: 20,
    tracking: "subject",
    envelope: { maxOrbit: 120, geometryRequirements: ["open orbit airspace"] },
  }),
  preset("mv-drone-descend-reveal", "Drone Descend Reveal", "Aerial", ["aerial", "descend", "reveal"], {
    motionType: "crane",
    direction: "descending forward",
    speed: "medium",
    range: 0.75,
    heightChange: -70,
    tracking: "point-of-interest",
    envelope: { maxOrbit: 15, geometryRequirements: ["clear descent corridor"] },
  }),

  /* ------------------------------ High Energy --------------------------- */
  preset("mv-whip-pan", "Whip Pan", "High Energy", ["whip", "fast", "transition"], {
    motionType: "pan",
    direction: "right",
    speed: "fast",
    range: 0.8,
    maxDegrees: 120,
    easing: "ease-in-out",
    endBehavior: "hard-cut",
    envelope: { maxOrbit: 120, geometryRequirements: ["motion-blur tolerant background"] },
  }),
  preset("mv-crash-zoom", "Crash Zoom", "High Energy", ["zoom", "punch", "aggressive"], {
    motionType: "zoom",
    direction: "in",
    speed: "fast",
    range: 0.9,
    easing: "ease-in",
    endBehavior: "hard-cut",
    envelope: { maxOrbit: 0, geometryRequirements: ["sharp subject at target framing"] },
  }),
  preset("mv-snap-push", "Snap Push", "High Energy", ["push-in", "snap", "beat"], {
    motionType: "push-in",
    direction: "forward",
    speed: "fast",
    range: 0.35,
    easing: "ease-out",
    endBehavior: "settle",
    envelope: { maxOrbit: 2, geometryRequirements: ["clear path"] },
  }),
  preset("mv-shake-impact", "Shake Impact", "High Energy", ["shake", "impact", "hit"], {
    motionType: "handheld",
    direction: "impact jolt",
    speed: "fast",
    range: 0.25,
    maxDegrees: 20,
    roll: 12,
    endBehavior: "settle",
    envelope: { maxOrbit: 20, geometryRequirements: [] },
  }),
  preset("mv-roll-twist", "Roll Twist", "High Energy", ["roll", "dutch", "stylized"], {
    motionType: "handheld",
    direction: "rolling",
    speed: "medium",
    range: 0.3,
    maxDegrees: 25,
    roll: 30,
    envelope: { maxOrbit: 25, geometryRequirements: ["tolerant frame edges"] },
  }),
  preset("mv-speed-ramp-orbit", "Speed Ramp Orbit", "High Energy", ["orbit", "ramp", "dynamic"], {
    motionType: "orbit",
    direction: "clockwise",
    speed: "fast",
    range: 0.6,
    maxDegrees: 60,
    easing: "ease-in-out",
    tracking: "subject",
    envelope: { maxOrbit: 60, geometryRequirements: ["subject readable across 60°"] },
  }),

  /* ------------------------------ Impossible ---------------------------- */
  preset("mv-bullet-time", "Bullet Time", "Impossible", ["frozen", "orbit", "vfx"], {
    motionType: "orbit",
    direction: "clockwise around frozen moment",
    speed: "medium",
    range: 0.5,
    maxDegrees: 100,
    tracking: "subject",
    envelope: { maxOrbit: 100, geometryRequirements: ["subject resolved from all covered angles"] },
  }),
  preset("mv-through-object", "Through Object", "Impossible", ["through", "impossible", "transition"], {
    motionType: "push-in",
    direction: "through the subject",
    speed: "medium",
    range: 1,
    parallax: 80,
    endBehavior: "continue",
    envelope: { maxOrbit: 5, geometryRequirements: ["penetrable foreground object", "interior beyond"] },
  }),
  preset("mv-scale-shift", "Scale Shift", "Impossible", ["scale", "surreal", "macro-to-wide"], {
    motionType: "pull-out",
    direction: "backward with scale change",
    speed: "medium",
    range: 1,
    parallax: 85,
    envelope: { maxOrbit: 5, geometryRequirements: ["subject valid at both scales"] },
  }),
  preset("mv-gravity-flip", "Gravity Flip", "Impossible", ["roll", "surreal", "180"], {
    motionType: "handheld",
    direction: "inverting",
    speed: "slow",
    range: 0.6,
    maxDegrees: 30,
    roll: 180,
    envelope: { maxOrbit: 30, geometryRequirements: ["symmetric-tolerant frame"] },
  }),
  preset("mv-endless-fall", "Endless Fall", "Impossible", ["vertical", "loop", "surreal"], {
    motionType: "pedestal",
    direction: "down",
    speed: "fast",
    range: 1,
    easing: "linear",
    heightChange: -100,
    endBehavior: "continue",
    envelope: { maxOrbit: 0, geometryRequirements: ["vertically repeating environment"] },
  }),

  /* ------------------------------ Transition ---------------------------- */
  preset("mv-match-push", "Match Push", "Transition", ["transition", "match-cut", "push"], {
    motionType: "push-in",
    direction: "forward to match frame",
    speed: "medium",
    range: 0.4,
    endBehavior: "hard-cut",
    envelope: { maxOrbit: 2, geometryRequirements: ["matching shape at cut point"] },
  }),
  preset("mv-wipe-by-foreground", "Wipe By Foreground", "Transition", ["transition", "wipe", "occluder"], {
    motionType: "truck",
    direction: "behind passing foreground",
    speed: "fast",
    range: 0.5,
    parallax: 90,
    endBehavior: "hard-cut",
    envelope: { maxOrbit: 6, geometryRequirements: ["full-frame foreground occluder"] },
  }),
  preset("mv-tilt-to-black", "Tilt To Black", "Transition", ["transition", "tilt", "out"], {
    motionType: "tilt",
    direction: "down into shadow",
    speed: "medium",
    range: 0.45,
    maxDegrees: 35,
    endBehavior: "hard-cut",
    envelope: { maxOrbit: 35, geometryRequirements: ["dark area in frame"] },
  }),
  preset("mv-pan-handoff", "Pan Handoff", "Transition", ["transition", "pan", "handoff"], {
    motionType: "pan",
    direction: "left to next subject",
    speed: "medium",
    range: 0.5,
    maxDegrees: 70,
    tracking: "point-of-interest",
    endBehavior: "settle",
    envelope: { maxOrbit: 70, geometryRequirements: ["two subjects in pan arc"] },
  }),
  preset("mv-zoom-blur-out", "Zoom Blur Out", "Transition", ["transition", "zoom", "blur"], {
    motionType: "zoom",
    direction: "out",
    speed: "fast",
    range: 0.8,
    easing: "ease-in",
    endBehavior: "hard-cut",
    envelope: { maxOrbit: 0, geometryRequirements: [] },
  }),
];

export function findMovementPresetByName(name: string | undefined): CinemaMovementPreset | undefined {
  if (!name) return undefined;
  return MOVEMENT_PRESETS.find((p) => p.name === name);
}
