/**
 * REAL horizontal timeline for the built-in editor.
 *
 * Each card is one clip in its saved order: a real extracted thumbnail, the
 * clip number and its trimmed duration, drag-to-reorder, and trim handles on
 * the selected clip that map the card's width to the clip's source duration.
 * Nothing here mutates media — every gesture is reported upward and persisted
 * as an edit op, so original files are untouched.
 */
import { useCallback, useRef, useState } from "react";
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
}

export interface ClipTimelineProps {
  clips: TimelineClip[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onReorder?: (order: string[]) => void;
  /** `commit` is true on release — that's when a history entry is recorded. */
  onTrim?: (id: string, trimStartMs: number, trimEndMs: number, commit: boolean) => void;
  onRetry?: (id: string) => void;
  /** Playhead position inside the selected clip, in ms of its trimmed span. */
  playheadRatio?: number | null;
  className?: string;
}

const MIN_CLIP_MS = 300;

const seconds = (ms: number) => `${(Math.max(0, ms) / 1000).toFixed(1)}s`;
const pad = (value: number) => String(value).padStart(2, "0");

type TrimDraft = { id: string; startMs: number; endMs: number };

export function ClipTimeline({
  clips,
  selectedId,
  onSelect,
  onReorder,
  onTrim,
  onRetry,
  playheadRatio = null,
  className,
}: ClipTimelineProps) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  /** Visual-only trim while dragging — persisted once, on release. */
  const [draft, setDraft] = useState<TrimDraft | null>(null);

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

    const compute = (clientX: number): TrimDraft => {
      const ratio = Math.min(1, Math.max(0, (clientX - card.left) / card.width));
      const at = Math.round(ratio * duration);
      if (edge === "start") {
        return { id: clip.id, startMs: Math.min(Math.max(0, at), endAt - MIN_CLIP_MS), endMs: endAt };
      }
      return { id: clip.id, startMs: startAt, endMs: Math.max(startAt + MIN_CLIP_MS, Math.min(duration, at)) };
    };

    const onMove = (moveEvent: PointerEvent) => setDraft(compute(moveEvent.clientX));
    const onEnd = (endEvent: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
      const next = compute(endEvent.clientX);
      setDraft(null);
      if (next.startMs !== startAt || next.endMs !== endAt) {
        onTrim(clip.id, next.startMs, next.endMs, true);
      }
    };

    setDraft({ id: clip.id, startMs: startAt, endMs: endAt });
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd);
    window.addEventListener("pointercancel", onEnd);
  };


  return (
    <ol className={cn("flex gap-3 overflow-x-auto pb-3", className)} aria-label="Clip timeline">
      {clips.map((clip) => {
        const selected = clip.id === selectedId;
        const source = Math.max(1, clip.sourceDurationMs);
        const live = draft && draft.id === clip.id ? draft : null;
        const trimStartMs = Math.min(Math.max(0, live ? live.startMs : clip.trimStartMs), source);
        const trimEndMs = Math.min(Math.max(trimStartMs, live ? live.endMs : clip.trimEndMs), source);
        const startPct = (trimStartMs / source) * 100;
        const endPct = (trimEndMs / source) * 100;
        const duration = Math.max(0, trimEndMs - trimStartMs);


        return (
          <li key={clip.id} className="shrink-0">
            <div
              data-clip-card
              role="button"
              tabIndex={0}
              draggable={!!onReorder}
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
                "group relative h-[112px] w-[160px] overflow-hidden rounded-xl border bg-slate-950 transition-[border-color,box-shadow,transform] duration-200 motion-reduce:transition-none",
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
              ) : (
                <span className="flex h-full w-full items-center justify-center text-slate-600">
                  <Film className="h-5 w-5" aria-hidden />
                </span>
              )}

              {/* Trimmed-out head and tail, shown only while the clip is selected. */}
              {selected && onTrim ? (
                <>
                  <span
                    className="pointer-events-none absolute inset-y-0 left-0 bg-slate-950/70"
                    style={{ width: `${startPct}%` }}
                  />
                  <span
                    className="pointer-events-none absolute inset-y-0 right-0 bg-slate-950/70"
                    style={{ width: `${100 - endPct}%` }}
                  />
                  <span
                    role="slider"
                    aria-label={`Trim start of clip ${pad(clip.number)}`}
                    aria-valuenow={Math.round(clip.trimStartMs)}
                    aria-valuemin={0}
                    aria-valuemax={clip.sourceDurationMs}
                    tabIndex={-1}
                    onPointerDown={(event) => beginTrim(event, clip, "start")}
                    onPointerMove={(event) => moveTrim(event, clip, false)}
                    onPointerUp={(event) => moveTrim(event, clip, true)}
                    className="absolute inset-y-0 z-10 flex w-3 cursor-ew-resize items-center justify-center bg-cyan-300/80"
                    style={{ left: `calc(${startPct}% - 1px)` }}
                  >
                    <span className="h-6 w-[2px] rounded bg-slate-950/70" />
                  </span>
                  <span
                    role="slider"
                    aria-label={`Trim end of clip ${pad(clip.number)}`}
                    aria-valuenow={Math.round(clip.trimEndMs)}
                    aria-valuemin={0}
                    aria-valuemax={clip.sourceDurationMs}
                    tabIndex={-1}
                    onPointerDown={(event) => beginTrim(event, clip, "end")}
                    onPointerMove={(event) => moveTrim(event, clip, false)}
                    onPointerUp={(event) => moveTrim(event, clip, true)}
                    className="absolute inset-y-0 z-10 flex w-3 cursor-ew-resize items-center justify-center bg-cyan-300/80"
                    style={{ left: `calc(${endPct}% - 11px)` }}
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
                    left: `${startPct + Math.min(1, Math.max(0, playheadRatio)) * (endPct - startPct)}%`,
                  }}
                />
              ) : null}

              <span className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-slate-950 via-slate-950/85 to-transparent px-2.5 py-1.5">
                <span className="font-display text-[11px] font-semibold uppercase tracking-[0.14em] text-white tabular-nums">
                  {pad(clip.number)} · {seconds(duration)}
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
