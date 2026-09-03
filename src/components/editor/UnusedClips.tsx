import { Plus } from "lucide-react";
import { clipDurationMs, formatSeconds, type EditSegment } from "@/services/campaignEditor";

/** Removed clips live here; one tap puts them back in the edit. */
export default function UnusedClips({
  segments,
  onRestore,
}: {
  segments: EditSegment[];
  onRestore: (id: string) => void;
}) {
  if (!segments.length) return null;
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-3">
      <p className="mb-2 px-1 font-display text-[11px] uppercase tracking-[0.2em] text-slate-400">
        Unused clips
      </p>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {segments.map((segment) => (
          <div
            key={segment.id}
            className="relative w-28 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-black/70"
          >
            <video
              src={segment.url ?? undefined}
              muted
              playsInline
              preload="metadata"
              className="h-16 w-full object-cover opacity-60"
            />
            <div className="flex items-center justify-between px-2 py-1">
              <span className="font-mono text-[10px] text-slate-400">
                {formatSeconds(clipDurationMs(segment))}
              </span>
              <button
                type="button"
                onClick={() => onRestore(segment.id)}
                aria-label="Add clip back to edit"
                className="inline-flex items-center gap-1 rounded-full bg-cyan-400/15 px-2 py-0.5 text-[10px] font-semibold text-cyan-100 transition-colors hover:bg-cyan-400/30"
              >
                <Plus className="h-3 w-3" />
                Add
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
