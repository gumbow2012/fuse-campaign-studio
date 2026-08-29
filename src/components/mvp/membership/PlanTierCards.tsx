import { useState } from "react";
import { ArrowRight, Check, ChevronDown, Sparkle } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import GatedPlanDialog from "@/components/mvp/membership/GatedPlanDialog";
import PlanComparisonMatrix from "@/components/mvp/membership/PlanComparisonMatrix";
import {
  SALE_PLAN_LADDER,
  WELCOME_CREDITS_ONCE,
  isCheckoutLive,
  type PlanAccentKey,
  type PlanLadderEntry,
} from "@/lib/planLadder";
import { formatMoney, getPlanOffer, type BillingPeriod } from "@/lib/planOffer";
import { planDifferentiators } from "@/lib/planFeatureModules";
import { MEDIAN_CAMPAIGN_TOOLTIP, typicalCapacityLabel } from "@/lib/creditOutputs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { STRIPE_TIERS } from "@/lib/stripe-config";
import {
  STARTER_WELCOME_BADGE,
  isStarterWelcomeOfferEligible,
  starterWelcomePrice,
} from "@/lib/starterWelcomeOffer";


export type BillingCycle = BillingPeriod;

/**
 * PRICING — Higgsfield-density cards.
 *
 * Pricing comes ONLY from getPlanOffer(), which reads PLAN_LADDER. There is no
 * active Stripe promotion and no annual/Capsule Stripe price, so nothing here
 * renders a crossed-out price, a "% OFF" badge, a "Save $X" line or a countdown.
 * When a real promo is passed into getPlanOffer later, the discount treatment
 * turns on without rebuilding these cards.
 */
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
  /** Renders the collapsed "Compare all features" table under the cards. */
  comparison?: boolean;
};

