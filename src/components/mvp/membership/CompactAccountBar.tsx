import { Link } from "react-router-dom";
import { Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { PLAN_LADDER } from "@/lib/planLadder";

/** Compact "your plan" bar — replaces the tall current-state column. */
export default function CompactAccountBar({ onManage }: { onManage?: () => void }) {
  const { profile } = useAuth();
  const planKey = profile?.plan ?? "free";
  const isActive = profile?.subscription_status === "active" || profile?.subscription_status === "trialing";
  const entry = PLAN_LADDER.find((plan) => plan.key === planKey);
  const planName = isActive && entry ? entry.name : "Free";
  const credits = Number(profile?.credits_balance ?? 0);

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
      <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Your plan</span>
      <span className="font-display text-sm font-bold uppercase tracking-[0.14em] text-cyan-200">{planName}</span>
      <span className="hidden text-slate-600 sm:inline">·</span>
      <span className="flex items-center gap-1 text-sm font-medium text-white">
        <Zap className="h-3.5 w-3.5 text-cyan-300" />
        {credits.toLocaleString()} credits
      </span>
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
        <Button
          asChild
          size="sm"
          variant="outline"
          className="rounded-full border-white/15 bg-white/5 text-xs text-foreground hover:bg-white/10"
        >
          <Link to="/account">Account</Link>
        </Button>
      </div>
    </div>
  );
}
