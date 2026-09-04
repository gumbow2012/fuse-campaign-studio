/**
 * THE BUILT-IN NON-DESTRUCTIVE EDITOR.
 *
 * Real, not visual: every gesture here is an edit op persisted through
 * `edit-project-update` with optimistic concurrency (the shared
 * `useCampaignEditor` hook owns the queue, conflict replay and undo stack).
 * Undo/redo re-apply the inverse op through the same endpoint — nothing is
 * faked locally and no generated file is ever overwritten.
 *
 * When a run has no edit project the clips are shown read-only with a note.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Copy,
  Loader2,
  Play,
  Pause,
  Redo2,
  RotateCcw,
  Trash2,
  Undo2,
  Volume2,
  VolumeX,
} from "lucide-react";
import ClipTimeline, { type TimelineClip } from "@/components/results/ClipTimeline";
import StudioButton from "@/components/results/StudioButton";
import TrueRatioMedia from "@/components/results/TrueRatioMedia";
import useClipPosters from "@/hooks/useClipPosters";
import { cachedDuration } from "@/lib/videoPoster";
import { persistSourceDuration, type EditSegment } from "@/services/campaignEditor";
import type { useCampaignEditor } from "@/hooks/useCampaignEditor";
import type { CampaignResultSlot } from "@/components/results/resultSlots";
import { cn } from "@/lib/utils";

export type CampaignEditorApi = ReturnType<typeof useCampaignEditor>;

export interface VideoEditWorkspaceProps {
  editor: CampaignEditorApi | null;
  /** Read-only clips when this run has no edit project. */
  fallbackSlots: CampaignResultSlot[];
  className?: string;
}

