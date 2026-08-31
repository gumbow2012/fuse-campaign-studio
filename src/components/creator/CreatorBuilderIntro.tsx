/**
 * CREATOR STUDIO first screen — learn-by-building intro.
 * Presentation only: START BUILDING opens the REAL builder in creator mode
 * with a brand-new creator-owned draft (created by the existing workbench
 * create path, created_by = self, server-enforced).
 */
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CREATOR_LEARNING_OUTCOMES } from "@/lib/creatorBuilderCopy";

export default function CreatorBuilderIntro({
  onStartBuilding,
  onExplore,
}: {
  onStartBuilding: () => void;
  onExplore: () => void;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm sm:p-6">
      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-200/80">
        Creator Studio
      </p>
      <h2 className="mt-2 font-display text-2xl font-black uppercase tracking-tight text-foreground sm:text-3xl">
        Build your first template
      </h2>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
        We'll teach you FUSE while you build your first reusable campaign.
      </p>

      <p className="mt-6 font-display text-xs font-bold uppercase tracking-[0.18em] text-foreground">
        By the end you'll know how to:
      </p>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {CREATOR_LEARNING_OUTCOMES.map((item) => (
          <li key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
            <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-cyan-200/40 bg-cyan-300/20 text-cyan-200">
              <Check className="h-2.5 w-2.5" />
            </span>
            {item}
          </li>
        ))}
      </ul>

      <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button
          type="button"
          onClick={onStartBuilding}
          className="rounded-full bg-cyan-300 px-6 py-6 font-display text-sm font-bold tracking-[0.12em] text-slate-950 hover:bg-cyan-200"
        >
          START BUILDING →
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={onExplore}
          className="rounded-full text-sm text-muted-foreground hover:text-foreground"
        >
          Explore on my own →
        </Button>
      </div>
      <p className="mt-3 text-xs text-muted-foreground sm:hidden">
        Building workflows works best on desktop — continue there for the full visual builder.
      </p>
    </div>
  );
}
