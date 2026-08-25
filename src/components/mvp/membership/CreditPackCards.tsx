import { useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CREDIT_PACKS } from "@/lib/stripe-config";
import { BEST_VALUE_PACK, costPer1k, packApproxLabel } from "@/components/mvp/membership/CreditSliderPanel";
import GatedPlanDialog from "@/components/mvp/membership/GatedPlanDialog";

type PackKey = keyof typeof CREDIT_PACKS;

type Props = {
  loading: string | null;
  isAdmin: boolean;
  onCheckout: (packKey: PackKey) => void;
};

/**
 * Top-up ladder. Only sizes backed by an EXISTING Stripe price show a price and check out;
 * the rest use the graceful early-access action and never display a fabricated price.
 */
type TopUp = { credits: number; packKey?: PackKey };

const TOP_UPS: TopUp[] = [
  { credits: 500, packKey: "boost" },
  { credits: 1000 },
  { credits: 1500, packKey: "growth" },
  { credits: 2000 },
  { credits: 4000, packKey: "bulk" },
  { credits: 10000 },
];

export default function CreditPackCards({ loading, isAdmin, onCheckout }: Props) {
  const [gatedSize, setGatedSize] = useState<number | null>(null);

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {TOP_UPS.map((topUp) => {
          const pack = topUp.packKey ? CREDIT_PACKS[topUp.packKey] : null;
          const isBestValue = !!topUp.packKey && topUp.packKey === BEST_VALUE_PACK;

          return (
            <article
              key={topUp.credits}
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
                {topUp.credits.toLocaleString()} credits
              </p>
              <p className="mt-1 text-sm text-cyan-100/90">Good for an extra drop</p>

              <div className="mt-4 min-h-[64px]">
                {pack ? (
                  <>
                    <p className="font-display text-3xl font-black tracking-[-0.04em] text-white">
                      ${pack.price}
                      <span className="ml-1 text-sm font-medium text-slate-400">one-time</span>
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      ${costPer1k(pack.price, pack.credits).toFixed(2)} per 1,000 credits
                    </p>
                  </>
                ) : (
                  <p className="text-sm leading-6 text-slate-300">
                    Bigger top-up for heavier drop weeks — request early access and we&apos;ll set it up with you.
                  </p>
                )}
              </div>

              <ul className="mt-4 space-y-2 text-sm text-slate-200">
                <li className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-cyan-200" />
                  <span>{packApproxLabel(topUp.credits)}</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-cyan-200" />
                  <span>One-time top-up, plan unchanged</span>
                </li>
              </ul>

              <Button
                onClick={() => {
                  if (isAdmin) return;
                  if (topUp.packKey) onCheckout(topUp.packKey);
                  else setGatedSize(topUp.credits);
                }}
                disabled={isAdmin || !!loading}
                className={`mt-5 w-full rounded-full font-semibold ${
                  isAdmin ? "bg-white/10 text-white hover:bg-white/10" : "bg-cyan-300 text-slate-950 hover:bg-cyan-200"
                }`}
              >
                {isAdmin
                  ? "Admin access"
                  : topUp.packKey && loading === topUp.packKey
                    ? "Loading..."
                    : `Add ${topUp.credits.toLocaleString()} credits`}
                {!isAdmin ? <ArrowRight className="h-4 w-4" /> : null}
              </Button>
            </article>
          );
        })}
      </div>

      <GatedPlanDialog
        open={gatedSize !== null}
        onOpenChange={(open) => !open && setGatedSize(null)}
        planName={gatedSize ? `${gatedSize.toLocaleString()} credit top-up` : null}
        interval="monthly"
      />
    </>
  );
}
