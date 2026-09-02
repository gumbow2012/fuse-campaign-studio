/**
 * F6 — post-free-video conversion panel.
 *
 * Prices come from the canonical plan config + starterWelcomeOffer helpers;
 * nothing is hardcoded here. Credit top-ups reuse the existing pack dialog.
 */

import { useEffect } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import CreditPackDialog from "@/components/mvp/CreditPackDialog";
import { useMembershipCheckout } from "@/hooks/useMembershipCheckout";
import { STRIPE_TIERS } from "@/lib/stripe-config";
import { STARTER_WELCOME_BADGE, starterWelcomePrice } from "@/lib/starterWelcomeOffer";
import { track } from "@/lib/analytics/track";
import { trackFreeVideo } from "@/lib/analytics/freeVideoEvents";

const usd = (dollars: number) =>
  dollars.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
  });

export default function KeepCreatingPanel({ templateId }: { templateId?: string | null }) {
  const { loading, startPlanCheckout } = useMembershipCheckout();
  const starter = STRIPE_TIERS.starter;

  useEffect(() => {
    trackFreeVideo("post_free_paywall_viewed", { template_id: templateId ?? null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="rounded-[1.5rem] border border-cyan-300/25 bg-cyan-300/[0.06] p-5">
      <p className="font-display text-[12px] font-bold uppercase tracking-[0.22em] text-cyan-100">
        Keep creating
      </p>
      <p className="mt-2 text-sm leading-6 text-slate-300">
        That was your free first video. Go unlimited on the whole library with {starter.name}.
      </p>

      <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/50 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-100">
            {starter.name}
          </span>
          <span className="rounded-full bg-cyan-300 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.18em] text-slate-950">
            20% off
          </span>
        </div>
        <p className="mt-2 text-sm text-slate-300">
          <span className="line-through">{usd(starter.price)}</span>{" "}
          <span className="font-semibold text-cyan-200">{usd(starterWelcomePrice(starter.price))}</span>{" "}
          <span className="text-xs uppercase tracking-[0.14em]">First month</span>
          <span className="text-slate-400">, then {usd(starter.price)}/mo</span>
        </p>
        <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-200/90">
          {STARTER_WELCOME_BADGE}
        </p>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button
          onClick={() => {
            track("keep_creating_starter_click", { template_id: templateId ?? null });
            trackFreeVideo("post_free_starter_started", { template_id: templateId ?? null });
            void startPlanCheckout("starter", { templateId: templateId ?? undefined });
          }}
          disabled={Boolean(loading)}
          className="rounded-full bg-cyan-300 px-5 font-display text-[12px] font-semibold uppercase tracking-[0.16em] text-slate-950 hover:bg-cyan-200"
        >
          {loading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden /> : null}
          Start with {starter.name}
          <ArrowRight className="ml-1 h-4 w-4" aria-hidden />
        </Button>

        <CreditPackDialog
          trigger={
            <Button
              variant="outline"
              onClick={() => trackFreeVideo("post_free_topup_started", { template_id: templateId ?? null })}
              className="rounded-full border-white/15 bg-white/5 px-5 font-display text-[12px] font-semibold uppercase tracking-[0.16em] text-slate-100 hover:bg-white/10"
            >
              Buy credits
              <ArrowRight className="ml-1 h-4 w-4" aria-hidden />
            </Button>
          }
        />
      </div>
      <p className="mt-2 text-[11px] text-slate-500">Credit top-ups are one-time — no subscription.</p>
    </div>
  );
}
