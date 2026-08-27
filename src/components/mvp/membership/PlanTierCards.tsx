import { useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import GatedPlanDialog from "@/components/mvp/membership/GatedPlanDialog";
import {
  ANNUAL_SAVINGS_LABEL,
  PLAN_LADDER,
  isCheckoutLive,
  planPrice,
  type PlanLadderEntry,
} from "@/lib/planLadder";
import { approxOutputLabel } from "@/lib/creditOutputs";
import type { STRIPE_TIERS } from "@/lib/stripe-config";

export type BillingCycle = "monthly" | "annual";

type Props = {
  billingCycle: BillingCycle;
  onBillingCycleChange: (cycle: BillingCycle) => void;
  loading: string | null;
  isAdmin: boolean;
  currentPlan: string;
  subscriptionStatus: string | null | undefined;
  onCheckout: (tierKey: keyof typeof STRIPE_TIERS) => void;
  /** When true, featured plans are rendered in a wider, premium 3-column composition. */
  hero?: boolean;
};

function PlanCard({
  entry,
  billingCycle,
  isCurrent,
  loading,
  isAdmin,
  compact,
  wide,
  className,
  onSelect,
}: {
  entry: PlanLadderEntry;
  billingCycle: BillingCycle;
  isCurrent: boolean;
  loading: string | null;
  isAdmin: boolean;
  compact?: boolean;
  wide?: boolean;
  className?: string;
  onSelect: () => void;
}) {
  const Icon = entry.icon;
  const price = planPrice(entry, billingCycle);
  const live = isCheckoutLive(entry, billingCycle);
  const approx = entry.monthlyCredits ? approxOutputLabel(entry.monthlyCredits) : null;

  return (
    <article
      className={`relative overflow-hidden rounded-2xl border backdrop-blur-sm transition-transform duration-200 hover:-translate-y-1 motion-reduce:transform-none motion-reduce:transition-none ${
        compact ? "p-5" : wide ? "p-7" : "p-6"
      } ${
        isCurrent
          ? "border-cyan-300/45 bg-cyan-300/[0.08]"
          : entry.recommended
            ? "border-lime-300/35 bg-white/[0.05] shadow-[0_0_50px_-14px_rgba(190,242,100,0.28)]"
            : "border-white/10 bg-white/[0.03]"
      } ${className ?? ""}`}
    >
      <span
        className={`absolute right-4 top-4 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${
          entry.recommended ? "bg-lime-300 text-slate-950" : "border border-white/15 bg-white/5 text-slate-200"
        }`}
      >
        {entry.badge}
      </span>

      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.04]">
          <Icon className="h-4 w-4 text-cyan-100" />
        </div>
        <p className={`font-display font-semibold text-white ${compact ? "text-lg" : wide ? "text-2xl" : "text-xl"}`}>
          {entry.name}
        </p>
      </div>

      <p className="mt-1 text-[11px] uppercase tracking-[0.2em] text-cyan-100/80">{entry.tagline}</p>
      {compact ? null : <p className="mt-3 text-sm leading-6 text-slate-300">{entry.description}</p>}

      <div className="mt-5">
        <p
          className={`font-display font-black tracking-[-0.04em] text-white ${
            compact ? "text-3xl" : wide ? "text-5xl" : "text-4xl"
          }`}
        >
          ${price}
          <span className="ml-1 text-sm font-medium text-slate-400">/ month</span>
        </p>
        {billingCycle === "annual" && price > 0 ? (
          <p className="mt-1 inline-flex items-center rounded-full bg-violet-400/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-violet-200">
            {ANNUAL_SAVINGS_LABEL} · billed annually
          </p>
        ) : null}
        <p className="mt-2 text-sm text-slate-300">{entry.goodFor}</p>
      </div>

      {isCurrent ? (
        <p className="mt-3 inline-flex items-center rounded-full border border-cyan-300/20 bg-cyan-300/10 px-2.5 py-1 text-xs font-medium text-cyan-50">
          Your plan
        </p>
      ) : null}

      <ul className={`mt-5 text-sm text-slate-200 ${compact ? "space-y-2.5" : wide ? "space-y-3.5" : "space-y-3"}`}>
        {entry.benefits.slice(0, compact ? 4 : 6).map((benefit) => (
          <li key={benefit} className="flex items-start gap-2">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-cyan-200" />
            <span>{benefit}</span>
          </li>
        ))}
      </ul>

      <Button
        onClick={onSelect}
        disabled={isAdmin || isCurrent || !!loading}
        className={`mt-6 w-full rounded-full font-semibold ${
          wide ? "h-12 text-sm" : ""
        } ${
          isCurrent || isAdmin
            ? "bg-white/10 text-white hover:bg-white/10"
            : entry.recommended
              ? "bg-lime-300 text-slate-950 hover:bg-lime-200"
              : "bg-cyan-300 text-slate-950 hover:bg-cyan-200"
        }`}
      >
        {isAdmin
          ? "Admin access"
          : isCurrent
            ? "Current plan"
            : live && loading === entry.stripeTierKey
              ? "Loading..."
              : entry.ctaLabel}
        {!isCurrent && !isAdmin ? <ArrowRight className="h-4 w-4" /> : null}
      </Button>

      <p className="mt-3 text-xs font-medium text-slate-300">{entry.creditsLabel}</p>
      {approx ? <p className="mt-1 text-[10px] text-slate-500">{approx}</p> : null}
    </article>
  );
}

