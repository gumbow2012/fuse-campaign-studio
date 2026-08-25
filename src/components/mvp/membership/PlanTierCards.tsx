import { useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { PLAN_LADDER, type PlanLadderEntry } from "@/lib/planLadder";
import { CREDITS_PER_IMAGE, approxOutputLabel } from "@/lib/creditOutputs";
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
};

/**
 * Presentation-only personalization. Selecting a use case changes which TRUE benefits
 * are surfaced and which plan is visually suggested. It never changes prices, credit
 * amounts, or implies feature gating between tiers.
 */
const USE_CASES = [
  {
    id: "clothing",
    label: "Clothing Brand",
    suggests: "starter",
    benefits: [
      "Product + campaign imagery from your own flats and photos",
      "Every template and model included on any paid plan",
      "Credits cover images and video — spend them however you drop",
    ],
  },
  {
    id: "jewelry",
    label: "Jewelry Brand",
    suggests: "starter",
    benefits: [
      "Jewelry Swap reconstruction on your real product references",
      "Every template and model included on any paid plan",
      "Top-up credit packs available any time",
    ],
  },
  {
    id: "creator",
    label: "Creator",
    suggests: "pro",
    benefits: [
      "Cinema director controls and the full template library",
      "Creator Program: publish templates and earn",
      "Every template and model included on any paid plan",
    ],
  },
  {
    id: "agency",
    label: "Agency",
    suggests: "studio",
    benefits: [
      "Largest monthly credit pool for multi-client volume",
      "Top-up credit packs when a month runs hot",
      "Team seats and shared workspaces are coming soon (not built yet)",
    ],
  },
  {
    id: "team",
    label: "Team",
    suggests: "studio",
    benefits: [
      "Biggest credit pool for shared output",
      "Team seats and shared workspaces are coming soon (not built yet)",
      "Every template and model included on any paid plan",
    ],
  },
] as const;

type UseCaseId = (typeof USE_CASES)[number]["id"];

const LIVE_MAX_CREDITS = Math.max(
  ...PLAN_LADDER.filter((entry) => entry.monthlyCredits).map((entry) => entry.monthlyCredits as number),
);

function planFeatures(entry: PlanLadderEntry): string[] {
  if (entry.checkout === "live" && entry.price !== null && entry.monthlyCredits !== null) {
    const per1k = ((entry.price / entry.monthlyCredits) * 1000).toFixed(2);
    return [
      `${entry.monthlyCredits.toLocaleString()} credits/mo`,
      `~$${per1k} per 1,000 credits`,
      "All templates, tools and models included",
    ];
  }
  if (entry.isFreeState) {
    return ["Browse templates and the studio", "No monthly credits", "Upgrade any time"];
  }
  return [entry.tagline, "Pricing not published yet", "No credits allotted yet"];
}

