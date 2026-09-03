/**
 * FUSE editor music track — a single background track laid under the video clips.
 * The file lives in private storage; only the storage path is persisted, and playback
 * uses a short-lived signed url that is re-fetched on load.
 */

export type MusicFillMode = "trim" | "loop" | "natural";

export type MusicTrack = {
  path: string;
  name: string;
  /** Where the track starts on the timeline. */
  startMs: number;
  /** Trim into the song itself. */
  clipStartMs: number;
  clipEndMs: number;
  sourceDurationMs: number;
  volume: number; // 0..1.5
  muted: boolean;
  fadeInMs: number;
  fadeOutMs: number;
  mode: MusicFillMode;
  /** Global duck under clips that keep their own audio, 0..100. */
  duck: number;
};

export const MUSIC_ACCEPT = "audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/mp4,audio/aac,audio/m4a,.mp3,.wav,.m4a,.aac";
export const MUSIC_MAX_BYTES = 40 * 1024 * 1024;

const num = (value: unknown, fallback: number, min: number, max: number) => {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
};

export function normalizeMusic(raw: unknown): MusicTrack | null {
  if (!raw || typeof raw !== "object") return null;
  const music = raw as Record<string, unknown>;
  const path = typeof music.path === "string" ? music.path : "";
  if (!path) return null;
  const sourceDuration = num(music.sourceDurationMs, 0, 0, 60 * 60_000);
  const clipStart = num(music.clipStartMs, 0, 0, Math.max(0, sourceDuration || 60 * 60_000));
  const clipEnd = num(
    music.clipEndMs,
    sourceDuration || clipStart + 30_000,
    clipStart + 200,
    Math.max(clipStart + 200, sourceDuration || 60 * 60_000),
  );
  return {
    path,
    name: typeof music.name === "string" ? music.name.slice(0, 120) : "Music",
    startMs: num(music.startMs, 0, 0, 30 * 60_000),
    clipStartMs: clipStart,
    clipEndMs: clipEnd,
    sourceDurationMs: sourceDuration,
    volume: num(music.volume, 0.7, 0, 1.5),
    muted: !!music.muted,
    fadeInMs: num(music.fadeInMs, 600, 0, 10_000),
    fadeOutMs: num(music.fadeOutMs, 900, 0, 10_000),
    mode: (["trim", "loop", "natural"] as MusicFillMode[]).includes(music.mode as MusicFillMode)
      ? (music.mode as MusicFillMode)
      : "trim",
    duck: num(music.duck, 35, 0, 100),
  };
}

export const musicClipDurationMs = (music: MusicTrack) =>
  Math.max(0, music.clipEndMs - music.clipStartMs);

/** How long the music actually sounds on the timeline for a given video length. */
export function musicTimelineDurationMs(music: MusicTrack, timelineMs: number) {
  const clip = musicClipDurationMs(music);
  const available = Math.max(0, timelineMs - music.startMs);
  if (music.mode === "natural") return clip;
  if (music.mode === "loop") return available;
  return Math.min(clip, available);
}

/** Music gain at an absolute timeline position (fades applied, ducking excluded). */
export function musicGainAt(music: MusicTrack, timelineMs: number, totalMs: number) {
  if (music.muted) return 0;
  const start = music.startMs;
  const end = start + musicTimelineDurationMs(music, totalMs);
  if (timelineMs < start || timelineMs > end) return 0;
  let gain = music.volume;
  if (music.fadeInMs > 0) gain *= Math.min(1, (timelineMs - start) / music.fadeInMs);
  if (music.fadeOutMs > 0) gain *= Math.min(1, Math.max(0, end - timelineMs) / music.fadeOutMs);
  return Math.max(0, Math.min(1.5, gain));
}

/** Position inside the source file for an absolute timeline position. */
export function musicSourceOffsetMs(music: MusicTrack, timelineMs: number) {
  const clip = musicClipDurationMs(music);
  const elapsed = Math.max(0, timelineMs - music.startMs);
  if (music.mode === "loop" && clip > 0) return music.clipStartMs + (elapsed % clip);
  return music.clipStartMs + elapsed;
}

export const musicSignature = (music: MusicTrack | null) =>
  music
    ? JSON.stringify([
        music.path,
        music.startMs,
        music.clipStartMs,
        music.clipEndMs,
        music.volume,
        music.muted,
        music.fadeInMs,
        music.fadeOutMs,
        music.mode,
        music.duck,
      ])
    : "none";
