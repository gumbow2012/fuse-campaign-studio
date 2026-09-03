import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { campaignExport, type ExportStatus } from "@/services/videoExport/exportClient";
import { segmentCacheKey, type ExportTarget, type WorkerSegment } from "@/services/videoExport/types";
import { clipDurationMs, type EditSegment } from "@/services/campaignEditor";
import { buildRenderSpec, timelineDurationMs } from "@/services/editorAdjustments";
import { textSignature, type TextLayer } from "@/services/editorText";
import { musicSignature, type MusicTrack } from "@/services/editorMusic";
import { mixExportAudio } from "@/services/videoExport/audioMixer";
import {
  AUDIO_QUALITY_BITRATE,
  resolveDimensions,
  resolveFps,
  resolveVideoBitrate,
  type ExportSettings,
} from "@/services/exportSettings";

const PRERENDER_DELAY_MS = 1200;

function toWorkerSegments(segments: EditSegment[]): WorkerSegment[] {
  let offset = 0;
  return segments
    .filter((segment) => !!segment.url)
    .map((segment) => {
      const render = buildRenderSpec(segment.adjustments);
      const worker: WorkerSegment = {
        id: segment.id,
        url: segment.url as string,
        trim_start_ms: segment.trim_start_ms,
        trim_end_ms: segment.trim_end_ms,
        muted: segment.muted,
        volume: segment.muted ? 0 : segment.volume,
        render,
        timelineOffsetMs: offset,
      };
      offset += timelineDurationMs(clipDurationMs(segment), render.motion);
      return worker;
    });
}

/** Background pre-render + export status for the active timeline. */
export function useCampaignExport(
  activeSegments: EditSegment[],
  settings: ExportSettings,
  projectName: string | null,
  textLayers: TextLayer[] = [],
  music: { track: MusicTrack; url: string | null } | null = null,
) {
  const [status, setStatus] = useState<ExportStatus>(campaignExport.getStatus());
  const [mixing, setMixing] = useState(false);
  const musicRef = useRef(music);
  musicRef.current = music;

  useEffect(() => {
    const unsubscribe = campaignExport.subscribe(setStatus);
    return () => {
      unsubscribe();
    };
  }, []);

  const textKey = useMemo(() => textSignature(textLayers), [textLayers]);
  const musicKey = useMemo(() => musicSignature(music?.track ?? null), [music?.track]);

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
      textLayers: textLayers.filter((layer) => !layer.hidden),
      textSignature: textKey,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings, textKey]);

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

  /** Music or any non-neutral clip audio/motion needs a full offline mixdown. */
  const needsMixdown = useMemo(() => {
    if (settings.remove_audio) return false;
    if (music?.track && music.url) return true;
    return workerSegments.some((segment) => {
      const { audio, motion } = segment.render;
      return (
        audio.fadeInMs > 0 ||
        audio.fadeOutMs > 0 ||
        audio.detached ||
        audio.normalize ||
        audio.voiceEnhance ||
        audio.noiseReduction > 0 ||
        motion.speed !== 1 ||
        motion.reverse ||
        motion.freezeMs > 0
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workerSegments, settings.remove_audio, musicKey, music?.url]);

  const start = useCallback(async () => {
    if (!workerSegments.length) return;
    let mixedAudio = null;
    if (needsMixdown) {
      setMixing(true);
      try {
        const currentMusic = musicRef.current;
        mixedAudio = await mixExportAudio({
          segments: workerSegments,
          music: currentMusic?.track && currentMusic.url
            ? { track: currentMusic.track, url: currentMusic.url }
            : null,
          loop: target.loop,
          removeAudio: target.removeAudio,
        });
      } catch {
        mixedAudio = null;
      } finally {
        setMixing(false);
      }
    }
    campaignExport.start(workerSegments, target, projectName, mixedAudio);
  }, [workerSegments, target, projectName, needsMixdown]);

  return {
    status,
    target,
    start,
    mixing,
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
