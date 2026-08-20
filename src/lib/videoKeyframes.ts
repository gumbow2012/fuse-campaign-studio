/**
 * REPLACEMENT-PRODUCT VIDEO → a small, diverse KEYFRAME set (client-side only).
 *
 * This is intake evidence extraction, not generation. A replacement-product
 * video is inspected in the browser, sampled, de-duplicated by perceptual
 * similarity, and reduced to roughly 6–20 genuinely different views. Selection
 * is driven by visual diversity, never by a fixed time interval, so a 40s
 * turntable clip never produces hundreds of near-identical frames.
 *
 * Nothing here ever touches the SOURCE video pipeline: these frames are
 * REPLACEMENT_PRODUCT_REFERENCE evidence.
 */

import { captureFrameAt, loadVideo, readMeta, seekVideoTo, type VideoMeta } from "@/lib/videoFrames";

export type KeyframeCandidate = {
  time: number;
  /** 64-bit perceptual difference hash, as a bit string. */
  hash: string;
};

export type ExtractedKeyframe = KeyframeCandidate & { file: File };

export type KeyframeSelection = {
  meta: VideoMeta;
  /** The chosen timestamps, ascending. */
  keyframes: ExtractedKeyframe[];
  /** Poster frame for the compact "VIDEO REFERENCE" card. */
  posterUrl: string;
  candidatesInspected: number;
};

/** Never fewer than this, however short the clip. */
const MIN_KEYFRAMES = 6;
/** Never more than this, however long the clip. */
const MAX_KEYFRAMES = 20;
/** Candidate ceiling — cheap 9x8 hashes, so sampling wide is affordable. */
const MAX_CANDIDATES = 48;
/** Below this Hamming distance two frames are treated as the same view. */
const NEAR_DUPLICATE_BITS = 8;

/* ------------------------------------------------------------------ *
 * Perceptual hashing (dHash) — tiny canvas, no dependencies
 * ------------------------------------------------------------------ */

const HASH_W = 9;
const HASH_H = 8;

function hashCanvas() {
  const canvas = document.createElement("canvas");
  canvas.width = HASH_W;
  canvas.height = HASH_H;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Canvas is unavailable in this browser");
  return { canvas, context };
}

function frameHash(
  video: HTMLVideoElement,
  scratch: { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D },
) {
  const { canvas, context } = scratch;
  context.drawImage(video, 0, 0, HASH_W, HASH_H);
  const { data } = context.getImageData(0, 0, HASH_W, HASH_H);
  let bits = "";
  for (let y = 0; y < HASH_H; y += 1) {
    for (let x = 0; x < HASH_W - 1; x += 1) {
      const left = (y * HASH_W + x) * 4;
      const right = (y * HASH_W + x + 1) * 4;
      const lum = (i: number) => data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      bits += lum(left) > lum(right) ? "1" : "0";
    }
  }
  return bits;
}

export function hammingDistance(a: string, b: string) {
  if (a.length !== b.length) return Number.MAX_SAFE_INTEGER;
  let distance = 0;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) distance += 1;
  return distance;
}

/* ------------------------------------------------------------------ *
 * Selection
 * ------------------------------------------------------------------ */

/** Candidate density scales with length but is always bounded. */
function candidateTimes(duration: number) {
  if (!duration || duration <= 0) return [0];
  const count = Math.max(MIN_KEYFRAMES * 2, Math.min(MAX_CANDIDATES, Math.round(duration * 2)));
  const last = Math.max(0, duration - 0.05);
  return Array.from({ length: count }, (_, index) =>
    Number(((index / Math.max(1, count - 1)) * last).toFixed(2)),
  );
}

/** How many keyframes a clip of this length deserves, before dedupe. */
function targetCount(duration: number) {
  return Math.max(MIN_KEYFRAMES, Math.min(MAX_KEYFRAMES, Math.round(MIN_KEYFRAMES + duration / 2)));
}

