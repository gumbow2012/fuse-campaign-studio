/**
 * Real clip lengths, measured from media metadata for EVERY clip on a timeline.
 *
 * Some runs never stored `source_duration_ms`, so the timeline has to measure it
 * itself. Unlike poster extraction this is NOT gated behind the viewport: a
 * `preload="metadata"` probe only fetches headers, so measuring all 9-10 clips
 * stays cheap while full playback remains limited to the active clip.
 */
import { useEffect, useMemo, useState } from "react";
import { cachedDuration, measureDuration } from "@/lib/videoPoster";

export interface DurationSource {
  id: string;
  url: string | null;
  /** Stable across signed-url refreshes — segment id, not the signature. */
  cacheKey?: string;
  /** Stored length, when the server already has one. */
  knownMs?: number | null;
  /** Images have no media length to measure. */
  skip?: boolean;
}

const CONCURRENCY = 3;

export function useClipDurations(
  sources: DurationSource[],
  options?: { concurrency?: number },
): Record<string, number> {
  const concurrency = Math.max(1, Math.min(4, options?.concurrency ?? CONCURRENCY));
  const signature = useMemo(
    () => sources.map((s) => `${s.id}:${s.cacheKey ?? ""}:${s.url ?? ""}:${s.skip ? 1 : 0}`).join("|"),
    [sources],
  );

  const [durations, setDurations] = useState<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;

    /* Seed from the module cache so a re-render never drops a known length. */
    const seed: Record<string, number> = {};
    for (const source of sources) {
      const cached = cachedDuration(source.url, source.cacheKey ?? source.id);
      if (cached) seed[source.id] = cached;
    }
    if (Object.keys(seed).length) setDurations((current) => ({ ...seed, ...current, ...seed }));

    const queue = sources.filter((source) => !source.skip && !!source.url && !seed[source.id]);
    if (!queue.length) return;

    let cursor = 0;
    const worker = async () => {
      while (!cancelled) {
        const next = queue[cursor];
        cursor += 1;
        if (!next?.url) return;
        const ms = await measureDuration(next.url, { cacheKey: next.cacheKey ?? next.id });
        if (cancelled) return;
        if (ms && ms > 0) setDurations((current) => ({ ...current, [next.id]: ms }));
      }
    };

    void Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, concurrency]);

  return durations;
}

export default useClipDurations;
