/**
 * GS-PERF8: stale-while-revalidate gallery cache.
 *
 * Module-level Map keyed by user id holds the FIRST gallery page
 * (lightweight rows + page-1 cursor) across route navigations, so
 * reopening Generation Studio renders the last gallery instantly
 * while a fresh page 1 loads in the background.
 *
 * Optionally backed by sessionStorage for same-tab reloads. Every
 * read/write is wrapped in try/catch — storage may be blocked or
 * empty; this cache is a convenience and must never throw or block
 * render.
 */

export interface StudioGalleryCacheEntry<T> {
  rows: T[];
  cursor: unknown;
  ts: number;
}

const memory = new Map<string, StudioGalleryCacheEntry<unknown>>();
const SS_PREFIX = "fuse:studio-gallery:";

export function readStudioGalleryCache<T>(userId: string): StudioGalleryCacheEntry<T> | null {
  if (!userId) return null;
  const hit = memory.get(userId);
  if (hit) return hit as StudioGalleryCacheEntry<T>;
  try {
    const raw = sessionStorage.getItem(SS_PREFIX + userId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StudioGalleryCacheEntry<T>;
    if (!parsed || !Array.isArray(parsed.rows)) return null;
    memory.set(userId, parsed as StudioGalleryCacheEntry<unknown>);
    return parsed;
  } catch {
    return null;
  }
}

export function writeStudioGalleryCache<T>(userId: string, rows: T[], cursor: unknown): void {
  if (!userId || !rows.length) return;
  const entry: StudioGalleryCacheEntry<T> = { rows, cursor, ts: Date.now() };
  memory.set(userId, entry as StudioGalleryCacheEntry<unknown>);
  try {
    sessionStorage.setItem(SS_PREFIX + userId, JSON.stringify(entry));
  } catch {
    // storage is a convenience only — never throw, never block render
  }
}
