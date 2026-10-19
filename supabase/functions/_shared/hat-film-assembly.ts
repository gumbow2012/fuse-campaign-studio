/**
 * Hat Brand Film — assembly state (pure). Assembly runs in the customer's
 * browser through the FUSE export engine; the server owns a durable lock
 * (compare-and-set on the job row) and only accepts a verified final file.
 */
import {
  assertCompleteShotSet, buildEditDecisionList, HAT_FILM_FPS, HAT_FILM_HEIGHT,
  HAT_FILM_MAX_AUTO_RETRIES, HAT_FILM_SHOTS, HAT_FILM_TOTAL_FRAMES, HAT_FILM_WIDTH,
} from "./hat-film-recipe.ts";

export const HAT_FILM_ASSEMBLY_KEY = "hat_film_assembly";
export const HAT_FILM_LOCK_MS = 15 * 60 * 1000;

export type ShotStatus = "pending" | "still" | "animating" | "ready" | "needs_review" | "failed";
export type FilmPhase = "creating_images" | "animating_shots" | "assembling_video" | "ready" | "needs_review" | "assembly_failed";

export interface ShotState {
  shot_id: string;
  status: ShotStatus;
  still_url?: string | null;
  clip_url?: string | null;
  clip_duration_ms?: number | null;
  retries: number;
}

export interface HatFilmAssemblyState {
  status: "waiting" | "assembling" | "ready" | "failed";
  lock_token: string | null;
  lock_expires_at: string | null;
  attempts: number;
  output_path: string | null;
  verified: { width: number; height: number; frames: number; has_audio: boolean; duration_ms: number } | null;
  error: string | null;
}

export const emptyAssembly = (): HatFilmAssemblyState => ({
  status: "waiting", lock_token: null, lock_expires_at: null, attempts: 0, output_path: null, verified: null, error: null,
});

export function parseAssembly(value: unknown): HatFilmAssemblyState {
  const v = (value ?? {}) as Partial<HatFilmAssemblyState>;
  return { ...emptyAssembly(), ...v };
}

export function phaseFor(shots: ShotState[], a: HatFilmAssemblyState): FilmPhase {
  if (a.status === "ready" && a.output_path && a.verified) return "ready";
  if (shots.some((s) => s.status === "needs_review" || s.status === "failed")) return "needs_review";
  const kinds = new Map(HAT_FILM_SHOTS.map((s) => [s.id, s.kind]));
  const stillsDone = shots.every((s) => !!s.still_url);
  if (!stillsDone) return "creating_images";
  const clipsDone = shots.every((s) => kinds.get(s.shot_id) === "logo_hold" || (s.status === "ready" && !!s.clip_url));
  if (!clipsDone) return "animating_shots";
  if (a.status === "failed") return "assembly_failed";
  return "assembling_video";
}

/** One automatic corrective retry per shot; then Needs review. */
export function onShotCheckFailed(s: ShotState): ShotState {
  return s.retries < HAT_FILM_MAX_AUTO_RETRIES ? { ...s, status: "pending", retries: s.retries + 1 } : { ...s, status: "needs_review" };
}

export type ManifestSegment = {
  shot_id: string;
  kind: "generated" | "logo_composite" | "logo_hold";
  frames: number;
  start_frame: number;
  source_url: string;
  source_type: "video" | "image";
  logo_overlay: boolean;
};

export interface RenderManifest {
  output: { width: number; height: number; fps: number; frames: number; codec: "h264"; audio_codec: "aac" };
  segments: ManifestSegment[];
  logo_url: string;
  soundtrack_url: string;
}

/**
 * Builds the frame-exact manifest. Throws on a duplicate/missing shot, a clip
 * shorter than its slot, or a missing logo/soundtrack. No partial manifests.
 */
