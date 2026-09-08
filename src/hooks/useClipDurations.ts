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
  /** Lower runs earlier in the shared media queue (active/visible clips first). */
  priority?: number;
}

export function useClipDurations(sources: DurationSource[]): Record<string, number> {
  const signature = useMemo(
    () =>
      sources
        .map((s) => `${s.id}:${s.cacheKey ?? ""}:${s.url ?? ""}:${s.skip ? 1 : 0}:${s.priority ?? ""}`)
        .join("|"),
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

    /* Every probe goes through the shared, concurrency-limited media queue in
       videoPoster: at most two hidden <video> elements exist at any moment, each
       released before the next starts, so a 10-clip run never floods the tab. */
    queue.forEach((source, index) => {
      void measureDuration(source.url as string, {
        cacheKey: source.cacheKey ?? source.id,
        priority: source.priority ?? 100 + index,
      }).then((ms) => {
        if (cancelled || !ms || ms <= 0) return;
        setDurations((current) => (current[source.id] === ms ? current : { ...current, [source.id]: ms }));
      });
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  return durations;
}


export default useClipDurations;
