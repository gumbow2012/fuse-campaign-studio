import { Loader2, RotateCcw } from "lucide-react";
import CampaignThumbnail from "@/components/campaigns/CampaignThumbnail";
import { Button } from "@/components/ui/button";
import { formatRelativeCampaignTime, hasUsableOutputs, usableOutputCount, type CampaignRun } from "@/lib/campaignHistory";
import { track } from "@/lib/analytics/track";
import { cn } from "@/lib/utils";

/**
 * RETENTION P2 — "Continue creating".
 *
 * Compact horizontal strip of the user's real recent runs (shared
 * useCampaignHistory query). Renders nothing when there are no runs.
 */
export default function ContinueCreatingStrip({
  campaigns,
  previewUrlForTemplate,
  templateIdForRun,
  onOpenRun,
  onRunAgain,
  className,
}: {
  campaigns: CampaignRun[];
  previewUrlForTemplate?: (templateName: string) => string | null;
  templateIdForRun?: (run: CampaignRun) => string | null;
  onOpenRun: (run: CampaignRun) => void;
  onRunAgain: (run: CampaignRun) => void;
  className?: string;
}) {
  const runs = campaigns.slice(0, 5);
  if (!runs.length) return null;

  const emit = (action: string, run: CampaignRun) => {
    track("continue_creating_clicked", {
      action,
      template_id: templateIdForRun?.(run) ?? null,
    });
  };

  return (
    <section className={cn("min-w-0", className)} aria-label="Continue creating">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-[11px] font-bold uppercase tracking-[0.22em] text-slate-300">
          Continue creating
        </h2>
      </div>

      <div className="mt-3 flex gap-3 overflow-x-auto pb-1 [scrollbar-width:thin]">
        {runs.map((run) => {
          const building = run.status === "queued" || run.status === "running" || run.status === "video_pending";
          // Terminal + usable outputs = a results campaign, never a failure.
          const readyCount = usableOutputCount(run);
          const failed = run.status === "failed" && !hasUsableOutputs(run);

          return (
            <article
              key={run.id}
              className="flex w-[236px] shrink-0 items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-2.5"
            >
              <span className="h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-white/10">
                <CampaignThumbnail
                  run={run}
                  templatePreviewUrl={previewUrlForTemplate?.(run.templateName) ?? null}
                  className="h-full w-full object-cover"
                />
              </span>

              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-foreground">{run.templateName}</p>
                <p
                  className={cn(
                    "mt-0.5 flex items-center gap-1 text-[10px]",
                    building ? "text-cyan-100" : failed ? "text-rose-200" : "text-muted-foreground",
                  )}
                >
                  {building ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" /> Generating…
                    </>
                  ) : failed ? (
                    "Needs another try"
                  ) : run.status === "failed" ? (
                    `${readyCount} ready`
                  ) : (
                    formatRelativeCampaignTime(run)
                  )}
                </p>

                <div className="mt-1.5 flex items-center gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-6 rounded-full px-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-200 hover:bg-white/10"
                    onClick={() => {
                      emit(building ? "view_progress" : failed ? "try_again" : "view_results", run);
                      if (failed) onRunAgain(run);
                      else onOpenRun(run);
                    }}
                  >
                    {building ? "View progress" : failed ? "Try again" : "View results"}
                  </Button>
                  {run.status === "complete" || (run.status === "failed" && !failed) ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-6 rounded-full px-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400 hover:bg-white/10 hover:text-slate-100"
                      onClick={() => {
                        emit("run_again", run);
                        onRunAgain(run);
                      }}
                    >
                      <RotateCcw className="h-3 w-3" />
                      Run again
                    </Button>
                  ) : null}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
