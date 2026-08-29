import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Loader2, Search } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import CampaignHistoryCard, { type CampaignCardActions } from "@/components/campaigns/CampaignHistoryCard";
import {
  ACTIVE_CAMPAIGN_STATUSES,
  CAMPAIGN_FILTERS,
  filterCampaigns,
  groupCampaignsByDay,
  type CampaignFilterKey,
  type CampaignRun,
} from "@/lib/campaignHistory";
import { cn } from "@/lib/utils";

interface CampaignHistoryDrawerProps extends CampaignCardActions {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaigns: CampaignRun[];
  activeRunId?: string | null;
  isLoading?: boolean;
  isError?: boolean;
  isFetchingNextPage?: boolean;
  hasNextPage?: boolean;
  onLoadMore?: () => void;
  onRetry?: () => void;
  previewUrlForTemplate?: (templateName: string) => string | null;
}

/** Right-hand campaign history sheet — search, filters, day groups, infinite list. */
export default function CampaignHistoryDrawer({
  open,
  onOpenChange,
  campaigns,
  activeRunId,
  isLoading,
  isError,
  isFetchingNextPage,
  hasNextPage,
  onLoadMore,
  onRetry,
  previewUrlForTemplate,
  onOpen,
  onDownload,
  onRemix,
}: CampaignHistoryDrawerProps) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<CampaignFilterKey>("all");
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const visible = useMemo(() => filterCampaigns(campaigns, search, filter), [campaigns, search, filter]);
  const building = useMemo(
    () => visible.filter((run) => ACTIVE_CAMPAIGN_STATUSES.has(run.status)),
    [visible],
  );
  const groups = useMemo(
    () => groupCampaignsByDay(visible.filter((run) => !ACTIVE_CAMPAIGN_STATUSES.has(run.status))),
    [visible],
  );

  // Progressive loading: the sentinel pulls the next page as it scrolls in.
  useEffect(() => {
    if (!open || !hasNextPage || !onLoadMore) return;
    const node = sentinelRef.current;
    if (!node) return;

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting) && !isFetchingNextPage) {
        onLoadMore();
      }
    }, { rootMargin: "240px" });

    observer.observe(node);
    return () => observer.disconnect();
  }, [open, hasNextPage, onLoadMore, isFetchingNextPage, visible.length]);

  const handleOpenRun = (run: CampaignRun) => {
    onOpen(run);
    onOpenChange(false);
  };

  const cardActions = { onOpen: handleOpenRun, onDownload, onRemix };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 border-white/10 bg-slate-950/95 p-0 backdrop-blur-xl sm:max-w-[440px]"
      >
        <div className="border-b border-white/10 px-5 pb-4 pt-5">
          <h2 className="font-display text-[13px] font-bold uppercase tracking-[0.26em] text-white">
            Your Campaigns
          </h2>

          <div className="relative mt-4">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search campaigns"
              className="h-9 rounded-full border-white/10 bg-black/30 pl-9 font-sans text-sm text-slate-100 placeholder:text-slate-500"
            />
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {CAMPAIGN_FILTERS.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setFilter(option.key)}
                className={cn(
                  "rounded-full border px-3 py-1 font-sans text-[10px] font-semibold uppercase tracking-[0.16em] transition-colors",
                  filter === option.key
                    ? "border-cyan-300/50 bg-cyan-300/10 text-cyan-100"
                    : "border-white/10 bg-white/[0.03] text-slate-400 hover:text-white",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {isError ? (
            <div className="rounded-[1.25rem] border border-rose-400/20 bg-rose-400/10 p-4">
              <p className="font-sans text-sm text-rose-100">We couldn't load your campaigns.</p>
              {onRetry ? (
                <button
                  type="button"
                  onClick={onRetry}
                  className="mt-2 font-sans text-xs font-semibold uppercase tracking-[0.16em] text-rose-100 underline-offset-4 hover:underline"
                >
                  Try again
                </button>
              ) : null}
            </div>
          ) : null}

          {!isError && isLoading ? (
            <div className="flex items-center gap-2 font-sans text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading your campaigns…
            </div>
          ) : null}

          {!isError && !isLoading && !visible.length ? (
            <div className="rounded-[1.25rem] border border-dashed border-white/12 bg-black/20 p-5 text-center">
              <p className="font-display text-[11px] font-bold uppercase tracking-[0.22em] text-white">
                Your first campaign will live here.
              </p>
              <p className="mt-2 font-sans text-xs text-slate-400">Pick a template to start.</p>
            </div>
          ) : null}

          {building.length ? (
            <section className="mb-5">
              <p className="font-display text-[10px] font-bold uppercase tracking-[0.24em] text-cyan-100">
                Building now
              </p>
              <div className="mt-2 space-y-2">
                {building.map((run) => (
                  <CampaignHistoryCard
                    key={run.id}
                    run={run}
                    active={activeRunId === run.id}
                    templatePreviewUrl={previewUrlForTemplate?.(run.templateName) ?? null}
                    {...cardActions}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {groups.map((group) => (
            <section key={group.bucket} className="mb-5">
              <p className="font-display text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">
                {group.label}
              </p>
              <div className="mt-2 space-y-2">
                {group.runs.map((run) => (
                  <CampaignHistoryCard
                    key={run.id}
                    run={run}
                    active={activeRunId === run.id}
                    templatePreviewUrl={previewUrlForTemplate?.(run.templateName) ?? null}
                    {...cardActions}
                  />
                ))}
              </div>
            </section>
          ))}

          <div ref={sentinelRef} className="h-px w-full" />

          {isFetchingNextPage ? (
            <div className="flex justify-center py-3">
              <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
            </div>
          ) : null}
        </div>

        <div className="border-t border-white/10 p-4">
          <Button
            asChild
            variant="outline"
            className="w-full rounded-full border-white/12 bg-white/[0.03] font-sans text-xs font-semibold uppercase tracking-[0.18em] text-slate-200 hover:bg-white/[0.08]"
          >
            <Link to="/app/campaigns" onClick={() => onOpenChange(false)}>
              View all campaigns
              <ArrowRight className="ml-2 h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
