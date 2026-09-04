import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Loader2, Search } from "lucide-react";
import SiteShell from "@/components/mvp/SiteShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import CampaignThumbnail from "@/components/campaigns/CampaignThumbnail";
import { useCampaignHistory } from "@/hooks/useCampaignHistory";
import {
  CAMPAIGN_FILTERS,
  CAMPAIGN_STATUS_TONE_CLASS,
  describeCampaignStatus,
  filterCampaigns,
  findActiveCampaign,
  formatCampaignOutputCount,
  formatRelativeCampaignTime,
  type CampaignFilterKey,
  type CampaignRun,
  hasUsableOutputs,
} from "@/lib/campaignHistory";
import { cn } from "@/lib/utils";

/** Deep-links into the Studio workspace using the existing `?run=` flow. */
function campaignHref(run: CampaignRun) {
  // Any run with usable outputs opens the RESULTS view — including terminal
  // partial runs. Only a run with nothing usable goes back to the builder.
  if (run.status === "failed") {
    return hasUsableOutputs(run)
      ? `/app/runs/${encodeURIComponent(run.id)}`
      : `/app/templates?template=${encodeURIComponent(run.templateName ?? "")}`;
  }
  return `/app/templates?run=${encodeURIComponent(run.id)}`;
}


function CampaignGridCard({ run, onOpen }: { run: CampaignRun; onOpen: (run: CampaignRun) => void }) {
  const status = describeCampaignStatus(run);

  return (
    <button
      type="button"
      onClick={() => onOpen(run)}
      className="group overflow-hidden rounded-[1.5rem] border border-white/8 bg-black/20 text-left transition-colors hover:border-white/20 hover:bg-white/[0.05]"
    >
      <div className="relative overflow-hidden bg-black/30">
        <CampaignThumbnail
          run={run}
          className="aspect-[9/16] w-full object-cover motion-safe:transition-transform motion-safe:duration-500 motion-safe:group-hover:scale-[1.03]"
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/75 via-black/15 to-transparent" />
      </div>
      <div className="space-y-1.5 p-4">
        <p className="truncate font-sans text-sm font-semibold text-white">{run.templateName}</p>
        <p
          className={cn(
            "font-sans text-[10px] font-semibold uppercase tracking-[0.16em]",
            CAMPAIGN_STATUS_TONE_CLASS[status.tone],
          )}
        >
          {status.label}
          {status.detail ? <span className="ml-1.5 text-slate-400">· {status.detail}</span> : null}
        </p>
        {/* Reserved slot: brand chip + "by @creator" attribution land here later. */}
        <p className="truncate font-sans text-[11px] text-slate-500">
          {formatCampaignOutputCount(run)} · {formatRelativeCampaignTime(run)}
        </p>
      </div>
    </button>
  );
}

export default function CampaignLibraryPage() {
  const navigate = useNavigate();
  const { query, campaigns } = useCampaignHistory();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<CampaignFilterKey>("all");
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const visible = useMemo(() => filterCampaigns(campaigns, search, filter), [campaigns, search, filter]);
  const activeCampaign = useMemo(() => findActiveCampaign(campaigns), [campaigns]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !query.hasNextPage) return;

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting) && !query.isFetchingNextPage) {
        void query.fetchNextPage();
      }
    }, { rootMargin: "320px" });

    observer.observe(node);
    return () => observer.disconnect();
  }, [query.hasNextPage, query.isFetchingNextPage, query.fetchNextPage, visible.length]);

  const openCampaign = (run: CampaignRun) => navigate(campaignHref(run));

  return (
    <SiteShell>
      <section className="container py-12 md:py-16">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <h1 className="font-display text-2xl font-bold uppercase tracking-[0.12em] text-white sm:text-3xl">
              Your Campaigns
            </h1>
            <p className="mt-3 font-sans text-sm leading-6 text-slate-300">
              Every campaign you've made with FUSE.
            </p>
          </div>
          <Button
            onClick={() => navigate("/app/templates")}
            className="rounded-full bg-cyan-300 font-sans text-xs font-semibold uppercase tracking-[0.18em] text-slate-950 hover:bg-cyan-200"
          >
            New campaign
          </Button>
        </div>

        {activeCampaign ? (
          <section className="mt-8 overflow-hidden rounded-[1.75rem] border border-cyan-300/25 bg-cyan-300/[0.06] p-4">
            <div className="flex flex-wrap items-center gap-4">
              <div className="h-20 w-14 shrink-0 overflow-hidden rounded-[0.9rem] border border-white/10">
                <CampaignThumbnail run={activeCampaign} className="h-full w-full object-cover" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-display text-[11px] font-bold uppercase tracking-[0.24em] text-cyan-100">
                  Continue creating
                </p>
                <p className="mt-1.5 truncate font-sans text-sm font-semibold text-white">
                  {activeCampaign.templateName}
                </p>
                <p className="mt-1 font-sans text-[11px] text-slate-400">
                  {describeCampaignStatus(activeCampaign).label}
                  {" · "}
                  {formatRelativeCampaignTime(activeCampaign)}
                </p>
              </div>
              <Button
                onClick={() => openCampaign(activeCampaign)}
                className="rounded-full bg-cyan-300 font-sans text-xs font-semibold uppercase tracking-[0.18em] text-slate-950 hover:bg-cyan-200"
              >
                Open campaign
                <ArrowRight className="ml-2 h-3.5 w-3.5" />
              </Button>
            </div>
          </section>
        ) : null}

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search campaigns"
              className="h-9 rounded-full border-white/10 bg-black/30 pl-9 font-sans text-sm text-slate-100 placeholder:text-slate-500"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {CAMPAIGN_FILTERS.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setFilter(option.key)}
                className={cn(
                  "rounded-full border px-3 py-1.5 font-sans text-[10px] font-semibold uppercase tracking-[0.16em] transition-colors",
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

        {query.isError ? (
          <div className="mt-8 rounded-[1.5rem] border border-rose-400/20 bg-rose-400/10 p-5">
            <p className="font-sans text-sm text-rose-100">We couldn't load your campaigns.</p>
            <button
              type="button"
              onClick={() => void query.refetch()}
              className="mt-2 font-sans text-xs font-semibold uppercase tracking-[0.16em] text-rose-100 underline-offset-4 hover:underline"
            >
              Try again
            </button>
          </div>
        ) : null}

        {!query.isError && query.isLoading ? (
          <div className="mt-10 flex items-center gap-2 font-sans text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading your campaigns…
          </div>
        ) : null}

        {!query.isError && !query.isLoading && !visible.length ? (
          <div className="mt-10 rounded-[1.75rem] border border-dashed border-white/12 bg-black/20 p-8 text-center">
            <p className="font-display text-[12px] font-bold uppercase tracking-[0.22em] text-white">
              Your first campaign will live here.
            </p>
            <p className="mt-2 font-sans text-sm text-slate-400">Pick a template to start.</p>
            <Button
              onClick={() => navigate("/app/templates")}
              variant="outline"
              className="mt-5 rounded-full border-white/12 bg-white/[0.03] font-sans text-xs font-semibold uppercase tracking-[0.18em] text-slate-200 hover:bg-white/[0.08]"
            >
              Browse templates
            </Button>
          </div>
        ) : null}

        {visible.length ? (
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visible.map((run) => (
              <CampaignGridCard key={run.id} run={run} onOpen={openCampaign} />
            ))}
          </div>
        ) : null}

        <div ref={sentinelRef} className="h-px w-full" />

        {query.isFetchingNextPage ? (
          <div className="mt-6 flex justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
          </div>
        ) : null}
      </section>
    </SiteShell>
  );
}
