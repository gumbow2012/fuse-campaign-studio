import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import CreditPackDialog from "@/components/mvp/CreditPackDialog";
import { cn } from "@/lib/utils";

const LOW_CREDITS = 500;
const CRITICAL_CREDITS = 100;

/** Compact mobile balance ("2.8K"), full desktop balance ("2,840"). */
function compactBalance(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return value.toLocaleString();
}

/**
 * Truthful campaign-run estimate: median credits-per-run across live templates.
 * Returns null when we cannot derive it, so the copy is simply omitted.
 */
function useApproxCampaignRuns(balance: number, enabled: boolean) {
  const { data } = useQuery({
    queryKey: ["template-run-cost-median"],
    enabled,
    staleTime: 30 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("templates")
        .select("estimated_credits_per_run")
        .eq("is_active", true);
      if (error) throw error;

      const costs = (data ?? [])
        .map((row) => Number(row.estimated_credits_per_run))
        .filter((cost) => Number.isFinite(cost) && cost > 0)
        .sort((a, b) => a - b);
      if (costs.length === 0) return null;
      return costs[Math.floor(costs.length / 2)];
    },
  });

  if (!data || data <= 0) return null;
  return Math.floor(balance / data);
}

export function CreditChip() {
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [topUpOpen, setTopUpOpen] = useState(false);
  const location = useLocation();
  const balance = Number(profile?.credits_balance ?? 0);
  const approxRuns = useApproxCampaignRuns(balance, open);

  useEffect(() => {
    setOpen(false);
  }, [location.pathname, location.search]);

  const isLow = balance < LOW_CREDITS;
  const isCritical = balance < CRITICAL_CREDITS;

  /* Low balance stays subtle (soft amber), never alarming. */
  const chipTone = isLow
    ? "border-amber-300/25 bg-amber-300/[0.07] text-amber-100"
    : "border-white/10 bg-white/[0.04] text-cyan-200";

  const isActivePlan =
    profile?.subscription_status === "active" || profile?.subscription_status === "trialing";
  const cycleCredits = Number(profile?.subscription_cycle_credits ?? 0);
  const hasAllowance = isActivePlan && cycleCredits > 0;
  const ratio = hasAllowance ? Math.min(1, Math.max(0, balance / cycleCredits)) : balance > 0 ? 1 : 0;

  const periodEnd = profile?.subscription_period_end ? new Date(profile.subscription_period_end) : null;
  const resetLabel =
    hasAllowance && periodEnd && !Number.isNaN(periodEnd.getTime())
      ? periodEnd.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
      : null;

  /**
   * ACCOUNT-FIRST: a signed-in user with no paid plan and no credits sees an
   * UPGRADE chip instead of a bare "0". Paid users and legacy free users with a
   * real balance keep their balance display.
   */
  const planlessAndEmpty = !isActivePlan && balance <= 0;
  if (planlessAndEmpty) {
    return (
      <Link
        to="/pricing"
        aria-label="Upgrade — buy credits to generate"
        className="inline-flex h-9 items-center gap-1.5 rounded-full border border-cyan-300/40 bg-cyan-300/10 px-3 font-sans text-xs font-semibold uppercase tracking-[0.14em] text-cyan-100 backdrop-blur-sm transition-colors duration-200 hover:bg-cyan-300/20 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/80 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <span aria-hidden="true">✦</span>
        Upgrade
      </Link>
    );
  }

  return (

    <>
      {/* Rendered outside the popover so closing the popover cannot unmount it. */}
      <CreditPackDialog open={topUpOpen} onOpenChange={setTopUpOpen} />
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Credits: ${balance.toLocaleString()} remaining`}
          aria-haspopup="dialog"
          aria-expanded={open}
          title="Credits"
          className={cn(
            "inline-flex h-9 items-center gap-1.5 rounded-full border px-3 font-sans text-xs font-semibold backdrop-blur-sm transition-colors duration-200 hover:brightness-110 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/80 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            chipTone
          )}
        >
          <span aria-hidden="true">✦</span>
          <span className="sm:hidden">{compactBalance(balance)}</span>
          <span className="hidden sm:inline">{balance.toLocaleString()}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-64 rounded-2xl border-white/10 bg-[#0B1120]/95 p-4 font-sans shadow-2xl backdrop-blur-xl"
      >
        <div className="space-y-3">
          <div>
            <p className="font-display text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
              Credits
            </p>
            <p className="mt-1 text-2xl font-bold text-foreground">
              {balance.toLocaleString()}
              <span className="ml-1.5 text-xs font-medium text-muted-foreground">remaining</span>
            </p>
          </div>

          <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
            <div
              className={cn(
                "h-full rounded-full transition-[width] duration-700 ease-out",
                isLow ? "bg-amber-300/80" : "bg-gradient-to-r from-electric-blue to-electric-cyan"
              )}
              style={{ width: `${ratio * 100}%` }}
            />
          </div>

          {hasAllowance ? (
            <div className="space-y-0.5 text-xs text-muted-foreground">
              <p>Monthly allowance: {cycleCredits.toLocaleString()}</p>
              {resetLabel ? <p>Resets {resetLabel}</p> : null}
            </div>
          ) : null}

          {isLow ? (
            <Link
              to="/membership?tab=upgrade"
              onClick={() => setOpen(false)}
              className="block rounded-xl border border-amber-300/25 bg-amber-300/[0.07] px-3 py-2 text-xs text-amber-100 transition-colors hover:bg-amber-300/[0.12]"
            >
              {isCritical ? "Running low on credits" : "Credits are getting low"} — see plans
            </Link>
          ) : null}

          {approxRuns !== null && approxRuns > 0 ? (
            <p className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-foreground">
              Approximately enough for {approxRuns.toLocaleString()} campaign run
              {approxRuns === 1 ? "" : "s"}
            </p>
          ) : null}

          <Button
            size="sm"
            onClick={() => {
              setOpen(false);
              setTopUpOpen(true);
            }}
            className="w-full rounded-full bg-cyan-300 font-sans text-xs font-bold uppercase tracking-[0.1em] text-slate-950 hover:bg-cyan-200"
          >
            Top up credits
          </Button>

          <Link
            to="/membership?tab=usage"
            onClick={() => setOpen(false)}
            className="block text-center text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            View usage
          </Link>
        </div>
      </PopoverContent>
    </Popover>
    </>
  );
}