/** One controlled accent per plan — dark FUSE base, never a rainbow page. */
const ACCENTS: Record<PlanAccentKey, {
  border: string;
  glow: string;
  badge: string;
  cta: string;
  metric: string;
  icon: string;
  tagline: string;
  creditBlock: string;
  module: string;
}> = {
  graphite: {
    border: "border-white/10",
    glow: "",
    badge: "border border-white/15 bg-white/[0.06] text-slate-200",
    cta: "bg-white/10 text-white hover:bg-white/15",
    metric: "text-slate-200",
    icon: "text-slate-300",
    tagline: "text-slate-400",
    creditBlock: "border-white/10 bg-white/[0.04]",
    module: "border-white/10 bg-white/[0.02]",
  },
  cyan: {
    border: "border-cyan-300/30",
    glow: "shadow-[0_0_50px_-18px_rgba(103,232,249,0.35)]",
    badge: "bg-cyan-300 text-slate-950",
    cta: "bg-cyan-300 text-slate-950 hover:bg-cyan-200",
    metric: "text-cyan-200",
    icon: "text-cyan-200",
    tagline: "text-cyan-100/80",
    creditBlock: "border-cyan-300/25 bg-cyan-300/[0.07]",
    module: "border-cyan-300/10 bg-white/[0.02]",
  },
  sky: {
    border: "border-sky-300/25",
    glow: "shadow-[0_0_50px_-20px_rgba(125,211,252,0.28)]",
    badge: "bg-sky-300 text-slate-950",
    cta: "bg-sky-300 text-slate-950 hover:bg-sky-200",
    metric: "text-sky-200",
    icon: "text-sky-200",
    tagline: "text-sky-100/80",
    creditBlock: "border-sky-300/25 bg-sky-300/[0.07]",
    module: "border-sky-300/10 bg-white/[0.02]",
  },
  violet: {
    border: "border-violet-400/40",
    glow: "shadow-[0_0_70px_-14px_rgba(167,139,250,0.45)]",
    badge: "bg-violet-400 text-slate-950",
    cta: "bg-violet-400 text-slate-950 hover:bg-violet-300",
    metric: "text-violet-200",
    icon: "text-violet-200",
    tagline: "text-violet-200/80",
    creditBlock: "border-violet-400/30 bg-violet-500/[0.10]",
    module: "border-violet-400/12 bg-white/[0.02]",
  },
  lime: {
    border: "border-lime-300/35",
    glow: "shadow-[0_0_55px_-16px_rgba(190,242,100,0.35)]",
    badge: "bg-lime-300 text-slate-950",
    cta: "bg-lime-300 text-slate-950 hover:bg-lime-200",
    metric: "text-lime-200",
    icon: "text-lime-200",
    tagline: "text-lime-200/80",
    creditBlock: "border-lime-300/25 bg-lime-300/[0.07]",
    module: "border-lime-300/10 bg-white/[0.02]",
  },
  /** STUDIO — crimson. */
  magenta: {
    border: "border-rose-500/35",
    glow: "shadow-[0_0_55px_-18px_rgba(244,63,94,0.35)]",
    badge: "bg-rose-500 text-white",
    cta: "bg-rose-500 text-white hover:bg-rose-400",
    metric: "text-rose-200",
    icon: "text-rose-200",
    tagline: "text-rose-200/80",
    creditBlock: "border-rose-500/25 bg-rose-500/[0.08]",
    module: "border-rose-500/10 bg-white/[0.02]",
  },
  royal: {
    border: "border-blue-500/35",
    glow: "shadow-[0_0_55px_-18px_rgba(59,130,246,0.35)]",
    badge: "bg-blue-500 text-white",
    cta: "bg-blue-500 text-white hover:bg-blue-400",
    metric: "text-blue-200",
    icon: "text-blue-200",
    tagline: "text-blue-200/80",
    creditBlock: "border-blue-500/25 bg-blue-500/[0.08]",
    module: "border-blue-500/10 bg-white/[0.02]",
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
  starterWelcomeEligible,
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
  starterWelcomeEligible?: boolean;
  onSelect: () => void;
}) {
  const Icon = entry.icon;
  const accent = ACCENTS[entry.accent];
  const live = isCheckoutLive(entry, billingCycle);

  // SOLE pricing source. No promo today → no slash, no % off, no savings line.
  const offer = getPlanOffer(entry, "monthly", null);

  /** Display-only: 20% off the first month, first-time Starter subscribers. */
  const showStarterWelcome =
    entry.key === "starter" && !!starterWelcomeEligible && !isCurrent && offer.purchasable;


  const credits = offer.monthlyCredits ?? 0;
  const capacity = typicalCapacityLabel(credits);
  const { inherits, items } = planDifferentiators(entry.key);
  const elevated = entry.recommendation === "MOST POPULAR";

  return (
    <article
      className={`relative flex flex-col overflow-hidden rounded-2xl border backdrop-blur-sm transition-transform duration-200 hover:-translate-y-1 motion-reduce:transform-none motion-reduce:transition-none ${
        compact ? "p-5" : wide ? "p-6 md:p-7" : "p-6"
      } ${accent.border} ${entry.recommendation ? accent.glow : ""} bg-white/[0.03] ${
        isCurrent ? "ring-1 ring-cyan-300/40" : ""
      } ${elevated ? "sm:-mt-2 ring-1 ring-violet-400/25" : ""} ${className ?? ""}`}
    >
      {/* 1 — PLAN NAME + tags */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.04]">
          <Icon className={`h-4 w-4 ${accent.icon}`} aria-hidden />
        </div>
        <p className={`font-display font-semibold text-white ${compact ? "text-lg" : wide ? "text-2xl" : "text-xl"}`}>
          {entry.name}
        </p>
        {entry.recommendation ? (
          <span
            className={`rounded-full font-bold uppercase tracking-wider ${accent.badge} ${
              elevated ? "px-3 py-1 text-[11px]" : "px-2.5 py-1 text-[10px]"
            }`}
          >
            {entry.recommendation}
          </span>
        ) : (
          <span className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-200">
            {entry.badge}
          </span>
        )}
      </div>

      {/* 2 — one-line positioning */}
      <p className={`mt-3 text-[11px] uppercase tracking-[0.2em] ${accent.tagline}`}>{entry.tagline}</p>
      <p className="mt-2 text-sm leading-6 text-slate-300">{entry.description}</p>

      {/* 3 — CREDIT BLOCK + typical campaign capacity (median-based equivalent) */}
      <div className={`mt-4 rounded-xl border px-3.5 py-3 ${accent.creditBlock}`}>
        <p className={`flex items-center gap-1.5 font-display text-sm font-bold ${accent.metric}`}>
          <Sparkle className="h-3.5 w-3.5" aria-hidden />
          {credits > 0 ? `${credits.toLocaleString()} credits/month` : entry.creditsLabel}
        </p>
        {capacity ? (
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>
                <p className="mt-1.5 cursor-help text-[11px] uppercase tracking-[0.16em] text-slate-400">
                  Typical capacity ·{" "}
                  <span className="text-[13px] font-semibold normal-case tracking-normal text-white">
                    {capacity}
                  </span>
                </p>
              </TooltipTrigger>
              <TooltipContent className="max-w-[260px] text-xs">{MEDIAN_CAMPAIGN_TOOLTIP}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          <p className="mt-1.5 text-[13px] font-semibold text-white">{entry.goodFor}</p>
        )}
      </div>

      {/* 4 — price (real current price only) */}
      <div className="mt-5">
        <p
          className={`font-display font-black tracking-[-0.04em] text-white ${
            compact ? "text-3xl" : wide ? "text-5xl" : "text-4xl"
          }`}
        >
          {showStarterWelcome ? (
            <>
              <span className="mr-2 text-slate-500 line-through">{formatMoney(offer.effectiveMonthly)}</span>
              <span className="text-cyan-200">{formatMoney(starterWelcomePrice(offer.effectiveMonthly))}</span>
            </>
          ) : (
            formatMoney(offer.effectiveMonthly)
          )}
          {entry.isFreeState ? null : <span className="ml-1 text-sm font-medium text-slate-400">/month</span>}
        </p>
        {showStarterWelcome ? (
          <p className="mt-2 inline-flex w-fit items-center rounded-full border border-cyan-300/25 bg-cyan-300/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-100">
            {STARTER_WELCOME_BADGE}
          </p>
        ) : null}
        {entry.isFreeState ? (
          <p className="mt-1 text-xs text-slate-400">
            $0 · {WELCOME_CREDITS_ONCE} welcome credits · one-time
          </p>
        ) : offer.purchasable ? (
          <p className="mt-1 text-xs text-slate-400">
            {showStarterWelcome
              ? "First month 20% off · then billed monthly · cancel anytime"
              : "Billed monthly · cancel anytime"}
          </p>
        ) : (
          <p className="mt-1 text-xs text-slate-400">Early access — not open for checkout yet</p>
        )}

        {isCurrent ? (
          <p className="mt-3 inline-flex w-fit items-center rounded-full border border-cyan-300/20 bg-cyan-300/10 px-2.5 py-1 text-xs font-medium text-cyan-50">
            Your plan
          </p>
        ) : null}
      </div>

      {/* 5 — CTA */}
      <Button
        onClick={onSelect}
        disabled={isAdmin || isCurrent || !!loading}
        className={`mt-4 w-full rounded-full font-semibold ${wide ? "h-12 text-sm" : ""} ${
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

      {/* 6 — 4–6 real differentiators. Everything else → "Compare all features". */}
      <div className="mt-5 flex-1">
        {inherits ? (
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
            Everything in {inherits}, plus:
          </p>
        ) : null}
        <ul className={`space-y-1.5 ${inherits ? "mt-2" : ""}`}>
          {items.slice(0, 6).map((item) => (
            <li key={item} className="flex items-start gap-2 text-[12.5px] leading-5 text-slate-200">
              <Check className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${accent.metric}`} aria-hidden />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}

/** Card order — Free first, then the live paid ladder. Team lives under "View all plans". */
const MOBILE_ORDER = ["free", "starter", "pro", "studio", "team"];
const mobileRank = (entry: PlanLadderEntry) => {
  const index = MOBILE_ORDER.indexOf(entry.key);
  return index === -1 ? MOBILE_ORDER.length : index;
};

export default function PlanTierCards({
  billingCycle,
  loading,
  isAdmin,
  currentPlan,
  subscriptionStatus,
  onCheckout,
  hero = false,
  comparison = false,
}: Props) {
  const navigate = useNavigate();
  const [showAll, setShowAll] = useState(false);
  const [showComparison, setShowComparison] = useState(false);
  const [gatedPlan, setGatedPlan] = useState<PlanLadderEntry | null>(null);

  const hasActivePaidPlan =
    currentPlan !== "free" && (subscriptionStatus === "active" || subscriptionStatus === "trialing");

  /** First-time subscribers see the 20%-off-first-month Starter treatment. */
  const starterWelcomeEligible = isStarterWelcomeOfferEligible({
    plan: currentPlan,
    subscriptionStatus,
  });


  // Public new-customer ladder = STARTER · PRO · STUDIO. Free is no longer a
  // selectable membership card (existing free accounts are untouched).
  const visible = (showAll ? SALE_PLAN_LADDER : SALE_PLAN_LADDER.filter((entry) => entry.featured))
    .filter((entry) => !entry.isFreeState)
    .slice()
    .sort((a, b) => mobileRank(a) - mobileRank(b));

  const handleSelect = (entry: PlanLadderEntry) => {
    if (isAdmin) return;
    if (entry.checkout === "none") {
      navigate("/app/templates");
      return;
    }
    if (isCheckoutLive(entry, "monthly") && entry.stripeTierKey) {
      onCheckout(entry.stripeTierKey);
      return;
    }
    // No Stripe price for this plan — gated early-access flow only, never a checkout.
    setGatedPlan(entry);
  };

  return (
    <div className={`space-y-5 ${hero ? "max-w-6xl mx-auto" : ""}`}>
      <section
        className={`grid grid-cols-1 gap-4 ${
          showAll ? "sm:grid-cols-2 xl:grid-cols-3" : "sm:grid-cols-2 xl:grid-cols-3 gap-5"
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
            starterWelcomeEligible={starterWelcomeEligible}
            onSelect={() => handleSelect(entry)}

          />
        ))}
      </section>

      <p className="text-center text-[12.5px] text-slate-400 sm:text-left">
        Not ready for a plan?{" "}
        <Link to="/app/templates" className="font-semibold text-cyan-200 underline underline-offset-4 hover:text-cyan-100">
          Try FUSE with {WELCOME_CREDITS_ONCE} welcome credits
        </Link>
      </p>

      <Button
        variant="outline"
        onClick={() => setShowAll((open) => !open)}
        className="w-full rounded-full border-white/15 bg-white/5 text-foreground hover:bg-white/10 sm:w-auto"
      >
        {showAll ? "Show featured plans" : "View all plans — incl. Team"}
      </Button>

      {comparison ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02]">
          <button
            type="button"
            onClick={() => setShowComparison((open) => !open)}
            aria-expanded={showComparison}
            className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
          >
            <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">
              Compare all features
            </span>
            <ChevronDown
              className={`h-4 w-4 text-slate-400 transition-transform ${showComparison ? "rotate-180" : ""}`}
              aria-hidden
            />
          </button>
          {showComparison ? (
            <div className="border-t border-white/5 px-3 pb-5 pt-4 sm:px-5">
              <PlanComparisonMatrix plan={currentPlan} subscriptionStatus={subscriptionStatus} />
            </div>
          ) : null}
        </div>
      ) : null}

      <GatedPlanDialog
        open={!!gatedPlan}
        onOpenChange={(open) => !open && setGatedPlan(null)}
        planName={gatedPlan?.name ?? null}
      />
    </div>
  );
}
