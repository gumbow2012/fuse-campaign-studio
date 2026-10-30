import type { DirectorProject, DirectorShot } from "./types";

/**
 * Turning finished clips into one video happens in the Campaign Editor (trim, reorder, text, music,
 * export). These helpers only decide WHICH clips go there and what each timeline row looks like.
 */

/** Object key inside the private fuse-assets bucket, from a stored (canonical) or signed URL. */
export function storageKey(url: string): string | null {
  const match = url.match(/\/object\/(?:public|sign)\/fuse-assets\/(.+)$/);
  return match ? decodeURIComponent(match[1].split("?")[0]) : null;
}

export interface ReadyClip {
  shot: DirectorShot;
  key: string;
}

/** Finished clips in script order. A shot whose clip failed or is still rendering is simply left out. */
export function readyClips(project: DirectorProject): ReadyClip[] {
  return project.shots
    .filter((s) => s.video.url)
    .map((shot) => ({ shot, key: storageKey(shot.video.url) }))
    .filter((c): c is ReadyClip => c.key !== null);
}

export const clipLabel = (shot: DirectorShot) => `Shot ${String(shot.index).padStart(2, "0")} · ${shot.title}`;

/** `03-secret-agent-inspection.mp4` */
export function clipFileName(shot: DirectorShot): string {
  const slug = shot.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "shot";
  return `${String(shot.index).padStart(2, "0")}-${slug}.mp4`;
}

export interface SegmentRow {
  project_id: string;
  source_path: string;
  source_label: string;
  source_type: "video";
  source_duration_ms: number;
  position: number;
  trim_start_ms: number;
  trim_end_ms: number;
  on_timeline: boolean;
}

/**
 * Rows for the editor timeline. First send: every clip, in script order, on the timeline. Later sends
 * only add clips the editor does not have yet, as "Available media" (off the timeline), so nothing the
 * user already arranged is ever moved or removed.
 */
export function segmentRows(
  projectId: string,
  clips: ReadyClip[],
  clipSeconds: number,
  existingPaths: string[] = [],
  firstPosition = 0,
): SegmentRow[] {
  const have = new Set(existingPaths);
  const first = existingPaths.length === 0;
  const durationMs = Math.round(clipSeconds * 1000);
  return clips
    .filter((c) => !have.has(c.key))
    .map((c, i) => ({
      project_id: projectId,
      source_path: c.key,
      source_label: clipLabel(c.shot),
      source_type: "video" as const,
      source_duration_ms: durationMs,
      position: firstPosition + i,
      trim_start_ms: 0,
      trim_end_ms: durationMs,
      on_timeline: first,
    }));
}
