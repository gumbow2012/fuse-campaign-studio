/**
 * REAL CLIP THUMBNAILS — client-side poster extraction from a signed video url.
 *
 * No server work, no public media: a hidden <video> is loaded with the same
 * short-lived signed url the player already uses, seeked to an early frame and
 * drawn once into a canvas. The resulting data url is cached per source path so
 * a re-render (or a refreshed signature on the same file) never re-decodes.
 */

/** Signature-independent fallback key — the same object keeps its poster. */
const urlCacheKey = (url: string) => url.split("?")[0];

const resolveCacheKey = (url: string, stableKey?: string) => stableKey?.trim() || urlCacheKey(url);

const posters = new Map<string, string>();
/** Real media length in ms, read from the same metadata load as the poster. */
const durations = new Map<string, number>();
const failed = new Set<string>();
const inflight = new Map<string, Promise<string | null>>();
/** Metadata-only duration probes, de-duplicated per stable key. */
const durationInflight = new Map<string, Promise<number | null>>();

/* ------------------------------------------------------------------------- *
 * GLOBAL MEDIA QUEUE
 *
 * Every hidden <video> this module opens — poster extraction AND duration
 * probes — passes through one bounded scheduler, so a 10-clip timeline never
 * has more than MAX_CONCURRENT media elements alive. Lower `priority` runs
 * first (visible/active clips), and the queue yields to the main thread
 * between items so scrolling and clicks stay responsive.
 * ------------------------------------------------------------------------- */

const MAX_CONCURRENT = 2;

type QueueEntry = { priority: number; run: () => void };

const waiting: QueueEntry[] = [];
let active = 0;

const yieldToMain = () =>
  new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 0);
  });

function pump() {
  while (active < MAX_CONCURRENT && waiting.length) {
    waiting.sort((a, b) => a.priority - b.priority);
    const next = waiting.shift();
    if (!next) return;
    active += 1;
    next.run();
  }
}

function schedule<T>(priority: number, task: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    waiting.push({
      priority,
      run: () => {
        task()
          .then(resolve, reject)
          .finally(async () => {
            /* Release the slot only after a frame, so decoding one clip never
               chains straight into the next on the same tick. */
            await yieldToMain();
            active -= 1;
            pump();
          });
      },
    });
    pump();
  });
}


export function cachedPoster(url: string | null | undefined, stableKey?: string): string | null {
  if (!url) return null;
  return posters.get(resolveCacheKey(url, stableKey)) ?? null;
}

/** Measured media duration (ms) for a clip whose metadata we already loaded. */
export function cachedDuration(url: string | null | undefined, stableKey?: string): number | null {
  if (!url && !stableKey) return null;
  const key = stableKey?.trim() || (url ? urlCacheKey(url) : "");
  const value = key ? durations.get(key) : null;
  return value && Number.isFinite(value) && value > 0 ? value : null;
}

export function posterFailed(url: string | null | undefined, stableKey?: string) {
  return !!url && failed.has(resolveCacheKey(url, stableKey));
}

function drawFrame(video: HTMLVideoElement): string | null {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) return null;
  /* Thumbnails render at most ~360px on the long edge. */
  const scale = Math.min(1, 360 / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(2, Math.round(width * scale));
  canvas.height = Math.max(2, Math.round(height * scale));
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  try {
    return canvas.toDataURL("image/jpeg", 0.72);
  } catch {
    /* Tainted canvas (no CORS header on the signed url). */
    return null;
  }
}

async function grab(url: string, timeoutMs: number, key: string): Promise<string | null> {
  return await new Promise<string | null>((resolve) => {
    const video = document.createElement("video");
    let settled = false;

    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      /* Release immediately: stop the fetch and drop the element's source so
         memory and bandwidth are free before the next queued clip starts. */
      try {
        video.pause();
      } catch {
        /* not playing */
      }
      video.removeAttribute("src");
      video.load();
      resolve(value);
    };


    const timer = window.setTimeout(() => finish(null), timeoutMs);

    video.crossOrigin = "anonymous";
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.setAttribute("aria-hidden", "true");

    video.onerror = () => finish(null);
    video.onloadedmetadata = () => {
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      if (duration > 0) durations.set(key, Math.round(duration * 1000));
      /* ~10% in, but never past the clip and never before the first frame. */
      const at = duration > 0 ? Math.min(Math.max(0.1, duration * 0.1), Math.max(0.05, duration - 0.05)) : 0.1;
      video.onseeked = () => finish(drawFrame(video));
      try {
        video.currentTime = at;
      } catch {
        finish(null);
      }
    };

    video.src = url;
  });
}

/**
 * Poster for a signed video url. Resolves from cache instantly when known,
 * de-duplicates concurrent requests, and remembers failures so a clip that
 * cannot be decoded is not retried on every render.
 */
export async function extractPoster(
  url: string,
  options?: { timeoutMs?: number; cacheKey?: string; priority?: number },
): Promise<string | null> {
  const key = resolveCacheKey(url, options?.cacheKey);
  const known = posters.get(key);
  if (known) return known;
  if (failed.has(key)) return null;

  const pending = inflight.get(key);
  if (pending) return await pending;

  const task = schedule(options?.priority ?? 10, () => grab(url, options?.timeoutMs ?? 9000, key))
    .then((value) => {
      if (value) posters.set(key, value);
      else failed.add(key);
      return value;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, task);
  return await task;
}


/**
 * DURATION ONLY — metadata probe for a clip whose length is not stored.
 *
 * `preload="metadata"` fetches headers, not the file, so this is cheap enough to
 * run for EVERY clip on a timeline (durations must never depend on scrolling).
 * The element is released as soon as the length is known. Result is cached under
 * the same stable key the poster cache uses.
 */
export async function measureDuration(
  url: string,
  options?: { timeoutMs?: number; cacheKey?: string; priority?: number },
): Promise<number | null> {
  const key = resolveCacheKey(url, options?.cacheKey);
  const known = durations.get(key);
  if (known && known > 0) return known;

  const pending = durationInflight.get(key);
  if (pending) return await pending;

  const task = schedule(options?.priority ?? 20, () => new Promise<number | null>((resolve) => {
    /* Cheap win: a poster pass may have measured this clip while we queued. */
    const already = durations.get(key);
    if (already && already > 0) {
      resolve(already);
      return;
    }
    const video = document.createElement("video");
    let settled = false;
    const finish = (value: number | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      video.onloadedmetadata = null;
      video.onerror = null;
      /* Release before the next queued clip starts: stop the fetch, drop the src. */
      try {
        video.pause();
      } catch {
        /* not playing */
      }
      video.removeAttribute("src");
      video.load();
      resolve(value);
    };
    const timer = window.setTimeout(() => finish(null), options?.timeoutMs ?? 12000);

    video.crossOrigin = "anonymous";
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.setAttribute("aria-hidden", "true");
    video.onerror = () => finish(null);
    video.onloadedmetadata = () => {
      const seconds = Number.isFinite(video.duration) ? video.duration : 0;
      if (seconds > 0) {
        const ms = Math.round(seconds * 1000);
        durations.set(key, ms);
        finish(ms);
        return;
      }
      finish(null);
    };
    video.src = url;
  })).finally(() => {
    durationInflight.delete(key);
  });


  durationInflight.set(key, task);
  return await task;
}
