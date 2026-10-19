/**
 * Hat Brand Film — browser-side frame plan (pure). Mirrors the server recipe
 * constants (a test asserts they match) and owns frame timing, source-frame
 * selection, coverage checks and logo placement for the in-browser assembler.
 */
export const HF_FPS = 30;
export const HF_WIDTH = 1080;
export const HF_HEIGHT = 1920;
export const HF_TOTAL_FRAMES = 645;
export const HF_CUTS = [0, 43, 72, 109, 147, 189, 223, 265, 340, 370, 414, 493, 645] as const;
export const HF_DURATION_MS = (HF_TOTAL_FRAMES / HF_FPS) * 1000; // 21500
export const HF_AUDIO_RATE = 48_000;
export const HF_AUDIO_SAMPLES = Math.round((HF_TOTAL_FRAMES / HF_FPS) * HF_AUDIO_RATE); // 1,032,000
export const HF_KEYFRAME_INTERVAL = 30;

export type HfSegmentKind = "generated" | "logo_composite" | "logo_hold";
export type HfSegment = {
  shot_id: string;
  kind: HfSegmentKind;
  frames: number;
  start_frame: number;
  source_url: string;
  source_type: "video" | "image";
  logo_overlay: boolean;
};

/** Output timestamp (µs) of global frame k — exact 30 fps grid. */
export const frameTimestampUs = (k: number) => Math.round((k * 1e6) / HF_FPS);
export const frameDurationUs = (k: number) => frameTimestampUs(k + 1) - frameTimestampUs(k);

/** Time within a segment (µs) that local output frame f samples. */
export const localTargetUs = (f: number) => Math.round((f * 1e6) / HF_FPS);

/**
 * Does a source ending at `sourceEndUs` (pts of last frame + its duration,
 * relative to its first frame) cover `frames` output frames? No padding.
 */
export const coversSlot = (sourceEndUs: number, frames: number) => sourceEndUs >= localTargetUs(frames - 1) + 1;

/** Validates the manifest before rendering: order, contiguity, exact totals. */
export function validateSegments(segments: HfSegment[]) {
  if (segments.length !== HF_CUTS.length - 1) throw new Error(`Expected 12 segments, got ${segments.length}`);
  const ids = new Set(segments.map((s) => s.shot_id));
  if (ids.size !== segments.length) throw new Error("Duplicate shot in manifest");
  segments.forEach((s, i) => {
    if (s.start_frame !== HF_CUTS[i] || s.frames !== HF_CUTS[i + 1] - HF_CUTS[i]) throw new Error(`${s.shot_id} doesn't match the cut list`);
    if (!s.source_url) throw new Error(`${s.shot_id} has no source`);
    if (s.kind === "logo_hold" ? s.source_type !== "image" : s.source_type !== "video") throw new Error(`${s.shot_id} has the wrong source type`);
  });
}

export type Rect = { x: number; y: number; w: number; h: number };

/** Cover-fit a source into the 9:16 frame (center crop, no stretch). */
export function coverRect(srcW: number, srcH: number, W = HF_WIDTH, H = HF_HEIGHT): Rect {
  const scale = Math.max(W / srcW, H / srcH);
  const w = srcW * scale, h = srcH * scale;
  return { x: (W - w) / 2, y: (H - h) / 2, w, h };
}

const easeOut = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

/**
 * Logo placement: aspect preserved, never warped. Composite shots place it in
 * the sign/banner area; the final hold scales 94%→100% over 1s then holds,
 * with a light sweep across the first 1.5s.
 */
export function logoPlacement(kind: HfSegmentKind, f: number, frames: number, logoW: number, logoH: number): (Rect & { opacity: number; sweep: number | null }) | null {
  if (kind === "generated") return null;
  const box = kind === "logo_hold" ? { w: HF_WIDTH * 0.62, h: HF_HEIGHT * 0.3, cy: HF_HEIGHT * 0.47 } : { w: HF_WIDTH * 0.5, h: HF_HEIGHT * 0.2, cy: HF_HEIGHT * 0.36 };
  const fit = Math.min(box.w / logoW, box.h / logoH);
  const grow = kind === "logo_hold" ? 0.94 + 0.06 * easeOut(f / HF_FPS) : 1;
  const w = logoW * fit * grow, h = logoH * fit * grow;
  const opacity = kind === "logo_hold" ? easeOut(f / 12) : 1;
  const sweep = kind === "logo_hold" && f < 45 ? f / 45 : null;
  void frames;
  return { x: (HF_WIDTH - w) / 2, y: box.cy - h / 2, w, h, opacity, sweep };
}

/** Exactly HF_AUDIO_SAMPLES per channel: trims a longer track, pads a shorter one with silence. */
export function fitAudioPlanes(planes: Float32Array[]): { planes: Float32Array[]; padded: boolean } {
  let padded = false;
  const out = planes.map((p) => {
    const next = new Float32Array(HF_AUDIO_SAMPLES);
    next.set(p.subarray(0, HF_AUDIO_SAMPLES));
    if (p.length < HF_AUDIO_SAMPLES) padded = true;
    return next;
  });
  return { planes: out, padded };
}

export type HfProbe = { width: number; height: number; frames: number; has_audio: boolean; duration_ms: number };

/** The only "ready" condition the browser will report. */
export const probeOk = (p: HfProbe) =>
  p.width === HF_WIDTH && p.height === HF_HEIGHT && p.frames === HF_TOTAL_FRAMES && p.has_audio && Math.abs(p.duration_ms - HF_DURATION_MS) <= 100;
