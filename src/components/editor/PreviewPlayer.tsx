import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Maximize2, Pause, Play, Volume2, VolumeX } from "lucide-react";
import {
  formatTimecode,
  playbackDurationMs,
  resolveAspect,
  type EditSegment,
} from "@/services/campaignEditor";
import { cn } from "@/lib/utils";
import { audioGainAt, buildRenderSpec, frameMotionAt } from "@/services/editorAdjustments";
import { frameBoxStyle, overlayLayersFor, videoStyleFor } from "@/lib/editorPreviewStyle";
import { musicGainAt, musicSourceOffsetMs, type MusicTrack } from "@/services/editorMusic";
import type { TextLayer } from "@/services/editorText";
import TextOverlay from "@/components/editor/TextOverlay";

/**
 * Client-side sequenced preview: plays each active segment inside its trim
 * window, back to back, with motion, music and text applied — the same maths
 * the export worker uses. No server render is involved.
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
  textLayers = [],
  selectedTextId = null,
  onSelectText,
  onMoveText,
  onMoveTextCommit,
  showGuides = false,
  music = null,
  musicUrl = null,
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
  textLayers?: TextLayer[];
  selectedTextId?: string | null;
  onSelectText?: (id: string) => void;
  onMoveText?: (id: string, x: number, y: number) => void;
  onMoveTextCommit?: (id: string, x: number, y: number) => void;
  showGuides?: boolean;
  music?: MusicTrack | null;
  musicUrl?: string | null;
}) {
  const aspect = resolveAspect(aspectRatio);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const frameRefs = useRef<(HTMLDivElement | null)[]>([]);
  const musicRef = useRef<HTMLAudioElement | null>(null);
  const [index, setIndex] = useState(0);
  const [masterVolume, setMasterVolume] = useState(1);
  const [masterMuted, setMasterMuted] = useState(false);
  const rafRef = useRef<number | null>(null);
  const clockRef = useRef({ timelineMs: 0, lastTs: 0 });

  const specs = useMemo(() => segments.map((segment) => buildRenderSpec(segment.adjustments)), [segments]);
  const durations = useMemo(() => segments.map((segment) => playbackDurationMs(segment)), [segments]);
  const offsets = useMemo(() => {
    let sum = 0;
    return durations.map((duration) => {
      const start = sum;
      sum += duration;
      return start;
    });
  }, [durations]);
  const totalMs = useMemo(() => durations.reduce((sum, value) => sum + value, 0), [durations]);

  const locate = useCallback(
    (globalMs: number) => {
      if (!segments.length) return { index: 0, localMs: 0 };
      for (let i = segments.length - 1; i >= 0; i -= 1) {
        if (globalMs >= offsets[i]) {
          return { index: i, localMs: Math.min(globalMs - offsets[i], durations[i]) };
        }
      }
      return { index: 0, localMs: 0 };
    },
    [segments, offsets, durations],
  );

  /** Position a clip's video element for a local timeline position. */
  const applyClipFrame = useCallback(
    (i: number, localMs: number, seeking: boolean) => {
      const segment = segments[i];
      const spec = specs[i];
      const video = videoRefs.current[i];
      if (!segment || !video || !spec) return;
      const motion = spec.motion;
      const trimmed = Math.max(0, segment.trim_end_ms - segment.trim_start_ms);
      const playableMs = Math.max(0, durations[i] - motion.freezeMs);
      const frozen = localMs > playableMs;
      const sourceMs = Math.min(trimmed, Math.max(0, (frozen ? playableMs : localMs) * motion.speed));
      const targetSeconds =
        (motion.reverse
          ? segment.trim_end_ms - sourceMs
          : segment.trim_start_ms + sourceMs) / 1000;

      const manual = motion.reverse || frozen;
      if (manual) {
        if (!video.paused) video.pause();
        if (Math.abs(video.currentTime - targetSeconds) > 0.02) {
          try {
            video.currentTime = Math.max(0, targetSeconds);
          } catch {
            /* metadata not ready */
          }
        }
      } else {
        if (video.playbackRate !== motion.speed) video.playbackRate = motion.speed;
        if (seeking || Math.abs(video.currentTime - targetSeconds) > 0.25) {
          try {
            video.currentTime = Math.max(0, targetSeconds);
          } catch {
            /* metadata not ready */
          }
        }
      }

      // Motion (pan/zoom, fades) is applied to the frame wrapper each tick.
      const frame = frameRefs.current[i];
      const state = frameMotionAt(spec, localMs, Math.max(1, durations[i]));
      if (frame) {
        frame.style.opacity = String(state.opacity);
        frame.style.transform = `translate(${state.offsetX}%, ${state.offsetY}%) scale(${state.scale})`;
      }

      const gain = audioGainAt(spec, segment.muted ? 0 : segment.volume, localMs, Math.max(1, durations[i]));
      video.volume = Math.min(1, Math.max(0, gain * masterVolume));
      video.muted = masterMuted || gain === 0 || manual;
    },
    [segments, specs, durations, masterVolume, masterMuted],
  );

  /** Keep the music element aligned with the timeline. */
  const applyMusic = useCallback(
    (timelineMs: number, seeking: boolean, isPlaying: boolean) => {
      const audio = musicRef.current;
      if (!audio || !music) return;
      const clipGain = (() => {
        const target = locate(timelineMs);
        const spec = specs[target.index];
        const segment = segments[target.index];
        if (!spec || !segment) return 0;
        return audioGainAt(spec, segment.muted ? 0 : segment.volume, target.localMs, durations[target.index] || 1);
      })();
      const duckAmount = Math.max(music.duck, specs[locate(timelineMs).index]?.audio.musicDuck ?? 0) / 100;
      const duck = clipGain > 0.01 ? 1 - duckAmount : 1;
      const gain = musicGainAt(music, timelineMs, totalMs) * duck * masterVolume;
      audio.volume = Math.min(1, Math.max(0, gain));
      audio.muted = masterMuted || gain <= 0;
      const sourceSeconds = musicSourceOffsetMs(music, timelineMs) / 1000;
      if (seeking || Math.abs(audio.currentTime - sourceSeconds) > 0.35) {
        try {
          audio.currentTime = Math.max(0, sourceSeconds);
        } catch {
          /* not ready */
        }
      }
      if (isPlaying && gain > 0 && audio.paused) void audio.play().catch(() => undefined);
      if ((!isPlaying || gain <= 0) && !audio.paused) audio.pause();
    },
    [music, locate, specs, segments, durations, totalMs, masterVolume, masterMuted],
  );

  /* Explicit seeks from the timeline / playhead. */
  useEffect(() => {
    if (!segments.length) return;
    const target = locate(currentMs);
    clockRef.current.timelineMs = currentMs;
    setIndex(target.index);
    applyClipFrame(target.index, target.localMs, true);
    applyMusic(currentMs, true, playing);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seekNonce]);

  /* Re-apply the static frame whenever adjustments change while paused. */
  useEffect(() => {
    if (playing) return;
    const target = locate(clockRef.current.timelineMs);
    applyClipFrame(target.index, target.localMs, false);
    applyMusic(clockRef.current.timelineMs, false, false);
  }, [playing, applyClipFrame, applyMusic, locate, specs]);

  /* Warm the next clip for a clean cut. */
  useEffect(() => {
    const next = videoRefs.current[index + 1];
    const segment = segments[index + 1];
    if (next && segment) {
      try {
        next.currentTime = segment.trim_start_ms / 1000;
      } catch {
        /* ignore */
      }
    }
  }, [index, segments]);

  /* Playback driver — one master clock so speed/reverse/freeze stay in sync. */
  useEffect(() => {
    if (!playing) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      segments.forEach((_, i) => videoRefs.current[i]?.pause());
      musicRef.current?.pause();
      return;
    }
    if (clockRef.current.timelineMs >= totalMs - 20) clockRef.current.timelineMs = 0;
    clockRef.current.lastTs = performance.now();

    const tick = (now: number) => {
      const delta = Math.min(250, now - clockRef.current.lastTs);
      clockRef.current.lastTs = now;
      clockRef.current.timelineMs += delta;

      if (clockRef.current.timelineMs >= totalMs) {
        clockRef.current.timelineMs = totalMs;
        onCurrentMs(totalMs);
        onPlayingChange(false);
        return;
      }

      const target = locate(clockRef.current.timelineMs);
      if (target.index !== index) setIndex(target.index);
      segments.forEach((_, i) => {
        if (i !== target.index) videoRefs.current[i]?.pause();
      });
      const video = videoRefs.current[target.index];
      const spec = specs[target.index];
      const manual =
        !!spec &&
        (spec.motion.reverse || target.localMs > Math.max(0, durations[target.index] - spec.motion.freezeMs));
      if (video && !manual && video.paused) void video.play().catch(() => undefined);
      applyClipFrame(target.index, target.localMs, false);
      applyMusic(clockRef.current.timelineMs, false, true);
      onCurrentMs(clockRef.current.timelineMs);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, totalMs, index, applyClipFrame, applyMusic, locate]);

  const toggleFullscreen = () => {
    const node = containerRef.current;
    if (!node) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void node.requestFullscreen?.().catch(() => undefined);
  };

  const restartIfEnded = () => {
    if (currentMs >= totalMs - 30) {
      clockRef.current.timelineMs = 0;
      onCurrentMs(0);
    }
  };

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div
        ref={containerRef}
        className="relative mx-auto w-full overflow-hidden rounded-2xl border border-white/10 bg-black shadow-[0_0_60px_-24px_hsl(var(--electric-blue)/0.55)]"
        style={{
          maxWidth: `min(100%, ${(aspect.width / aspect.height) * 54}vh)`,
          maxHeight: "54vh",
          aspectRatio: `${aspect.width} / ${aspect.height}`,
        }}
      >
        {segments.length === 0 ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-slate-400">
            No clips in this edit yet — restore one from Unused clips.
          </div>
        ) : null}
        {segments.map((segment, i) => {
          const spec = specs[i];
          return (
            <div
              key={segment.id}
              className={cn(
                "absolute inset-0 transition-opacity duration-100",
                i === index ? "opacity-100" : "pointer-events-none opacity-0",
              )}
            >
              <div className="absolute inset-0 grid place-items-center bg-black">
                <div
                  ref={(node) => {
                    frameRefs.current[i] = node;
                  }}
                  className="relative overflow-hidden"
                  style={frameBoxStyle(spec)}
                >
                  <video
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
                    className="h-full w-full"
                    style={videoStyleFor(spec)}
                  />
                  {overlayLayersFor(spec).map((layer) => (
                    <div key={layer.key} className="pointer-events-none absolute inset-0" style={layer.style} />
                  ))}
                </div>
              </div>
            </div>
          );
        })}

        {textLayers.length ? (
          <TextOverlay
            layers={textLayers}
            currentMs={currentMs}
            selectedId={selectedTextId}
            onSelect={onSelectText}
            onMove={onMoveText}
            onMoveCommit={onMoveTextCommit}
            interactive={!!onMoveText}
            showGuides={showGuides}
          />
        ) : null}

        <div className="pointer-events-none absolute left-3 top-3 rounded-full border border-white/10 bg-black/60 px-2.5 py-1 font-display text-[10px] uppercase tracking-[0.18em] text-cyan-200">
          Clip {Math.min(index + 1, Math.max(segments.length, 1))} / {segments.length || 1}
        </div>
      </div>

      {music && musicUrl ? (
        <audio ref={musicRef} src={musicUrl} preload="auto" className="hidden" />
      ) : null}

      <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-1.5">
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
