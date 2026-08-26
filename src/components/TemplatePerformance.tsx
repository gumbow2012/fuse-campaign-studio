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
  const cvr = formatCvr(row.purchase_cvr_lpv);
  const aov = formatAov(row.aov);
  const spend = formatSpend(row.spend);

  return (
    <div
      className={cn(
        "rounded-2xl border border-white/10 bg-black/40 px-3 py-2.5 backdrop-blur",
        className,
      )}
    >
      <div className="flex items-end justify-between gap-3">
        {roas ? (
          <div className="flex items-baseline gap-1.5">
            <span
              className={cn(
                "font-display font-bold leading-none text-lime-300",
                compact ? "text-2xl" : "text-3xl",
              )}
            >
              {roas}
            </span>
            <span className="text-[9px] font-semibold uppercase tracking-[0.2em] text-slate-400">
              ROAS
            </span>
          </div>
        ) : (
          <span className="text-[9px] font-semibold uppercase tracking-[0.2em] text-slate-400">
            Performance
          </span>
        )}
        <PerformanceProvenance row={row} />
      </div>

      {(cvr || aov) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] uppercase tracking-[0.14em] text-slate-300">
          {cvr && (
            <span>
              Purchase CVR (LPV) <span className="text-white">{cvr}</span>
            </span>
          )}
          {aov && (
            <span>
              AOV <span className="text-white">{aov}</span>
            </span>
          )}
        </div>
      )}

      {spend && (
        <p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-slate-500">
          Tested on {spend} spend
        </p>
      )}
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
