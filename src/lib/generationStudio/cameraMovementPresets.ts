/**
 * GENERATION STUDIO — camera movement presets (VIDEO mode only).
 *
 * Plain code data. Selecting a preset appends `promptFragment` to the outgoing
 * video prompt — nothing else in the run/billing path changes.
 *
 * Movement concepts mirror src/lib/cinema/presets/movementPresets.ts, but this
 * list is Generation Studio's own (Cinema is never modified or imported).
 *
 * NOTE: `previewUrl` is intentionally undefined for every preset. Per-preset
 * preview clips are a separate (paid) generation batch to be added later; the
 * UI falls back to an icon + label placeholder until then.
 */

export type CameraMovementPreset = {
  id: string;
  name: string;
  description: string;
  /** Concise cinematographic instruction appended to the video prompt. */
  promptFragment: string;
  /** Optional real preview clip — added later, no redesign needed. */
  previewUrl?: string;
};

export const CAMERA_MOVEMENT_PRESETS: CameraMovementPreset[] = [
  {
    id: "none",
    name: "None",
    description: "No movement instruction — the model decides.",
    promptFragment: "",
  },
  {
    id: "static",
    name: "Static / Locked-off",
    description: "Tripod-locked frame, zero camera motion.",
    promptFragment:
      "Camera movement: locked-off static tripod shot, no camera motion, stable framing throughout.",
  },
  {
    id: "push-in",
    name: "Slow push-in",
    description: "Gentle dolly-in toward the subject.",
    promptFragment:
      "Camera movement: slow steady dolly-in pushing toward the subject, constant speed, no zoom distortion.",
  },
  {
    id: "pull-out",
    name: "Slow pull-out",
    description: "Gentle dolly-out revealing context.",
    promptFragment:
      "Camera movement: slow steady dolly-out pulling back from the subject, gradually revealing the surrounding scene.",
  },
  {
    id: "orbit",
    name: "Orbit",
    description: "Smooth arc around the subject.",
    promptFragment:
      "Camera movement: smooth orbital arc travelling around the subject at a fixed radius, subject stays centred.",
  },
  {
    id: "crane-up",
    name: "Crane up",
    description: "Vertical rise on a crane.",
    promptFragment:
      "Camera movement: controlled crane rise upward, camera lifting vertically while keeping the subject framed.",
  },
  {
    id: "crane-down",
    name: "Crane down",
    description: "Vertical descent on a crane.",
    promptFragment:
      "Camera movement: controlled crane descent, camera lowering vertically toward the subject with steady framing.",
  },
  {
    id: "handheld",
    name: "Handheld",
    description: "Organic documentary-style sway.",
    promptFragment:
      "Camera movement: handheld documentary feel, subtle organic sway and micro-corrections, no heavy shake.",
  },
  {
    id: "whip-pan",
    name: "Whip pan",
    description: "Fast horizontal snap with motion blur.",
    promptFragment:
      "Camera movement: fast whip pan across the scene with natural motion blur, settling cleanly on the subject.",
  },
  {
    id: "tracking-follow",
    name: "Tracking follow",
    description: "Camera travels with the moving subject.",
    promptFragment:
      "Camera movement: tracking shot following the subject's motion at matched speed, consistent distance and framing.",
  },
  {
    id: "rise-reveal",
    name: "Rise reveal",
    description: "Low start rising into a reveal.",
    promptFragment:
      "Camera movement: begins low and rises upward into a reveal of the subject and setting, smooth continuous motion.",
  },
  {
    id: "spin-360",
    name: "360 spin",
    description: "Full revolution around the subject.",
    promptFragment:
      "Camera movement: full 360-degree revolution around the subject, continuous even speed, subject locked in frame.",
  },
];

export const DEFAULT_CAMERA_MOVEMENT_ID = "none";

export function getCameraMovementPreset(id: string | null | undefined) {
  return CAMERA_MOVEMENT_PRESETS.find((preset) => preset.id === id);
}
