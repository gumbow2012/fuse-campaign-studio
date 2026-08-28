/**
 * CONVERSION PASS — P3: post-auth plan-offer popup.
 *
 * Shown ONCE to a genuinely new, undecided account (free plan, no
 * welcome_credit_grants row, no active paid subscription) right after auth —
 * in context, over the dimmed page they came from. Never a paywall: the free
 * escape is always visible and grants the 100 welcome credits via the existing
 * grant_welcome_credits() RPC.
 *
 * Prices and monthly credits come from the canonical plan ladder — never
 * hardcoded here.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, Loader2, X, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { PLAN_LADDER, WELCOME_CREDITS_ONCE, type PlanLadderEntry } from "@/lib/planLadder";
import { getPlanOffer } from "@/lib/planOffer";
import { planDifferentiators } from "@/lib/planFeatureModules";
import { MEDIAN_CAMPAIGN_TOOLTIP, typicalCapacityLabel } from "@/lib/creditOutputs";
import type { LucideIcon } from "lucide-react";
import { useMembershipCheckout } from "@/hooks/useMembershipCheckout";
import GatedPlanDialog from "@/components/mvp/membership/GatedPlanDialog";
import { getPendingGenerationIntent } from "@/lib/pendingGenerationIntent";
import {
  hasActivePaidSubscription,
  normalizeOfferState,
  offerDecisionPending,
  persistOfferState,
} from "@/lib/onboardingPlanOffer";
import { readPendingAuthIntent, resolveIntentDestination } from "@/lib/pendingAuthIntent";
import { track } from "@/lib/analytics/track";
import { setPlanOfferActive } from "@/lib/planOfferVisibility";

const WELCOME_CREDITS = WELCOME_CREDITS_ONCE;

const STARTER = PLAN_LADDER.find((entry) => entry.key === "starter")!;

/**
 * Compressed version of the pricing card system (PlanTierCards) so both
 * surfaces match. Pricing comes ONLY from getPlanOffer — with no active
 * promotion there is no slash price, no % off and no savings line.
 */
