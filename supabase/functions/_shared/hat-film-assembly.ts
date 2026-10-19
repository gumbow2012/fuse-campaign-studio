/**
 * Hat Brand Film — automatic assembly planning and honest state (pure).
 * The I/O caller persists `HatFilmAssemblyState` on the job and dispatches the
 * render worker only when `decideAssembly` returns `dispatch`.
 */
import {
  buildEditDecisionList, HAT_FILM_FPS, HAT_FILM_HEIGHT, HAT_FILM_MAX_AUTO_RETRIES,
  HAT_FILM_SHOTS, HAT_FILM_TOTAL_FRAMES, HAT_FILM_WIDTH,
} from "./hat-film-recipe.ts";

export type ShotStatus = "pending" | "still" | "animating" | "ready" | "needs_review" | "failed";
export type FilmPhase = "creating_images" | "animating_shots" | "assembling_video" | "ready" | "needs_review" | "render_unavailable" | "render_failed";

export interface ShotState { shot_id: string; status: ShotStatus; clip_url?: string | null; retries: number }
export interface HatFilmAssemblyState {
  dispatch_key: string | null; // set once; prevents duplicate dispatch
  export_status: "none" | "rendering" | "ready" | "failed";
  final_url: string | null;
  final_verified: { width: number; height: number; frames: number; has_audio: boolean } | null;
}

export function phaseFor(shots: ShotState[], a: HatFilmAssemblyState, rendererConfigured: boolean): FilmPhase {
  if (a.export_status === "ready" && a.final_url && a.final_verified) return "ready";
  if (a.export_status === "failed") return "render_failed";
  if (shots.some((s) => s.status === "needs_review" || s.status === "failed")) return "needs_review";
  if (shots.some((s) => s.status === "pending" || s.status === "still") && !shots.some((s) => s.status === "animating")) return "creating_images";
  if (shots.some((s) => s.status !== "ready")) return "animating_shots";
  return rendererConfigured ? "assembling_video" : "render_unavailable";
}

/** One automatic corrective retry per shot; then Needs review. */
export function onShotCheckFailed(s: ShotState): ShotState {
  return s.retries < HAT_FILM_MAX_AUTO_RETRIES ? { ...s, status: "pending", retries: s.retries + 1 } : { ...s, status: "needs_review" };
}

export type AssemblyDecision =
  | { action: "wait" }
  | { action: "blocked"; reason: string }
  | { action: "already_dispatched" }
  | { action: "dispatch"; dispatch_key: string; manifest: ReturnType<typeof buildRenderManifest> };

/** Idempotent: duplicate callbacks see dispatch_key and do nothing. */
export function decideAssembly(jobId: string, shots: ShotState[], a: HatFilmAssemblyState, opts: { rendererConfigured: boolean; soundtrackUrl: string | null; logoUrl: string | null }): AssemblyDecision {
  if (a.dispatch_key || a.export_status !== "none") return { action: "already_dispatched" };
  if (shots.length !== HAT_FILM_SHOTS.length) return { action: "blocked", reason: "shot count mismatch" };
  if (shots.some((s) => s.status === "needs_review" || s.status === "failed")) return { action: "blocked", reason: "a shot needs review" };
  if (shots.some((s) => s.status !== "ready" || !s.clip_url)) return { action: "wait" };
  if (!opts.rendererConfigured) return { action: "blocked", reason: "render worker not connected" };
  if (!opts.soundtrackUrl) return { action: "blocked", reason: "template soundtrack missing" };
  if (!opts.logoUrl) return { action: "blocked", reason: "logo missing" };
  return { action: "dispatch", dispatch_key: `hatfilm:${jobId}:v1`, manifest: buildRenderManifest(shots, opts.soundtrackUrl, opts.logoUrl) };
}

export function buildRenderManifest(shots: ShotState[], soundtrackUrl: string, logoUrl: string) {
  const byId = new Map(shots.map((s) => [s.shot_id, s]));
  const edl = buildEditDecisionList();
  return {
    output: { width: HAT_FILM_WIDTH, height: HAT_FILM_HEIGHT, fps: HAT_FILM_FPS, frames: HAT_FILM_TOTAL_FRAMES, codec: "h264", audio_codec: "aac" },
    segments: edl.map((e) => ({ ...e, url: byId.get(e.shot_id)!.clip_url!, volume: 0 })),
    overlays: edl.filter((e) => e.logo_overlay).map((e) => ({ type: "image", url: logoUrl, start_frame: e.start_frame, end_frame: e.end_frame, fit: "contain", treatment: "subtle_scale_light" })),
    music: { url: soundtrackUrl, volume: 1, fade_out_ms: 400 },
  };
}

/** A queued/rendering export is never success. Ready requires a verified render. */
export function acceptRenderCallback(a: HatFilmAssemblyState, cb: { status: "ready" | "failed"; url?: string | null; probe?: HatFilmAssemblyState["final_verified"] }): HatFilmAssemblyState {
  if (a.export_status === "ready") return a; // duplicate callback
  if (cb.status === "failed") return { ...a, export_status: "failed" };
  const p = cb.probe;
  const ok = !!cb.url && !!p && p.width === HAT_FILM_WIDTH && p.height === HAT_FILM_HEIGHT && p.frames === HAT_FILM_TOTAL_FRAMES && p.has_audio;
  return ok ? { ...a, export_status: "ready", final_url: cb.url!, final_verified: p! } : { ...a, export_status: "failed" };
}

export const emptyAssembly = (): HatFilmAssemblyState => ({ dispatch_key: null, export_status: "none", final_url: null, final_verified: null });
