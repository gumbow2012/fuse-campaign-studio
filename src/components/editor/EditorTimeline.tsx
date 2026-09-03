import { useCallback, useEffect, useRef, useState } from "react";
import { clipDurationMs, formatSeconds, type EditSegment } from "@/services/campaignEditor";
import { cn } from "@/lib/utils";

const PX_PER_SEC = 62;
const MIN_CLIP_MS = 400;

type DragState =
  | { kind: "reorder"; id: string; startX: number; dx: number }
  | { kind: "trim"; id: string; edge: "start" | "end"; startX: number; startValue: number }
  | { kind: "playhead" }
  | null;

/** Horizontal FUSE timeline: thumbnails, trim handles, playhead, drag reorder. */
export default function EditorTimeline({
  segments,
  selectedId,
  onSelect,
  onReorder,
  onTrim,
  onTrimCommit,
  currentMs,
  onSeek,
}: {
  segments: EditSegment[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onReorder: (order: string[]) => void;
  onTrim: (id: string, startMs: number, endMs: number) => void;
  onTrimCommit: (id: string, startMs: number, endMs: number) => void;
  currentMs: number;
  onSeek: (ms: number) => void;
}) {
  const [drag, setDrag] = useState<DragState>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState>(null);
  dragRef.current = drag;

  const widthOf = (segment: EditSegment) =>
    Math.max(48, (clipDurationMs(segment) / 1000) * PX_PER_SEC);

  const offsetsPx: number[] = [];
  let running = 0;
  segments.forEach((segment) => {
    offsetsPx.push(running);
    running += widthOf(segment) + 8;
  });

  const msFromClientX = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track) return 0;
      const rect = track.getBoundingClientRect();
      const x = clientX - rect.left + track.scrollLeft;
      let acc = 0;
      for (let i = 0; i < segments.length; i += 1) {
        const width = widthOf(segments[i]);
        if (x <= offsetsPx[i] + width) {
          const withinPx = Math.max(0, x - offsetsPx[i]);
          return acc + Math.min(clipDurationMs(segments[i]), (withinPx / PX_PER_SEC) * 1000);
        }
        acc += clipDurationMs(segments[i]);
      }
      return acc;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [segments, offsetsPx.join(",")],
  );

  /* Global pointer handling for all drag interactions. */
  useEffect(() => {
    if (!drag) return;

    const onMove = (event: PointerEvent) => {
      const state = dragRef.current;
      if (!state) return;
      if (state.kind === "playhead") {
        onSeek(msFromClientX(event.clientX));
        return;
      }
      if (state.kind === "reorder") {
        setDrag({ ...state, dx: event.clientX - state.startX });
        return;
      }
      const segment = segments.find((item) => item.id === state.id);
      if (!segment) return;
      const deltaMs = ((event.clientX - state.startX) / PX_PER_SEC) * 1000;
      if (state.edge === "start") {
        const next = Math.min(
          segment.trim_end_ms - MIN_CLIP_MS,
          Math.max(0, state.startValue + deltaMs),
        );
        onTrim(segment.id, Math.round(next), segment.trim_end_ms);
      } else {
        const next = Math.max(
          segment.trim_start_ms + MIN_CLIP_MS,
          Math.min(segment.source_duration_ms, state.startValue + deltaMs),
        );
        onTrim(segment.id, segment.trim_start_ms, Math.round(next));
      }
    };

    const onUp = (event: PointerEvent) => {
      const state = dragRef.current;
      setDrag(null);
      if (!state) return;
      if (state.kind === "trim") {
        const segment = segments.find((item) => item.id === state.id);
        if (segment) onTrimCommit(segment.id, segment.trim_start_ms, segment.trim_end_ms);
        return;
      }
      if (state.kind === "reorder") {
        const fromIndex = segments.findIndex((item) => item.id === state.id);
        if (fromIndex === -1) return;
        const dx = event.clientX - state.startX;
        const width = widthOf(segments[fromIndex]) + 8;
        const shift = Math.round(dx / width);
        const toIndex = Math.min(segments.length - 1, Math.max(0, fromIndex + shift));
        if (toIndex === fromIndex) return;
        const order = segments.map((item) => item.id);
        order.splice(toIndex, 0, order.splice(fromIndex, 1)[0]);
        onReorder(order);
      }
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [drag, segments, msFromClientX, onSeek, onTrim, onTrimCommit, onReorder]);

  const playheadPx = (() => {
    let remaining = currentMs;
    for (let i = 0; i < segments.length; i += 1) {
      const duration = clipDurationMs(segments[i]);
      if (remaining <= duration) return offsetsPx[i] + (remaining / 1000) * PX_PER_SEC;
      remaining -= duration;
    }
    return running > 0 ? running - 8 : 0;
  })();

  const dragIndex = drag?.kind === "reorder" ? segments.findIndex((s) => s.id === drag.id) : -1;
  const dragShift =
    drag?.kind === "reorder" && dragIndex >= 0
      ? Math.round(drag.dx / (widthOf(segments[dragIndex]) + 8))
      : 0;
  const dropIndex =
    dragIndex >= 0 ? Math.min(segments.length - 1, Math.max(0, dragIndex + dragShift)) : -1;

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-3">
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="font-display text-[11px] uppercase tracking-[0.2em] text-slate-400">Timeline</span>
        <span className="text-[11px] text-slate-500">{segments.length} clips · drag to reorder · drag edges to trim</span>
      </div>

      <div
        ref={trackRef}
        className="relative overflow-x-auto overflow-y-hidden pb-2"
        onPointerDown={(event) => {
          if ((event.target as HTMLElement).closest("[data-clip]")) return;
          onSeek(msFromClientX(event.clientX));
          setDrag({ kind: "playhead" });
        }}
      >
        <div className="relative flex min-h-[104px] items-stretch gap-2" style={{ width: Math.max(running, 1) }}>
          {segments.map((segment, i) => {
            const selected = segment.id === selectedId;
            const isDragging = drag?.kind === "reorder" && drag.id === segment.id;
            // Neighbours slide out of the way of the dragged clip.
            let neighbourShift = 0;
            if (dragIndex >= 0 && !isDragging) {
              const width = widthOf(segments[dragIndex]) + 8;
              if (i > dragIndex && i <= dropIndex) neighbourShift = -width;
              if (i < dragIndex && i >= dropIndex) neighbourShift = width;
            }
            return (
              <div
                key={segment.id}
                data-clip
                role="button"
                tabIndex={0}
                aria-label={`Clip ${i + 1}`}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") onSelect(segment.id);
                }}
                onClick={() => onSelect(segment.id)}
                onPointerDown={(event) => {
                  if ((event.target as HTMLElement).dataset.handle) return;
                  onSelect(segment.id);
                  setDrag({ kind: "reorder", id: segment.id, startX: event.clientX, dx: 0 });
                }}
                style={{
                  width: widthOf(segment),
                  transform: `translateX(${isDragging ? drag.dx : neighbourShift}px)`,
                  transition: isDragging ? "none" : "transform 160ms ease",
                  zIndex: isDragging ? 30 : 1,
                }}
                className={cn(
                  "group relative shrink-0 cursor-grab select-none overflow-hidden rounded-xl border bg-black/70 active:cursor-grabbing",
                  selected
                    ? "border-cyan-300 shadow-[0_0_22px_-6px_hsl(var(--electric-blue)/0.9)]"
                    : "border-white/10 hover:border-white/25",
                )}
              >
                <video
                  src={segment.url ?? undefined}
                  muted
                  playsInline
                  preload="metadata"
                  className="pointer-events-none h-[104px] w-full object-cover opacity-80"
                />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/90 to-transparent px-2 py-1">
                  <span className="font-display text-[10px] uppercase tracking-[0.14em] text-white/90">
                    {i + 1}
                  </span>
                  <span className="font-mono text-[10px] text-cyan-200">{formatSeconds(clipDurationMs(segment))}</span>
                </div>

                <span
                  data-handle="start"
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    onSelect(segment.id);
                    setDrag({
                      kind: "trim",
                      id: segment.id,
                      edge: "start",
                      startX: event.clientX,
                      startValue: segment.trim_start_ms,
                    });
                  }}
                  className="absolute left-0 top-0 h-full w-3 cursor-ew-resize bg-cyan-300/70 opacity-0 transition-opacity group-hover:opacity-100 md:w-2.5"
                  style={{ opacity: selected ? 1 : undefined }}
                  aria-label="Trim clip start"
                />
                <span
                  data-handle="end"
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    onSelect(segment.id);
                    setDrag({
                      kind: "trim",
                      id: segment.id,
                      edge: "end",
                      startX: event.clientX,
                      startValue: segment.trim_end_ms,
                    });
                  }}
                  className="absolute right-0 top-0 h-full w-3 cursor-ew-resize bg-cyan-300/70 opacity-0 transition-opacity group-hover:opacity-100 md:w-2.5"
                  style={{ opacity: selected ? 1 : undefined }}
                  aria-label="Trim clip end"
                />
              </div>
            );
          })}

          {/* Playhead */}
          <div
            className="pointer-events-none absolute top-0 z-40 h-full"
            style={{ left: Math.max(0, playheadPx) }}
          >
            <div className="h-full w-[2px] bg-cyan-300 shadow-[0_0_10px_hsl(var(--electric-blue))]" />
            <div className="absolute -left-[5px] -top-1 h-3 w-3 rounded-full bg-cyan-300" />
          </div>
        </div>
      </div>
    </div>
  );
}
