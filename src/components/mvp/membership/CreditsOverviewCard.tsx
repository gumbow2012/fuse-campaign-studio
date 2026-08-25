import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";

const ACTIVE_STATUSES = ["active", "trialing"];

export default function CreditsOverviewCard({ buyCreditsHref = "/pricing" }: { buyCreditsHref?: string }) {
  const { profile } = useAuth();
  const isActive = ACTIVE_STATUSES.includes(profile?.subscription_status ?? "");

  return (
    <section className="rounded-[2rem] border border-white/10 bg-slate-950/75 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl">
      <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Credits</p>
      <div className="mt-5">
        <p className="font-display text-5xl font-black tracking-tight text-white">
          {profile?.credits_balance.toLocaleString() ?? "0"}
        </p>
        <p className="mt-1 text-sm text-slate-400">credits available</p>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Included this cycle</p>
          <p className="mt-1 text-xl font-semibold text-white">
            {profile?.subscription_cycle_credits?.toLocaleString() ?? "—"}
          </p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Plan</p>
          <p className="mt-1 text-xl font-semibold capitalize text-white">
            {profile?.plan && isActive ? profile.plan : "No active plan"}
          </p>
          {isActive && profile?.subscription_status ? (
            <p className="mt-1 text-xs capitalize text-slate-400">{profile.subscription_status}</p>
          ) : null}
        </div>
      </div>

      {profile?.subscription_period_end && isActive ? (
        <p className="mt-5 text-sm text-slate-400">
          Renews{" "}
          {new Date(profile.subscription_period_end).toLocaleDateString(undefined, {
            month: "long",
            day: "numeric",
            year: "numeric",
          })}
        </p>
      ) : (
        <p className="mt-5 text-sm text-slate-400">Credits come with a membership or one-time top-ups.</p>
      )}

      <Button asChild className="mt-6 rounded-full bg-cyan-300 text-slate-950 hover:bg-cyan-200">
        <Link to={buyCreditsHref}>Buy more credits</Link>
      </Button>
    </section>
  );
}
