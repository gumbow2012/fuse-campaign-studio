import { useState } from "react";
import { ArrowRight, Check, Sparkle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import GatedPlanDialog from "@/components/mvp/membership/GatedPlanDialog";
import {
  ANNUAL_SAVINGS_LABEL,
  PLAN_LADDER,
  isCheckoutLive,
  type PlanAccentKey,
  type PlanLadderEntry,
} from "@/lib/planLadder";
import { computePlanDiscount, formatMoney, savingsLabel } from "@/lib/planDiscount";
import { approxCampaignRangeLabel, approxImageGenerationsLabel } from "@/lib/creditOutputs";
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
  /** When true, featured plans are rendered in a wider, premium composition. */
  hero?: boolean;
};

/** One controlled accent per plan — dark FUSE system, never a rainbow page. */
const ACCENTS: Record<PlanAccentKey, {
  border: string;
  glow: string;
  badge: string;
  cta: string;
  metric: string;
  icon: string;
  tagline: string;
}> = {
  graphite: {
    border: "border-white/10",
    glow: "",
    badge: "border border-white/15 bg-white/[0.06] text-slate-200",
    cta: "bg-white/10 text-white hover:bg-white/15",
    metric: "text-slate-200",
    icon: "text-slate-300",
    tagline: "text-slate-400",
  },
  cyan: {
    border: "border-cyan-300/30",
    glow: "shadow-[0_0_50px_-18px_rgba(103,232,249,0.35)]",
    badge: "bg-cyan-300 text-slate-950",
    cta: "bg-cyan-300 text-slate-950 hover:bg-cyan-200",
    metric: "text-cyan-200",
    icon: "text-cyan-200",
    tagline: "text-cyan-100/80",
  },
  sky: {
    border: "border-sky-300/25",
    glow: "shadow-[0_0_50px_-20px_rgba(125,211,252,0.28)]",
    badge: "bg-sky-300 text-slate-950",
    cta: "bg-sky-300 text-slate-950 hover:bg-sky-200",
    metric: "text-sky-200",
    icon: "text-sky-200",
    tagline: "text-sky-100/80",
  },
  violet: {
    border: "border-violet-400/35",
    glow: "shadow-[0_0_55px_-16px_rgba(167,139,250,0.4)]",
    badge: "bg-violet-400 text-slate-950",
    cta: "bg-violet-400 text-slate-950 hover:bg-violet-300",
    metric: "text-violet-200",
    icon: "text-violet-200",
    tagline: "text-violet-200/80",
  },
  lime: {
    border: "border-lime-300/35",
    glow: "shadow-[0_0_55px_-16px_rgba(190,242,100,0.35)]",
    badge: "bg-lime-300 text-slate-950",
    cta: "bg-lime-300 text-slate-950 hover:bg-lime-200",
    metric: "text-lime-200",
    icon: "text-lime-200",
    tagline: "text-lime-200/80",
  },
  magenta: {
    border: "border-fuchsia-400/30",
    glow: "shadow-[0_0_55px_-18px_rgba(232,121,249,0.32)]",
    badge: "bg-fuchsia-400 text-slate-950",
    cta: "bg-fuchsia-400 text-slate-950 hover:bg-fuchsia-300",
    metric: "text-fuchsia-200",
    icon: "text-fuchsia-200",
    tagline: "text-fuchsia-200/80",
  },
  royal: {
    border: "border-blue-500/35",
    glow: "shadow-[0_0_55px_-18px_rgba(59,130,246,0.35)]",
    badge: "bg-blue-500 text-white",
    cta: "bg-blue-500 text-white hover:bg-blue-400",
    metric: "text-blue-200",
    icon: "text-blue-200",
    tagline: "text-blue-200/80",
  },
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
  const accent = ACCENTS[entry.accent];
  const live = isCheckoutLive(entry, billingCycle);

  // Every crossed-out price, % OFF badge and savings line comes from here.
  const discount = computePlanDiscount(entry, billingCycle);
  const showDiscount = discount.hasDiscount && discount.monthlyPrice > 0;
  const saveLine = showDiscount ? savingsLabel(discount) : null;

  const credits = entry.monthlyCredits ?? 0;
  const campaignRange = approxCampaignRangeLabel(credits);
  const imageEquivalent = approxImageGenerationsLabel(credits);

  return (
    <article
      className={`relative flex flex-col overflow-hidden rounded-2xl border backdrop-blur-sm transition-transform duration-200 hover:-translate-y-1 motion-reduce:transform-none motion-reduce:transition-none ${
        compact ? "p-5" : wide ? "p-6 md:p-7" : "p-6"
      } ${accent.border} ${entry.recommendation ? accent.glow : ""} bg-white/[0.03] ${
        isCurrent ? "ring-1 ring-cyan-300/40" : ""
      } ${className ?? ""}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
            entry.recommendation ? accent.badge : "border border-white/15 bg-white/5 text-slate-200"
          }`}
        >
          {entry.recommendation ?? entry.badge}
        </span>
        {showDiscount ? (
          <span className="rounded-full bg-rose-500 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-white">
            {discount.percentOff}% OFF
          </span>
        ) : null}
      </div>

      <div className="mt-4 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.04]">
          <Icon className={`h-4 w-4 ${accent.icon}`} />
        </div>
        <p className={`font-display font-semibold text-white ${compact ? "text-lg" : wide ? "text-2xl" : "text-xl"}`}>
          {entry.name}
        </p>
      </div>

      <p className={`mt-1 text-[11px] uppercase tracking-[0.2em] ${accent.tagline}`}>{entry.tagline}</p>
      {compact ? null : <p className="mt-3 text-sm leading-6 text-slate-300">{entry.description}</p>}

      {/* Price treatment — monthly is the undiscounted reference. */}
      <div className="mt-5">
        {showDiscount ? (
          <p className="text-sm font-semibold text-rose-400/90 line-through">
            {formatMoney(discount.monthlyPrice)}
          </p>
        ) : null}
        <p
          className={`font-display font-black tracking-[-0.04em] text-white ${
            compact ? "text-3xl" : wide ? "text-5xl" : "text-4xl"
          }`}
        >
          {formatMoney(discount.equivalentMonthly)}
          <span className="ml-1 text-sm font-medium text-slate-400">/month</span>
        </p>
        {billingCycle === "annual" && discount.actualPeriodPrice > 0 ? (
          <p className="mt-1 text-xs text-slate-400">
            billed annually ({formatMoney(discount.actualPeriodPrice)}/yr)
          </p>
        ) : null}
        {entry.isFreeState ? (
          <p className="mt-1 text-xs text-slate-400">$0 · 100 welcome credits</p>
        ) : null}
        <p className="mt-2 text-sm text-slate-300">{entry.goodFor}</p>
      </div>

      {/* Credit value block — real cost basis, ranges never a single model. */}
      <div className="mt-4 rounded-xl border border-white/10 bg-slate-950/50 px-3 py-3">
        <p className={`flex items-center gap-1.5 font-display text-sm font-bold ${accent.metric}`}>
          <Sparkle className="h-3.5 w-3.5" />
          {credits > 0 ? `${credits.toLocaleString()} credits/month` : entry.creditsLabel}
        </p>
        {campaignRange ? <p className="mt-1 text-xs text-slate-300">{campaignRange}</p> : null}
        {imageEquivalent ? <p className="mt-0.5 text-[11px] text-slate-500">{imageEquivalent}</p> : null}
      </div>

      {isCurrent ? (
        <p className="mt-3 inline-flex w-fit items-center rounded-full border border-cyan-300/20 bg-cyan-300/10 px-2.5 py-1 text-xs font-medium text-cyan-50">
          Your plan
        </p>
      ) : null}

      <ul className={`mt-5 flex-1 text-sm text-slate-200 ${compact ? "space-y-2.5" : "space-y-3"}`}>
        {entry.benefits.slice(0, compact ? 4 : 6).map((benefit) => (
          <li key={benefit} className="flex items-start gap-2">
            <Check className={`mt-0.5 h-4 w-4 shrink-0 ${accent.metric}`} />
            <span>{benefit}</span>
          </li>
        ))}
      </ul>

      <Button
        onClick={onSelect}
        disabled={isAdmin || isCurrent || !!loading}
        className={`mt-6 w-full rounded-full font-semibold ${wide ? "h-12 text-sm" : ""} ${
          isCurrent || isAdmin ? "bg-white/10 text-white hover:bg-white/10" : accent.cta
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

      {saveLine ? <p className="mt-3 text-xs font-semibold text-rose-300">{saveLine}</p> : null}
      {billingCycle === "annual" && entry.checkout === "live" ? (
        <p className="mt-2 text-[11px] leading-4 text-slate-500">
          Annual billing is opening soon — this joins the early-access list.
        </p>
      ) : null}
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
    // No Stripe price for this plan/interval (incl. every annual price) — gated flow only.
    setGatedPlan(entry);
  };

  return (
    <div className={`space-y-5 ${hero ? "max-w-6xl mx-auto" : ""}`}>
      {/* Billing period — monthly and annual only. */}
      <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-3">
        <div className="inline-flex w-full rounded-full border border-white/10 bg-white/[0.03] p-1 sm:w-auto">
          {(["monthly", "annual"] as const).map((cycle) => (
            <button
              key={cycle}
              type="button"
              onClick={() => onBillingCycleChange(cycle)}
              className={`flex-1 whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium transition-colors motion-reduce:transition-none sm:flex-none ${
                billingCycle === cycle ? "bg-cyan-300 text-slate-950" : "text-slate-300 hover:text-white"
              }`}
            >
              {cycle === "monthly" ? "Monthly" : `Annual · ${ANNUAL_SAVINGS_LABEL}`}
            </button>
          ))}
        </div>
      </div>

      <section
        className={`grid grid-cols-1 gap-4 ${
          showAll ? "sm:grid-cols-2 xl:grid-cols-3" : "sm:grid-cols-2 xl:grid-cols-4 gap-5"
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
          />
        ))}
      </section>

      <Button
        variant="outline"
        onClick={() => setShowAll((open) => !open)}
        className="w-full rounded-full border-white/15 bg-white/5 text-foreground hover:bg-white/10 sm:w-auto"
      >
        {showAll ? "Show featured plans" : "View all plans — incl. Free, Plus & Team"}
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
