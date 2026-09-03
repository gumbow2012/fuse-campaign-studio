import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Maximize2, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { clipDurationMs, formatTimecode, resolveAspect, type EditSegment } from "@/services/campaignEditor";
import { cn } from "@/lib/utils";

/**
 * Client-side sequenced preview: plays each active segment inside its trim
 * window, back to back, so the run feels like one assembled campaign.
 * No server render is involved.
 */
export default function PreviewPlayer({
  segments,
  aspectRatio,
  currentMs,
  onCurrentMs,
  seekNonce,
  playing,
  onPlayingChange,
  className,
}: {
  segments: EditSegment[];
  aspectRatio: string | null;
  currentMs: number;
  onCurrentMs: (ms: number) => void;
  /** Bumped by the parent whenever `currentMs` is an explicit seek request. */
  seekNonce: number;
  playing: boolean;
  onPlayingChange: (playing: boolean) => void;
  className?: string;
}) {
  const aspect = resolveAspect(aspectRatio);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const [index, setIndex] = useState(0);
  const [masterVolume, setMasterVolume] = useState(1);
  const [masterMuted, setMasterMuted] = useState(false);
  const rafRef = useRef<number | null>(null);

  const offsets = useMemo(() => {
    let sum = 0;
    return segments.map((segment) => {
      const start = sum;
      sum += clipDurationMs(segment);
      return start;
    });
  }, [segments]);
  const totalMs = useMemo(
    () => segments.reduce((sum, segment) => sum + clipDurationMs(segment), 0),
    [segments],
  );

  const locate = useCallback(
    (globalMs: number) => {
      if (!segments.length) return { index: 0, localMs: 0 };
      for (let i = segments.length - 1; i >= 0; i -= 1) {
        if (globalMs >= offsets[i]) {
          return { index: i, localMs: Math.min(globalMs - offsets[i], clipDurationMs(segments[i])) };
        }
      }
      return { index: 0, localMs: 0 };
    },
    [segments, offsets],
  );

  /* Apply per-clip audio settings. */
  useEffect(() => {
    segments.forEach((segment, i) => {
      const video = videoRefs.current[i];
      if (!video) return;
      video.volume = Math.min(1, Math.max(0, segment.volume * masterVolume));
      video.muted = segment.muted || masterMuted || i !== index;
    });
  }, [segments, masterVolume, masterMuted, index]);

  /* Explicit seeks from the timeline / playhead. */
  useEffect(() => {
    if (!segments.length) return;
    const target = locate(currentMs);
    setIndex(target.index);
    const video = videoRefs.current[target.index];
    if (video) {
      const seconds = (segments[target.index].trim_start_ms + target.localMs) / 1000;
      try {
        video.currentTime = seconds;
      } catch {
        /* metadata not ready yet — onLoadedMetadata re-applies */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seekNonce]);

  /* Keep the active clip anchored to its trim window when the index changes. */
  useEffect(() => {
    const segment = segments[index];
    const video = videoRefs.current[index];
    if (!segment || !video) return;
    if (video.currentTime * 1000 < segment.trim_start_ms - 60 || video.currentTime * 1000 > segment.trim_end_ms) {
      try {
        video.currentTime = segment.trim_start_ms / 1000;
      } catch {
        /* ignore */
      }
    }
    // Warm the next clip for a clean cut.
    const next = videoRefs.current[index + 1];
    if (next && segments[index + 1]) {
      try {
        next.currentTime = segments[index + 1].trim_start_ms / 1000;
      } catch {
        /* ignore */
      }
    }
  }, [index, segments]);

  /* Playback driver. */
  useEffect(() => {
    const video = videoRefs.current[index];
    if (!video) return;
    if (playing) void video.play().catch(() => onPlayingChange(false));
    else video.pause();
    segments.forEach((_, i) => {
      if (i !== index) videoRefs.current[i]?.pause();
    });
  }, [playing, index, segments, onPlayingChange]);

  useEffect(() => {
    if (!playing) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      return;
    }
    const tick = () => {
      const segment = segments[index];
      const video = videoRefs.current[index];
      if (segment && video) {
        const localMs = Math.max(0, video.currentTime * 1000 - segment.trim_start_ms);
        const duration = clipDurationMs(segment);
        if (localMs >= duration - 20) {
          if (index + 1 < segments.length) {
            setIndex(index + 1);
          } else {
            onPlayingChange(false);
            onCurrentMs(totalMs);
            return;
          }
        } else {
          onCurrentMs(offsets[index] + localMs);
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [playing, index, segments, offsets, totalMs, onCurrentMs, onPlayingChange]);

  const toggleFullscreen = () => {
    const node = containerRef.current;
    if (!node) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void node.requestFullscreen?.().catch(() => undefined);
  };

  const restartIfEnded = () => {
    if (currentMs >= totalMs - 30) onCurrentMs(0);
  };

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div
        ref={containerRef}
        className="relative mx-auto w-full overflow-hidden rounded-2xl border border-white/10 bg-black shadow-[0_0_60px_-24px_hsl(var(--electric-blue)/0.55)]"
        style={{ maxWidth: `min(100%, ${(aspect.width / aspect.height) * 68}vh)`, aspectRatio: `${aspect.width} / ${aspect.height}` }}
      >
        {segments.length === 0 ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-slate-400">
            No clips in this edit yet — restore one from Unused clips.
          </div>
        ) : null}
        {segments.map((segment, i) => (
          <video
            key={segment.id}
            ref={(node) => {
              videoRefs.current[i] = node;
            }}
            src={segment.url ?? undefined}
            playsInline
            preload={i <= index + 1 ? "auto" : "metadata"}
            onLoadedMetadata={() => {
              const video = videoRefs.current[i];
              if (video) video.currentTime = segment.trim_start_ms / 1000;
            }}
            className={cn(
              "absolute inset-0 h-full w-full object-contain transition-opacity duration-100",
              i === index ? "opacity-100" : "pointer-events-none opacity-0",
            )}
          />
        ))}
        <div className="pointer-events-none absolute left-3 top-3 rounded-full border border-white/10 bg-black/60 px-2.5 py-1 font-display text-[10px] uppercase tracking-[0.18em] text-cyan-200">
          Clip {Math.min(index + 1, Math.max(segments.length, 1))} / {segments.length || 1}
        </div>
      </div>

      <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
        <button
          type="button"
          aria-label={playing ? "Pause preview" : "Play preview"}
          onClick={() => {
            restartIfEnded();
            onPlayingChange(!playing);
          }}
          className="grid h-10 w-10 place-items-center rounded-full bg-cyan-400 text-slate-950 transition-transform hover:scale-105"
        >
          {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
        </button>
        <span className="font-mono text-xs text-slate-300">
          {formatTimecode(currentMs)} / {formatTimecode(totalMs)}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            aria-label={masterMuted ? "Unmute preview" : "Mute preview"}
            onClick={() => setMasterMuted((v) => !v)}
            className="text-slate-300 transition-colors hover:text-cyan-200"
          >
            {masterMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={masterVolume}
            aria-label="Preview volume"
            onChange={(event) => setMasterVolume(Number(event.target.value))}
            className="h-1 w-20 accent-cyan-400"
          />
          <button
            type="button"
            aria-label="Fullscreen"
            onClick={toggleFullscreen}
            className="text-slate-300 transition-colors hover:text-cyan-200"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
