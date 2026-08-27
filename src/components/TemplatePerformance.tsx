import { BadgeCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  formatAov,
  formatCvr,
  formatRoas,
  formatSpend,
  hasMetrics,
  isDemo,
  isVerified,
  PERFORMANCE_DISCLAIMER,
  computeCvrFromCounts,
  computePerformanceRange,
  earnedBadges,
  formatAttributionWindow,
  formatCpa,
  formatRevenue,
  formatVerifiedDate,
  type TemplatePerformanceRow,
} from "@/services/templatePerformance";

/** "META VERIFIED" is rendered for META_VERIFIED rows only. DEMO rows are labelled. */
export function PerformanceProvenance({ row }: { row: TemplatePerformanceRow }) {
  if (isVerified(row)) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-cyan-300/40 bg-cyan-300/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-cyan-100">
        <BadgeCheck className="h-3 w-3" />
        Meta verified
      </span>
    );
  }
  if (isDemo(row)) {
    return (
      <span className="inline-flex items-center rounded-full border border-amber-300/40 bg-amber-300/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-amber-100">
        Demo data
      </span>
    );
  }
  const label =
    row.verification_status === "VERIFIED_UPLOAD"
      ? "Verified upload"
      : row.verification_status === "USER_REPORTED"
        ? "Brand reported"
        : row.verification_status === "FUSE_INTERNAL"
          ? "FUSE internal"
          : "Unverified";
  return (
    <span className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-300">
      {label}
    </span>
  );
}

/** Performance-first block. Renders nothing when the row carries no real metrics. */
export function MetricRing({
  value,
  label,
  tone = "neutral",
  compact,
}: {
  value: string;
  label: string;
  tone?: "roas" | "revenue" | "neutral";
  compact?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={cn(
          "flex items-center justify-center rounded-full border-2 bg-black/50 text-center",
          compact ? "h-16 w-16" : "h-20 w-20",
          tone === "roas"
            ? "border-lime-300/70 shadow-[0_0_18px_-6px_rgba(163,230,53,0.55)]"
            : tone === "revenue"
              ? "border-cyan-300/60 shadow-[0_0_18px_-6px_rgba(103,232,249,0.5)]"
              : "border-white/20",
        )}
      >
        <span
          className={cn(
            "font-display font-bold leading-none",
            compact ? "text-sm" : "text-lg",
            tone === "roas" ? "text-lime-300" : tone === "revenue" ? "text-cyan-200" : "text-white",
          )}
        >
          {value}
        </span>
      </div>
      <span
        className={cn(
          "font-semibold uppercase tracking-[0.16em] text-slate-400",
          compact ? "text-[8px]" : "text-[9px]",
        )}
      >
        {label}
      </span>
    </div>
  );
}

export function PerformanceBlock({
  row,
  className,
  compact,
}: {
  row: TemplatePerformanceRow | null | undefined;
  className?: string;
  compact?: boolean;
}) {
  if (!row || !hasMetrics(row)) return null;

  const roas = formatRoas(row.roas);
  const revenue = formatRevenue(row.revenue);
  const cvr = formatCvr(row.purchase_cvr_lpv);
  const aov = formatAov(row.aov);
  const spend = formatSpend(row.spend);

  const rings: Array<{ value: string; label: string; tone?: "roas" | "revenue" | "neutral" }> = [];
  if (roas) rings.push({ value: roas, label: "ROAS", tone: "roas" });
  if (revenue) rings.push({ value: revenue, label: "Revenue", tone: "revenue" });
  if (cvr) rings.push({ value: cvr, label: "CVR (LPV)" });
  if (spend) rings.push({ value: spend, label: "Spend" });
  if (aov) rings.push({ value: aov, label: "AOV" });

  return (
    <div
      className={cn(
        "rounded-2xl border border-white/10 bg-black/40 px-3 py-2.5 backdrop-blur",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-[9px] font-semibold uppercase tracking-[0.2em] text-slate-400">
          Performance
        </span>
        <PerformanceProvenance row={row} />
      </div>

      {rings.length ? (
        <div className={cn("flex flex-wrap items-start", compact ? "mt-2 gap-2.5" : "mt-3 gap-4")}>
          {rings.map((ring) => (
            <MetricRing
              key={ring.label}
              value={ring.value}
              label={ring.label}
              tone={ring.tone}
              compact={compact}
            />
          ))}
        </div>
      ) : null}

      {spend && !compact ? (
        <p className="mt-2 text-[10px] uppercase tracking-[0.14em] text-slate-500">
          Tested on {spend} spend
        </p>
      ) : null}

      <PerformanceDisclaimer className={compact ? "mt-2 text-[9px] leading-4" : "mt-2"} />
    </div>
  );
}


export function PerformanceDisclaimer({ className }: { className?: string }) {
  return (
    <p className={cn("text-[10px] leading-5 text-slate-500", className)}>
      {PERFORMANCE_DISCLAIMER}
    </p>
  );
}

/* ------------------------------------------------------------------ */
/* Part 2 — earned badges + template-detail performance section        */
/* ------------------------------------------------------------------ */

/** Badges are always derived from the stored row — never hand-set. */
export function PerformanceBadges({
  row,
  className,
  limit,
}: {
  row: TemplatePerformanceRow | null | undefined;
  className?: string;
  limit?: number;
}) {
  const badges = earnedBadges(row);
  if (!badges.length) return null;
  const shown = typeof limit === "number" ? badges.slice(0, limit) : badges;

  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {shown.map((badge) => (
        <span
          key={badge.key}
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em]",
            badge.tone === "verified"
              ? "border-cyan-300/40 bg-cyan-300/10 text-cyan-100"
              : badge.tone === "performance"
                ? "border-lime-300/35 bg-lime-300/10 text-lime-200"
                : "border-white/15 bg-white/5 text-slate-300",
          )}
        >
          {badge.key === "META_VERIFIED" ? <BadgeCheck className="h-3 w-3" /> : null}
          {badge.label}
        </span>
      ))}
    </div>
  );
}

function DetailMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
      <p className="text-[9px] uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-white">{value}</p>
    </div>
  );
}

/**
 * Serious performance section for the template detail view.
 * `rows` may hold every measured row for the template — a range is rendered
 * only when the data genuinely supports it.
 */
export function PerformanceDetailSection({
  row,
  rows,
  className,
}: {
  row: TemplatePerformanceRow | null | undefined;
  rows?: TemplatePerformanceRow[];
  className?: string;
}) {
  if (!row || !hasMetrics(row)) return null;

  const verified = isVerified(row);
  const demo = isDemo(row);
  const roas = formatRoas(row.roas);
  const cvr = row.purchase_cvr_lpv ?? computeCvrFromCounts(row);
  const range = computePerformanceRange(rows?.length ? rows : [row]);
  const attribution = formatAttributionWindow(row);
  const verifiedAt = verified ? formatVerifiedDate(row.last_verified_at) : null;

  const metrics: Array<{ label: string; value: string }> = [];
  const spend = formatSpend(row.spend);
  if (spend) metrics.push({ label: "Spend tested", value: spend });
  const revenue = formatRevenue(row.revenue);
  if (revenue) metrics.push({ label: "Purchase value", value: revenue });
  const cvrLabel = formatCvr(cvr);
  if (cvrLabel) metrics.push({ label: "Purchase CVR (per landing page view)", value: cvrLabel });
  const aov = formatAov(row.aov);
  if (aov) metrics.push({ label: "AOV", value: aov });
  const cpa = formatCpa(row.cpa);
  if (cpa) metrics.push({ label: "CPA", value: cpa });
  if (row.purchases !== null && row.purchases !== undefined)
    metrics.push({ label: "Purchases", value: row.purchases.toLocaleString("en-US") });
  if (row.campaign_count !== null && row.campaign_count !== undefined)
    metrics.push({ label: "Campaigns measured", value: row.campaign_count.toLocaleString("en-US") });
  if (attribution) metrics.push({ label: "Attribution window", value: attribution });
  if (verifiedAt) metrics.push({ label: "Last verified", value: verifiedAt });

  return (
    <section className={cn("rounded-2xl border border-white/10 bg-black/35 p-4", className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-400">
          Performance
        </p>
        {demo ? (
          <span className="inline-flex items-center rounded-full border border-amber-300/40 bg-amber-300/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-amber-100">
            Demo data
          </span>
        ) : verified ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-cyan-300/40 bg-cyan-300/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-cyan-100">
            <BadgeCheck className="h-3 w-3" />
            Verified performance
          </span>
        ) : (
          <PerformanceProvenance row={row} />
        )}
      </div>

      {roas ? (
        <div className="mt-3 flex items-baseline gap-2">
          <span className="font-display text-4xl font-bold leading-none text-lime-300">{roas}</span>
          <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
            ROAS
          </span>
        </div>
      ) : null}

      <PerformanceBadges row={row} className="mt-3" />

      {metrics.length ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {metrics.map((metric) => (
            <DetailMetric key={metric.label} label={metric.label} value={metric.value} />
          ))}
        </div>
      ) : null}

      {range ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <DetailMetric label="Best observed ROAS" value={formatRoas(range.bestRoas) ?? "—"} />
          <DetailMetric label="Median observed ROAS" value={formatRoas(range.medianRoas) ?? "—"} />
          <DetailMetric
            label="Campaigns measured"
            value={range.campaignsMeasured.toLocaleString("en-US")}
          />
        </div>
      ) : null}

      <PerformanceDisclaimer className="mt-3" />
    </section>
  );
}
