/**
 * VIDEO EDIT — the centrepiece of the studio.
 *
 * Header states the real counts and carries the two big actions (EDIT VIDEO,
 * EXPORT FINAL VIDEO); below sits the built-in non-destructive editor with the
 * large player and the real timeline. Clips hold their intended output-number
 * position, so a clip that lands late never reshuffles the sequence, and a slot
 * with no media yet stays a calm "needs another pass" card — never red.
 */
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Download, Loader2, Scissors, Sparkles } from "lucide-react";
import StudioButton from "@/components/results/StudioButton";
import VideoEditWorkspace, { type CampaignEditorApi } from "@/components/results/VideoEditWorkspace";
import type { CampaignResultSlot } from "@/components/results/resultSlots";
import type { ServerExportPhase } from "@/hooks/useServerExport";
import { cn } from "@/lib/utils";

export interface VideoEditSectionProps {
  slots: CampaignResultSlot[];
  jobId: string | null;
  editor: CampaignEditorApi | null;
  editProject: { id: string; segmentCount: number; customized: boolean } | null;
  downloading: boolean;
  executionComplete: boolean;
  onDownloadAll: () => void;
  /** Server render of the CURRENT saved edit. */
  exportPhase: ServerExportPhase;
  exportError: string | null;
  exportReady: boolean;
  onExport: () => void;
  onDownloadExport: () => void;
  className?: string;
}

export function VideoEditSection({
  slots,
  jobId,
  editor,
  editProject,
  downloading,
  executionComplete,
  onDownloadAll,
  exportPhase,
  exportError,
  exportReady,
  onExport,
  onDownloadExport,
  className,
}: VideoEditSectionProps) {
  const readySlots = useMemo(() => slots.filter((slot) => slot.item), [slots]);
  if (!readySlots.length) return null;

  const missing = slots.length - readySlots.length;
  const exporting = exportPhase === "starting" || exportPhase === "rendering";

  return (
    <section
      id="video-edit"
      className={cn(
        "scroll-mt-24 rounded-3xl border border-white/10 bg-slate-950/50 p-6 sm:p-8",
        className,
      )}
      aria-label="Video edit"
    >
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <h3 className="font-display text-lg font-bold uppercase tracking-[0.14em] text-white">
            Video edit
            <span className="ml-2 font-display text-sm font-semibold tracking-[0.14em] text-cyan-100 tabular-nums">
              {readySlots.length} / {slots.length} clips ready
            </span>
          </h3>
          <p className="mt-1.5 text-[13px] leading-6 text-slate-400">
            {missing > 0
              ? `${readySlots.length} ready · ${missing} needs retry — arrange, trim and export what's here now.`
              : "Arrange, trim and export your clips. Your original files are never changed."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <StudioButton tone="secondary" size="xl" asChild>
            <a href="#video-edit-timeline">
              <Scissors className="h-4 w-4" aria-hidden /> Edit video
            </a>
          </StudioButton>

          {exportReady ? (
            <StudioButton tone="primary" size="xl" onClick={onDownloadExport}>
              <CheckCircle2 className="h-5 w-5" aria-hidden /> Download final video
            </StudioButton>
          ) : (
            <StudioButton tone="primary" size="xl" disabled={exporting || !editProject} onClick={onExport}>
              {exporting ? (
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
              ) : (
                <Sparkles className="h-5 w-5" aria-hidden />
              )}
              {exporting ? "Rendering…" : "Export final video"}
            </StudioButton>
          )}
        </div>
      </header>

      {exportError ? (
        <p className="mt-3 text-[13px] text-amber-200">{exportError}</p>
      ) : exporting ? (
        <p className="mt-3 text-[13px] text-slate-400">
          We're rendering your edit. You can keep browsing — this can take a few minutes.
        </p>
      ) : null}

      <div id="video-edit-timeline" className="mt-7 scroll-mt-24">
        <VideoEditWorkspace editor={editor} fallbackSlots={slots} />
      </div>

      <div className="mt-7 flex flex-wrap items-center gap-3 border-t border-white/10 pt-6">
        <StudioButton tone="secondary" size="lg" disabled={downloading} onClick={onDownloadAll}>
          {downloading ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Download className="h-4 w-4" aria-hidden />
          )}
          {executionComplete && !missing
            ? "Download all clips"
            : `Download ${readySlots.length} ready clip${readySlots.length === 1 ? "" : "s"}`}
        </StudioButton>

        {missing > 0 ? (
          <span className="font-display text-[12px] font-semibold uppercase tracking-[0.16em] text-slate-400 tabular-nums">
            {readySlots.length} ready · {missing} needs retry
          </span>
        ) : null}

        {jobId ? (
          <StudioButton tone="tertiary" size="md" asChild className="ml-auto">
            <Link to={`/app/campaigns/${encodeURIComponent(jobId)}/edit`}>
              {editProject ? "Open advanced editor" : "Open full editor"}
            </Link>
          </StudioButton>
        ) : null}
      </div>
    </section>
  );
}

export default VideoEditSection;
