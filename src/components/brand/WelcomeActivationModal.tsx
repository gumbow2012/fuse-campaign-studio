/**
 * FIRST-RUN MODAL — the one-time welcome shown right after account creation.
 *
 * Mounted ONCE at the app root. It renders only when the Phase 1 resolver says
 * level === "modal", the user is inside the app shell, and it has not already
 * appeared this session. Onboarding is never forced — "Explore FUSE First"
 * always works and persists a deferral so this does not nag.
 *
 * ACCOUNT-FIRST: the middle content is the verified Starter offer (display only,
 * real numbers from starterWelcomeOffer). No credits are granted here — credits
 * come exclusively from the authoritative billing webhook.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowRight, Loader2, Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useBrand } from "@/contexts/BrandContext";
import { useBrandActivation } from "@/hooks/useBrandActivation";
import { useMembershipCheckout } from "@/hooks/useMembershipCheckout";
import { STRIPE_TIERS } from "@/lib/stripe-config";
import {
  STARTER_WELCOME_BADGE,
  isStarterWelcomeOfferEligible,
  starterWelcomePrice,
} from "@/lib/starterWelcomeOffer";
import {
  ACTIVATION_EVENTS,
  ONBOARDING_ROUTE,
  buildActivationStatePatch,
} from "@/lib/brandActivation";
import {
  markWelcomeShownThisSession,
  welcomeShownThisSession,
  writeLocalActivationState,
} from "@/lib/brandActivationLocal";
import { patchBrandMetadata } from "@/services/brandProfiles";
import { track } from "@/lib/analytics/track";

const MARKETPLACE_ROUTE = "/app/templates";
const ACCOUNT_CREATED_KEY = "fuse.accountCreatedTracked";

/** Signed-in product surfaces only — never over /auth or public marketing pages. */
function insideAppShell(pathname: string): boolean {
  if (pathname.startsWith("/auth")) return false;
  if (pathname.startsWith(ONBOARDING_ROUTE)) return false;
  return pathname.startsWith("/app") || pathname === "/account";
}

const usd = (dollars: number) =>
  dollars.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 });

/** account_created fires once per user id, covering email and OAuth signups. */
function trackAccountCreatedOnce(userId: string | undefined) {
  if (!userId) return;
  try {
    const raw = window.localStorage.getItem(ACCOUNT_CREATED_KEY);
    if (raw === userId) return;
    window.localStorage.setItem(ACCOUNT_CREATED_KEY, userId);
  } catch {
    /* storage unavailable — still fire once for this session */
  }
  track("account_created", { surface: "first_run_modal" });
}