const timecode = (ms: number) => {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

const MIN_CLIP_MS = 300;

const IMAGE_EXTENSIONS = /\.(png|jpe?g|webp|gif|avif|heic|bmp)$/i;

/** Images are shown directly; everything else is treated as video media. */
const isImageSegment = (path: string | null | undefined) => !!path && IMAGE_EXTENSIONS.test(path.split("?")[0]);


export function VideoEditWorkspace({ editor, fallbackSlots, className }: VideoEditWorkspaceProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [playheadRatio, setPlayheadRatio] = useState<number | null>(null);
  /** Live trim while a handle is held — local only, never a request per pixel. */
  const [liveTrim, setLiveTrim] = useState<
    { id: string; trimStartMs: number; trimEndMs: number; edge: "start" | "end" } | null
  >(null);
  const scrubFrame = useRef<number | null>(null);
  /** Clips near the viewport — only these extract a poster. */
  const [visibleIds, setVisibleIds] = useState<string[]>([]);
  /** Real media lengths measured from video metadata, keyed by segment id. */
  const [measured, setMeasured] = useState<Record<string, number>>({});
  const correctedRef = useRef<Set<string>>(new Set());
  const [activeLoading, setActiveLoading] = useState(false);

  const onVisibleClipsChange = useCallback((ids: string[]) => setVisibleIds(ids), []);

  const segments = editor?.active ?? [];
  const selectedId = editor?.selectedId ?? null;
  const selected = useMemo(
    () => segments.find((segment) => segment.id === selectedId) ?? segments[0] ?? null,
    [segments, selectedId],
  );

  const posterSources = useMemo(
    () =>
      editor
        ? segments.map((segment) => ({
            id: segment.id,
            url: segment.url,
              cacheKey: `edit-segment:${segment.id}`,
            /* An image segment IS its own thumbnail — nothing to decode. */
            poster: isImageSegment(segment.source_path) ? segment.url : null,
          }))
        : fallbackSlots
            .filter((slot) => slot.item)
            .map((slot) => ({
              id: slot.item!.id,
              url: slot.item!.url,
              cacheKey: `result-output:${slot.item!.id}`,
              poster: slot.item!.poster_url ?? null,
            })),
    [editor, segments, fallbackSlots],
  );

  /* The active clip always extracts first; the rest only when scrolled near. */
  const allowedIds = useMemo(
    () => [...visibleIds, ...(selectedId ? [selectedId] : []), ...(segments[0] ? [segments[0].id] : [])],
    [visibleIds, selectedId, segments],
  );
  const posters = useClipPosters(posterSources, { allowedIds, concurrency: 2 });

  /**
   * Lengths are measured for EVERY clip, never gated behind the viewport: a
   * metadata-only probe fetches headers, not the file, so a 10-clip run still
   * knows all its real durations while only the active clip streams fully.
   */
  const durationSources = useMemo(
    () =>
      segments.map((segment) => ({
        id: segment.id,
        url: segment.url,
        cacheKey: `edit-segment:${segment.id}`,
        knownMs: segment.source_duration_ms || null,
        skip: isImageSegment(segment.source_path),
      })),
    [segments],
  );
  const probed = useClipDurations(durationSources, { concurrency: 3 });

  /**
   * Metadata durations are the source of truth for labels, totals and trim
   * ranges; stored values are only a fallback until metadata arrives.
   */
  useEffect(() => {
    setMeasured((current) => {
      let next = current;
      for (const segment of segments) {
        const real = probed[segment.id] ?? cachedDuration(segment.url, `edit-segment:${segment.id}`);
        if (real && current[segment.id] !== real) {
          if (next === current) next = { ...current };
          next[segment.id] = real;
        }
      }
      return next;
    });
  }, [posters, probed, segments]);

  const durationOf = useCallback(
    (segment: EditSegment) => {
      const real = measured[segment.id];
      if (real && Number.isFinite(real) && real > 0) return Math.round(real);
      const stored = Number(segment.source_duration_ms);
      return Number.isFinite(stored) && stored > 0 ? Math.round(stored) : 0;
    },
    [measured],
  );

  /**
   * SELF-HEALING DURATIONS — write each measured length back once per clip,
   * debounced and serialized, silently. Runs whose `source_duration_ms` was
   * never stored get real lengths persisted so trims stay valid next session.
   */
  const projectId = editor?.project?.id ?? null;
  const revision = editor?.project?.revision ?? 0;
  const patchSourceDuration = editor?.patchSourceDuration;
  const healTimerRef = useRef<number | null>(null);
  const healingRef = useRef(false);
  useEffect(() => {
    if (!projectId) return;
    if (healTimerRef.current) window.clearTimeout(healTimerRef.current);
    healTimerRef.current = window.setTimeout(() => {
      void (async () => {
        if (healingRef.current) return;
        healingRef.current = true;
        try {
          for (const segment of segments) {
            const real = measured[segment.id];
            if (!real || correctedRef.current.has(segment.id)) continue;
            if (Math.abs(real - (Number(segment.source_duration_ms) || 0)) < 250) continue;
            correctedRef.current.add(segment.id);
            /* Local state first, so labels/total/trim ranges are valid instantly. */
            patchSourceDuration?.(segment.id, real);
            await persistSourceDuration(projectId, revision, segment.id, real);
          }
        } finally {
          healingRef.current = false;
        }
      })();
    }, 400);
    return () => {
      if (healTimerRef.current) window.clearTimeout(healTimerRef.current);
    };
  }, [measured, segments, projectId, revision, patchSourceDuration]);

  /* ------------------------------ playback ------------------------------ */

  /* Start each clip at its trim-in point whenever the selection changes. */
  useEffect(() => {
    const element = videoRef.current;
    if (!element || !selected) return;
    const onLoaded = () => {
      element.currentTime = selected.trim_start_ms / 1000;
      if (playing) void element.play().catch(() => setPlaying(false));
    };
    element.addEventListener("loadedmetadata", onLoaded);
    if (element.readyState >= 1) onLoaded();
    return () => element.removeEventListener("loadedmetadata", onLoaded);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, selected?.trim_start_ms]);

  const advance = useCallback(() => {
    if (!editor || !selected) return;
    const index = segments.findIndex((segment) => segment.id === selected.id);
    const next = segments[index + 1];
    if (next) {
      editor.setSelectedId(next.id);
    } else {
      setPlaying(false);
      videoRef.current?.pause();
    }
  }, [editor, segments, selected]);

  const onTimeUpdate = () => {
    const element = videoRef.current;
    if (!element || !selected) return;
    const ms = element.currentTime * 1000;
    const span = Math.max(1, selected.trim_end_ms - selected.trim_start_ms);
    setPlayheadRatio((ms - selected.trim_start_ms) / span);
    if (ms >= selected.trim_end_ms - 30) advance();
  };

  const togglePlay = () => {
    const element = videoRef.current;
    if (!element) return;
    if (playing) {
      element.pause();
      setPlaying(false);
    } else {
      void element.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    }
  };

  /* ------------------------------ read-only ------------------------------ */

  if (!editor || !editor.project) {
    const ready = fallbackSlots.filter((slot) => slot.item);
    const first = ready[0]?.item ?? null;
    return (
      <div className={cn("space-y-4", className)}>
        {first ? (
          <TrueRatioMedia
            url={first.url}
            type="video"
            poster={posters[first.id] ?? first.poster_url ?? undefined}
            fallbackRatio="9 / 16"
            maxHeight="min(58vh, 640px)"
          />
        ) : null}
        <ClipTimeline
          clips={fallbackSlots.map((slot) => ({
            id: slot.item?.id ?? `slot-${slot.number}`,
            number: slot.number,
            posterUrl: slot.item ? posters[slot.item.id] ?? slot.item.poster_url ?? null : null,
            mediaUrl: slot.item?.url ?? null,
            kind: "video" as const,
            sourceDurationMs: 1,
            trimStartMs: 0,
            trimEndMs: 1,
            muted: false,
            incomplete: !slot.item,
            durationUnknown: true,
          }))}

          selectedId={null}
          onSelect={() => undefined}
        />
        <p className="text-[13px] leading-6 text-slate-400">
          {editor?.loadError ??
            "Timeline editing isn't available for this campaign yet — your clips are ready to play and download."}
        </p>
      </div>
    );
  }

  const { project, runOp, runOps, undo, redo, canUndo, canRedo, saveState, saveError, retrySave } = editor;

  /**
   * Clip status comes from the REAL segment state: a segment that exists with
   * removed:false and a source is READY. The "needs another pass" warning is
   * reserved for a genuinely missing output (no source at all).
   */
  const liveSpan = (segment: (typeof segments)[number]) => {
    const live = liveTrim && liveTrim.id === segment.id ? liveTrim : null;
    return {
      trimStartMs: live ? live.trimStartMs : segment.trim_start_ms,
      trimEndMs: live ? live.trimEndMs : segment.trim_end_ms,
    };
  };

  /** Total ticks in realtime: swap the dragged clip's span into the saved total. */
  const liveDurationMs = (() => {
    if (!liveTrim) return editor.durationMs;
    const segment = segments.find((item) => item.id === liveTrim.id);
    if (!segment) return editor.durationMs;
    const savedSpan = Math.max(0, segment.trim_end_ms - segment.trim_start_ms);
    const nextSpan = Math.max(0, liveTrim.trimEndMs - liveTrim.trimStartMs);
    return Math.max(0, editor.durationMs - savedSpan + nextSpan);
  })();

  const clips: TimelineClip[] = segments.map((segment, index) => ({
    id: segment.id,
    number: index + 1,
    posterUrl: posters[segment.id] ?? null,
    mediaUrl: segment.url,
    kind: isImageSegment(segment.source_path) ? "image" : "video",
    sourceDurationMs: Math.max(1, durationOf(segment) || 1),
    trimStartMs: liveSpan(segment).trimStartMs,
    trimEndMs: liveSpan(segment).trimEndMs,
    muted: segment.muted,
    incomplete: segment.removed || !segment.source_path,
    durationUnknown: durationOf(segment) <= 0,
  }));

  /**
   * Live handle drag: seek the already-loaded player to the exact boundary frame
   * (in-point for the left handle, out-point for the right) once per animation
   * frame, and keep the live trim in local state so durations tick in realtime.
   * Nothing is persisted here.
   */
  const previewTrim = (
    preview: { id: string; trimStartMs: number; trimEndMs: number; edge: "start" | "end" } | null,
  ) => {
    setLiveTrim(preview);
    const element = videoRef.current;
    if (!preview) {
      if (scrubFrame.current != null) {
        cancelAnimationFrame(scrubFrame.current);
        scrubFrame.current = null;
      }
      /* Back to normal playback of the selected clip. */
      if (element && selected) {
        try {
          element.currentTime = selected.trim_start_ms / 1000;
        } catch {
          /* ignore seek races */
        }
      }
      return;
    }
    if (!element || preview.id !== selected?.id || element.readyState < 1) return;
    const at = (preview.edge === "start" ? preview.trimStartMs : preview.trimEndMs) / 1000;
    if (scrubFrame.current != null) return;
    scrubFrame.current = requestAnimationFrame(() => {
      scrubFrame.current = null;
      if (!element.paused) element.pause();
      try {
        element.currentTime = at;
      } catch {
        /* ignore seek races */
      }
    });
  };

  /** Persisted once, on drag release — the timeline shows the drag visually. */
  const trim = (id: string, startMs: number, endMs: number, commit: boolean) => {
    const before = segments.find((segment) => segment.id === id);
    if (!before) return;
    const duration = durationOf(before);
    /* Unknown length — never persist a NaN or zero-length trim. */
    if (!duration || !Number.isFinite(startMs) || !Number.isFinite(endMs)) return;
    const start = Math.min(Math.max(0, Math.round(startMs)), Math.max(0, duration - MIN_CLIP_MS));
    const end = Math.min(duration, Math.max(start + MIN_CLIP_MS, Math.round(endMs)));
    runOp(
      { op: "trim", payload: { segment_id: id, trim_start_ms: start, trim_end_ms: end } },
      { record: commit, immediate: commit, label: "trim" },
    );
  };


  const resetClip = () => {
    if (!selected) return;
    runOps(
      [
        {
          op: "trim",
          payload: {
            segment_id: selected.id,
            trim_start_ms: 0,
            trim_end_ms: Math.max(1, selected.source_duration_ms),
          },
        },
        { op: "mute", payload: { segment_id: selected.id, muted: false } },
        { op: "reset_adjust", payload: { segment_id: selected.id, scope: "clip" } },
      ],
      { label: "reset clip", immediate: true },
    );
  };

  return (
    <div className={cn("space-y-5", className)}>
      {selected?.url ? (
        <div className="space-y-3">
          <div className="relative">
            <video
              ref={videoRef}
              key={selected.id}
              src={selected.url}
              muted={selected.muted}
              playsInline
              preload="auto"
              poster={posters[selected.id] ?? undefined}
              onLoadedMetadata={(event) => {
                const real = Math.round((event.currentTarget.duration || 0) * 1000);
                if (real > 0) setMeasured((current) => ({ ...current, [selected.id]: real }));
                setActiveLoading(false);
              }}
              onWaiting={() => setActiveLoading(true)}
              onCanPlay={() => setActiveLoading(false)}
              onTimeUpdate={onTimeUpdate}
              onPause={() => setPlaying(false)}
              onPlay={() => setPlaying(true)}
              className="mx-auto max-h-[min(58vh,640px)] w-auto rounded-2xl border border-white/10 bg-black object-contain"
            />
            {activeLoading ? (
              <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-slate-950/80 p-2">
                <Loader2 className="h-4 w-4 animate-spin text-cyan-200 motion-reduce:animate-none" aria-hidden />
              </span>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <StudioButton tone="secondary" size="icon-lg" onClick={togglePlay} aria-label={playing ? "Pause" : "Play"}>
                {playing ? <Pause className="h-4 w-4" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}
              </StudioButton>
              <p className="font-display text-[12px] font-semibold uppercase tracking-[0.16em] text-slate-300 tabular-nums">
                {timecode(liveDurationMs)} total · {clips.length} clip{clips.length === 1 ? "" : "s"}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <StudioButton tone="tertiary" size="icon" onClick={undo} disabled={!canUndo} aria-label="Undo">
                <Undo2 className="h-4 w-4" aria-hidden />
              </StudioButton>
              <StudioButton tone="tertiary" size="icon" onClick={redo} disabled={!canRedo} aria-label="Redo">
                <Redo2 className="h-4 w-4" aria-hidden />
              </StudioButton>
              <StudioButton
                tone="tertiary"
                size="icon"
                disabled={!selected}
                aria-label={selected?.muted ? "Unmute clip" : "Mute clip"}
                onClick={() =>
                  selected &&
                  runOp(
                    { op: "mute", payload: { segment_id: selected.id, muted: !selected.muted } },
                    { label: "mute" },
                  )
                }
              >
                {selected?.muted ? <VolumeX className="h-4 w-4" aria-hidden /> : <Volume2 className="h-4 w-4" aria-hidden />}
              </StudioButton>
              <StudioButton
                tone="tertiary"
                size="icon"
                disabled={!selected}
                aria-label="Duplicate clip"
                onClick={() =>
                  selected && runOp({ op: "duplicate", payload: { segment_id: selected.id } }, { label: "duplicate" })
                }
              >
                <Copy className="h-4 w-4" aria-hidden />
              </StudioButton>
              <StudioButton tone="tertiary" size="icon" disabled={!selected} aria-label="Reset clip" onClick={resetClip}>
                <RotateCcw className="h-4 w-4" aria-hidden />
              </StudioButton>
              <StudioButton
                tone="danger"
                size="icon"
                disabled={!selected || clips.length < 2}
                aria-label="Delete clip"
                onClick={() =>
                  selected && runOp({ op: "remove", payload: { segment_id: selected.id } }, { label: "delete" })
                }
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </StudioButton>
            </div>
          </div>
        </div>
      ) : null}

      <ClipTimeline
        clips={clips}
        selectedId={selected?.id ?? null}
        onSelect={(id) => editor.setSelectedId(id)}
        onReorder={(order) => runOp({ op: "reorder", payload: { order } }, { label: "reorder" })}
        onTrim={trim}
        onTrimPreview={previewTrim}
        onVisibleClipsChange={onVisibleClipsChange}
        playheadRatio={playheadRatio}
      />

      <div className="flex flex-wrap items-center gap-3 text-[13px] text-slate-400">
        <span>
          {project.name?.trim() ? project.name : "Untitled campaign"} · drag clips to reorder, select a clip to trim.
        </span>
        {saveState === "saving" ? (
          <span className="inline-flex items-center gap-1.5 text-slate-300">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Saving
          </span>
        ) : saveState === "saved" ? (
          <span className="text-cyan-200/90">All changes saved</span>
        ) : saveState === "error" ? (
          <button type="button" onClick={retrySave} className="text-amber-200 underline underline-offset-4">
            {saveError ?? "We couldn't save your last change."} Retry
          </button>
        ) : null}
      </div>

      {editor.unused.length ? (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <p className="font-display text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">
            Removed clips
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {editor.unused.map((segment) => (
              <StudioButton
                key={segment.id}
                tone="tertiary"
                size="md"
                onClick={() => runOp({ op: "restore", payload: { segment_id: segment.id } }, { label: "restore" })}
              >
                Restore {segment.source_label ?? "clip"}
              </StudioButton>
            ))}
          </div>
        </div>
      ) : null}

      {editor.availableMedia.length ? (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <p className="font-display text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">
            Unused clips
          </p>
          <p className="mt-1 text-[13px] text-slate-400">
            New media that isn't on your timeline yet.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {editor.availableMedia.map((segment) => (
              <StudioButton
                key={segment.id}
                tone="secondary"
                size="md"
                onClick={() =>
                  runOp({ op: "add_to_timeline", payload: { segment_id: segment.id } }, { label: "add clip" })
                }
              >
                Add {segment.source_label ?? "clip"}
              </StudioButton>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default VideoEditWorkspace;
