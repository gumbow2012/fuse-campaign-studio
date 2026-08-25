import { ArrowRight, Check, Crown, Rocket, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { STRIPE_TIERS } from "@/lib/stripe-config";

export const tierCopy = {
  starter: {
    icon: Zap,
    description:
      "For brands getting started. Full template library. Standard processing. Everything you need to launch your first drops with real campaign visuals.",
  },
  pro: {
    icon: Rocket,
    description:
      "For brands that drop regularly. Priority processing. Faster turnaround. The full creative toolkit for brands running a real drop calendar.",
  },
  studio: {
    icon: Crown,
    description:
      "For teams and agencies. Fastest processing. Largest volume. Built for brands running multiple lines or managing client drops.",
  },
} as const;

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

export default function PlanTierCards({
  billingCycle,
  onBillingCycleChange,
  loading,
  isAdmin,
  currentPlan,
  subscriptionStatus,
  onCheckout,
}: Props) {
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

      <section className="grid gap-4 md:grid-cols-3">
        {(Object.keys(STRIPE_TIERS) as Array<keyof typeof STRIPE_TIERS>).map((tierKey) => {
          const tier = STRIPE_TIERS[tierKey];
          const tierMeta = tierCopy[tierKey];
          const Icon = tierMeta.icon;
          const isRecommended = tierKey === "pro";
          const isCurrentActive =
            currentPlan === tierKey && (subscriptionStatus === "active" || subscriptionStatus === "trialing");
          const tierCtaLabel =
            tierKey === "starter" ? "Start Creating" : tierKey === "pro" ? "Launch Your Drops" : "Contact Us";
          const ctaLabel = isAdmin
            ? "Admin access"
            : isCurrentActive
              ? "Current plan"
              : loading === tierKey
                ? "Loading..."
                : tierCtaLabel;

          const per1k = ((tier.price / tier.monthlyCredits) * 1000).toFixed(2);
          const tierFeatures = [
            `${tier.monthlyCredits.toLocaleString()} credits/mo`,
            `~$${per1k} per 1,000 credits`,
            tierKey === "starter"
              ? "Great for your first campaigns"
              : tierKey === "pro"
                ? "Built for a regular drop calendar"
                : "For teams & multi-brand studios",
          ];

          return (
            <article
              key={tierKey}
              className={`relative overflow-hidden rounded-2xl border p-6 backdrop-blur-sm ${
                isCurrentActive
                  ? "border-cyan-300/40 bg-cyan-300/[0.08]"
                  : isRecommended
                    ? "border-cyan-300/30 bg-white/[0.04] shadow-[0_0_40px_-12px_rgba(34,211,238,0.18)]"
                    : "border-white/10 bg-white/[0.03]"
              }`}
            >
              {isRecommended ? (
                <span className="absolute right-4 top-4 rounded-full bg-cyan-300 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-950">
                  Recommended
                </span>
              ) : null}

              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.04]">
                  <Icon className="h-4 w-4 text-cyan-100" />
                </div>
                <p className="font-display text-xl font-semibold text-white">{tier.name}</p>
              </div>

              <p className="mt-3 text-sm leading-6 text-slate-300">{tierMeta.description}</p>

              <div className="mt-5">
                {billingCycle === "annual" ? (
                  // GATED: annual requires real Stripe annual prices to be created before enabling checkout.
                  <>
                    <p className="font-display text-2xl font-black tracking-[-0.04em] text-white">
                      Annual billing coming soon
                    </p>
                    <p className="mt-1 text-sm text-slate-400">
                      {tier.monthlyCredits.toLocaleString()} credits/mo when launched
                    </p>
                  </>
                ) : (
                  <>
                    <p className="font-display text-4xl font-black tracking-[-0.04em] text-white">
                      ${tier.price}
                      <span className="ml-1 text-sm font-medium text-slate-400">/ month</span>
                    </p>
                    <p className="mt-1 text-sm text-cyan-100/90">{tier.monthlyCredits.toLocaleString()} credits/mo</p>
                  </>
                )}
              </div>

              {isCurrentActive ? (
                <p className="mt-3 inline-flex items-center rounded-full border border-cyan-300/20 bg-cyan-300/10 px-2.5 py-1 text-xs font-medium text-cyan-50">
                  Current plan
                </p>
              ) : null}

              <ul className="mt-5 space-y-3 text-sm text-slate-200">
                {tierFeatures.map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 text-cyan-200" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <Button
                onClick={() => {
                  // GATED: annual requires real Stripe annual prices to be created before enabling checkout.
                  if (billingCycle === "annual") return;
                  onCheckout(tierKey);
                }}
                disabled={billingCycle === "annual" || isAdmin || isCurrentActive || !!loading}
                className={`mt-6 w-full rounded-full font-semibold ${
                  isCurrentActive || isAdmin || billingCycle === "annual"
                    ? "bg-white/10 text-white hover:bg-white/10"
                    : "bg-cyan-300 text-slate-950 hover:bg-cyan-200"
                }`}
              >
                {billingCycle === "annual" ? "Coming soon" : ctaLabel}
                {billingCycle !== "annual" && !isCurrentActive && !isAdmin ? (
                  <ArrowRight className="h-4 w-4" />
                ) : null}
              </Button>
            </article>
          );
        })}
      </section>
    </div>
  );
}
