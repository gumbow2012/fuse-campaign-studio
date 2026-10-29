import { Film, ImageIcon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { estimateRun, formatUsd, type RunEstimate, type RunMode, type UnitPrices } from "@/lib/campaign-director/costEstimate";
import { projectStats } from "@/lib/campaign-director/state";
import type { DirectorProject } from "@/lib/campaign-director/types";

type Props = {
  project: DirectorProject;
  prices: (UnitPrices & { live: boolean }) | null;
  running: boolean;
  /** Opens the spend dialog. Nothing is submitted from here. */
  onRequest: (estimate: RunEstimate) => void;
};

export default function RunBar({ project, prices, running, onRequest }: Props) {
  const stats = projectStats(project);
  const images = prices ? estimateRun(project, "images", prices) : null;
  const videos = prices ? estimateRun(project, "videos", prices) : null;

  const button = (mode: RunMode, estimate: RunEstimate | null) => (
    <Button
      type="button"
      variant={mode === "images" ? "default" : "secondary"}
      disabled={running || !estimate || estimate.count === 0}
      onClick={() => estimate && onRequest(estimate)}
    >
      {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : mode === "images" ? <ImageIcon className="mr-2 h-4 w-4" /> : <Film className="mr-2 h-4 w-4" />}
      {mode === "images" ? "Generate images" : "Animate approved"}
      {estimate ? ` (${estimate.count} · ${formatUsd(estimate.usd)})` : ""}
    </Button>
  );

  return (
    <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-background/95 p-3 shadow-lg backdrop-blur">
      <p className="text-sm text-muted-foreground">
        {stats.shots} shots · {stats.imagesReady} images · {stats.approved} approved · {stats.videosReady} clips
        {stats.failed ? ` · ${stats.failed} failed` : ""}
        {prices ? "" : " · loading prices…"}
        {prices && !prices.live ? " · estimate (live price unavailable)" : ""}
      </p>
      <div className="flex flex-wrap gap-2">
        {button("images", images)}
        {button("videos", videos)}
      </div>
    </div>
  );
}
