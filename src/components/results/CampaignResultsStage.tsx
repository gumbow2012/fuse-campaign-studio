/**
 * FUSE CREATIVE STUDIO — the single canonical presentation of a campaign.
 *
 * `campaign-live-status` is the only source of truth: polling stops the moment
 * the server reports `execution_complete`, and nothing here invents progress,
 * status or failure copy.
 *
 * Hierarchy:
 *   HEADER          headline · editable campaign name · template · counts
 *   STATUS BAR      ready/total · progress · retry when outputs are missing
 *   VIDEO EDIT      big player + REAL non-destructive timeline + export
 *   PHOTOSHOOT      large true-ratio gallery + download all
 *
 * A campaign with at least one usable output NEVER shows a global partial or
 * failed state — missing outputs stay slot-level. Every edit and the export go
 * through the existing edge functions; original generated files are untouched.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Sliders } from "lucide-react";
import CampaignWorkflowPanel from "@/components/results/CampaignWorkflowPanel";
import EditableCampaignName from "@/components/results/EditableCampaignName";
import PhotoshootSection from "@/components/results/PhotoshootSection";
import StudioButton from "@/components/results/StudioButton";
import StudioStatusBar from "@/components/results/StudioStatusBar";
import VideoEditSection from "@/components/results/VideoEditSection";
import { buildSlots, readyItems, type CampaignResultSlot } from "@/components/results/resultSlots";
import { useCampaignEditor } from "@/hooks/useCampaignEditor";
import useCampaignLiveStatus from "@/hooks/useCampaignLiveStatus";
import useServerExport from "@/hooks/useServerExport";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { findEditProjectForRun } from "@/services/campaignEditor";
import { downloadAllOutputs, downloadSignedOutput } from "@/services/resultDownloads";
import { normalizeExportSettings } from "@/services/exportSettings";
import type { CampaignLiveStatus } from "@/services/campaignLiveStatus";
import type { CustomizeState } from "@/lib/customizeGating";
import { cn } from "@/lib/utils";

export interface CampaignResultsStageProps {
  jobId: string | null;
  resolveLatest?: boolean;
  templateName?: string | null;
  onTerminal?: (status: CampaignLiveStatus) => void;
  /** Existing private-fork entry point, owned by the parent. */
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
  const [retrying, setRetrying] = useState(false);
  const [nameSavedAt, setNameSavedAt] = useState<number | null>(null);

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
        customized: found.revision > 1,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [liveJobId, executionComplete]);

  /* The live, real editor for this run's auto-created edit project. */
  const editor = useCampaignEditor(editProject?.id);
  const hasEditor = !!editProject && !!editor.project;
  const campaignName = editor.project?.name?.trim() || null;

  const exporter = useServerExport(editProject?.id ?? null, campaignName ?? templateName ?? null);

  const videoSlots = useMemo(() => (status ? buildSlots(status, "video") : []), [status]);
  const photoSlots = useMemo(() => (status ? buildSlots(status, "image") : []), [status]);

  const renameCampaign = useCallback(
    (next: string) => {
      editor.setProjectName(next);
      setNameSavedAt(Date.now());
    },
    [editor],
  );

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

  /* Free retry of the outputs the server reports as missing. */
  const retryFailed = useCallback(async () => {
    if (!liveJobId) return;
    setRetrying(true);
    try {
      const { error } = await supabase.functions.invoke("retry-failed-run", {
        body: { run_id: liveJobId },
      });
      if (error) throw error;
      toast({ title: "Another pass started", description: "We'll add the outputs here as they land." });
      await refresh();
    } catch {
      toast({ title: "Couldn't start another pass", description: "Please try again in a moment." });
    } finally {
      setRetrying(false);
    }
  }, [liveJobId, refresh]);

  if (!status) {
    return (
      <section
        className={cn("rounded-3xl border border-white/10 bg-slate-950/50 p-7", className)}
        aria-label="Your campaign"
      >
        <p className="font-display text-[12px] font-semibold uppercase tracking-[0.2em] text-slate-400">
          Campaign workflow
        </p>
        <p className="mt-2 text-sm text-slate-400">Reconnecting to your campaign…</p>
      </section>
    );
  }

  const ready = status.outputs.ready;
  const total = status.outputs.total;
  const missing = Math.max(0, total - ready);
  const zeroOutputTerminal = executionComplete && ready === 0;
  const canCustomize = !!onCustomizeWorkflow || !!onLockedCustomize;
  const locked = customizeState ? !customizeState.allowed : false;

  return (
    <div className={cn("mx-auto w-full max-w-[1520px] space-y-6", className)}>
      {/* ------------------------------- header ------------------------------- */}
      <header className="rounded-3xl border border-white/10 bg-slate-950/50 p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-5">
          <div className="min-w-0 flex-1">
            <p className="font-display text-[12px] font-semibold uppercase tracking-[0.22em] text-cyan-100">
              {executionComplete ? "Your campaign is ready" : status.job.headline}
            </p>
            <div className="mt-3">
              <EditableCampaignName
                name={campaignName}
                placeholder={templateName ? `${templateName} campaign` : "Untitled campaign"}
                saving={hasEditor && editor.saveState === "saving"}
                savedAt={hasEditor && editor.saveState === "saved" ? nameSavedAt : null}
                onSave={hasEditor ? renameCampaign : undefined}
              />
            </div>
            <p className="mt-2 text-[14px] text-slate-400">
              {templateName ? `${templateName} · ` : ""}
              <span className="tabular-nums">
                {ready}/{total || ready} outputs ready
              </span>
            </p>
          </div>

          {canCustomize ? (
            <StudioButton
              tone="secondary"
              size="xl"
              onClick={locked ? onLockedCustomize : onCustomizeWorkflow}
            >
              <Sliders className="h-4 w-4" aria-hidden /> Edit workflow
            </StudioButton>
          ) : null}
        </div>

        {/* Technical details stay out of the primary experience. */}
        {liveJobId ? (
          <details className="mt-6 border-t border-white/10 pt-4">
            <summary className="cursor-pointer font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 transition-colors duration-200 hover:text-slate-300">
              Details
            </summary>
            <p className="mt-2 break-all text-[13px] text-slate-500">Current run {liveJobId}</p>
          </details>
        ) : null}
      </header>

      <StudioStatusBar
        ready={ready}
        total={total}
        percent={maxProgress}
        complete={executionComplete}
        missing={missing}
        retrying={retrying}
        onRetry={executionComplete ? () => void retryFailed() : undefined}
      />

      {!executionComplete ? (
        <CampaignWorkflowPanel
          status={status}
          maxProgress={maxProgress}
          templateName={templateName}
          customizeState={customizeState}
          onCustomizeWorkflow={onCustomizeWorkflow}
          onLockedCustomize={onLockedCustomize}
        />
      ) : null}

      {zeroOutputTerminal ? (
        <section
          className="rounded-3xl border border-white/10 bg-white/[0.02] p-7"
          aria-label="Recovery"
        >
          <p className="font-display text-lg font-bold uppercase tracking-[0.14em] text-slate-100">
            We couldn't start this campaign
          </p>
          <p className="mt-2 max-w-xl text-[14px] leading-6 text-slate-400">
            Try again or update your uploads. You're only charged for outputs you receive.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            {onRunAgain ? (
              <StudioButton tone="primary" size="lg" onClick={onRunAgain}>
                Try again
              </StudioButton>
            ) : null}
            {liveJobId ? (
              <StudioButton tone="tertiary" size="lg" asChild>
                <Link to={`/app/runs/${encodeURIComponent(liveJobId)}`}>View all outputs</Link>
              </StudioButton>
            ) : null}
          </div>
        </section>
      ) : (
        <>
          <VideoEditSection
            slots={videoSlots}
            jobId={liveJobId}
            editor={hasEditor ? editor : null}
            editProject={editProject}
            downloading={downloading === "video"}
            executionComplete={executionComplete}
            onDownloadAll={() => void downloadMany("video", videoSlots)}
            exportPhase={exporter.phase}
            exportError={exporter.error}
            exportReady={exporter.phase === "ready"}
            onExport={() =>
              void exporter.start(
                editor.project?.export_settings ?? normalizeExportSettings(null, "9:16"),
              )
            }
            onDownloadExport={exporter.download}
          />

          <PhotoshootSection
            slots={photoSlots}
            downloading={downloading === "image"}
            executionComplete={executionComplete}
            onDownloadItem={(slot) => void downloadOne(slot)}
            onDownloadAll={() => void downloadMany("image", photoSlots)}
          />

          {liveJobId && ready > 0 ? (
            <div className="pb-2">
              <StudioButton tone="tertiary" size="md" asChild>
                <Link to={`/app/runs/${encodeURIComponent(liveJobId)}`}>View all outputs</Link>
              </StudioButton>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

export default CampaignResultsStage;
