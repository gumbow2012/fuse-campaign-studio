import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/contexts/AuthContext";

const ACTIVE_STATUSES = ["active", "trialing"];

function initials(source: string) {
  return source
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function AccountHeader() {
  const { user, profile, roles } = useAuth();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const email = profile?.email ?? user?.email ?? "";
  const displayName = profile?.name || email.split("@")[0] || "Account";
  const avatarUrl = user?.user_metadata?.avatar_url as string | undefined;

  const isActivePlan = ACTIVE_STATUSES.includes(profile?.subscription_status ?? "");
  const planLabel = profile?.plan && isActivePlan ? profile.plan : null;

  const balance = profile?.credits_balance ?? 0;
  const cycleCredits = profile?.subscription_cycle_credits ?? 0;
  const hasCycle = cycleCredits > 0;
  const ratio = hasCycle ? Math.min(1, Math.max(0, balance / cycleCredits)) : 0;

  const chips: string[] = [];
  if (roles.includes("admin")) chips.push("Admin");
  if (roles.includes("dev")) chips.push("Dev");
  if (roles.includes("creator")) chips.push("Creator");
  if (planLabel) chips.push(`${planLabel} plan`);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-xl sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="flex min-w-0 items-center gap-4">
          <Avatar className="h-14 w-14 rounded-2xl border border-white/10">
            <AvatarImage src={avatarUrl || ""} alt={displayName} />
            <AvatarFallback className="rounded-2xl bg-cyan-200/10 font-display text-base font-bold text-cyan-300">
              {initials(displayName)}
            </AvatarFallback>
          </Avatar>

          <div className="min-w-0">
            <p className="truncate font-display text-2xl font-bold tracking-tight text-white">{displayName}</p>
            <p className="truncate text-sm text-slate-400">{email || "No email available"}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {chips.length > 0 ? (
                chips.map((chip) => (
                  <span
                    key={chip}
                    className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-2 py-0.5 font-display text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-200"
                  >
                    {chip}
                  </span>
                ))
              ) : (
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                  No active plan
                </span>
              )}
            </div>
          </div>
        </div>

        <Button asChild className="rounded-full bg-cyan-300 text-slate-950 hover:bg-cyan-200">
          <Link to="/pricing">Manage plan</Link>
        </Button>
      </div>

      <div className="mt-6">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <p className="font-display text-3xl font-black tracking-tight text-white">
            {balance.toLocaleString()}
            <span className="ml-2 font-sans text-xs font-medium uppercase tracking-[0.2em] text-slate-400">credits</span>
          </p>
          {profile?.subscription_period_end && isActivePlan ? (
            <p className="text-xs text-slate-400">
              Resets{" "}
              {new Date(profile.subscription_period_end).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </p>
          ) : null}
        </div>

        <div className="mt-3 h-2 overflow-hidden rounded-full border border-white/10 bg-white/[0.04]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-electric-blue to-electric-cyan transition-[width] duration-1000 ease-out"
            style={{ width: mounted ? `${hasCycle ? ratio * 100 : balance > 0 ? 100 : 0}%` : "0%" }}
          />
        </div>

        <p className="mt-2 text-xs text-slate-400">
          {hasCycle
            ? `${balance.toLocaleString()} credits · monthly allotment ${cycleCredits.toLocaleString()}`
            : `${balance.toLocaleString()} credits available`}
        </p>
      </div>
    </div>
  );
}