/**
 * Farthest-point selection over the perceptual hashes: each new keyframe is the
 * candidate most visually unlike everything already chosen. Selection stops as
 * soon as the best remaining candidate is a near-duplicate, so a static clip
 * yields a handful of frames rather than the full target.
 */
function selectDiverse(candidates: KeyframeCandidate[], target: number) {
  if (candidates.length <= target) return [...candidates];
  const chosen: KeyframeCandidate[] = [candidates[0]];
  const remaining = candidates.slice(1);
  // The final frame is structurally interesting (end pose / last view).
  const last = remaining.pop();
  if (last) chosen.push(last);

  while (chosen.length < target && remaining.length) {
    let bestIndex = -1;
    let bestDistance = -1;
    remaining.forEach((candidate, index) => {
      const distance = Math.min(...chosen.map((entry) => hammingDistance(entry.hash, candidate.hash)));
      if (distance > bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });
    if (bestIndex < 0 || bestDistance < NEAR_DUPLICATE_BITS) break;
    chosen.push(remaining.splice(bestIndex, 1)[0]);
  }

  return chosen.sort((a, b) => a.time - b.time);
}

/* ------------------------------------------------------------------ *
 * Cache — an unchanged video is never re-extracted
 * ------------------------------------------------------------------ */

export function videoSignature(file: File) {
  return `${file.name}|${file.size}|${file.lastModified}|${file.type}`;
}

const timestampCache = new Map<string, { meta: VideoMeta; times: number[]; hashes: string[] }>();

/** Cached keyframe timestamps for a video, when it has been inspected before. */
export function cachedKeyframeTimes(signature: string) {
  return timestampCache.get(signature) ?? null;
}

/**
 * Inspect a replacement-product video and return its diverse keyframe set.
 * Two passes: cheap hashing over many candidates, then full-quality capture of
 * only the frames that survived de-duplication.
 */
export async function selectVideoKeyframes(
  file: File,
  onProgress?: (done: number, total: number, phase: "inspecting" | "extracting") => void,
): Promise<KeyframeSelection> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const video = await loadVideo(objectUrl);
    const meta = readMeta(video);
    const signature = videoSignature(file);

    const cached = cachedKeyframeTimes(signature);
    let chosen: KeyframeCandidate[];
    let candidatesInspected = 0;

    if (cached) {
      chosen = cached.times.map((time, index) => ({ time, hash: cached.hashes[index] ?? "" }));
      candidatesInspected = cached.times.length;
    } else {
      const scratch = hashCanvas();
      const times = candidateTimes(meta.duration);
      candidatesInspected = times.length;
      const candidates: KeyframeCandidate[] = [];
      for (const [index, time] of times.entries()) {
        await seekVideoTo(video, time);
        candidates.push({ time, hash: frameHash(video, scratch) });
        onProgress?.(index + 1, times.length, "inspecting");
      }
      chosen = selectDiverse(candidates, targetCount(meta.duration));
      timestampCache.set(signature, {
        meta,
        times: chosen.map((entry) => entry.time),
        hashes: chosen.map((entry) => entry.hash),
      });
    }

    const keyframes: ExtractedKeyframe[] = [];
    for (const [index, candidate] of chosen.entries()) {
      const frame = await captureFrameAt(video, candidate.time, 1280);
      keyframes.push({ ...candidate, file: frame });
      onProgress?.(index + 1, chosen.length, "extracting");
    }

    const poster = keyframes[Math.floor(keyframes.length / 2)] ?? keyframes[0];
    return {
      meta,
      keyframes,
      posterUrl: poster ? URL.createObjectURL(poster.file) : "",
      candidatesInspected,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/** "0:07" style duration for the compact VIDEO REFERENCE card. */
export function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

export const VIDEO_MIME = /^video\/(mp4|quicktime|x-m4v|webm)$/i;
export const VIDEO_EXTENSION = /\.(mp4|mov|m4v|webm)$/i;

export function isVideoAsset(file: File) {
  return VIDEO_MIME.test(file.type) || VIDEO_EXTENSION.test(file.name);
}
