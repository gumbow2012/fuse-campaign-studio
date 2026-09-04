/**
 * REAL CLIP THUMBNAILS — client-side poster extraction from a signed video url.
 *
 * No server work, no public media: a hidden <video> is loaded with the same
 * short-lived signed url the player already uses, seeked to an early frame and
 * drawn once into a canvas. The resulting data url is cached per source path so
 * a re-render (or a refreshed signature on the same file) never re-decodes.
 */

/** Signature-independent cache key — the same file keeps its poster. */
const cacheKey = (url: string) => url.split("?")[0];

const posters = new Map<string, string>();
const failed = new Set<string>();
const inflight = new Map<string, Promise<string | null>>();

export function cachedPoster(url: string | null | undefined): string | null {
  if (!url) return null;
  return posters.get(cacheKey(url)) ?? null;
}

export function posterFailed(url: string | null | undefined) {
  return !!url && failed.has(cacheKey(url));
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

async function grab(url: string, timeoutMs: number): Promise<string | null> {
  return await new Promise<string | null>((resolve) => {
    const video = document.createElement("video");
    let settled = false;

    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
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
  options?: { timeoutMs?: number },
): Promise<string | null> {
  const key = cacheKey(url);
  const known = posters.get(key);
  if (known) return known;
  if (failed.has(key)) return null;

  const pending = inflight.get(key);
  if (pending) return await pending;

  const task = grab(url, options?.timeoutMs ?? 9000)
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