export function buildRenderManifest(shots: ShotState[], opts: { logoUrl: string | null; soundtrackUrl: string | null }): RenderManifest {
  assertCompleteShotSet(shots.map((s) => s.shot_id));
  if (!opts.logoUrl) throw new Error("Logo missing");
  if (!opts.soundtrackUrl) throw new Error("Template soundtrack missing");
  const byId = new Map(shots.map((s) => [s.shot_id, s]));
  const segments = buildEditDecisionList().map((e): ManifestSegment => {
    const shot = byId.get(e.shot_id)!;
    if (shot.status === "needs_review" || shot.status === "failed") throw new Error(`${e.shot_id} needs review`);
    if (e.kind === "logo_hold") {
      if (!shot.still_url) throw new Error(`${e.shot_id} still missing`);
      return { shot_id: e.shot_id, kind: e.kind, frames: e.frames, start_frame: e.start_frame, source_url: shot.still_url, source_type: "image", logo_overlay: true };
    }
    if (!shot.clip_url) throw new Error(`${e.shot_id} clip missing`);
    if (shot.clip_duration_ms != null && shot.clip_duration_ms < e.min_source_ms) {
      throw new Error(`${e.shot_id} clip is ${shot.clip_duration_ms}ms; needs ${e.min_source_ms}ms`);
    }
    return { shot_id: e.shot_id, kind: e.kind, frames: e.frames, start_frame: e.start_frame, source_url: shot.clip_url, source_type: "video", logo_overlay: e.logo_overlay };
  });
  if (segments.reduce((n, s) => n + s.frames, 0) !== HAT_FILM_TOTAL_FRAMES) throw new Error("Frame total mismatch");
  return {
    output: { width: HAT_FILM_WIDTH, height: HAT_FILM_HEIGHT, fps: HAT_FILM_FPS, frames: HAT_FILM_TOTAL_FRAMES, codec: "h264", audio_codec: "aac" },
    segments, logo_url: opts.logoUrl, soundtrack_url: opts.soundtrackUrl,
  };
}

/** May this caller take the lock now? (The DB update repeats this as its WHERE.) */
export function canClaim(a: HatFilmAssemblyState, nowIso: string): boolean {
  if (a.status === "ready") return false;
  return !a.lock_token || !a.lock_expires_at || a.lock_expires_at < nowIso;
}

/**
 * Lease view for the caller. `owned` = this browser session holds the live
 * lease (same session token after a reload) and may resume; anyone else sees
 * `locked` until it expires. An expired lease is neither locked nor owned.
 */
export function lockView(a: HatFilmAssemblyState, token: string | null, nowIso: string): { locked: boolean; owned: boolean } {
  const live = a.status === "assembling" && !!a.lock_token && !canClaim(a, nowIso);
  const owned = live && !!token && a.lock_token === token;
  return { locked: live && !owned, owned };
}

export function claimed(a: HatFilmAssemblyState, token: string, now: Date): HatFilmAssemblyState {
  return { ...a, status: "assembling", lock_token: token, lock_expires_at: new Date(now.getTime() + HAT_FILM_LOCK_MS).toISOString(), attempts: a.attempts + 1, error: null };
}

/** Ready only for the lock holder and a verified 1080x1920 / 645-frame file with audio. */
export function acceptAssembly(a: HatFilmAssemblyState, token: string, result: { output_path: string; verified: HatFilmAssemblyState["verified"] }): HatFilmAssemblyState {
  if (a.status === "ready") return a;
  if (a.lock_token !== token) throw new Error("Assembly lock is held by another session");
  const p = result.verified;
  const ok = !!result.output_path && !!p && p.width === HAT_FILM_WIDTH && p.height === HAT_FILM_HEIGHT &&
    p.frames === HAT_FILM_TOTAL_FRAMES && p.has_audio && Math.abs(p.duration_ms - (HAT_FILM_TOTAL_FRAMES / HAT_FILM_FPS) * 1000) <= 100;
  if (!ok) return { ...a, status: "failed", lock_token: null, lock_expires_at: null, error: "The assembled file didn't pass verification (size, frame count, duration or audio)." };
  return { ...a, status: "ready", lock_token: null, lock_expires_at: null, output_path: result.output_path, verified: p, error: null };
}

export function failedAssembly(a: HatFilmAssemblyState, token: string, message: string): HatFilmAssemblyState {
  if (a.status === "ready" || a.lock_token !== token) return a;
  return { ...a, status: "failed", lock_token: null, lock_expires_at: null, error: message.slice(0, 300) };
}
