/**
 * Posters for a list of video clips, extracted client-side and cached.
 *
 * Extraction is paced (two at a time) so a ten-clip timeline never stalls the
 * main thread, and an already-cached poster is returned on the first render
 * with no flash of an empty box.
 */
import { useEffect, useMemo, useState } from "react";
import { cachedPoster, extractPoster, posterFailed } from "@/lib/videoPoster";

export interface PosterSource {
  id: string;
  url: string | null;
  /** Stable across signed-url refreshes; segment id or immutable object path. */
  cacheKey?: string;
  /** A server-provided poster always wins — no extraction needed. */
  poster?: string | null;
}

const CONCURRENCY = 2;

export interface ClipPosterOptions {
  /**
   * When provided, ONLY these clips extract a poster (near/in the viewport plus
   * the active clip). Keeps a ten-clip timeline from opening ten videos at once.
   */
  allowedIds?: Iterable<string> | null;
  concurrency?: number;
}

export function useClipPosters(
  sources: PosterSource[],
  options?: ClipPosterOptions,
): Record<string, string | null> {
  const allowed = useMemo(
    () => (options?.allowedIds ? new Set(options.allowedIds) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [options?.allowedIds ? Array.from(options.allowedIds).sort().join("|") : ""],
  );
  const concurrency = Math.max(1, Math.min(3, options?.concurrency ?? CONCURRENCY));
  const signature = useMemo(
    () => sources.map((source) => `${source.id}:${source.cacheKey ?? ""}:${source.url ?? ""}:${source.poster ?? ""}`).join("|"),
    [sources],
  );

  const [posters, setPosters] = useState<Record<string, string | null>>({});

  useEffect(() => {
    let cancelled = false;

    /* Seed synchronously from server posters + the module cache. */
    const seed: Record<string, string | null> = {};
    for (const source of sources) {
      seed[source.id] = source.poster ?? cachedPoster(source.url, source.cacheKey ?? source.id) ?? posters[source.id] ?? null;
    }
    setPosters(seed);

    const queue = sources.filter(
      (source) =>
        !seed[source.id] &&
        !!source.url &&
        (!allowed || allowed.has(source.id)) &&
        !posterFailed(source.url, source.cacheKey ?? source.id),
    );
    if (!queue.length) return;

    let cursor = 0;
    const worker = async () => {
      while (!cancelled) {
        const next = queue[cursor];
        cursor += 1;
        if (!next?.url) return;
        const poster = await extractPoster(next.url, { cacheKey: next.cacheKey ?? next.id });
        if (cancelled) return;
        if (poster) setPosters((current) => ({ ...current, [next.id]: poster }));
      }
    };

    void Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, allowed, concurrency]);

  return posters;
}

export default useClipPosters;
