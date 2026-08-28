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
import { Check, Loader2, Package, X, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { PLAN_LADDER } from "@/lib/planLadder";
import { useMembershipCheckout } from "@/hooks/useMembershipCheckout";
import GatedPlanDialog from "@/components/mvp/membership/GatedPlanDialog";
import { getPendingGenerationIntent } from "@/lib/pendingGenerationIntent";
import {
  hasActivePaidSubscription,
  markPlanOfferSeen,
  planOfferSeen,
  writePlanChoice,
} from "@/lib/onboardingPlanOffer";
import { track } from "@/lib/analytics/track";
import { setPlanOfferActive } from "@/lib/planOfferVisibility";

const WELCOME_CREDITS = 100;
/** A "genuinely new" account — the offer is an onboarding step, not a nag. */
const NEW_ACCOUNT_WINDOW_MS = 24 * 60 * 60 * 1000;

const STARTER = PLAN_LADDER.find((entry) => entry.key === "starter")!;
const CAPSULE = PLAN_LADDER.find((entry) => entry.key === "capsule")!;

const STARTER_BENEFITS = [
  "Full campaign templates",
  "Brand Workspace",
  "Premium image templates",
  "Saved products + brand assets",
  "Campaign history",
  "Credit top-ups",
];

const CAPSULE_BENEFITS = [
  "Everything in Starter",
  "More monthly credits",
  "FUSE Cast",
  "Higher campaign capacity",
];

function creditsLabel(credits: number | null) {
  return credits ? `${credits.toLocaleString()} credits/mo` : "";
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

  const isNewAccount = useMemo(() => {
    if (!user?.created_at) return false;
    return Date.now() - new Date(user.created_at).getTime() < NEW_ACCOUNT_WINDOW_MS;
  }, [user?.created_at]);

  useEffect(() => {
    if (decided.current) return;
    if (!user?.id || !profile) return;
    if (!isNewAccount) return;
    if (planOfferSeen(user.id)) return;
    if (hasActivePaidSubscription(profile.plan, profile.subscription_status)) return;

    let cancelled = false;

    const check = async () => {
      // Server-derived truth: a grant row means they already chose free.
      try {
        const { data, error } = await (supabase as unknown as {
          from: (table: string) => {
            select: (cols: string) => {
              eq: (col: string, value: string) => { limit: (n: number) => Promise<{ data: unknown[] | null; error: unknown }> };
            };
          };
        })
          .from("welcome_credit_grants")
          .select("id")
          .eq("user_id", user.id)
          .limit(1);
        // A missing table/permission is not a reason to spam the modal forever,
        // but it must not block a genuinely new account either.
        if (!error && Array.isArray(data) && data.length > 0) return;
      } catch {
        /* fall through — local seen flag still guards repeat displays */
      }
      if (cancelled) return;
      decided.current = true;
      setOpen(true);
      markPlanOfferSeen(user.id);
      track("onboarding_plan_offer_shown", { plan: profile.plan ?? "free" });
      // P7 funnel — canonical event name for the offer moment (fires once).
      track("onboarding_offer_shown", { plan_key: profile.plan ?? "free" });
    };


    void check();
    return () => {
      cancelled = true;
    };
  }, [isNewAccount, profile, user?.id]);

  // P6b — while this offer is on screen the builder must not auto-run.
  useEffect(() => {
    setPlanOfferActive(open);
    return () => setPlanOfferActive(false);
  }, [open]);

  // P7 — one funnel event per moment; a choice suppresses the "closed" event.
  const choiceMade = useRef(false);
  const closeTracked = useRef(false);

  const close = () => {
    if (!choiceMade.current && !closeTracked.current) {
      closeTracked.current = true;
      track("onboarding_offer_closed", {});
    }
    setOpen(false);
    setGranted(false);
    setAfford(null);
  };

  const handleFree = async () => {
    if (!user?.id) return;
    setGranting(true);
    try {
      const { data, error } = await supabase.rpc("grant_welcome_credits" as never);
      if (error) throw error;
      writePlanChoice(user.id, "free");
      choiceMade.current = true;
      track("onboarding_plan_choice", { choice: "free" });
      track("free_selected", {});
      const grantResult = data as { granted?: boolean } | boolean | null;
      const wasGranted =
        grantResult === true || (typeof grantResult === "object" && grantResult?.granted === true);
      if (wasGranted) track("welcome_credits_granted", { credits: WELCOME_CREDITS });
      const refreshed = await refreshProfile();
      setGranted(true);


      const intent = getPendingGenerationIntent();
      const required = intent?.creditCost ?? 0;
      const available = refreshed?.credits_balance ?? WELCOME_CREDITS;
      if (required > available) {
        // Never imply the campaign will run when it cannot be paid for.
        setAfford({ required, available });
        return;
      }
      window.setTimeout(close, 1400);
    } catch (error) {
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
    if (user?.id) writePlanChoice(user.id, "starter");
    choiceMade.current = true;
    track("onboarding_plan_choice", { choice: "starter" });
    track("starter_selected", { plan_key: "starter" });
    void startPlanCheckout("starter");
  };

  const handleCapsule = () => {
    if (user?.id) writePlanChoice(user.id, "capsule");
    choiceMade.current = true;
    track("onboarding_plan_choice", { choice: "capsule" });
    track("capsule_selected", { plan_key: "capsule" });
    setGatedOpen(true);
  };

  if (!open) {
    return <GatedPlanDialog open={gatedOpen} onOpenChange={setGatedOpen} planName={CAPSULE.name} />;
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
          className="relative my-auto w-full max-w-[860px] rounded-[1.75rem] border border-white/10 bg-slate-950/95 p-5 shadow-[0_28px_90px_rgba(0,0,0,0.6)] sm:p-8"
        >
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="absolute right-3 top-3 rounded-full p-2 text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
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
                    close();
                    navigate("/app/templates");
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
              <h2 className="pr-8 font-display text-[1.5rem] font-bold leading-tight tracking-[-0.03em] text-white sm:text-[1.9rem]">
                UNLOCK MORE FUSE.
              </h2>
              <p className="mt-2.5 max-w-[46rem] text-sm leading-6 text-slate-400">
                Get enough credits to build full campaigns — or continue free with {WELCOME_CREDITS} credits.
              </p>

              <div className="mt-6 grid gap-3 md:grid-cols-2">
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

                {/* CAPSULE — no Stripe price yet, early-access flow only */}
                <CompactPlanCard
                  entry={CAPSULE}
                  icon={Package}
                  tag="Most popular"
                  accent={{
                    shell: "border-violet-400/35 bg-violet-500/[0.09]",
                    text: "text-violet-100",
                    check: "text-violet-200",
                    block: "border-violet-400/30 bg-violet-500/[0.10]",
                    cta: "bg-violet-400 text-slate-950 hover:bg-violet-300",
                  }}
                  headline="Create consistently."
                  footnote="Early access — not open for checkout yet"
                  ctaLabel={`Choose ${CAPSULE.name}`}
                  onSelect={handleCapsule}
                />
              </div>



              <div className="mt-6 text-center">
                <button
                  type="button"
                  onClick={() => void handleFree()}
                  disabled={granting}
                  className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[13px] font-medium text-slate-300 underline underline-offset-4 transition-colors hover:text-cyan-100 disabled:opacity-60"
                >
                  {granting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  Continue with free — {WELCOME_CREDITS} credits
                </button>
                <p className="mt-1.5 text-[11px] text-slate-500">
                  Start with {WELCOME_CREDITS} FUSE credits. Upgrade anytime.
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      <GatedPlanDialog open={gatedOpen} onOpenChange={setGatedOpen} planName={CAPSULE.name} />
    </>
  );
}
