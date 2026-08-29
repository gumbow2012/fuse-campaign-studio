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
import { quoteCreditTopUp } from "@/lib/creditPricing";
import { QUICK_TOP_UP_AMOUNTS } from "@/lib/topUpLadder";
import { STRIPE_TIERS } from "@/lib/stripe-config";
import { useAuth } from "@/contexts/AuthContext";
import { track } from "@/lib/analytics/track";
import {
  STARTER_WELCOME_BADGE,
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

/** Smallest quick top-up amount that covers the shortfall. */
function suggestedTopUp(shortfall: number) {
  const amounts = [...QUICK_TOP_UP_AMOUNTS];
  return amounts.find((amount) => amount >= shortfall) ?? amounts[amounts.length - 1];
}

const usd = (dollars: number) =>
  dollars.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 });

/**
 * Purchase paywall shown at the Generate step when a non-privileged user does not
 * have enough credits. Reuses the existing credit top-up and membership checkouts.
 */
export default function GeneratePaywallModal({
  open,
  onOpenChange,
  templateName,
  creditsRequired,
  creditBalance,
}: Props) {
  const { loading, startPlanCheckout, startCreditTopUp } = useMembershipCheckout();
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
  const topUpAmount = suggestedTopUp(Math.max(shortfall, 1));
  const topUpQuote = (() => {
    try {
      return quoteCreditTopUp(topUpAmount);
    } catch {
      return null;
    }
  })();
  const starter = STRIPE_TIERS.starter;
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

          <div className="mt-2 space-y-3">
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
                    20% off
                  </span>
                ) : null}
              </div>
              <p className="mt-2 text-sm text-white/85">
                {starter.monthlyCredits.toLocaleString()} credits / month · ≈ 3 typical campaigns
              </p>
              <p className="mt-1 text-sm text-slate-300">
                {starterWelcomeEligible ? (
                  <>
                    <span className="line-through">{usd(starter.price)}</span>{" "}
                    <span className="font-semibold text-cyan-200">
                      {usd(starterWelcomePrice(starter.price))}
                    </span>{" "}
                    <span className="text-xs uppercase tracking-[0.14em]">First month</span>
                  </>
                ) : (
                  <span className="font-semibold text-cyan-200">{usd(starter.price)}/mo</span>
                )}
              </p>
              {starterWelcomeEligible ? (
                <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-200/90">
                  {STARTER_WELCOME_BADGE}
                </p>
              ) : null}
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
              className="w-full justify-center rounded-full bg-cyan-300 font-semibold text-slate-950 hover:bg-cyan-200"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Sparkles className="h-4 w-4" aria-hidden />
              )}
              Start with {starter.name}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Button>

            <Button
              variant="outline"
              onClick={() => void startCreditTopUp(topUpAmount, { balanceBefore: creditBalance })}
              disabled={busy}
              className="w-full justify-center rounded-full border-white/15 bg-white/5 font-semibold text-white hover:bg-white/10"
            >
              <Coins className="h-4 w-4" aria-hidden />
              Buy {topUpAmount.toLocaleString()} credits
              {topUpQuote ? ` · ${usd(topUpQuote.dollars)}` : ""}
            </Button>

            <button
              type="button"
              onClick={() => {
                onOpenChange(false);
                setPackDialogOpen(true);
              }}
              className="w-full text-center text-xs text-cyan-200 underline-offset-4 hover:underline"
            >
              Choose a different credit amount
            </button>
          </div>

          <p className="mt-3 text-xs text-slate-500">Set up is free — you only pay to generate.</p>
        </DialogContent>
      </Dialog>

      <CreditPackDialog open={packDialogOpen} onOpenChange={setPackDialogOpen} />
    </>
  );
}
