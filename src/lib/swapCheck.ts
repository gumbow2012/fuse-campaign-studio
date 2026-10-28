import { loadVideo, seekVideoTo } from "@/lib/videoFrames";

/**
 * Tiny grayscale thumbnails for comparing frames in the browser.
 * The swapped person is a small part of the frame, so frames are compared
 * cell by cell (8x8 px cells on a 72x128 thumbnail) and scored by their most
 * changed cells, not the average.
 */
const W = 72;
const H = 128;
const CELL = 8;
/** Below this, two thumbnails are the same picture (used to skip near-duplicate frames). */
export const UNCHANGED_SCORE = 20;
/**
 * Below this (aligned, in-browser), an output moment looks like a copy of the source.
 * Measured on 5 real renders: copied stretches 8–27; swapped 34+, except lone dips
 * (one at 23) — so only 2+ samples in a row count as a copy.
 */
export const COPY_SCORE = 30;

export type Gray = Float32Array;

let canvas: HTMLCanvasElement | null = null;
let mid: HTMLCanvasElement | null = null;

/** The video element's current frame as a 72x128 grayscale thumbnail (area-averaged, not aliased). */
export function grayOf(source: CanvasImageSource): Gray {
  // Two smooth steps (4x then 4x): one big drawImage jump aliases and adds noise.
  mid ??= document.createElement("canvas");
  mid.width = W * 4;
  mid.height = H * 4;
  const midCtx = mid.getContext("2d")!;
  midCtx.imageSmoothingQuality = "high";
  midCtx.drawImage(source, 0, 0, mid.width, mid.height);
  canvas ??= document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(mid, 0, 0, W, H);
  const rgba = ctx.getImageData(0, 0, W, H).data;
  const gray = new Float32Array(W * H);
  for (let i = 0; i < gray.length; i++) gray[i] = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2];
  return gray;
}

/** How different two thumbnails are where they differ most (3rd most changed cell). */
export function changeScore(a: Gray, b: Gray): number {
  const cells: number[] = [];
  for (let cy = 0; cy < H / CELL; cy++) {
    for (let cx = 0; cx < W / CELL; cx++) {
      let sum = 0;
      for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) {
        const i = (cy * CELL + y) * W + cx * CELL + x;
        sum += Math.abs(a[i] - b[i]);
      }
      cells.push(sum / (CELL * CELL));
    }
  }
  cells.sort((x, y) => y - x);
  return cells[2];
}

/**
 * The moments (seconds into `output`, every half second) that came back as an
 * untouched copy of the source while a person is on screen. `personAt(gray)`
 * says whether a source thumbnail shows someone (from the frame analysis).
 */
export async function unswappedTimes(
  sourceUrl: string,
  sourceStart: number,
  outputUrl: string,
  personAt: (sourceGray: Gray) => boolean,
): Promise<number[]> {
  const [source, output] = await Promise.all([loadVideo(sourceUrl), loadVideo(outputUrl)]);
  const length = Math.min(output.duration, source.duration - sourceStart);
  const samples: { t: number; copy: boolean }[] = [];
  for (let t = 0.25; t < length; t += 0.5) {
    await seekVideoTo(source, sourceStart + t);
    const src = grayOf(source);
    await seekVideoTo(output, t);
    samples.push({ t, copy: alignedChangeScore(src, grayOf(output)) < COPY_SCORE && personAt(src) });
  }
  // A lone low sample is motion noise; a copy lasts at least a second.
  return samples.filter((s, i) => s.copy && (samples[i - 1]?.copy || samples[i + 1]?.copy)).map((s) => s.t);
}

/**
 * changeScore after undoing Seedance's slight reframing: the best match over small
 * shifts (±3 x, ±4 y px) and zooms (±4%). A re-rendered copy lines up; a new outfit doesn't.
 */
export function alignedChangeScore(srcGray: Gray, outGray: Gray): number {
  // Undo brightness/contrast grading first: zero mean, fixed spread.
  const normalize = (g: Gray) => {
    let mean = 0;
    for (const v of g) mean += v;
    mean /= g.length;
    let sd = 0;
    for (const v of g) sd += (v - mean) ** 2;
    sd = Math.sqrt(sd / g.length) + 1e-6;
    return g.map((v) => ((v - mean) / sd) * 50);
  };
  const src = normalize(srcGray);
  const out = normalize(outGray);
  let best = Infinity;
  const shifted = new Float32Array(W * H);
  for (const scale of [0.96, 1, 1.04]) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        for (let y = 0; y < H; y++) {
          const by = Math.min(H - 1, Math.max(0, Math.trunc((y - H / 2) * scale + H / 2) + dy));
          for (let x = 0; x < W; x++) {
            const bx = Math.min(W - 1, Math.max(0, Math.trunc((x - W / 2) * scale + W / 2) + dx));
            shifted[y * W + x] = out[by * W + bx];
          }
        }
        best = Math.min(best, changeScore(src, shifted));
      }
    }
  }
  return best;
}

