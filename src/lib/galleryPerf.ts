/**
 * GS-PERF9: DEV-ONLY Generation Studio gallery performance instrumentation.
 *
 * Every exported function guards on `import.meta.env.DEV`. Vite statically
 * replaces that constant in production builds, so terser dead-code
 * eliminates these calls entirely — no perf overhead, no console output,
 * no PerformanceObserver for real users.
 *
 * Metrics are exposed on `window.__fuseGalleryPerf` in dev and a compact
 * summary is logged once the first screen settles (or after 15s).
 */

const DEV = import.meta.env.DEV;

export interface GalleryPerfMetrics {
  /** performance.now() at gallery mount. */
  mountedAt: number;
  /** 1. Initial action:"queue" fetch duration. */
  initialApiMs: number | null;
  /** 2. Initial payload size, approximated via JSON.stringify length. */
  initialApiBytes: number | null;
  /** 3. Mount → first gallery <img> onLoad / <video> onLoadedData. */
  firstPreviewMs: number | null;
  /** 4. Mount → 8th media element loaded. */
  first8PreviewsMs: number | null;
  /** 7. Duration of each cursor "Load More" fetch. */
  loadMoreApiMs: number[];
  /** 6. React render counts. */
  galleryRenderCount: number;
  cardRenderCount: number;
  /** 5. Media network activity on initial load (PerformanceObserver). */
  mediaRequestCount: number;
  mediaBytesDownloaded: number;
  /** internal: how many media elements have loaded this session. */
  mediaLoadedCount: number;
}

let session: GalleryPerfMetrics | null = null;
let observer: PerformanceObserver | null = null;
let summaryLogged = false;
let summaryTimer: ReturnType<typeof setTimeout> | null = null;

/** Media hosts/paths that count toward gallery download bytes. */
function isGalleryMediaResource(name: string): boolean {
  return (
    name.includes("fal.media") ||
    name.includes("/studio/previews/") ||
    name.includes("fuse-assets")
  );
}

function publish(): void {
  if (!DEV || !session) return;
  (window as unknown as Record<string, unknown>).__fuseGalleryPerf = {
    metrics: session,
    summary: logSummary,
    reset: galleryPerfMount,
  };
}

function logSummary(): void {
  if (!DEV || !session || summaryLogged) return;
  summaryLogged = true;
  const m = session;
  const kb = (bytes: number | null) =>
    bytes == null ? "n/a" : `${(bytes / 1024).toFixed(1)} KB`;
  const ms = (v: number | null) => (v == null ? "n/a" : `${Math.round(v)} ms`);
  // eslint-disable-next-line no-console
  console.groupCollapsed("[FUSE] Generation Studio gallery perf (dev only)");
  // eslint-disable-next-line no-console
  console.table({
    "initial API duration": ms(m.initialApiMs),
    "initial API payload": kb(m.initialApiBytes),
    "time to first preview": ms(m.firstPreviewMs),
    "time to first 8 previews": ms(m.first8PreviewsMs),
    "media requests (initial)": m.mediaRequestCount,
    "media bytes (initial)": kb(m.mediaBytesDownloaded),
    "gallery renders": m.galleryRenderCount,
    "card renders": m.cardRenderCount,
    "load-more API calls": m.loadMoreApiMs.length
      ? m.loadMoreApiMs.map((v) => `${Math.round(v)}ms`).join(", ")
      : "none",
  });
  // eslint-disable-next-line no-console
  console.groupEnd();
}

function maybeSummary(): void {
  if (!DEV || !session || summaryLogged) return;
  // Settled = initial API done AND first 8 previews decoded (or no media).
  if (session.initialApiMs != null && session.first8PreviewsMs != null) {
    logSummary();
  }
}

/** Call once when the Generation Studio gallery mounts. */
export function galleryPerfMount(): void {
  if (!DEV) return;
  observer?.disconnect();
  if (summaryTimer) clearTimeout(summaryTimer);
  summaryLogged = false;
  session = {
    mountedAt: performance.now(),
    initialApiMs: null,
    initialApiBytes: null,
    firstPreviewMs: null,
    first8PreviewsMs: null,
    loadMoreApiMs: [],
    galleryRenderCount: 0,
    cardRenderCount: 0,
    mediaRequestCount: 0,
    mediaBytesDownloaded: 0,
    mediaLoadedCount: 0,
  };
  try {
    observer = new PerformanceObserver((list) => {
      if (!session) return;
      for (const entry of list.getEntries() as PerformanceResourceTiming[]) {
        if (!isGalleryMediaResource(entry.name)) continue;
        session.mediaRequestCount += 1;
        session.mediaBytesDownloaded += entry.transferSize || entry.encodedBodySize || 0;
      }
      publish();
    });
    observer.observe({ type: "resource", buffered: true });
  } catch {
    observer = null;
  }
  publish();
  // Fallback: log whatever we have after 15s even if 8 previews never load.
  summaryTimer = setTimeout(logSummary, 15000);
}

/** 1+2. Wrap the FIRST action:"queue" fetch only. */
export function galleryPerfInitialApi(durationMs: number, payload: unknown): void {
  if (!DEV || !session) return;
  session.initialApiMs = durationMs;
  try {
    session.initialApiBytes = JSON.stringify(payload ?? null).length;
  } catch {
    session.initialApiBytes = null;
  }
  publish();
  maybeSummary();
}

/** 3+4. Call from gallery media onLoad / onLoadedData (not onError). */
export function galleryPerfMediaLoaded(): void {
  if (!DEV || !session) return;
  session.mediaLoadedCount += 1;
  const elapsed = performance.now() - session.mountedAt;
  if (session.firstPreviewMs == null) session.firstPreviewMs = elapsed;
  if (session.mediaLoadedCount === 8 && session.first8PreviewsMs == null) {
    session.first8PreviewsMs = elapsed;
  }
  publish();
  maybeSummary();
}

/** 7. Time around each cursor "Load More" fetch. */
export function galleryPerfLoadMore(durationMs: number): void {
  if (!DEV || !session) return;
  session.loadMoreApiMs.push(durationMs);
  publish();
  // eslint-disable-next-line no-console
  console.debug(`[FUSE] Load More API: ${Math.round(durationMs)} ms`);
}

/** 6. Increment once per gallery component render. */
export function galleryPerfRender(): void {
  if (!DEV || !session) return;
  session.galleryRenderCount += 1;
}

/** 6. Increment once per gallery card render. */
export function galleryPerfCardRender(): void {
  if (!DEV || !session) return;
  session.cardRenderCount += 1;
}
