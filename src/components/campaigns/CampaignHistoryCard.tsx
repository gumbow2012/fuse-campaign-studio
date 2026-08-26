import { MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import CampaignThumbnail from "@/components/campaigns/CampaignThumbnail";
import {
  CAMPAIGN_STATUS_TONE_CLASS,
  describeCampaignStatus,
  formatCampaignOutputCount,
  formatRelativeCampaignTime,
  type CampaignRun,
} from "@/lib/campaignHistory";
import { cn } from "@/lib/utils";

export interface CampaignCardActions {
  onOpen: (run: CampaignRun) => void;
  onDownload?: (run: CampaignRun) => void;
  onRemix?: (run: CampaignRun) => void;
}

/**
 * One campaign row (drawer) — thumbnail + name + customer status + meta.
 *
 * Layout note: the meta row intentionally keeps room for a future brand chip
 * and "by @creator" attribution, so those can drop in without a redesign.
 */
export default function CampaignHistoryCard({
  run,
  templatePreviewUrl,
  active,
  onOpen,
  onDownload,
  onRemix,
}: CampaignCardActions & {
  run: CampaignRun;
  templatePreviewUrl?: string | null;
  active?: boolean;
}) {
  const status = describeCampaignStatus(run);

  return (
    <div
      className={cn(
        "group relative flex items-stretch gap-3 overflow-hidden rounded-[1.15rem] border p-2 pr-2 transition-colors",
        active
          ? "border-cyan-300/40 bg-cyan-300/[0.06]"
          : "border-white/8 bg-black/20 hover:border-white/20 hover:bg-white/[0.05]",
      )}
    >
      <button
        type="button"
        onClick={() => onOpen(run)}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <div className="h-16 w-12 shrink-0 overflow-hidden rounded-[0.75rem] border border-white/10">
          <CampaignThumbnail
            run={run}
            templatePreviewUrl={templatePreviewUrl}
            className="h-full w-full object-cover"
          />
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate font-sans text-sm font-semibold text-white">{run.templateName}</p>
          <p
            className={cn(
              "mt-1 font-sans text-[10px] font-semibold uppercase tracking-[0.16em]",
              CAMPAIGN_STATUS_TONE_CLASS[status.tone],
            )}
          >
            {status.label}
            {status.detail ? <span className="ml-1.5 text-slate-400">· {status.detail}</span> : null}
          </p>
          {/* Reserved slot: brand chip + creator attribution land here later. */}
          <p className="mt-1 truncate font-sans text-[11px] text-slate-500">
            {formatCampaignOutputCount(run)} · {formatRelativeCampaignTime(run)}
          </p>
        </div>
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Actions for ${run.templateName}`}
            className="my-auto rounded-full border border-white/10 bg-white/[0.03] p-1.5 text-slate-400 opacity-0 transition-opacity hover:text-white focus-visible:opacity-100 group-hover:opacity-100 motion-reduce:opacity-100"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem onSelect={() => onOpen(run)}>Open</DropdownMenuItem>
          {onDownload ? (
            <DropdownMenuItem
              disabled={!run.outputs?.length}
              onSelect={() => onDownload(run)}
            >
              Download
            </DropdownMenuItem>
          ) : null}
          {onRemix ? <DropdownMenuItem onSelect={() => onRemix(run)}>Remix</DropdownMenuItem> : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
