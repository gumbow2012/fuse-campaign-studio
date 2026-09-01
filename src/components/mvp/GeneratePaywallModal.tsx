import { useEffect, useState } from "react";
import { ArrowRight, Coins, Loader2, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import CreditPackDialog from "@/components/mvp/CreditPackDialog";
import { useMembershipCheckout } from "@/hooks/useMembershipCheckout";
import { CREDIT_PACKS, STRIPE_TIERS, type CreditPackKey } from "@/lib/stripe-config";
import { useAuth } from "@/contexts/AuthContext";
import { track } from "@/lib/analytics/track";
import {
  STARTER_WELCOME_BADGE,
  STARTER_WELCOME_DISCOUNT_RATE,
  isStarterWelcomeOfferEligible,
  starterWelcomePrice,
} from "@/lib/starterWelcomeOffer";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templateName?: string | null;
  creditsRequired: number;
  creditBalance: number;
};

/** Smallest REAL configured credit pack that fully covers the shortfall. */
function recommendedPack(shortfall: number): CreditPackKey {
  const packs = (Object.keys(CREDIT_PACKS) as CreditPackKey[]).sort(
    (a, b) => CREDIT_PACKS[a].credits - CREDIT_PACKS[b].credits,
  );
  return packs.find((key) => CREDIT_PACKS[key].credits >= shortfall) ?? packs[packs.length - 1];
}

const usd = (dollars: number) =>
  dollars.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 });

/**
 * Purchase paywall shown at the Generate step when a non-privileged user does not
 * have enough credits. Presentation only — every price, discount and pack comes
 * from the canonical modules (starterWelcomeOffer, stripe-config) and every
 * checkout uses the existing unchanged flows.
 */
export default function GeneratePaywallModal({
  open,
  onOpenChange,
  templateName,
  creditsRequired,
  creditBalance,
}: Props) {
  const { loading, startPlanCheckout, startCreditCheckout } = useMembershipCheckout();
  const { profile } = useAuth();
  const starterWelcomeEligible = isStarterWelcomeOfferEligible(
    profile
      ? {
          plan: profile.plan,
          subscriptionStatus: profile.subscription_status,
          stripeSubscriptionId: profile.stripe_subscription_id,
        }
      : null,
  );
  const [packDialogOpen, setPackDialogOpen] = useState(false);

  const shortfall = Math.max(0, creditsRequired - creditBalance);
  const packKey = recommendedPack(Math.max(shortfall, 1));
  const pack = CREDIT_PACKS[packKey];
  const starter = STRIPE_TIERS.starter;
  const discountPercent = Math.round(STARTER_WELCOME_DISCOUNT_RATE * 100);
  const busy = Boolean(loading);

  useEffect(() => {
    if (!open) return;
    track("contextual_plan_offer_viewed", {
      plan_key: "starter",
      credits_required: creditsRequired,
      credit_balance: creditBalance,
    });
    track("starter_welcome_offer_viewed", { surface: "generate_paywall", plan_key: "starter" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="border-white/10 bg-slate-950 text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-3xl tracking-[-0.04em]">
              Ready to run {templateName ? templateName : "this campaign"}?
            </DialogTitle>
            <DialogDescription className="text-slate-300">
              This campaign uses {creditsRequired.toLocaleString()} credits.
              {creditBalance > 0 ? ` You have ${creditBalance.toLocaleString()}.` : ""}
            </DialogDescription>
          </DialogHeader>

          {shortfall > 0 ? (
            <p className="font-display text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-200">
              You need {shortfall.toLocaleString()} more credits
            </p>
          ) : null}

          <div className="mt-2 space-y-3">
            {/* PRIMARY — Starter membership */}
            <div className="rounded-2xl border border-cyan-200/30 bg-cyan-400/[0.06] p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-100">
                  {starter.name}
                </span>
                <span className="rounded-full border border-cyan-200/40 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.18em] text-cyan-100">
                  Start here
                </span>
                {starterWelcomeEligible ? (
                  <span className="rounded-full bg-cyan-300 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.18em] text-slate-950">
                    {discountPercent}% off
                  </span>
                ) : null}
              </div>
              <p className="mt-2 text-sm text-white/85">
                {starter.monthlyCredits.toLocaleString()} credits / month · ≈ 3 typical campaigns
              </p>

              {starterWelcomeEligible ? (
                <>
                  <p className="mt-2 flex items-baseline gap-2">
                    <span className="text-sm text-slate-400 line-through">{usd(starter.price)}</span>
                    <span className="font-display text-2xl font-black tracking-[-0.03em] text-cyan-200">
                      {usd(starterWelcomePrice(starter.price))}
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-100">
                      First month
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-slate-400">then {usd(starter.price)}/month</p>
                  <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-200/90">
                    {STARTER_WELCOME_BADGE}
                  </p>
                </>
              ) : (
                <p className="mt-2 font-display text-2xl font-black tracking-[-0.03em] text-cyan-200">
                  {usd(starter.price)}
                  <span className="ml-1 text-sm font-medium text-slate-300">/month</span>
                </p>
              )}
            </div>

            <Button
              onClick={() => {
                track("starter_welcome_offer_clicked", {
                  surface: "generate_paywall",
                  plan_key: "starter",
                });
                void startPlanCheckout("starter");
              }}
              disabled={busy}
              className="w-full justify-center rounded-full bg-cyan-300 font-display text-[12px] font-semibold uppercase tracking-[0.16em] text-slate-950 hover:bg-cyan-200"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Sparkles className="h-4 w-4" aria-hidden />
              )}
              Start with {starter.name}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Button>

            {/* SECONDARY — one-time top-up */}
            <div className="pt-1">
              <div className="flex items-center gap-3">
                <span className="h-px flex-1 bg-white/10" />
                <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-500">
                  Or top up
                </span>
                <span className="h-px flex-1 bg-white/10" />
              </div>

              <Button
                variant="outline"
                onClick={() => void startCreditCheckout(packKey)}
                disabled={busy}
                className="mt-3 w-full justify-center rounded-full border-white/15 bg-white/5 font-semibold text-white hover:bg-white/10"
              >
                <Coins className="h-4 w-4" aria-hidden />
                Buy {pack.credits.toLocaleString()} credits · {usd(pack.price)}
              </Button>
              <p className="mt-1.5 text-center text-[11px] text-slate-500">
                One-time {pack.name} pack — covers this campaign.
              </p>

              <button
                type="button"
                onClick={() => {
                  onOpenChange(false);
                  setPackDialogOpen(true);
                }}
                className="mt-2 w-full text-center text-xs text-cyan-200 underline-offset-4 hover:underline"
              >
                Top-ups from $10
              </button>
            </div>
          </div>

          <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            Credits are only used when you run a campaign.
          </p>
        </DialogContent>
      </Dialog>

      <CreditPackDialog open={packDialogOpen} onOpenChange={setPackDialogOpen} />
    </>
  );
}
