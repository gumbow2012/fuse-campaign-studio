import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * TR7 — subtle revision navigator: "‹ r / total ›".
 *
 * index 0..total-1 where the LAST index is the current (latest) output; earlier
 * indexes are stored revisions. The original is never deleted, so it is always
 * reachable at index 0.
 */
export interface OutputRevisionNavProps {
  index: number;
  total: number;
  onChange: (index: number) => void;
  label?: string;
}

export default function OutputRevisionNav({ index, total, onChange, label }: OutputRevisionNavProps) {
  if (total < 2) return null;

  return (
    <div className="inline-flex items-center gap-0.5 rounded-full border border-white/10 bg-black/40 px-1 py-0.5">
      <button
        type="button"
        onClick={() => onChange(Math.max(0, index - 1))}
        disabled={index <= 0}
        aria-label={`Previous version${label ? ` of ${label}` : ""}`}
        className="rounded-full p-0.5 text-slate-300 disabled:opacity-30 hover:bg-white/[0.08]"
      >
        <ChevronLeft className="h-3 w-3" />
      </button>
      <span className="px-1 text-[9px] uppercase tracking-[0.14em] text-slate-300" aria-live="polite">
        {index + 1} / {total}
      </span>
      <button
        type="button"
        onClick={() => onChange(Math.min(total - 1, index + 1))}
        disabled={index >= total - 1}
        aria-label={`Next version${label ? ` of ${label}` : ""}`}
        className="rounded-full p-0.5 text-slate-300 disabled:opacity-30 hover:bg-white/[0.08]"
      >
        <ChevronRight className="h-3 w-3" />
      </button>
    </div>
  );
}
