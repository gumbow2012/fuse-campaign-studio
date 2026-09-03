import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, Scissors } from "lucide-react";
import { Button } from "@/components/ui/button";
import { findEditProjectForRun, type EditProjectSummary } from "@/services/campaignEditor";

/**
 * Additive result-page header: once a run finishes and an edit project exists,
 * editing becomes the primary action. "View all outputs" always stays available.
 */
export default function CampaignReadyBanner({
  jobId,
  videoCount,
  failedCount,
  onViewOutputs,
}: {
  jobId: string | null;
  videoCount: number;
  failedCount?: number;
  onViewOutputs?: () => void;
}) {
  const [project, setProject] = useState<EditProjectSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    setProject(null);
    if (!jobId) return;
    void findEditProjectForRun(jobId).then((found) => {
      if (!cancelled) setProject(found);
    });
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  const hasEdits = !!project && (project.revision > 0 || (project.status && project.status !== "draft"));

  return (
    <div className="rounded-[1.5rem] border border-cyan-300/25 bg-cyan-400/[0.06] p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 font-display text-base uppercase tracking-[0.1em] text-white sm:text-lg">
            <CheckCircle2 className="h-5 w-5 text-cyan-300" />
            Your campaign is ready
          </p>
          <p className="mt-1 text-[12px] text-slate-300">
            {videoCount} ready
            {failedCount ? ` · ${failedCount} failed` : ""}
            {project ? " · edit them into one video" : ""}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {project ? (
            <Button
              asChild
              className="bg-cyan-400 font-display uppercase tracking-[0.08em] text-slate-950 hover:bg-cyan-300"
            >
              <Link to={`/editor/${project.id}`}>
                <Scissors className="mr-2 h-4 w-4" />
                {hasEdits ? "Continue editing" : "Edit campaign video"}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            onClick={onViewOutputs}
            className="border-white/15 bg-white/[0.03] text-slate-200"
          >
            View all outputs
          </Button>
        </div>
      </div>
    </div>
  );
}
