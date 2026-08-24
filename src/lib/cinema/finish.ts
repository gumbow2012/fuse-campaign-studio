/**
 * FUSE Cinema — FINISH (post-generation grade).
 *
 * IMPORTANT: a finish is NON-DESTRUCTIVE metadata plus an on-screen preview.
 * It never re-renders, re-generates or re-encodes anything: the stored file is
 * untouched, and export/processing is a later commit. Grading is NOT
 * generative regeneration.
 */

export type CinemaFinish = {
  /** -100..100 */
  exposure: number;
  temperature: number;
  tint: number;
  contrast: number;
  saturation: number;
  highlights: number;
  shadows: number;
  blacks: number;
  /** 0..100 */
  grain: number;
  sharpness: number;
  updatedAt: string;
};

export const NEUTRAL_FINISH: CinemaFinish = {
  exposure: 0,
  temperature: 0,
  tint: 0,
  contrast: 0,
  saturation: 0,
  highlights: 0,
  shadows: 0,
  blacks: 0,
  grain: 0,
  sharpness: 0,
  updatedAt: "",
};

export type FinishControlKey = Exclude<keyof CinemaFinish, "updatedAt">;

export type FinishControl = {
  key: FinishControlKey;
  label: string;
  min: number;
  max: number;
  /** False when CSS cannot honestly preview it (saved as metadata only). */
  previewable: boolean;
};

export const FINISH_CONTROLS: FinishControl[] = [
  { key: "exposure", label: "Exposure", min: -100, max: 100, previewable: true },
  { key: "temperature", label: "Temperature", min: -100, max: 100, previewable: true },
  { key: "tint", label: "Tint", min: -100, max: 100, previewable: true },
  { key: "contrast", label: "Contrast", min: -100, max: 100, previewable: true },
  { key: "saturation", label: "Saturation", min: -100, max: 100, previewable: true },
  { key: "highlights", label: "Highlights", min: -100, max: 100, previewable: true },
  { key: "shadows", label: "Shadows", min: -100, max: 100, previewable: true },
  { key: "blacks", label: "Blacks", min: -100, max: 100, previewable: true },
  { key: "grain", label: "Grain", min: 0, max: 100, previewable: true },
  { key: "sharpness", label: "Sharpness", min: 0, max: 100, previewable: false },
];

export function isNeutralFinish(finish: CinemaFinish | undefined): boolean {
  if (!finish) return true;
  return FINISH_CONTROLS.every((control) => finish[control.key] === NEUTRAL_FINISH[control.key]);
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * Approximate the grade with CSS filters for the on-screen preview only.
 * Some controls (sharpness) have no faithful CSS equivalent and are stored
 * as metadata without a preview.
 */
export function finishToCssFilter(finish: CinemaFinish | undefined): string | undefined {
  if (!finish || isNeutralFinish(finish)) return undefined;

  const brightness = clamp(1 + (finish.exposure + finish.shadows * 0.25) / 200, 0.2, 2);
  const contrast = clamp(1 + (finish.contrast - finish.blacks * 0.35) / 200, 0.2, 2.5);
  const saturate = clamp(1 + finish.saturation / 100, 0, 3);
  const sepia = clamp(Math.max(0, finish.temperature) / 400, 0, 0.35);
  const hueRotate = clamp(finish.tint / 6 + (finish.temperature < 0 ? finish.temperature / 12 : 0), -40, 40);

  const parts = [
    `brightness(${brightness.toFixed(3)})`,
    `contrast(${contrast.toFixed(3)})`,
    `saturate(${saturate.toFixed(3)})`,
  ];
  if (sepia > 0.001) parts.push(`sepia(${sepia.toFixed(3)})`);
  if (Math.abs(hueRotate) > 0.5) parts.push(`hue-rotate(${hueRotate.toFixed(1)}deg)`);
  if (finish.highlights !== 0) {
    // Highlight roll-off is approximated with a light opacity/contrast nudge.
    parts.push(`opacity(${clamp(1 - Math.max(0, -finish.highlights) / 500, 0.6, 1).toFixed(3)})`);
  }
  return parts.join(" ");
}

/** Grain overlay opacity for the preview layer (0 = no overlay). */
export function finishGrainOpacity(finish: CinemaFinish | undefined): number {
  if (!finish) return 0;
  return clamp(finish.grain, 0, 100) / 320;
}
