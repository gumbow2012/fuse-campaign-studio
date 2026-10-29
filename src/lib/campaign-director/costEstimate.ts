import type { DirectorProject, DirectorShot } from "./types";

/**
 * Spend preview. Nothing is generated until the user confirms a run whose count
 * and cost were shown. Unit prices come from the live provider lookup; they are
 * passed in so this stays pure and testable.
 */

export interface UnitPrices {
  /** USD per still at the world's resolution. */
  imageUsd: number;
  /** USD per clip second at the world's video model. */
  videoUsdPerSecond: number;
}

export type RunMode = "images" | "videos";

export interface RunEstimate {
  mode: RunMode;
  count: number;
  usd: number;
  shotIds: string[];
}

export function shotsNeedingImage(project: DirectorProject): DirectorShot[] {
  return project.shots.filter(
    (s) => !s.image.url && s.status !== "image_queued" && (s.status === "draft" || s.status === "rejected" || s.status === "failed"),
  );
}

export function shotsNeedingVideo(project: DirectorProject): DirectorShot[] {
  return project.shots.filter((s) => s.status === "approved" && s.image.url && !s.video.url);
}

export function estimateRun(project: DirectorProject, mode: RunMode, prices: UnitPrices, only?: string[]): RunEstimate {
  const pool = mode === "images" ? shotsNeedingImage(project) : shotsNeedingVideo(project);
  const shots = only ? pool.filter((s) => only.includes(s.id)) : pool;
  const unit = mode === "images" ? prices.imageUsd : prices.videoUsdPerSecond * project.world.clipSeconds;
  return {
    mode,
    count: shots.length,
    usd: Number((shots.length * unit).toFixed(2)),
    shotIds: shots.map((s) => s.id),
  };
}

export function formatUsd(value: number): string {
  return `$${value.toFixed(2)}`;
}

/** Plain-words description of a run, shown in the spend dialog. */
export function describeRun(estimate: RunEstimate, project: DirectorProject): string {
  const w = project.world;
  return estimate.mode === "images"
    ? `${estimate.count} still image${estimate.count === 1 ? "" : "s"} with Nano Banana Pro at ${w.imageResolution}, ${w.aspectRatio}.`
    : `${estimate.count} clip${estimate.count === 1 ? "" : "s"} of ${w.clipSeconds} seconds each with ${w.videoModel === "kling-3.0-pro" ? "Kling 3.0 Pro" : "Kling 3.0 Standard"}, no audio.`;
}
