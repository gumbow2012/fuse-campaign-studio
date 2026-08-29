import { useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CREDIT_PACKS } from "@/lib/stripe-config";
import { packApproxLabel } from "@/components/mvp/membership/CreditSliderPanel";
import {
  BEST_PLAN_COST_PER_1K,
  BEST_VALUE_STOP,
  TOP_UP_LADDER,
  costPer1kCredits,
} from "@/lib/topUpLadder";
import GatedPlanDialog from "@/components/mvp/membership/GatedPlanDialog";

type PackKey = keyof typeof CREDIT_PACKS;

type Props = {
  loading: string | null;
  isAdmin: boolean;
  onCheckout: (packKey: PackKey) => void;
};

/**
 * Top-up ladder. Sizes flagged `live` in TOP_UP_LADDER check out through the EXISTING
 * credit-pack handler; `gated` sizes (1K / 2K / 10K) have no Stripe product yet and only
 * offer the early-access action — checkout is never called for them.
 */
export default function CreditPackCards({ loading, isAdmin, onCheckout }: Props) {
  const [gatedSize, setGatedSize] = useState<number | null>(null);

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {TOP_UP_LADDER.map((stop) => {
          const per1k = costPer1kCredits(stop.price, stop.credits);
          const isBestValue = stop.credits === BEST_VALUE_STOP.credits;
          const isLive = stop.checkout === "live";

          return (
            <article
              key={stop.credits}
              className={`relative overflow-hidden rounded-2xl border p-5 backdrop-blur-sm ${
                isBestValue
                  ? "border-cyan-300/30 bg-white/[0.04] shadow-[0_0_40px_-12px_rgba(34,211,238,0.18)]"
                  : "border-white/10 bg-white/[0.03]"
              }`}
            >
              {isBestValue ? (
                <span className="absolute right-4 top-4 rounded-full bg-cyan-300 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-950">
                  Best value
                </span>
              ) : null}

              <p className="font-display text-xl font-semibold text-white">
                {stop.credits.toLocaleString()} credits
              </p>
              <p className="mt-1 text-sm text-cyan-100/90">
                {isLive ? "One-time top-up" : "Coming soon — early access"}
              </p>

              <div className="mt-4 min-h-[64px]">
                <p className="font-display text-3xl font-black tracking-[-0.04em] text-white">
                  ${stop.price}
                  <span className="ml-1 text-sm font-medium text-slate-400">one-time</span>
                </p>
                <p className={`mt-1 text-xs ${isBestValue ? "text-cyan-100" : "text-slate-400"}`}>
                  ${per1k.toFixed(2)} per 1,000 credits
                </p>
                {!isLive ? (
                  <p className="mt-1 text-xs text-amber-100/80">Not purchasable yet — request early access.</p>
                ) : null}
              </div>

              <ul className="mt-4 space-y-2 text-sm text-slate-200">
                <li className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-cyan-200" />
                  <span>{packApproxLabel(stop.credits)}</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-cyan-200" />
                  <span>One-time top-up, plan unchanged</span>
                </li>
              </ul>

              <Button
                onClick={() => {
                  if (isAdmin) return;
                  if (stop.checkout === "live") onCheckout(stop.packKey);
                  else setGatedSize(stop.credits);
                }}
                disabled={isAdmin || !!loading}
                className={`mt-5 w-full rounded-full font-semibold ${
                  isAdmin || !isLive
                    ? "bg-white/10 text-white hover:bg-white/15"
                    : "bg-cyan-300 text-slate-950 hover:bg-cyan-200"
                }`}
              >
                {isAdmin
                  ? "Admin access"
                  : !isLive
                    ? "Request early access"
                    : loading === stop.packKey
                      ? "Loading..."
                      : `Add ${stop.credits.toLocaleString()} credits`}
                {!isAdmin ? <ArrowRight className="h-4 w-4" /> : null}
              </Button>
            </article>
          );
        })}
      </div>

      <p className="mt-4 text-xs text-slate-400">
        Larger top-ups cost less per credit. Monthly plans are cheaper still — from $
        {BEST_PLAN_COST_PER_1K.toFixed(2)} per 1,000 credits.
      </p>

      <GatedPlanDialog
        open={gatedSize !== null}
        onOpenChange={(open) => !open && setGatedSize(null)}
        planName={gatedSize ? `${gatedSize.toLocaleString()} credit top-up` : null}
        interval="monthly"
      />
    </>
  );
}
