/**
 * Creator-level performance surfaces (presentation only).
 *
 * Renders nothing unless the aggregate contains real rows. DEMO-only data is
 * always chipped as "DEMO DATA" and never labelled verified.
 */

import { BadgeCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  creatorPerformanceBadges,
  type CreatorPerformanceAggregate,
} from "@/services/creatorPerformance";
import {
  formatRevenue,
  formatRoas,
  formatSpend,
  isVerified,
  PERFORMANCE_DISCLAIMER,
} from "@/services/templatePerformance";

function DemoChip() {
  return (
    <span className="inline-flex items-center rounded-full border border-amber-300/40 bg-amber-300/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-amber-100">
      Demo data
    </span>
  );
}

function VerifiedChip({ count }: { count: number }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-cyan-300/40 bg-cyan-300/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-cyan-100">
      <BadgeCheck className="h-3 w-3" />
      {count} performance-verified
    </span>
  );
}

function BadgeRow({ aggregate }: { aggregate: CreatorPerformanceAggregate }) {
  const badges = creatorPerformanceBadges(aggregate).slice(0, 2);
  if (!badges.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {badges.map((badge) => (
        <span
          key={badge.key}
          className="rounded-full border border-lime-300/30 bg-lime-300/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-lime-200"
        >
          {badge.label}
        </span>
      ))}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-display text-2xl font-bold leading-none text-lime-300">{value}</p>
      <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-slate-400">{label}</p>
    </div>
  );
}

/** Creator Studio (own dashboard) — per-template rows + top-line summary. */
export function CreatorPerformancePanel({
  aggregate,
  className,
}: {
  aggregate: CreatorPerformanceAggregate;
  className?: string;
}) {
  if (!aggregate.templates.length) return null;

  const roas = formatRoas(aggregate.medianRoas);
  const spend = formatSpend(aggregate.totalTrackedSpend);
  const revenue = formatRevenue(aggregate.totalTrackedRevenue);

  return (
    <section className={cn("space-y-4", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Performance</p>
        <div className="flex flex-wrap items-center gap-2">
          {aggregate.performanceVerifiedTemplateCount > 0 ? (
            <VerifiedChip count={aggregate.performanceVerifiedTemplateCount} />
          ) : null}
          {aggregate.hasDemoData ? <DemoChip /> : null}
        </div>
      </div>

      <div className="flex flex-wrap gap-8 rounded-2xl border border-white/10 bg-black/30 px-4 py-4">
        {roas ? <Metric label="Median ROAS" value={roas} /> : null}
        {spend ? <Metric label="Tracked spend" value={spend} /> : null}
        {revenue ? <Metric label="Tracked revenue" value={revenue} /> : null}
        <Metric
          label="Verified templates"
          value={String(aggregate.performanceVerifiedTemplateCount)}
        />
      </div>

      <BadgeRow aggregate={aggregate} />

      <div className="space-y-2">
        {aggregate.templates.map((entry) => (
          <div
            key={entry.templateId}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/30 px-4 py-3"
          >
            <div className="min-w-0">
              <p className="truncate font-display text-sm font-semibold text-foreground">
                {entry.name ?? "Untitled template"}
              </p>
              <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {formatSpend(entry.row.spend) ? <span>{formatSpend(entry.row.spend)} spend</span> : null}
                {formatRevenue(entry.row.revenue) ? (
                  <span>{formatRevenue(entry.row.revenue)} revenue</span>
                ) : null}
                {entry.uses !== null ? <span>{entry.uses} uses</span> : null}
                {isVerified(entry.row) ? (
                  <span className="text-cyan-200">Meta verified</span>
                ) : entry.row.verification_status === "DEMO" || entry.row.source === "DEMO" ? (
                  <DemoChip />
                ) : null}
              </p>
            </div>
            {formatRoas(entry.row.roas) ? (
              <div className="flex items-baseline gap-1.5">
                <span className="font-display text-xl font-bold leading-none text-lime-300">
                  {formatRoas(entry.row.roas)}
                </span>
                <span className="text-[9px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                  ROAS
                </span>
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <p className="text-[10px] leading-relaxed text-slate-500">{PERFORMANCE_DISCLAIMER}</p>
    </section>
  );
}

/**
 * Public profile proof block. Aggregated metrics only — no ad-account identity,
 * campaign names or audience data. Hidden entirely when nothing real exists;
 * DEMO-only aggregates are explicitly chipped and never read as verified.
 */
export function CreatorPerformanceProof({
  aggregate,
  className,
}: {
  aggregate: CreatorPerformanceAggregate;
  className?: string;
}) {
  if (!aggregate.templates.length) return null;
  if (aggregate.demoOnly === false && aggregate.performanceVerifiedTemplateCount === 0) return null;

  const roas = formatRoas(aggregate.medianRoas);
  const spend = formatSpend(aggregate.totalTrackedSpend);

  return (
    <section className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
          {aggregate.demoOnly ? "Creative performance" : "Verified creative performance"}
        </h2>
        {aggregate.demoOnly ? (
          <DemoChip />
        ) : (
          <VerifiedChip count={aggregate.performanceVerifiedTemplateCount} />
        )}
      </div>

      <div className="flex flex-wrap gap-8 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-4">
        {spend ? <Metric label="Tracked ad spend" value={spend} /> : null}
        {roas ? <Metric label="Median ROAS" value={roas} /> : null}
        <Metric
          label="Performance-verified templates"
          value={String(aggregate.performanceVerifiedTemplateCount)}
        />
      </div>

      <BadgeRow aggregate={aggregate} />

      <p className="text-[10px] leading-relaxed text-slate-500">{PERFORMANCE_DISCLAIMER}</p>
    </section>
  );
}
