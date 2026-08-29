import { History } from "lucide-react";
import CampaignThumbnail from "@/components/campaigns/CampaignThumbnail";
import {
  CAMPAIGN_STATUS_TONE_CLASS,
  describeCampaignStatus,
  formatRelativeCampaignTime,
  type CampaignRun,
} from "@/lib/campaignHistory";
import { cn } from "@/lib/utils";

/**
 * Quiet history affordance for the Studio toolbar. Deliberately small — the
 * Campaign Builder stays the dominant surface. On mobile it collapses to a
 * single "History" button.
 */
export default function CampaignHistoryLauncher({
  campaigns,
  onOpenDrawer,
  onOpenCampaign,
  isError,
  onRetry,
  previewUrlForTemplate,
}: {
  campaigns: CampaignRun[];
  onOpenDrawer: () => void;
  onOpenCampaign: (run: CampaignRun) => void;
  isError?: boolean;
  onRetry?: () => void;
  previewUrlForTemplate?: (templateName: string) => string | null;
}) {
  const preview = campaigns.slice(0, 3);

  return (
    <div className="flex items-center gap-3 rounded-full border border-white/10 bg-white/[0.03] px-3 py-2">
      <button
        type="button"
        onClick={onOpenDrawer}
        className="inline-flex items-center gap-2 rounded-full px-2 py-1 font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-200 transition-colors hover:text-white"
      >
        <History className="h-3.5 w-3.5" />
        History
      </button>

      {isError ? (
        <button
          type="button"
          onClick={onRetry}
          className="font-sans text-[11px] text-rose-200 underline-offset-4 hover:underline"
        >
          Try again
        </button>
      ) : null}

      {!isError && preview.length ? (
        <div className="hidden items-center gap-2 sm:flex">
          <span className="h-4 w-px bg-white/10" />
          {preview.map((run, index) => {
            const status = describeCampaignStatus(run);
            return (
              <button
                key={run.id}
                type="button"
                onClick={() => onOpenCampaign(run)}
                title={`${run.templateName} · ${formatRelativeCampaignTime(run)}`}
                className={cn(
                  "group flex items-center gap-2 rounded-full border border-white/8 bg-black/25 py-1 pl-1 pr-3 transition-colors hover:border-white/20 hover:bg-white/[0.06]",
                  index === 2 ? "hidden lg:flex" : "",
                )}
              >
                <span className="h-7 w-7 overflow-hidden rounded-full border border-white/10">
                  <CampaignThumbnail
                    run={run}
                    templatePreviewUrl={previewUrlForTemplate?.(run.templateName) ?? null}
                    className="h-full w-full object-cover"
                  />
                </span>
                <span className="max-w-[112px] truncate font-sans text-[11px] text-slate-300 group-hover:text-white">
                  {run.templateName}
                </span>
                <span className={cn("font-sans text-[9px] font-semibold tracking-[0.12em]", CAMPAIGN_STATUS_TONE_CLASS[status.tone])}>
                  {status.tone === "ready" ? "✓" : status.tone === "attention" ? "!" : "●"}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
