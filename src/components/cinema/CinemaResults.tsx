import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { CinemaGeneration } from "@/services/cinemaStudio";

/**
 * FUSE Cinema — results with native revision history (‹ 2/3 ›).
 * History is append-only: a new generation never replaces an earlier one.
 */

export interface CinemaResultsProps {
  generations: CinemaGeneration[];
  index: number;
  onIndexChange: (index: number) => void;
  /** Optional non-destructive FINISH preview (CSS only) for the shown version. */
  finishCss?: string;
  /** 0–1 grain overlay opacity from the saved finish. */
  finishGrain?: number;
}


const STATUS_COPY: Record<string, string> = {
  queued: "Queued",
  running: "Generating…",
  complete: "Ready",
  failed: "Failed",
};

export default function CinemaResults({
  generations,
  index,
  onIndexChange,
  finishCss,
  finishGrain = 0,
}: CinemaResultsProps) {

  if (!generations.length) return null;

  const safeIndex = Math.min(Math.max(index, 0), generations.length - 1);
  const current = generations[safeIndex];
  const pending = current.status === "queued" || current.status === "running";

  return (
    <div className="fuse-panel space-y-3 rounded-2xl p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="font-display text-[11px] uppercase tracking-[0.2em]">Results</span>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[9px] uppercase tracking-[0.14em]">
            {STATUS_COPY[current.status] ?? current.status}
          </Badge>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            disabled={safeIndex === 0}
            onClick={() => onIndexChange(safeIndex - 1)}
            aria-label="Previous version"
          >
            ‹
          </Button>
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {safeIndex + 1}/{generations.length}
          </span>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            disabled={safeIndex === generations.length - 1}
            onClick={() => onIndexChange(safeIndex + 1)}
            aria-label="Next version"
          >
            ›
          </Button>
        </div>
      </div>

      {current.outputUrl && current.outputType === "video" ? (
        <video
          key={current.id}
          src={current.outputUrl}
          controls
          playsInline
          className="w-full rounded-xl bg-black"
        />
      ) : current.outputUrl ? (
        <img
          src={current.outputUrl}
          alt="Cinema generation result"
          className="w-full rounded-xl"
          loading="lazy"
        />
      ) : (
        <div className="flex min-h-[160px] items-center justify-center rounded-xl border border-border/60 bg-background/40 p-4 text-center text-[12px] text-muted-foreground">
          {pending
            ? "Generating — this usually takes a couple of minutes."
            : current.error ?? "No file returned for this version."}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
        <span>{current.snapshot?.model ?? "—"}</span>
        {current.estimatedCredits ? <span>{current.estimatedCredits} credits</span> : null}
        {current.snapshot?.promptSource === "USER_EDITED" ? <span>Edited prompt</span> : null}
      </div>
    </div>
  );
}