/** Honest volume module: bar width is purely credits-derived, never a feature "level". */
function VolumeModule({ entry }: { entry: PlanLadderEntry }) {
  const credits = entry.monthlyCredits;
  const pct = credits ? Math.max(6, Math.round((credits / LIVE_MAX_CREDITS) * 100)) : 0;
  const outputs = approxOutputLabel(credits);

  return (
    <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.02] p-3">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-slate-400">
        <span>Campaign volume</span>
        <span>{credits ? `${credits.toLocaleString()} cr` : "—"}</span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-cyan-300 transition-[width] duration-700 ease-out motion-reduce:transition-none"
          style={{ width: credits ? `${pct}%` : "0%" }}
        />
      </div>
      <p className="mt-2 text-xs text-slate-400">
        {outputs
          ? `Roughly enough for ${outputs} (${CREDITS_PER_IMAGE} credits per image)`
          : "No credit allotment to estimate yet"}
      </p>
    </div>
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
}: Props) {
  const [useCase, setUseCase] = useState<UseCaseId | null>(null);
  const activeUseCase = USE_CASES.find((option) => option.id === useCase) ?? null;
  const suggestedKey = activeUseCase?.suggests ?? "pro";
  const hasActivePaidPlan =
    currentPlan !== "free" && (subscriptionStatus === "active" || subscriptionStatus === "trialing");

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div className="inline-flex rounded-full border border-white/10 bg-white/[0.03] p-1">
          {(["monthly", "annual"] as const).map((cycle) => (
            <button
              key={cycle}
              type="button"
              onClick={() => onBillingCycleChange(cycle)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                billingCycle === cycle ? "bg-cyan-300 text-slate-950" : "text-slate-300 hover:text-white"
              }`}
            >
              {cycle === "monthly" ? "Monthly" : "Annual"}
            </button>
          ))}
        </div>
        {billingCycle === "annual" ? (
          <p className="text-sm text-slate-300">Annual plans are coming soon.</p>
        ) : null}
      </div>

      {/* Presentation-only personalization — no pricing or entitlement effect. */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">What are you using FUSE for?</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {USE_CASES.map((option) => {
            const isActive = useCase === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setUseCase(isActive ? null : option.id)}
                className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ${
                  isActive
                    ? "border-cyan-300/50 bg-cyan-300/15 text-cyan-50"
                    : "border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.06] hover:text-white"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
        {activeUseCase ? (
          <ul className="mt-4 space-y-2 text-sm text-slate-300">
            {activeUseCase.benefits.map((benefit) => (
              <li key={benefit} className="flex items-start gap-2">
                <Check className="mt-0.5 h-4 w-4 text-cyan-200" />
                <span>{benefit}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-xs text-slate-500">
            Plans differ only by monthly credit volume — every template, tool and model is included on any paid plan.
          </p>
        )}
      </div>


      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {PLAN_LADDER.map((entry) => {
          const Icon = entry.icon;
          const isLive = entry.checkout === "live" && !!entry.stripeTierKey;
          const isCurrentActive = isLive && currentPlan === entry.stripeTierKey && hasActivePaidPlan;
          const isCurrentFree = !!entry.isFreeState && !hasActivePaidPlan;
          const annualGated = billingCycle === "annual";

          const liveCtaLabel =
            entry.key === "starter" ? "Start Creating" : entry.key === "pro" ? "Launch Your Drops" : "Get Studio";
          const ctaLabel = isAdmin
            ? "Admin access"
            : isCurrentActive
              ? "Current plan"
              : loading === entry.stripeTierKey
                ? "Loading..."
                : liveCtaLabel;

          const isSuggested = entry.key === suggestedKey;

          return (
            <article
              key={entry.key}
              className={`group relative overflow-hidden rounded-2xl border p-6 backdrop-blur-sm transition-transform duration-300 hover:-translate-y-1 motion-reduce:transform-none motion-reduce:transition-none ${
                isCurrentActive || isCurrentFree
                  ? "border-cyan-300/40 bg-cyan-300/[0.08]"
                  : isSuggested
                    ? "border-cyan-300/30 bg-white/[0.04] shadow-[0_0_40px_-12px_rgba(34,211,238,0.18)]"
                    : "border-white/10 bg-white/[0.03]"
              } ${!isLive && !entry.isFreeState ? "opacity-80" : ""}`}
            >
              <span
                className={`absolute right-4 top-4 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${
                  isSuggested ? "bg-cyan-300 text-slate-950" : "border border-white/15 bg-white/5 text-slate-200"
                }`}
              >
                {isSuggested && activeUseCase ? "Suggested" : entry.badge}
              </span>


              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.04]">
                  <Icon className="h-4 w-4 text-cyan-100" />
                </div>
                <p className="font-display text-xl font-semibold text-white">{entry.name}</p>
              </div>

              <p className="mt-1 text-[11px] uppercase tracking-[0.2em] text-cyan-100/80">{entry.tagline}</p>
              <p className="mt-3 text-sm leading-6 text-slate-300">{entry.description}</p>

              <div className="mt-5">
                {isLive && annualGated ? (
                  // GATED: annual requires real Stripe annual prices to be created before enabling checkout.
                  <>
                    <p className="font-display text-2xl font-black tracking-[-0.04em] text-white">
                      Annual billing coming soon
                    </p>
                    <p className="mt-1 text-sm text-slate-400">
                      {entry.monthlyCredits?.toLocaleString()} credits/mo when launched
                    </p>
                  </>
                ) : isLive ? (
                  <>
                    <p className="font-display text-4xl font-black tracking-[-0.04em] text-white">
                      ${entry.price}
                      <span className="ml-1 text-sm font-medium text-slate-400">/ month</span>
                    </p>
                    <p className="mt-1 text-sm text-cyan-100/90">
                      {entry.monthlyCredits?.toLocaleString()} credits/mo
                    </p>
                  </>
                ) : entry.isFreeState ? (
                  <>
                    <p className="font-display text-4xl font-black tracking-[-0.04em] text-white">
                      $0
                      <span className="ml-1 text-sm font-medium text-slate-400">/ month</span>
                    </p>
                    <p className="mt-1 text-sm text-slate-400">No monthly credits</p>
                  </>
                ) : (
                  <>
                    <p className="font-display text-3xl font-black tracking-[-0.04em] text-white">
                      {entry.key === "team" ? "Custom" : "—"}
                    </p>
                    <p className="mt-1 text-sm text-slate-400">
                      {entry.key === "team" ? "Contact for pricing" : "Not available yet"}
                    </p>
                  </>
                )}
              </div>

              <VolumeModule entry={entry} />

              {isCurrentActive || isCurrentFree ? (
                <p className="mt-3 inline-flex items-center rounded-full border border-cyan-300/20 bg-cyan-300/10 px-2.5 py-1 text-xs font-medium text-cyan-50">
                  Current

                </p>
              ) : null}

              <ul className="mt-5 space-y-3 text-sm text-slate-200">
                {planFeatures(entry).map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 text-cyan-200" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              {isLive ? (
                <Button
                  onClick={() => {
                    // GATED: annual requires real Stripe annual prices to be created before enabling checkout.
                    if (annualGated) return;
                    onCheckout(entry.stripeTierKey as keyof typeof STRIPE_TIERS);
                  }}
                  disabled={annualGated || isAdmin || isCurrentActive || !!loading}
                  className={`mt-6 w-full rounded-full font-semibold ${
                    isCurrentActive || isAdmin || annualGated
                      ? "bg-white/10 text-white hover:bg-white/10"
                      : "bg-cyan-300 text-slate-950 hover:bg-cyan-200"
                  }`}
                >
                  {annualGated ? "Coming soon" : ctaLabel}
                  {!annualGated && !isCurrentActive && !isAdmin ? <ArrowRight className="h-4 w-4" /> : null}
                </Button>
              ) : entry.isFreeState ? (
                <Button disabled className="mt-6 w-full rounded-full bg-white/10 font-semibold text-white hover:bg-white/10">
                  {isCurrentFree ? "Your current state" : "Free state"}
                </Button>
              ) : entry.gatedCta?.href ? (
                <Button
                  asChild
                  variant="outline"
                  className="mt-6 w-full rounded-full border-white/15 bg-white/5 font-semibold text-foreground hover:bg-white/10"
                >
                  <Link to={entry.gatedCta.href}>{entry.gatedCta.label}</Link>
                </Button>
              ) : (
                <Button disabled className="mt-6 w-full rounded-full bg-white/10 font-semibold text-white hover:bg-white/10">
                  {entry.gatedCta?.label ?? "Coming soon"}
                </Button>
              )}
            </article>
          );
        })}
      </section>
    </div>
  );
}

