import { useCallback, useEffect, useMemo, useState } from "react";
import { campaignExport, type ExportStatus } from "@/services/videoExport/exportClient";
import { segmentCacheKey, type ExportTarget, type WorkerSegment } from "@/services/videoExport/types";
import type { EditSegment } from "@/services/campaignEditor";
import { buildRenderSpec } from "@/services/editorAdjustments";
import {
  AUDIO_QUALITY_BITRATE,
  resolveDimensions,
  resolveFps,
  resolveVideoBitrate,
  type ExportSettings,
} from "@/services/exportSettings";

const PRERENDER_DELAY_MS = 1200;

function toWorkerSegments(segments: EditSegment[]): WorkerSegment[] {
  return segments
    .filter((segment) => !!segment.url)
    .map((segment) => ({
      id: segment.id,
      url: segment.url as string,
      trim_start_ms: segment.trim_start_ms,
      trim_end_ms: segment.trim_end_ms,
      muted: segment.muted,
      volume: segment.muted ? 0 : segment.volume,
      render: buildRenderSpec(segment.adjustments),
    }));
}

/** Background pre-render + export status for the active timeline. */
export function useCampaignExport(
  activeSegments: EditSegment[],
  settings: ExportSettings,
  projectName: string | null,
) {
  const [status, setStatus] = useState<ExportStatus>(campaignExport.getStatus());

  useEffect(() => {
    const unsubscribe = campaignExport.subscribe(setStatus);
    return () => {
      unsubscribe();
    };
  }, []);

  const target = useMemo<ExportTarget>(() => {
    const { width, height } = resolveDimensions(settings);
    const fps = resolveFps(settings);
    return {
      width,
      height,
      fps,
      aspectRatio: settings.aspect_ratio,
      videoBitrate: resolveVideoBitrate(settings, width, height, fps),
      audioBitrate: AUDIO_QUALITY_BITRATE[settings.audio_quality],
      codec: settings.codec,
      removeAudio: settings.remove_audio,
      loop: settings.loop,
    };
  }, [settings]);

  const workerSegments = useMemo(() => toWorkerSegments(activeSegments), [activeSegments]);
  const signature = useMemo(
    () => workerSegments.map((segment) => segmentCacheKey(segment, target)).join("~"),
    [workerSegments, target],
  );

  /** Warm the cache shortly after the timeline settles; drop stale renders. */
  useEffect(() => {
    if (!workerSegments.length) return;
    campaignExport.syncCache(workerSegments, target);
    const timer = window.setTimeout(() => campaignExport.prerender(workerSegments, target), PRERENDER_DELAY_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  const readyClips = useMemo(
    () =>
      workerSegments.filter((segment) => status.cachedKeys.includes(segmentCacheKey(segment, target))).length,
    [workerSegments, status.cachedKeys, target],
  );

  const start = useCallback(() => {
    if (!workerSegments.length) return;
    campaignExport.start(workerSegments, target, projectName);
  }, [workerSegments, target, projectName]);

  return {
    status,
    target,
    start,
    cancel: () => campaignExport.cancel(),
    reset: () => campaignExport.reset(),
    supported: campaignExport.isSupported() && status.phase !== "unsupported",
    clipCount: workerSegments.length,
    readyClips,
    /** Individual signed clip urls — the graceful fallback when local render can't run. */
    clipDownloads: workerSegments.map((segment, index) => ({
      url: segment.url,
      label: `Clip ${index + 1}`,
    })),
  };
}
