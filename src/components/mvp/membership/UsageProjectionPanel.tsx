import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { loadCreditUsage, type CreditUsageSummary } from "@/services/creditUsage";
import { STRIPE_TIERS, type StripeTierKey } from "@/lib/stripe-config";

const TYPE_LABEL: Record<string, string> = {
  run_template: "Template runs",
  rerun_step: "Rerun steps",
};

const fmt = (n: number) => n.toLocaleString();

interface Props {
  onNavigateTab?: (tab: "upgrade" | "credits") => void;
}

export default function UsageProjectionPanel({ onNavigateTab }: Props) {
  const { user, profile } = useAuth();
  const [summary, setSummary] = useState<CreditUsageSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    loadCreditUsage(user.id, profile?.subscription_period_start ?? null)
      .then((result) => {
        if (!cancelled) setSummary(result);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load usage.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id, profile?.subscription_period_start]);

  const planKey = (profile?.plan ?? "free") as StripeTierKey | "free";
  const planAllotment =
    profile?.subscription_cycle_credits && profile.subscription_cycle_credits > 0
      ? profile.subscription_cycle_credits
      : planKey !== "free" && planKey in STRIPE_TIERS
        ? STRIPE_TIERS[planKey as StripeTierKey].monthlyCredits
        : null;

  const used = summary?.creditsUsed ?? 0;
  const pct = planAllotment ? Math.min(100, (used / planAllotment) * 100) : null;
  const projected = summary?.projectedCredits ?? null;
  const shortfall = planAllotment && projected ? projected - planAllotment : null;

  return (
    <section className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-6 md:p-8">
      <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
        {summary?.cycleSource === "subscription" ? "This billing cycle" : "Last 30 days"}
      </p>
      <h2 className="mt-2 font-display text-2xl font-semibold tracking-[-0.03em] text-white">
        {loading ? "Loading usage…" : `${fmt(used)} credits used`}
      </h2>

      {error ? (
        <p className="mt-3 text-sm text-rose-300">{error}</p>
      ) : loading ? (
        <div className="mt-5 h-2 w-full animate-pulse rounded-full bg-white/10" />
      ) : (
        <>
          {planAllotment ? (
            <div className="mt-5">
              <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-cyan-300 transition-[width] duration-500 motion-reduce:transition-none"
                  style={{ width: `${pct ?? 0}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-slate-400">
                {fmt(used)} of {fmt(planAllotment)} plan credits ({Math.round(pct ?? 0)}%)
              </p>
            </div>
          ) : (
            <p className="mt-4 text-xs text-slate-400">
              No active plan allotment on file, so there is nothing to measure this against.
            </p>
          )}

          {/* Breakdown — only dimensions the ledger actually records (type + template_id). */}
          <div className="mt-8 grid gap-6 md:grid-cols-2">
            <div>
              <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">By activity type</p>
              {summary && summary.byType.length > 0 ? (
                <ul className="mt-3 space-y-2 text-sm text-slate-300">
                  {summary.byType.map((row) => (
                    <li key={row.type} className="flex items-baseline justify-between gap-4">
                      <span>{TYPE_LABEL[row.type] ?? row.type}</span>
                      <span className="text-white">
                        {fmt(row.credits)} <span className="text-slate-500">({row.count})</span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-slate-500">No credit spend recorded yet.</p>
              )}
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Top templates</p>
              {summary && summary.byTemplate.length > 0 ? (
                <ul className="mt-3 space-y-2 text-sm text-slate-300">
                  {summary.byTemplate.map((row) => (
                    <li key={row.templateId} className="flex items-baseline justify-between gap-4">
                      <span className="truncate">{row.name}</span>
                      <span className="text-white">
                        {fmt(row.credits)} <span className="text-slate-500">({row.count})</span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-slate-500">Nothing attributed to a template yet.</p>
              )}
            </div>
          </div>

          {/* Projection */}
          <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.02] p-5">
            <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Projection</p>
            {projected === null ? (
              <p className="mt-2 text-sm text-slate-300">
                Not enough data yet — we need at least two days of activity in the current period before projecting a
                pace.
              </p>
            ) : (
              <>
                <p className="mt-2 text-sm text-slate-300">
                  At your current pace you're projected to use{" "}
                  <span className="font-semibold text-white">~{fmt(projected)}</span> credits by the end of this{" "}
                  {summary?.cycleSource === "subscription" ? "cycle" : "30-day window"} (approx).
                </p>
                {planAllotment && shortfall !== null && shortfall > 0 ? (
                  <div className="mt-4 space-y-3">
                    <p className="text-sm text-amber-200">
                      That is about {fmt(shortfall)} credits over your {fmt(planAllotment)}-credit allotment.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        onClick={() => onNavigateTab?.("upgrade")}
                        className="rounded-full bg-cyan-300 text-slate-950 hover:bg-cyan-200"
                      >
                        Upgrade
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => onNavigateTab?.("credits")}
                        className="rounded-full border-white/15 bg-white/5 text-foreground hover:bg-white/10"
                      >
                        Buy credits
                      </Button>
                    </div>
                  </div>
                ) : planAllotment ? (
                  <p className="mt-3 text-sm text-slate-400">
                    That stays inside your {fmt(planAllotment)}-credit allotment.
                  </p>
                ) : null}
              </>
            )}
          </div>
        </>
      )}
    </section>
  );
}
