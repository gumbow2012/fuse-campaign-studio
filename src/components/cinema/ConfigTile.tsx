import { cn } from "@/lib/utils";
import PresetPreview from "./PresetPreview";
import type { ActiveConfigTile } from "@/lib/cinema/activeConfigTiles";

export interface ConfigTileProps {
  tile: ActiveConfigTile;
  active?: boolean;
  onClick: () => void;
}

/**
 * CV2 — one visual tile in the active-config strip: the CV1 preview of the
 * currently selected value plus its category label. Clicking opens the
 * category's existing full browser (unchanged).
 */
export default function ConfigTile({ tile, active, onClick }: ConfigTileProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${tile.label} — ${tile.summary}`}
      className={cn(
        "group relative w-[8.5rem] shrink-0 overflow-hidden rounded-xl border text-left transition-all",
        "border-border/70 bg-card/50 backdrop-blur hover:border-primary/60 hover:bg-card",
        active && "border-primary/70 glow-blue-sm",
      )}
    >
      <PresetPreview media={tile.media} alt={`${tile.label} ${tile.summary}`} className="h-16" />
      <span className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-background/10 to-background/70" />
      <div className="relative space-y-0.5 px-2.5 py-2">
        <span className="block font-display text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
          {tile.label}
        </span>
        <span className="block truncate text-[11px] text-foreground/90">{tile.summary}</span>
      </div>
    </button>
  );
}
