/**
 * REAL horizontal timeline for the built-in editor.
 *
 * Each card is one clip in its saved order: a real extracted thumbnail, the
 * clip number and its trimmed duration, drag-to-reorder, and trim handles on
 * the selected clip that map the card's width to the clip's source duration.
 * Nothing here mutates media — every gesture is reported upward and persisted
 * as an edit op, so original files are untouched.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Film, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";

export interface TimelineClip {
  id: string;
  number: number;
  posterUrl: string | null;
  /** Signed media url — used as a live fallback thumbnail when no poster exists. */
  mediaUrl?: string | null;
  kind?: "video" | "image";
  sourceDurationMs: number;
  trimStartMs: number;
  trimEndMs: number;
  muted: boolean;
  /** Media that is missing or could not be decoded. */
  incomplete?: boolean;
  /**
   * True until this clip's real length is known. Trim handles stay disabled and
   * the label shows a quiet loading state — never a 0.0s or NaN width.
   */
  durationUnknown?: boolean;
}

export interface ClipTimelineProps {
  clips: TimelineClip[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onReorder?: (order: string[]) => void;
  /** `commit` is true on release — that's when a history entry is recorded. */
  onTrim?: (id: string, trimStartMs: number, trimEndMs: number, commit: boolean) => void;
  /**
   * Live drag feedback (rAF-throttled, no network): lets the parent scrub the
   * main player to the boundary frame and tick the total duration in realtime.
   * `edge` is null on release.
   */
  onTrimPreview?: (
    preview: { id: string; trimStartMs: number; trimEndMs: number; edge: "start" | "end" } | null,
  ) => void;
  onRetry?: (id: string) => void;
  /**
   * Ids currently near/in the viewport (IntersectionObserver). The parent uses
   * this to extract posters lazily instead of opening every clip at once.
   */
  onVisibleClipsChange?: (ids: string[]) => void;
  /** Playhead position inside the selected clip, in ms of its trimmed span. */
  playheadRatio?: number | null;
  className?: string;
}

const MIN_CLIP_MS = 300;
/** Card width when a clip's full source length is kept. */
const CARD_WIDTH = 160;
const MIN_CARD_WIDTH = 76;

const seconds = (ms: number) => `${(Math.max(0, ms) / 1000).toFixed(1)}s`;
const pad = (value: number) => String(value).padStart(2, "0");

type TrimDraft = { id: string; startMs: number; endMs: number; edge: "start" | "end" };

export function ClipTimeline({
  clips,
  selectedId,
  onSelect,
  onReorder,
  onTrim,
  onTrimPreview,
  onRetry,
  onVisibleClipsChange,
  playheadRatio = null,
  className,
}: ClipTimelineProps) {
  const listRef = useRef<HTMLOListElement>(null);
  const visibleRef = useRef<Set<string>>(new Set());
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  /** Visual-only trim while dragging — persisted once, on release. */
  const [draft, setDraft] = useState<TrimDraft | null>(null);
  /** rAF handle + latest pointer x, so a drag never renders more than once a frame. */
  const frame = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (frame.current != null) cancelAnimationFrame(frame.current);
    },
    [],
  );

  /**
   * Only clips near the viewport are reported as visible, so the parent extracts
   * at most a couple of posters at a time instead of hitting every signed url.
   */
  useEffect(() => {
    const list = listRef.current;
    if (!list || !onVisibleClipsChange || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        let changed = false;
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset.clipId;
          if (!id) continue;
          if (entry.isIntersecting) {
            if (!visibleRef.current.has(id)) {
              visibleRef.current.add(id);
              changed = true;
            }
          } else if (visibleRef.current.delete(id)) {
            changed = true;
          }
        }
        if (changed) onVisibleClipsChange(Array.from(visibleRef.current));
      },
      { root: list, rootMargin: "200px" },
    );
    list.querySelectorAll<HTMLElement>("[data-clip-id]").forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [onVisibleClipsChange, clips.length]);

  const reorder = useCallback(
    (fromId: string, toId: string) => {
      if (!onReorder || fromId === toId) return;
      const order = clips.map((clip) => clip.id);
      const from = order.indexOf(fromId);
      const to = order.indexOf(toId);
      if (from < 0 || to < 0) return;
      order.splice(to, 0, ...order.splice(from, 1));
      onReorder(order);
    },
    [clips, onReorder],
  );

  /**
   * Trim drag: window-level listeners (never lost if the handle re-renders),
   * clamped to [0, sourceDuration] with start < end, and persisted only once
   * the pointer is released — no request per pixel.
   */
  const beginTrim = (
    event: React.PointerEvent<HTMLSpanElement>,
    clip: TimelineClip,
    edge: "start" | "end",
  ) => {
    if (!onTrim) return;
    event.preventDefault();
    event.stopPropagation();
    const card = (event.currentTarget.closest("[data-clip-card]") as HTMLElement | null)?.getBoundingClientRect();
    if (!card || card.width <= 0) return;

    const duration = Math.max(MIN_CLIP_MS, Math.round(clip.sourceDurationMs) || MIN_CLIP_MS);
    const startAt = Math.min(Math.max(0, clip.trimStartMs), duration - MIN_CLIP_MS);
    const endAt = Math.min(duration, Math.max(startAt + MIN_CLIP_MS, clip.trimEndMs));

    /* px → ms from the card geometry captured at drag start, so the mapping
       stays stable even though the card itself resizes while dragging. */
    const compute = (clientX: number): TrimDraft => {
      const ratio = Math.min(1, Math.max(0, (clientX - card.left) / card.width));
      const at = Math.round(ratio * duration);
      if (edge === "start") {
        return { id: clip.id, edge, startMs: Math.min(Math.max(0, at), endAt - MIN_CLIP_MS), endMs: endAt };
      }
      return {
        id: clip.id,
        edge,
        startMs: startAt,
        endMs: Math.max(startAt + MIN_CLIP_MS, Math.min(duration, at)),
      };
    };

    const publish = (next: TrimDraft) => {
      setDraft(next);
      onTrimPreview?.({ id: next.id, trimStartMs: next.startMs, trimEndMs: next.endMs, edge });
    };

    let pendingX: number | null = null;
    const onMove = (moveEvent: PointerEvent) => {
      pendingX = moveEvent.clientX;
      if (frame.current != null) return;
      frame.current = requestAnimationFrame(() => {
        frame.current = null;
        if (pendingX == null) return;
        publish(compute(pendingX));
      });
    };
    const onEnd = (endEvent: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
      if (frame.current != null) {
        cancelAnimationFrame(frame.current);
        frame.current = null;
      }
      const next = compute(endEvent.clientX ?? pendingX ?? card.left);
      setDraft(null);
      onTrimPreview?.(null);
      if (next.startMs !== startAt || next.endMs !== endAt) {
        onTrim(clip.id, next.startMs, next.endMs, true);
      }
    };

    publish({ id: clip.id, edge, startMs: startAt, endMs: endAt });
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd);
    window.addEventListener("pointercancel", onEnd);
  };


  return (
    <ol ref={listRef} className={cn("flex gap-3 overflow-x-auto pb-3", className)} aria-label="Clip timeline">
      {clips.map((clip) => {
        const selected = clip.id === selectedId;
        const source = Math.max(1, clip.sourceDurationMs);
        const live = draft && draft.id === clip.id ? draft : null;
        const trimStartMs = Math.min(Math.max(0, live ? live.startMs : clip.trimStartMs), source);
        const trimEndMs = Math.min(Math.max(trimStartMs, live ? live.endMs : clip.trimEndMs), source);
        const startPct = (trimStartMs / source) * 100;
        const endPct = (trimEndMs / source) * 100;
        const duration = Math.max(0, trimEndMs - trimStartMs);
        /* The card is a real ruler of the clip: full source width while a handle
           is being dragged (so the cut region can dim under the cursor), and
           proportional to the kept span the rest of the time — it visibly grows
           and shrinks as the trim changes. */
        const cardWidth = live
          ? CARD_WIDTH
          : Math.max(MIN_CARD_WIDTH, Math.round(CARD_WIDTH * (duration / source)) || MIN_CARD_WIDTH);

        return (
          <li key={clip.id} data-clip-id={clip.id} className="shrink-0">
            <div
              data-clip-card
              role="button"
              tabIndex={0}
              draggable={!!onReorder && !live}
              style={{ width: cardWidth }}
              aria-current={selected}
              aria-label={`Clip ${pad(clip.number)} — ${seconds(duration)}`}
              onClick={() => onSelect(clip.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(clip.id);
                }
              }}
              onDragStart={() => setDragId(clip.id)}
              onDragEnd={() => {
                setDragId(null);
                setOverId(null);
              }}
              onDragOver={(event) => {
                if (!dragId) return;
                event.preventDefault();
                setOverId(clip.id);
              }}
              onDrop={(event) => {
                event.preventDefault();
                if (dragId) reorder(dragId, clip.id);
                setDragId(null);
                setOverId(null);
              }}
              className={cn(
                "group relative h-[112px] overflow-hidden rounded-xl border bg-slate-950 transition-[border-color,box-shadow,transform,width] duration-200 motion-reduce:transition-none",
                live ? "transition-none select-none" : "",
                selected
                  ? "border-cyan-300 shadow-[0_0_0_2px_rgba(103,232,249,0.28),0_10px_30px_-12px_rgba(103,232,249,0.5)]"
                  : "border-white/12 hover:border-white/30",
                overId === clip.id && dragId !== clip.id ? "translate-x-1" : "",
                dragId === clip.id ? "opacity-60" : "",
                onReorder ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
              )}
            >
              {clip.posterUrl ? (
                <img
                  src={clip.posterUrl}
                  alt=""
                  className={cn(
                    "h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03] motion-reduce:transition-none",
                    clip.incomplete ? "opacity-40" : "",
                  )}
                />
              ) : clip.mediaUrl && clip.kind !== "image" && selected ? (
                /* Only the ACTIVE clip may mount a real video element — inactive
                   clips never open a stream, so a 10-clip run has no burst. */
                <video
                  src={`${clip.mediaUrl}#t=0.1`}
                  muted
                  playsInline
                  preload="metadata"
                  tabIndex={-1}
                  className="pointer-events-none h-full w-full object-cover"
                />
              ) : clip.mediaUrl && clip.kind === "image" ? (
                <img src={clip.mediaUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-slate-600">
                  <Film className="h-5 w-5" aria-hidden />
                </span>
              )}


              {/* Trimmed-out head and tail, shown only while the clip is selected.
                  While dragging the card spans the full source, so the cut region
                  dims live under the cursor; at rest the card IS the kept span and
                  the handles sit on its edges. */}
              {selected && onTrim && !clip.durationUnknown ? (
                <>
                  <span
                    className="pointer-events-none absolute inset-y-0 left-0 bg-slate-950/75"
                    style={{ width: `${live ? startPct : 0}%` }}
                  />
                  <span
                    className="pointer-events-none absolute inset-y-0 right-0 bg-slate-950/75"
                    style={{ width: `${live ? 100 - endPct : 0}%` }}
                  />
                  {live ? (
                    <span
                      className="pointer-events-none absolute inset-y-0 z-[5] border-x-2 border-cyan-300/90 bg-cyan-300/[0.06]"
                      style={{ left: `${startPct}%`, width: `${Math.max(0, endPct - startPct)}%` }}
                    />
                  ) : null}
                  <span
                    role="slider"
                    aria-label={`Trim start of clip ${pad(clip.number)}`}
                    aria-valuenow={Math.round(trimStartMs)}
                    aria-valuemin={0}
                    aria-valuemax={clip.sourceDurationMs}
                    tabIndex={-1}
                    onPointerDown={(event) => beginTrim(event, clip, "start")}
                    className="absolute inset-y-0 z-10 flex w-3 touch-none cursor-ew-resize items-center justify-center bg-cyan-300/80"
                    style={{ left: `calc(${live ? startPct : 0}% - 1px)` }}
                  >
                    <span className="h-6 w-[2px] rounded bg-slate-950/70" />
                  </span>
                  <span
                    role="slider"
                    aria-label={`Trim end of clip ${pad(clip.number)}`}
                    aria-valuenow={Math.round(trimEndMs)}
                    aria-valuemin={0}
                    aria-valuemax={clip.sourceDurationMs}
                    tabIndex={-1}
                    onPointerDown={(event) => beginTrim(event, clip, "end")}
                    className="absolute inset-y-0 z-10 flex w-3 touch-none cursor-ew-resize items-center justify-center bg-cyan-300/80"
                    style={{ left: `calc(${live ? endPct : 100}% - 11px)` }}
                  >
                    <span className="h-6 w-[2px] rounded bg-slate-950/70" />
                  </span>

                </>
              ) : null}

              {/* Playhead inside the selected clip. */}
              {selected && playheadRatio != null ? (
                <span
                  className="pointer-events-none absolute inset-y-0 z-20 w-[2px] bg-white/90"
                  style={{
                    left: `${
                      (live ? startPct : 0) +
                      Math.min(1, Math.max(0, playheadRatio)) * ((live ? endPct : 100) - (live ? startPct : 0))
                    }%`,
                  }}
                />
              ) : null}

              <span className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-slate-950 via-slate-950/85 to-transparent px-2.5 py-1.5">
                <span className="font-display text-[11px] font-semibold uppercase tracking-[0.14em] text-white tabular-nums">
                  {pad(clip.number)} · {clip.durationUnknown ? "loading…" : seconds(duration)}
                </span>
                {clip.muted ? <VolumeX className="h-3.5 w-3.5 text-slate-400" aria-hidden /> : null}
              </span>

              {clip.incomplete ? (
                <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-md border border-amber-300/40 bg-slate-950/85 px-1.5 py-1 text-[10px] font-medium text-amber-100">
                  <AlertTriangle className="h-3 w-3" aria-hidden /> Needs another pass
                </span>
              ) : null}
            </div>

            {clip.incomplete && onRetry ? (
              <button
                type="button"
                onClick={() => onRetry(clip.id)}
                className="mt-1.5 w-full rounded-lg border border-amber-300/30 bg-amber-300/5 py-1.5 font-display text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-100 transition-colors duration-200 hover:bg-amber-300/15"
              >
                Retry
              </button>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

export default ClipTimeline;
