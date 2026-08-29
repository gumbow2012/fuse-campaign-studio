import { useState } from "react";
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

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="border-white/10 bg-slate-950 text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-3xl tracking-[-0.04em]">Unlock this campaign</DialogTitle>
            <DialogDescription className="text-slate-300">
              {templateName ? <span className="font-medium text-white">{templateName}</span> : "This campaign"}
              {" — "}
              {creditBalance <= 0
                ? `generate this campaign for ${creditsRequired.toLocaleString()} credits.`
                : `${creditsRequired.toLocaleString()} credits needed — you have ${creditBalance.toLocaleString()}.`}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-2 space-y-3">
            <Button
              onClick={() => void startCreditTopUp(topUpAmount, { balanceBefore: creditBalance })}
              disabled={busy}
              className="w-full justify-center rounded-full bg-cyan-300 font-semibold text-slate-950 hover:bg-cyan-200"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Coins className="h-4 w-4" aria-hidden />}
              Buy {topUpAmount.toLocaleString()} credits
              {topUpQuote ? ` · ${usd(topUpQuote.dollars)}` : ""}
            </Button>

            <Button
              variant="outline"
              onClick={() => void startPlanCheckout("starter")}
              disabled={busy}
              className="w-full justify-center rounded-full border-white/15 bg-white/5 font-semibold text-white hover:bg-white/10"
            >
              <Sparkles className="h-4 w-4" aria-hidden />
              {starterWelcomeEligible ? (
                <>
                  Upgrade to {starter.name} —{" "}
                  <span className="text-slate-400 line-through">{usd(starter.price)}</span>{" "}
                  <span className="text-cyan-200">{usd(starterWelcomePrice(starter.price))}</span>/mo
                </>
              ) : (
                <>
                  Upgrade to {starter.name} — {usd(starter.price)}/mo
                </>
              )}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Button>
            {starterWelcomeEligible ? (
              <p className="text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-200/90">
                {STARTER_WELCOME_BADGE}
              </p>
            ) : null}


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