function CompactPlanCard({
  entry,
  icon: Icon,
  tag,
  accent,
  headline,
  footnote,
  ctaLabel,
  ctaLoading,
  onSelect,
}: {
  entry: PlanLadderEntry;
  icon: LucideIcon;
  tag?: string;
  accent: { shell: string; text: string; check: string; block: string; cta: string };
  headline: string;
  footnote: string;
  ctaLabel: string;
  ctaLoading?: boolean;
  onSelect: () => void;
}) {
  const offer = getPlanOffer(entry, "monthly", null);
  const credits = offer.monthlyCredits ?? 0;
  const capacity = typicalCapacityLabel(credits);
  const { inherits, items } = planDifferentiators(entry.key);

  return (
    <div className={cn("relative flex flex-col rounded-[1.25rem] border p-4 sm:p-5", accent.shell)}>
      {tag ? (
        <span className="absolute right-4 top-4 rounded-full border border-white/20 bg-white/10 px-2 py-0.5 font-display text-[9px] font-bold uppercase tracking-[0.18em] text-white">
          {tag}
        </span>
      ) : null}
      <div className="flex items-center gap-2">
        <Icon className={cn("h-4 w-4", accent.check)} aria-hidden />
        <p className={cn("font-display text-[11px] font-bold uppercase tracking-[0.22em]", accent.text)}>
          {entry.name}
        </p>
      </div>

      <div className={cn("mt-3 rounded-xl border px-3 py-2.5", accent.block)}>
        <p className={cn("font-display text-[13px] font-bold", accent.text)}>
          ✦ {credits > 0 ? `${credits.toLocaleString()} credits/month` : entry.creditsLabel}
        </p>
        {capacity ? (
          <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-slate-400" title={MEDIAN_CAMPAIGN_TOOLTIP}>
            Typical capacity ·{" "}
            <span className="text-[12.5px] font-semibold normal-case tracking-normal text-white">{capacity}</span>
          </p>
        ) : null}
      </div>

      <p className="mt-3 font-display text-2xl font-bold tracking-[-0.03em] text-white">
        ${offer.effectiveMonthly}
        <span className="ml-1 text-sm font-medium text-slate-400">/mo</span>
      </p>
      <p className="mt-0.5 text-[11px] text-slate-500">{footnote}</p>
      <p className="mt-2 text-[13px] font-semibold text-white">{headline}</p>

      <Button
        onClick={onSelect}
        disabled={ctaLoading}
        className={cn("mt-3 w-full rounded-full font-semibold", accent.cta)}
      >
        {ctaLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {ctaLabel}
      </Button>

      <div className="mt-3 flex-1">
        {inherits ? (
          <p className="text-[9.5px] font-bold uppercase tracking-[0.18em] text-slate-400">
            Everything in {inherits}, plus:
          </p>
        ) : null}
        <ul className={cn("space-y-1", inherits && "mt-1.5")}>
          {items.slice(0, 5).map((item) => (
            <li key={item} className="flex items-start gap-2 text-[12px] leading-5 text-slate-300">
              <Check className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", accent.check)} aria-hidden />
              {item}
            </li>
          ))}
        </ul>
      </div>

    </div>
  );
}


export default function PlanOfferModal() {
  const navigate = useNavigate();
  const { user, profile, refreshProfile } = useAuth();
  const { loading: checkoutLoading, startPlanCheckout } = useMembershipCheckout();

  const [open, setOpen] = useState(false);
  const [granting, setGranting] = useState(false);
  const [granted, setGranted] = useState(false);
  const [gatedOpen, setGatedOpen] = useState(false);
  const [afford, setAfford] = useState<{ required: number; available: number } | null>(null);
  const decided = useRef(false);

  /**
   * The decision is server-owned and taken ONCE:
   * profiles.onboarding_plan_offer ∈ unseen|shown|free|starter|capsule|dismissed.
   * Existing users (already decided) never see this onboarding step, and this
   * surface never touches the session or routes back to /auth.
   */
  const offerState = useMemo(
    () => normalizeOfferState(profile?.onboarding_plan_offer),
    [profile?.onboarding_plan_offer],
  );

  /** Post-decision destination — pending generation intent, returnTo, else the app. */
  const destination = useMemo(() => resolveIntentDestination(readPendingAuthIntent()), []);

  useEffect(() => {
    if (decided.current) return;
    if (!user?.id || !profile) return;
    if (!offerDecisionPending(offerState)) return;
    if (hasActivePaidSubscription(profile.plan, profile.subscription_status)) return;

    decided.current = true;
    setOpen(true);
    void persistOfferState("shown");
    track("onboarding_plan_offer_shown", { plan: profile.plan ?? "free" });
    // P7 funnel — canonical event name for the offer moment (fires once).
    track("onboarding_offer_shown", { plan_key: profile.plan ?? "free" });
  }, [offerState, profile, user?.id]);

  // P6b — while this offer is on screen the builder must not auto-run.
  useEffect(() => {
    setPlanOfferActive(open);
    return () => setPlanOfferActive(false);
  }, [open]);

  // P7 — one funnel event per moment; a choice suppresses the "closed" event.
  const choiceMade = useRef(false);
  const closeTracked = useRef(false);

  const dismissModal = () => {
    setOpen(false);
    setGranted(false);
    setAfford(null);
  };

  /**
   * X / backdrop = CONTINUE FREE (deterministic): grant the one-time welcome
   * credits and record the decision — never a dead end, never back to /auth.
   */
  const close = () => {
    if (!choiceMade.current && !closeTracked.current) {
      closeTracked.current = true;
      track("onboarding_offer_closed", {});
    }
    if (choiceMade.current) {
      dismissModal();
      return;
    }
    // Dismiss is still a decision: grant the credits, record "dismissed".
    void handleFree({ silent: true, state: "dismissed" });
  };

  const handleFree = async (options: { silent?: boolean; state?: "free" | "dismissed" } = {}) => {
    if (!user?.id) {
      dismissModal();
      return;
    }
    setGranting(true);
    try {
      const { data, error } = await supabase.rpc("grant_welcome_credits" as never);
      if (error) throw error;
      choiceMade.current = true;
      await persistOfferState(options.state ?? "free");
      track("onboarding_plan_choice", { choice: options.state ?? "free" });
      track("free_selected", {});
      const grantResult = data as { granted?: boolean } | boolean | null;
      const wasGranted =
        grantResult === true || (typeof grantResult === "object" && grantResult?.granted === true);
      if (wasGranted) track("welcome_credits_granted", { credits: WELCOME_CREDITS });
      const refreshed = await refreshProfile();
      if (options.silent) {
        dismissModal();
        return;
      }
      setGranted(true);


      const intent = getPendingGenerationIntent();
      const required = intent?.creditCost ?? 0;
      const available = refreshed?.credits_balance ?? WELCOME_CREDITS;
      if (required > available) {
        // Never imply the campaign will run when it cannot be paid for.
        setAfford({ required, available });
        return;
      }
      window.setTimeout(dismissModal, 1400);
    } catch (error) {
      if (options.silent) {
        // A dismiss must always close; the grant RPC is idempotent and retried later.
        dismissModal();
        return;
      }
      toast({
        title: "Could not add your credits",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setGranting(false);
    }
  };

  const handleStarter = () => {
    choiceMade.current = true;
    void persistOfferState("starter");
    track("onboarding_plan_choice", { choice: "starter" });
    track("starter_selected", { plan_key: "starter" });
    // Checkout returns INTO the app (never /auth) with the session intact.
    void startPlanCheckout("starter", { returnPath: destination });
  };



  if (!open) {
    return <GatedPlanDialog open={gatedOpen} onOpenChange={setGatedOpen} planName={null} />;
  }

  return (
    <>
      <div className="fixed inset-0 z-[75] flex items-center justify-center overflow-y-auto p-3 sm:p-4">
        <button
          type="button"
          aria-label="Close"
          onClick={close}
          className="absolute inset-0 cursor-default bg-slate-950/70 backdrop-blur-md"
        />

        <div
          role="dialog"
          aria-modal="true"
          aria-label="Unlock more FUSE"
          className={cn(
            "relative my-auto w-full rounded-[1.75rem] border border-white/10 bg-slate-950/95 p-6 shadow-[0_28px_90px_rgba(0,0,0,0.6)] sm:p-10",
            // One paid plan → focused, narrow single-offer layout.
            // More than one → keep the wider multi-column pricing width.
            singleOffer ? "max-w-[880px]" : "max-w-[1140px]",
          )}
        >
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="absolute right-5 top-5 rounded-full p-2 text-slate-400 transition-colors hover:bg-white/5 hover:text-white sm:right-6 sm:top-6"
          >
            <X className="h-4 w-4" />
          </button>


          {afford ? (
            <div className="py-2">
              <h2 className="font-display text-[1.5rem] font-bold tracking-[-0.03em] text-white">
                YOUR ACCOUNT IS READY
              </h2>
              <p className="mt-2.5 text-sm leading-6 text-slate-300">
                {afford.available.toLocaleString()} credits available. This campaign requires{" "}
                {afford.required.toLocaleString()} credits. Your uploads and setup are saved.
              </p>
              <div className="mt-6 flex flex-col gap-2 sm:flex-row">
                <Button
                  onClick={handleStarter}
                  disabled={checkoutLoading === "starter"}
                  className="rounded-full bg-cyan-300 px-5 font-semibold text-slate-950 hover:bg-cyan-200"
                >
                  {checkoutLoading === "starter" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  View Starter
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    dismissModal();
                    navigate(destination);
                  }}
                  className="rounded-full border-white/15 bg-white/5 text-foreground hover:bg-white/10"
                >
                  Explore free templates
                </Button>
              </div>
            </div>
          ) : granted ? (
            <div className="py-6 text-center">
              <p className="font-display text-lg font-semibold tracking-[-0.02em] text-cyan-100">
                ✓ {WELCOME_CREDITS} credits added
              </p>
              <p className="mt-2 text-sm text-slate-400">You&apos;re ready to explore FUSE.</p>
            </div>
          ) : (
            <>
              <div
                className={cn(
                  "mx-auto flex w-full flex-col",
                  singleOffer ? "max-w-[640px] items-stretch" : "max-w-none",
                )}
              >
                <h2 className="pr-8 font-display text-[1.6rem] font-bold leading-[1.1] tracking-[-0.03em] text-white sm:text-[2.05rem]">
                  UNLOCK MORE FUSE.
                </h2>
                <p className="mt-3 text-[13.5px] leading-6 text-slate-400">
                  Get enough credits to build full campaigns — or continue free with {WELCOME_CREDITS} credits.
                </p>

                <div className={cn("mt-7", singleOffer ? "grid gap-3" : "grid gap-3 sm:grid-cols-2")}>
                  {/* STARTER — live Stripe checkout */}
                  <CompactPlanCard
                    entry={STARTER}
                    icon={Zap}
                    accent={{
                      shell: "border-cyan-300/30 bg-cyan-300/[0.06]",
                      text: "text-cyan-100",
                      check: "text-cyan-200",
                      block: "border-cyan-300/25 bg-cyan-300/[0.07]",
                      cta: "bg-cyan-300 text-slate-950 hover:bg-cyan-200",
                    }}
                    headline="Start creating."
                    footnote="Billed monthly · cancel anytime"
                    ctaLabel={`Start with ${STARTER.name} →`}
                    ctaLoading={checkoutLoading === "starter"}
                    onSelect={handleStarter}
                  />
                </div>

                <div className="mt-5 text-center">
                  <button
                    type="button"
                    onClick={() => void handleFree()}
                    disabled={granting}
                    className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[11.5px] font-normal text-slate-500 transition-colors hover:text-slate-300 disabled:opacity-60"
                  >
                    {granting ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                    Continue with free — {WELCOME_CREDITS} credits
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <GatedPlanDialog open={gatedOpen} onOpenChange={setGatedOpen} planName={null} />

    </>
  );
}
