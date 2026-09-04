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

const IMAGE_EXTENSIONS = /\.(png|jpe?g|webp|gif|avif|heic|bmp)$/i;

/** Images are shown directly; everything else is treated as video media. */
const isImageSegment = (path: string | null | undefined) => !!path && IMAGE_EXTENSIONS.test(path.split("?")[0]);


export function VideoEditWorkspace({ editor, fallbackSlots, className }: VideoEditWorkspaceProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [playheadRatio, setPlayheadRatio] = useState<number | null>(null);

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
            /* An image segment IS its own thumbnail — nothing to decode. */
            poster: isImageSegment(segment.source_path) ? segment.url : null,
          }))
        : fallbackSlots
            .filter((slot) => slot.item)
            .map((slot) => ({
              id: slot.item!.id,
              url: slot.item!.url,
              poster: slot.item!.poster_url ?? null,
            })),
    [editor, segments, fallbackSlots],
  );

  const posters = useClipPosters(posterSources);

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
  const clips: TimelineClip[] = segments.map((segment, index) => ({
    id: segment.id,
    number: index + 1,
    posterUrl: posters[segment.id] ?? null,
    mediaUrl: segment.url,
    kind: isImageSegment(segment.source_path) ? "image" : "video",
    sourceDurationMs: Math.max(1, segment.source_duration_ms),
    trimStartMs: segment.trim_start_ms,
    trimEndMs: segment.trim_end_ms,
    muted: segment.muted,
    incomplete: !segment.source_path,
  }));

  /** Persisted once, on drag release — the timeline shows the drag visually. */
  const trim = (id: string, startMs: number, endMs: number, commit: boolean) => {
    const before = segments.find((segment) => segment.id === id);
    if (!before) return;
    const duration = Math.max(1, before.source_duration_ms);
    const start = Math.min(Math.max(0, Math.round(startMs)), duration - 1);
    const end = Math.min(duration, Math.max(start + 1, Math.round(endMs)));
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
              preload="metadata"
              poster={posters[selected.id] ?? undefined}
              onTimeUpdate={onTimeUpdate}
              onPause={() => setPlaying(false)}
              onPlay={() => setPlaying(true)}
              className="mx-auto max-h-[min(58vh,640px)] w-auto rounded-2xl border border-white/10 bg-black object-contain"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <StudioButton tone="secondary" size="icon-lg" onClick={togglePlay} aria-label={playing ? "Pause" : "Play"}>
                {playing ? <Pause className="h-4 w-4" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}
              </StudioButton>
              <p className="font-display text-[12px] font-semibold uppercase tracking-[0.16em] text-slate-300 tabular-nums">
                {timecode(editor.durationMs)} total · {clips.length} clip{clips.length === 1 ? "" : "s"}
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
