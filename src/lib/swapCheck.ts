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
/** Below this, a source/output pair is the same picture (measured: copies 10–14, swaps 27+). */
export const UNCHANGED_SCORE = 20;

export type Gray = Float32Array;

let canvas: HTMLCanvasElement | null = null;

/** The video element's current frame as a 72x128 grayscale thumbnail. */
export function grayOf(source: CanvasImageSource): Gray {
  canvas ??= document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(source, 0, 0, W, H);
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
 * Up to `max` frames spread evenly over `pool` (so every shot of a montage is near a
 * reference), skipping any that look the same as the one before (a static shot).
 */
export function pickSpread(pool: number[], grays: (Gray | undefined)[], max: number): number[] {
  const count = Math.min(max, pool.length);
  const picks = Array.from({ length: count }, (_, k) => pool[Math.floor((pool.length / count) * (k + 0.5))]);
  return picks.filter((i, k) => {
    const prev = grays[picks[k - 1]];
    return k === 0 || !prev || !grays[i] || changeScore(grays[i]!, prev) >= UNCHANGED_SCORE * 2;
  });
}

/**
 * Seconds of `output` that came back as an untouched copy of the source while a
 * person is on screen. `personAt(gray)` says whether a source thumbnail shows
 * someone (from the frame analysis). Samples every half second.
 */
export async function unswappedSeconds(
  sourceUrl: string,
  sourceStart: number,
  outputUrl: string,
  personAt: (sourceGray: Gray) => boolean,
): Promise<number> {
  const [source, output] = await Promise.all([loadVideo(sourceUrl), loadVideo(outputUrl)]);
  const length = Math.min(output.duration, source.duration - sourceStart);
  let copied = 0;
  for (let t = 0.25; t < length; t += 0.5) {
    await seekVideoTo(source, sourceStart + t);
    const src = grayOf(source);
    await seekVideoTo(output, t);
    if (changeScore(src, grayOf(output)) < UNCHANGED_SCORE && personAt(src)) copied += 0.5;
  }
  return copied;
}
