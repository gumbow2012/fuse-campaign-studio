/**
 * CUSTOMER RESULTS EXPERIENCE — the single canonical presentation of a campaign.
 *
 * `campaign-live-status` is the only source of truth: polling stops the moment
 * the server reports `execution_complete`, and nothing here invents progress,
 * status or failure copy.
 *
 * Hierarchy (R3):
 *   CAMPAIGN WORKFLOW   [ EDIT WORKFLOW · PRO ]
 *   VIDEO EDIT          (from the first ready video clip)
 *   PHOTOSHOOT          (from the first ready photo)
 *
 * R1: a campaign with at least one usable output NEVER shows a global
 * partial/failed/interrupted state. Missing outputs stay slot-level.
 *
 * Seams left open on purpose: per-slot Regenerate (outlined slot treatment is
 * already in place), a server ZIP bundle (swap `downloadAllOutputs`), and live
 * edit-project attachment (`findEditProjectForRun`).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import CampaignWorkflowPanel from "@/components/results/CampaignWorkflowPanel";
import PhotoshootSection from "@/components/results/PhotoshootSection";
import VideoEditSection from "@/components/results/VideoEditSection";
import { buildSlots, readyItems, type CampaignResultSlot } from "@/components/results/resultSlots";
import useCampaignLiveStatus from "@/hooks/useCampaignLiveStatus";
import { toast } from "@/hooks/use-toast";
import { findEditProjectForRun } from "@/services/campaignEditor";
import { downloadAllOutputs, downloadSignedOutput } from "@/services/resultDownloads";
import type { CampaignLiveStatus } from "@/services/campaignLiveStatus";
import type { CustomizeState } from "@/lib/customizeGating";
import { cn } from "@/lib/utils";

export interface CampaignResultsStageProps {
  jobId: string | null;
  resolveLatest?: boolean;
  templateName?: string | null;
  onTerminal?: (status: CampaignLiveStatus) => void;
  /** R7 — existing private-fork entry point, owned by the parent. */
  customizeState?: CustomizeState;
  onCustomizeWorkflow?: () => void;
  onLockedCustomize?: () => void;
  /** Offered in the zero-output recovery state. */
  onRunAgain?: () => void;
  className?: string;
}

export function CampaignResultsStage({
  jobId,
  resolveLatest = false,
  templateName,
  onTerminal,
  customizeState,
  onCustomizeWorkflow,
  onLockedCustomize,
  onRunAgain,
  className,
}: CampaignResultsStageProps) {
  const { jobId: liveJobId, status, maxProgress, refresh } = useCampaignLiveStatus(jobId, {
    resolveLatest,
    onTerminal,
  });

  const [editProject, setEditProject] = useState<
    { id: string; segmentCount: number; customized: boolean } | null
  >(null);
  const [downloading, setDownloading] = useState<"video" | "image" | null>(null);

  const executionComplete = status?.job.execution_complete ?? false;

  /* Attach the real edit project once one exists for this run. */
  useEffect(() => {
    setEditProject(null);
    if (!liveJobId) return;
    let cancelled = false;
    void findEditProjectForRun(liveJobId).then((found) => {
      if (cancelled || !found) return;
      setEditProject({
        id: found.id,
        segmentCount: found.segmentCount,
        /* A revision beyond the initial build means the user has edited it. */
        customized: found.revision > 1,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [liveJobId, executionComplete]);

  const videoSlots = useMemo(() => (status ? buildSlots(status, "video") : []), [status]);
  const photoSlots = useMemo(() => (status ? buildSlots(status, "image") : []), [status]);

  const downloadOne = useCallback(
    async (slot: CampaignResultSlot) => {
      if (!slot.item) return;
      try {
        await downloadSignedOutput(slot.item, slot.number - 1);
      } catch {
        await refresh();
        toast({ title: "Link refreshed", description: "Please tap download again." });
      }
    },
    [refresh],
  );

  const downloadMany = useCallback(
    async (kind: "video" | "image", slots: CampaignResultSlot[]) => {
      const items = readyItems(slots);
      if (!items.length) return;
      setDownloading(kind);
      try {
        const { saved, failed } = await downloadAllOutputs(items);
        if (failed) {
          await refresh();
          toast({
            title: `${saved} of ${items.length} saved`,
            description: "Links refresh automatically — tap download again for the rest.",
          });
        }
      } finally {
        setDownloading(null);
      }
    },
    [refresh],
  );

  if (!status) {
    return (
      <section
        className={cn("rounded-[1.5rem] border border-white/10 bg-black/30 p-6", className)}
        aria-label="Your campaign"
      >
        <p className="font-display text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">
          Campaign workflow
        </p>
        <p className="mt-2 text-sm text-slate-400">Reconnecting to your campaign…</p>
      </section>
    );
  }

  const ready = status.outputs.ready;
  const total = status.outputs.total;
  const zeroOutputTerminal = executionComplete && ready === 0;

  return (
    <div className={cn("space-y-7", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-display text-sm font-semibold uppercase tracking-[0.18em] text-white">
          Your campaign
        </p>
        {total > 0 ? (
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-400 tabular-nums">
            {ready} / {total} ready
          </p>
        ) : null}
      </div>

      <CampaignWorkflowPanel
        status={status}
        maxProgress={maxProgress}
        templateName={templateName}
        customizeState={customizeState}
        onCustomizeWorkflow={onCustomizeWorkflow}
        onLockedCustomize={onLockedCustomize}
      />

      {zeroOutputTerminal ? (
        <section className="rounded-[1.5rem] border border-white/10 bg-white/[0.02] p-6" aria-label="Recovery">
          <p className="font-display text-sm font-semibold uppercase tracking-[0.12em] text-slate-100">
            We couldn't start this campaign
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Try again or update your uploads. You're only charged for outputs you receive.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {onRunAgain ? (
              <Button
                type="button"
                onClick={onRunAgain}
                className="rounded-full bg-[hsl(var(--electric-cyan))] text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-950 hover:bg-[hsl(var(--electric-blue))]"
              >
                Try again
              </Button>
            ) : null}
            {liveJobId ? (
              <Button
                asChild
                variant="outline"
                className="rounded-full border-white/20 text-[11px] uppercase tracking-[0.16em]"
              >
                <Link to={`/app/runs/${encodeURIComponent(liveJobId)}`}>View all files</Link>
              </Button>
            ) : null}
          </div>
        </section>
      ) : (
        <>
          <VideoEditSection
            slots={videoSlots}
            jobId={liveJobId}
            editProject={editProject}
            downloading={downloading === "video"}
            executionComplete={executionComplete}
            onDownloadItem={(slot) => void downloadOne(slot)}
            onDownloadAll={() => void downloadMany("video", videoSlots)}
          />

          <PhotoshootSection
            slots={photoSlots}
            downloading={downloading === "image"}
            executionComplete={executionComplete}
            onDownloadItem={(slot) => void downloadOne(slot)}
            onDownloadAll={() => void downloadMany("image", photoSlots)}
          />

          {liveJobId && ready > 0 ? (
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">
              <Link to={`/app/runs/${encodeURIComponent(liveJobId)}`} className="hover:text-slate-300">
                View all files →
              </Link>
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

export default CampaignResultsStage;