/** Back-to-back unswapped moments grouped into runs (a gap over 1s starts a new run). */
export function groupRuns(times: number[]): { from: number; to: number }[] {
  const runs: { from: number; to: number }[] = [];
  for (const t of [...times].sort((a, b) => a - b)) {
    const last = runs[runs.length - 1];
    if (last && t - last.to <= 1) last.to = t;
    else runs.push({ from: t, to: t });
  }
  return runs;
}

/** The whole-second window (Seedance needs 4s+) that covers every run, inside [0, length]. */
export function patchWindow(runs: { from: number; to: number }[], length: number, minSeconds = 4, maxSeconds = 15) {
  const from = Math.min(...runs.map((r) => r.from)) - 0.25;
  const to = Math.max(...runs.map((r) => r.to)) + 0.25;
  const span = Math.min(maxSeconds, Math.max(minSeconds, Math.ceil(to - from)), Math.floor(length) || length);
  const start = Math.max(0, Math.min((from + to) / 2 - span / 2, length - span));
  return { start, end: start + span };
}

export type Patch = { start: number; end: number; url: string };

/**
 * A render as stitchable pieces with its patches laid over it in order (a later
 * patch wins where windows overlap). Times in seconds, pieces in ms of each file.
 */
export function layPatches(url: string, lengthMs: number, patches: Patch[]) {
  let segments = [{ url, from: 0, to: lengthMs, offset: 0 }]; // timeline [from,to) shows url at (t - offset)
  for (const p of patches) {
    const from = Math.round(p.start * 1000);
    const to = Math.round(p.end * 1000);
    segments = segments.flatMap((s) => [
      ...(s.from < from ? [{ ...s, to: Math.min(s.to, from) }] : []),
      ...(s.to > to ? [{ ...s, from: Math.max(s.from, to) }] : []),
    ]);
    segments.push({ url: p.url, from, to: Math.min(to, lengthMs), offset: from });
    segments.sort((a, b) => a.from - b.from);
  }
  return segments
    .filter((s) => s.to - s.from > 40)
    .map((s) => ({ url: s.url, startMs: s.from - s.offset, endMs: s.to - s.offset }));
}

export type Shot = { start: number; end: number };

/**
 * Hard cuts in a clip: compare each frame with the one 1/15s before it. Motion
 * changes little between neighbours; a cut (even same room, new shirt) spikes.
 * A spike counts when it is well above its neighbourhood's normal change.
 */
export async function detectShots(
  video: HTMLVideoElement,
  duration: number,
  onProgress?: (done: number, total: number) => void,
): Promise<Shot[]> {
  const step = 1 / 15;
  const times: number[] = [];
  for (let t = step; t < duration - 0.02; t += step) times.push(t);
  const diffs: number[] = [];
  await seekVideoTo(video, 0);
  let prev = grayOf(video);
  for (const [i, t] of times.entries()) {
    await seekVideoTo(video, t);
    const g = grayOf(video);
    diffs.push(changeScore(prev, g));
    prev = g;
    if (i % 15 === 0) onProgress?.(i, times.length);
  }
  const cuts: number[] = [];
  diffs.forEach((d, i) => {
    const near = diffs.slice(Math.max(0, i - 7), i + 8).sort((a, b) => a - b);
    const normal = near[Math.floor(near.length / 2)];
    if (d > Math.max(18, normal * 2.5) && (!cuts.length || times[i] - cuts[cuts.length - 1] > 0.25)) cuts.push(times[i]);
  });
  const edges = [0, ...cuts, duration];
  return edges.slice(1).map((end, i) => ({ start: edges[i], end }));
}

/**
 * Where to grab frames: one mid-shot frame per shot, plus one per extra `spacing` seconds
 * of a long shot (turns, walk-aways). Over `max`, long shots give up extras first,
 * then the shortest shots are dropped.
 */
export function shotFrameTimes(shots: Shot[], max: number, spacing = 3): { time: number; shot: Shot }[] {
  const usable = shots.filter((s) => s.end - s.start >= 0.2);
  const counts = usable.map((s) => Math.max(1, Math.round((s.end - s.start) / spacing)));
  const total = () => counts.reduce((a, b) => a + b, 0);
  while (total() > max && counts.some((c) => c > 1)) counts[counts.indexOf(Math.max(...counts))]--;
  let keep = usable.map((_, i) => i);
  if (total() > max) keep = keep.sort((a, b) => (usable[b].end - usable[b].start) - (usable[a].end - usable[a].start)).slice(0, max);
  return keep
    .sort((a, b) => a - b)
    .flatMap((i) => {
      const s = usable[i];
      const step = (s.end - s.start) / counts[i];
      return Array.from({ length: counts[i] }, (_, k) => ({ time: Number((s.start + step * (k + 0.5)).toFixed(2)), shot: s }));
    });
}
