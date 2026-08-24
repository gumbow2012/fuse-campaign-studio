import { Badge } from "@/components/ui/badge";
import PresetPreview from "./PresetPreview";
import CinemaResults from "./CinemaResults";
import type { ActiveConfigTile } from "@/lib/cinema/activeConfigTiles";
import type { CinemaReference } from "@/lib/cinema/types";
import type { CinemaGeneration } from "@/services/cinemaStudio";

export interface CinemaStageProps {
  generations: CinemaGeneration[];
  index: number;
  onIndexChange: (index: number) => void;
  references: CinemaReference[];
  /** The most recently focused config tile, used as the fallback visual. */
  focusTile?: ActiveConfigTile;
}

/**
 * CV2 — the FUSE Cinema VISUAL STAGE: the hero of the page.
 *
 * Render priority:
 *   1. a generation exists   → CinemaResults (output + native revision history)
 *   2. a reference is attached → that reference plate
 *   3. a focused config tile  → its CV1 canonical-scene preview
 *   4. otherwise              → an empty "stage" state
 *
 * Presentation only: no config writes, no generation logic.
 */
export default function CinemaStage({
  generations,
  index,
  onIndexChange,
  references,
  focusTile,
}: CinemaStageProps) {
  const hasGeneration = generations.length > 0;
  const reference = references[0];

  return (
    <section className="fuse-panel relative overflow-hidden rounded-3xl border-border/70 bg-background/60 p-3 sm:p-5">
      <header className="mb-3 flex items-center justify-between gap-3">
        <span className="font-display text-[10px] uppercase tracking-[0.28em] text-muted-foreground">
          Stage
        </span>
        <Badge variant="outline" className="text-[9px] uppercase tracking-[0.16em]">
          {hasGeneration
            ? "Shot output"
            : reference
              ? "Reference"
              : focusTile
                ? `${focusTile.label} preview`
                : "Empty stage"}
        </Badge>
      </header>

      {hasGeneration ? (
        <CinemaResults generations={generations} index={index} onIndexChange={onIndexChange} />
      ) : reference ? (
        <figure className="overflow-hidden rounded-2xl bg-black">
          <img
            src={reference.url}
            alt={reference.name ?? "Selected reference"}
            loading="lazy"
            className="mx-auto max-h-[62vh] w-full object-contain"
          />
        </figure>
      ) : focusTile ? (
        <div className="overflow-hidden rounded-2xl bg-black">
          <PresetPreview
            media={focusTile.media}
            alt={`${focusTile.label} ${focusTile.summary}`}
            className="h-[38vh] min-h-[220px] sm:h-[52vh]"
          />
          <div className="flex items-center justify-between gap-3 px-4 py-3 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            <span>{focusTile.label}</span>
            <span className="truncate text-foreground/80">{focusTile.summary}</span>
            <span>{focusTile.media.canonicalScene}</span>
          </div>
        </div>
      ) : (
        <div className="flex h-[38vh] min-h-[220px] flex-col items-center justify-center gap-2 rounded-2xl border border-border/50 bg-[radial-gradient(circle_at_50%_0%,hsl(var(--primary)/0.12),transparent_65%)] text-center sm:h-[52vh]">
          <span className="font-display text-sm uppercase tracking-[0.3em] text-foreground/80">
            Set the shot
          </span>
          <p className="max-w-sm text-[12px] text-muted-foreground">
            Attach a reference, pick a camera, lens and light below, then generate. Your output and
            every revision appear here.
          </p>
        </div>
      )}
    </section>
  );
}
