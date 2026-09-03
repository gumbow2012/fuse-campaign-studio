import { AlertTriangle, Download, Film, Image as ImageIcon, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CampaignRecovery, RecoveredOutput } from "@/services/campaignRecovery";
import type { DownloadState } from "@/hooks/useCampaignRecovery";

/**
 * Recovery view for a run whose job status hides successful deliverables.
 * Presentation only — every URL comes pre-signed from the server.
 */
export interface RecoveredCampaignResultsProps {
  recovery: CampaignRecovery;
  templateName: string | null;
  downloadState: DownloadState;
  onDownload: (output: RecoveredOutput, index: number) => void;
  onRefresh: () => void;
  refreshing?: boolean;
}

function downloadLabel(state: DownloadState) {
  if (state === "preparing") return "Preparing…";
  if (state === "expired") return "Download link expired · Refresh";
  return "Download";
}

export default function RecoveredCampaignResults({
  recovery,
  templateName,
  downloadState,
  onDownload,
  onRefresh,
  refreshing = false,
}: RecoveredCampaignResultsProps) {
  const total = recovery.ready_count + recovery.failed_count;
  const partial = recovery.status === "partial";

  return (
    <div className="space-y-5">
      {partial ? (
        <div className="rounded-[1.5rem] border border-amber-300/25 bg-amber-300/[0.06] p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-200" />
            <div>
              <p className="font-display text-sm uppercase tracking-[0.16em] text-amber-100">
                Campaign partially complete — {recovery.ready_count} of {total} outputs ready
              </p>
              <p className="mt-1 text-sm text-amber-50/90">
                Most of your campaign finished. {recovery.failed_count} output(s) need a retry.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {recovery.ready_outputs.map((output, index) => (
          <div
            key={`${output.node_id}-${index}`}
            className="overflow-hidden rounded-[1.25rem] border border-white/10 bg-slate-950/70"
          >
            <div className="relative aspect-[9/16] bg-black/60">
              {output.type === "video" ? (
                <video
                  src={output.url}
                  controls
                  playsInline
                  preload="metadata"
                  className="h-full w-full object-contain"
                />
              ) : (
                <img
                  src={output.url}
                  alt={output.label ?? `Campaign output ${index + 1}`}
                  loading="lazy"
                  className="h-full w-full object-contain"
                />
              )}
            </div>
            <div className="flex items-center justify-between gap-2 px-3 py-2.5">
              <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.16em] text-slate-400">
                {output.type === "video" ? <Film className="h-3.5 w-3.5" /> : <ImageIcon className="h-3.5 w-3.5" />}
                {output.label ?? `Output ${index + 1}`}
              </span>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="h-8 gap-1.5 text-[11px]"
                disabled={downloadState === "preparing"}
                onClick={() => onDownload(output, index)}
              >
                {downloadState === "preparing" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
                {downloadLabel(downloadState)}
              </Button>
            </div>
          </div>
        ))}
      </div>

      {recovery.failed_outputs.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {recovery.failed_outputs.map((failure, index) => (
            <span
              key={`${failure.node_id}-${index}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-rose-300/20 bg-rose-400/10 px-3 py-1 text-[11px] text-rose-100"
            >
              <AlertTriangle className="h-3 w-3" />
              Output {recovery.ready_count + index + 1} · needs retry
            </span>
          ))}
        </div>
      ) : null}

      <button
        type="button"
        onClick={onRefresh}
        disabled={refreshing}
        className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.16em] text-slate-400 transition-colors hover:text-slate-100 disabled:opacity-60"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
        Refresh download links
      </button>
      <p className="sr-only">{templateName ?? "Campaign"} deliverables</p>
    </div>
  );
}
