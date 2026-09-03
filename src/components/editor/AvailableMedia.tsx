import { Plus } from "lucide-react";
import { formatSeconds, type EditSegment } from "@/services/campaignEditor";

/**
 * Available Media — clips attached to this project but not on the timeline
 * (retried outputs land here). Adding one appends it to the end of the edit.
 */
export default function AvailableMedia({
  segments,
  onAdd,
}: {
  segments: EditSegment[];
  onAdd: (id: string) => void;
}) {
  if (!segments.length) return null;
  return (
    <div className="rounded-2xl border border-cyan-300/25 bg-slate-950/60 p-3">
      <div className="mb-2 flex items-baseline justify-between px-1">
        <p className="font-display text-[10px] uppercase tracking-[0.18em] text-cyan-100">
          Available media
        </p>
        <p className="text-[10px] text-slate-500">{segments.length} not on timeline</p>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {segments.map((segment) => (
          <div
            key={segment.id}
            className="relative w-24 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-black/40"
          >
            <div className="aspect-[9/16] w-full bg-black/60">
              {segment.url ? (
                <video
                  src={segment.url}
                  muted
                  playsInline
                  preload="metadata"
                  className="h-full w-full object-cover"
                />
              ) : null}
            </div>
            <div className="px-1.5 pb-1.5 pt-1">
              <p className="truncate text-[10px] text-slate-300">
                {segment.source_label || "New clip"}
              </p>
              <p className="font-mono text-[9px] text-slate-500">
                {formatSeconds(segment.source_duration_ms)}
              </p>
              <button
                type="button"
                onClick={() => onAdd(segment.id)}
                className="mt-1.5 inline-flex w-full items-center justify-center gap-1 rounded-lg border border-cyan-300/40 bg-cyan-400/10 px-1.5 py-1 text-[10px] text-cyan-100 hover:bg-cyan-400/20"
              >
                <Plus className="h-3 w-3" />
                Add to timeline
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
