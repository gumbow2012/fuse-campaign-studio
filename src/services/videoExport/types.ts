/**
 * Shared contract between the editor UI (main thread) and the export worker.
 * No signed urls are ever persisted — they are passed per request and dropped.
 */
import type { RenderSpec } from "@/services/editorAdjustments";

export type ExportTarget = {
  width: number;
  height: number;
  fps: number;
  aspectRatio: string;
  /** Encoder settings resolved from the project's export settings. */
  videoBitrate: number;
  audioBitrate: number;
  codec: "h264" | "h265";
  removeAudio: boolean;
  loop: boolean;
};

/** One clip as the worker needs it (already resolved to a signed playback url). */
export type WorkerSegment = {
  id: string;
  url: string;
  trim_start_ms: number;
  trim_end_ms: number;
  muted: boolean;
  volume: number;
  /** Precomputed on the main thread so preview and export share one source of truth. */
  render: RenderSpec;
};

/** Cache identity — any change here means that one segment must be re-rendered. */
export function segmentCacheKey(segment: WorkerSegment, target: ExportTarget) {
  return [
    segment.id,
    Math.round(segment.trim_start_ms),
    Math.round(segment.trim_end_ms),
    segment.muted ? "m1" : "m0",
    `v${segment.volume.toFixed(2)}`,
    `${target.width}x${target.height}@${target.fps}`,
    `${target.codec}:${target.videoBitrate}:${target.removeAudio ? "na" : target.audioBitrate}`,
    segment.render.identity ? "id" : JSON.stringify([segment.render.filter, segment.render.transform, segment.render.overlays]),
  ].join("|");
}

export type WorkerRequest =
  | { type: "prerender"; segments: WorkerSegment[]; target: ExportTarget }
  | { type: "export"; jobId: string; segments: WorkerSegment[]; target: ExportTarget; fileName: string }
  | { type: "cancel"; jobId: string }
  | { type: "invalidate"; keys: string[] }
  | { type: "keep"; keys: string[] };

export type WorkerResponse =
  | { type: "ready"; supported: boolean }
  | { type: "cached"; keys: string[] }
  | { type: "prerender-progress"; done: number; total: number }
  | { type: "export-progress"; jobId: string; progress: number; stage: string }
  | { type: "export-done"; jobId: string; buffer: ArrayBuffer; fileName: string; durationMs: number }
  | { type: "export-error"; jobId: string; message: string };

/** FUSE_PROJECT-NAME_2026-09-03.mp4 */
export function exportFileName(projectName: string | null | undefined) {
  const slug = (projectName || "campaign")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "CAMPAIGN";
  const date = new Date().toISOString().slice(0, 10);
  return `FUSE_${slug}_${date}.mp4`;
}
