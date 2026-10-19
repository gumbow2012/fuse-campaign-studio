/** Pure Hat Brand Film panel decisions (node-testable). */

/** The assembly service reports finished shots as "ready". */
export const readyShotCount = (shots: Array<{ status: string }>) => shots.filter((s) => s.status === "ready").length;

export type HatPanelMode = "auto_start" | "other_tab" | "idle";

/**
 * auto_start: this tab may (re)start assembly — the lease is free, or it is
 * this browser session's own lease after a reload and no other open tab holds
 * the in-browser tab lock (a duplicated tab copies the session token).
 */
export function hatFilmPanelMode(
  state: { phase: string; manifest: unknown; assembly: { locked: boolean; owned?: boolean } },
  ctx: { busy: boolean; autoStarted: boolean; tabLockFree: boolean },
): HatPanelMode {
  if (state.phase !== "assembling_video") return "idle";
  if (state.assembly.locked) return "other_tab";
  if (state.assembly.owned && !ctx.tabLockFree) return "other_tab";
  if (ctx.busy || ctx.autoStarted || !state.manifest) return "idle";
  return "auto_start";
}
