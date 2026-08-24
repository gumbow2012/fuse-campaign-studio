import { cn } from "@/lib/utils";

export interface DirectorChipProps {
  label: string;
  summary?: string;
  active?: boolean;
  onClick: () => void;
}

/** Reusable FUSE Cinema chip: category label + optional value summary. */
export default function DirectorChip({ label, summary, active, onClick }: DirectorChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex min-w-[7.5rem] flex-col items-start gap-0.5 rounded-xl border px-3.5 py-2 text-left transition-all",
        "border-border/70 bg-card/60 backdrop-blur hover:border-primary/60 hover:bg-card",
        active && "border-primary/70 bg-primary/10 glow-blue-sm",
      )}
    >
      <span className="font-display text-[10px] uppercase tracking-[0.18em] text-foreground/90">
        {label}
      </span>
      <span className="truncate text-[11px] text-muted-foreground">
        {summary || "Auto"}
      </span>
    </button>
  );
}