export default function WelcomeActivationModal() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { user, profile, loading: authLoading } = useAuth();
  const { activeBrand } = useBrand();
  const { nudge, activationState, loading } = useBrandActivation();
  const { loading: checkoutLoading, startPlanCheckout } = useMembershipCheckout();

  const [open, setOpen] = useState(false);
  const decided = useRef(false);

  const starter = STRIPE_TIERS.starter;
  const starterEligible = isStarterWelcomeOfferEligible(
    profile
      ? {
          plan: profile.plan,
          subscriptionStatus: profile.subscription_status,
          stripeSubscriptionId: profile.stripe_subscription_id,
        }
      : null,
  );
  const discounted = starterWelcomePrice(starter.price);

  const eligible = useMemo(
    () =>
      !authLoading &&
      !loading &&
      !!user &&
      nudge?.level === "modal" &&
      insideAppShell(pathname),
    [authLoading, loading, user, nudge?.level, pathname],
  );

  // Opens at most once per session and never reopens on route changes.
  useEffect(() => {
    if (decided.current || !eligible) return;
    if (welcomeShownThisSession()) {
      decided.current = true;
      return;
    }
    decided.current = true;
    markWelcomeShownThisSession();
    setOpen(true);
    trackAccountCreatedOnce(user?.id);
    track(ACTIVATION_EVENTS.nudgeShown, { level: "modal", reason: nudge?.reason ?? "no_brand" });
    track("starter_welcome_offer_viewed", { surface: "first_run_modal", plan_key: "starter" });
    void persist({ shownAt: new Date().toISOString() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eligible]);

  async function persist(change: Record<string, string>) {
    try {
      if (activeBrand) {
        await patchBrandMetadata(activeBrand, buildActivationStatePatch(activationState, change));
      } else {
        writeLocalActivationState(user?.id, change);
      }
    } catch {
      /* cadence state is best-effort — never block the UI */
    }
  }

  /** Paid-first: authoritative billing grants the credits, never the client. */
  const startStarter = () => {
    track("starter_welcome_offer_clicked", { surface: "first_run_modal", plan_key: "starter" });
    void startPlanCheckout("starter");
  };

  const explore = () => {
    setOpen(false);
    void persist({ deferredAt: new Date().toISOString() });
    track(ACTIVATION_EVENTS.onboardingDeferred, { source: "welcome_modal" });
    track("explore_fuse_first_clicked", { surface: "first_run_modal" });
    navigate(MARKETPLACE_ROUTE);
  };

  if (!open) return null;

  return (
    <Dialog open onOpenChange={(next) => (next ? null : explore())}>
      <DialogContent className="max-w-lg overflow-hidden border-cyan-200/20 bg-[#070b16] p-0">
        <div className="pointer-events-none absolute inset-x-0 -top-24 h-48 bg-[radial-gradient(60%_100%_at_50%_100%,rgba(56,189,248,0.28),transparent)]" />
        <div className="relative space-y-6 p-7 sm:p-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200/25 bg-white/[0.04] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-100">
            <Sparkles className="h-3 w-3" aria-hidden />
            Get started
          </div>

          <div className="space-y-3">
            <DialogTitle className="text-2xl font-semibold uppercase tracking-[0.12em] text-foreground sm:text-3xl">
              Welcome to FUSE.
            </DialogTitle>
            <DialogDescription className="text-sm leading-relaxed text-muted-foreground sm:text-base">
              Ready to run your first campaign?
            </DialogDescription>
          </div>

          <div className="rounded-2xl border border-cyan-200/30 bg-cyan-400/[0.06] p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-100">
                {starter.name}
              </span>
              <span className="rounded-full border border-cyan-200/40 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.18em] text-cyan-100">
                Start here
              </span>
              {starterEligible ? (
                <span className="rounded-full bg-cyan-300 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.18em] text-slate-950">
                  20% off
                </span>
              ) : null}
            </div>

            <p className="mt-2 text-sm text-foreground/85">
              {starter.monthlyCredits.toLocaleString()} credits / month · ≈ 3 typical campaigns
            </p>

            <p className="mt-1 text-sm text-muted-foreground">
              {starterEligible ? (
                <>
                  <span className="line-through">{usd(starter.price)}</span>{" "}
                  <span className="font-semibold text-cyan-200">{usd(discounted)}</span>{" "}
                  <span className="text-xs uppercase tracking-[0.14em]">First month</span>
                </>
              ) : (
                <span className="font-semibold text-cyan-200">{usd(starter.price)}/mo</span>
              )}
            </p>
            {starterEligible ? (
              <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-200/90">
                {STARTER_WELCOME_BADGE}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-2.5 sm:flex-row">
            <Button
              onClick={startStarter}
              disabled={Boolean(checkoutLoading)}
              className="flex-1 gap-2 font-semibold uppercase tracking-[0.14em]"
            >
              {checkoutLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Sparkles className="h-4 w-4" aria-hidden />
              )}
              Start with {starter.name}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Button>
            <Button
              variant="outline"
              onClick={explore}
              className="flex-1 border-white/15 bg-white/[0.03] font-medium uppercase tracking-[0.14em]"
            >
              Explore FUSE First
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
