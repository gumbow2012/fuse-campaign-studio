import { Link } from "react-router-dom";
import { Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useAnimatedNumber } from "@/hooks/useAnimatedNumber";
import { PLAN_LADDER } from "@/lib/planLadder";

/** Compact horizontal "YOUR MEMBERSHIP" strip placed above plan cards. */
export default function CompactAccountBar({ onManage }: { onManage?: () => void }) {
  const { profile } = useAuth();
  const planKey = profile?.plan ?? "free";
  const isActive = profile?.subscription_status === "active" || profile?.subscription_status === "trialing";
  const entry = PLAN_LADDER.find((plan) => plan.key === planKey);
  const planName = isActive && entry ? entry.name : "Free";
  const credits = Number(profile?.credits_balance ?? 0);
  const cycleCredits = Number(profile?.subscription_cycle_credits ?? 0);
  const animatedCredits = useAnimatedNumber(credits, 800);

  const progressPct = cycleCredits > 0 ? Math.min(100, Math.max(0, (credits / cycleCredits) * 100)) : 0;

  const renewalDate = profile?.subscription_period_end
    ? new Date(profile.subscription_period_end).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
      <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Your membership</span>
      <span className="font-display text-sm font-bold uppercase tracking-[0.14em] text-cyan-200">{planName}</span>

      {isActive && cycleCredits > 0 ? (
        <>
          <span className="hidden text-slate-600 sm:inline">·</span>
          <Link
            to="/membership?tab=usage"
            className="flex items-center gap-1.5 text-sm font-medium text-white hover:text-cyan-100"
          >
            <Zap className="h-3.5 w-3.5 text-cyan-300" />
            {animatedCredits.toLocaleString()} / {cycleCredits.toLocaleString()} credits
          </Link>
          <div
            className="hidden h-1.5 w-24 items-center rounded-full bg-white/10 sm:flex"
            aria-hidden="true"
          >
            <div
              className="h-full rounded-full bg-cyan-300 transition-all duration-700 ease-out"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          {renewalDate ? (
            <>
              <span className="hidden text-slate-600 sm:inline">·</span>
              <span className="text-xs text-slate-400">Renews {renewalDate}</span>
            </>
          ) : null}
        </>
      ) : (
        <>
          <span className="hidden text-slate-600 sm:inline">·</span>
          <span className="text-sm text-slate-400">
            {credits > 0
              ? `${animatedCredits.toLocaleString()} credits · one-time welcome grant`
              : "0 credits · no monthly refill"}
          </span>
        </>
      )}

      <div className="ml-auto flex gap-2">
        {onManage ? (
          <Button
            size="sm"
            onClick={onManage}
            className="rounded-full bg-cyan-300 text-xs font-semibold text-slate-950 hover:bg-cyan-200"
          >
            {isActive ? "Manage" : "Upgrade"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