export default function PlanTierCards({
  billingCycle,
  onBillingCycleChange,
  loading,
  isAdmin,
  currentPlan,
  subscriptionStatus,
  onCheckout,
  hero = false,
}: Props) {
  const navigate = useNavigate();
  const [showAll, setShowAll] = useState(false);
  const [gatedPlan, setGatedPlan] = useState<PlanLadderEntry | null>(null);

  const hasActivePaidPlan =
    currentPlan !== "free" && (subscriptionStatus === "active" || subscriptionStatus === "trialing");

  const visible = showAll ? PLAN_LADDER : PLAN_LADDER.filter((entry) => entry.featured);

  const handleSelect = (entry: PlanLadderEntry) => {
    if (isAdmin) return;
    if (entry.checkout === "none") {
      navigate("/app/templates");
      return;
    }
    if (isCheckoutLive(entry, billingCycle) && entry.stripeTierKey) {
      onCheckout(entry.stripeTierKey);
      return;
    }
    // No Stripe price for this plan/interval — graceful early-access action only.
    setGatedPlan(entry);
  };

  const orderClass = (entry: PlanLadderEntry) => {
    if (!hero || showAll) return "";
    if (entry.recommended) return "order-1 md:order-2";
    if (entry.key === "starter") return "order-2 md:order-1";
    if (entry.key === "studio") return "order-3";
    return "";
  };

  return (
    <div className={`space-y-5 ${hero ? "max-w-6xl mx-auto" : ""}`}>
      {/* Billing interval */}
      <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-3">
        <div className="inline-flex rounded-full border border-white/10 bg-white/[0.03] p-1">
          {(["monthly", "annual"] as const).map((cycle) => (
            <button
              key={cycle}
              type="button"
              onClick={() => onBillingCycleChange(cycle)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors motion-reduce:transition-none ${
                billingCycle === cycle ? "bg-cyan-300 text-slate-950" : "text-slate-300 hover:text-white"
              }`}
            >
              {cycle === "monthly" ? "Monthly" : "Annual"}
            </button>
          ))}
        </div>
        <span className="text-xs font-bold uppercase tracking-[0.16em] text-violet-200">{ANNUAL_SAVINGS_LABEL} annually</span>
      </div>

      <section
        className={`grid gap-4 ${
          showAll ? "sm:grid-cols-2 xl:grid-cols-3" : hero ? "md:grid-cols-3 gap-5" : "md:grid-cols-3"
        }`}
      >
        {visible.map((entry) => (
          <PlanCard
            key={entry.key}
            entry={entry}
            billingCycle={billingCycle}
            compact={showAll}
            wide={hero && !showAll}
            isCurrent={
              entry.stripeTierKey
                ? currentPlan === entry.stripeTierKey && hasActivePaidPlan
                : !!entry.isFreeState && !hasActivePaidPlan
            }
            loading={loading}
            isAdmin={isAdmin}
            onSelect={() => handleSelect(entry)}
            className={orderClass(entry)}
          />
        ))}
      </section>

      <Button
        variant="outline"
        onClick={() => setShowAll((open) => !open)}
        className="rounded-full border-white/15 bg-white/5 text-foreground hover:bg-white/10"
      >
        {showAll ? "Show featured plans" : "View all plans — incl. Free & Capsule"}
      </Button>

      <GatedPlanDialog
        open={!!gatedPlan}
        onOpenChange={(open) => !open && setGatedPlan(null)}
        planName={gatedPlan?.name ?? null}
        interval={billingCycle}
      />
    </div>
  );
}
