import { useEffect } from "react";
import { ArrowRight, Loader2, Sparkles, X } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useMembershipCheckout } from "@/hooks/useMembershipCheckout";
import { STRIPE_TIERS } from "@/lib/stripe-config";
import { track } from "@/lib/analytics/track";
import {
  STARTER_WELCOME_BADGE,
  starterWelcomePrice,
} from "@/lib/starterWelcomeOffer";

/**
 * ACQUISITION — PAYMENT-FIRST access modal for one template.
 *
 * Single split-layout surface (large campaign media left, checkout panel right)
 * that replaces both the former "confirmation → plan" sheet and the
 * account-creation gate. No account fields appear before payment: checkout is
 * delegated to the existing guest `startPlanCheckout` (checkout_intent + claim
 * flow), which is where Stripe collects the email.
 */

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templateId: string | null;
  /** Short customer-facing name (campaignDisplayName). */
  displayName: string;
  /** Canonical template name — used for checkout context only. */
  fullName: string;
  previewUrl?: string | null;
  isVideo?: boolean;
  /** "X images · Y video clips" from the shared formatter. */
  outputsLabel?: string | null;
  assetCount?: number;
  assetLabels?: string[];
  creditsRequired: number;
  /** Deep link back to this exact template after payment. */
  returnPath: string;
};

const usd = (dollars: number) =>
  dollars.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
  });

export default function TemplateUnlockModal({
  open,
  onOpenChange,
  templateId,
  displayName,
  fullName,
  previewUrl,
  isVideo,
  outputsLabel,
  creditsRequired,
  returnPath,
}: Props) {
  const { loading, startPlanCheckout } = useMembershipCheckout();
  const starter = STRIPE_TIERS.starter;
  const busy = Boolean(loading);
  const name = (displayName || fullName || "this template").toUpperCase();

  useEffect(() => {
    if (!open) return;
    track("template_confirmation_view", { template_id: templateId });
    track("plan_offer_view", { template_id: templateId, plan_key: "starter" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-0 sm:p-4">
      <button
        type="button"
        aria-label="Close"
        onClick={() => onOpenChange(false)}
        className="absolute inset-0 cursor-default bg-slate-950/75 backdrop-blur-md"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Unlock FUSE Studio"

        className="relative grid max-h-[100dvh] w-full max-w-full overflow-y-auto border border-white/10 bg-slate-950/95 shadow-[0_28px_90px_rgba(0,0,0,0.6)] sm:max-h-[92vh] sm:max-w-[1040px] sm:rounded-[1.75rem] md:max-h-[88vh] md:grid-cols-[1.05fr_1fr] md:grid-rows-1 md:overflow-hidden md:rounded-[2rem]"
      >
        {/* LEFT — the selected template's real preview, full-bleed. */}
        <div className="relative h-[32vh] overflow-hidden bg-black sm:h-auto sm:min-h-[220px] md:min-h-full">
          {previewUrl ? (
            isVideo ? (
              <video
                src={previewUrl}
                className="absolute inset-0 h-full w-full object-cover"
                muted
                loop
                autoPlay
                playsInline
                preload="metadata"
              />
            ) : (
              <img
                src={previewUrl}
                alt={`${fullName} campaign preview`}
                className="absolute inset-0 h-full w-full object-cover"
              />
            )
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <Sparkles className="h-6 w-6 text-cyan-200/60" aria-hidden />
            </div>
          )}

          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/25 to-transparent" />

          <div className="absolute inset-x-0 bottom-0 p-5 md:p-7">
            <p className="font-display text-[10px] font-bold uppercase tracking-[0.28em] text-cyan-200">
              {name}
            </p>
            <p className="mt-1.5 max-w-[22rem] font-display text-base font-semibold leading-snug tracking-[-0.02em] text-white md:text-lg">
              Your first drop.
            </p>

          </div>
        </div>

        {/* RIGHT — checkout panel. Payment first: no account fields here. */}
        <div className="relative flex flex-col justify-center p-5 sm:p-8 md:overflow-y-auto">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="Close"
            className="absolute right-3 top-3 rounded-full p-2 text-slate-400 transition-colors hover:bg-white/5 hover:text-white sm:right-4 sm:top-4"
          >
            <X className="h-4 w-4" />
          </button>

          <h2 className="pr-8 font-display text-[1.5rem] font-bold uppercase leading-tight tracking-[-0.03em] text-white sm:text-[1.75rem]">
            Unlock FUSE Studio
          </h2>
          <p className="mt-2.5 text-sm leading-6 text-slate-400">
            Start with {displayName || fullName} — then run every template, as many campaigns as you
            want.
          </p>


          <p className="mt-4 text-sm text-white/85">
            This template uses{" "}
            <span className="font-semibold text-cyan-200">
              {creditsRequired.toLocaleString()} credits
            </span>
            .
            {outputsLabel ? (
              <span className="text-slate-400"> You get {outputsLabel}.</span>
            ) : null}
          </p>

          <div className="mt-4 rounded-2xl border border-cyan-200/30 bg-cyan-400/[0.06] p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-100">
                {starter.name}
              </span>
              <span className="rounded-full border border-cyan-200/40 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.18em] text-cyan-100">
                Start here
              </span>
              <span className="rounded-full bg-cyan-300 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.18em] text-slate-950">
                20% off
              </span>
            </div>
            <p className="mt-2 text-sm text-white/85">
              {starter.monthlyCredits.toLocaleString()} credits / month
            </p>
            <p className="mt-1 text-sm text-slate-300">
              <span className="line-through">{usd(starter.price)}</span>{" "}
              <span className="font-semibold text-cyan-200">
                {usd(starterWelcomePrice(starter.price))}
              </span>{" "}
              <span className="text-xs uppercase tracking-[0.14em]">First month</span>
            </p>
            <p className="mt-2 text-[11px] leading-5 text-slate-400">
              {starter.monthlyCredits.toLocaleString()} credits/month — enough for{" "}
              {displayName || fullName} plus dozens more clips across the whole library.
            </p>
            <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-200/90">
              {STARTER_WELCOME_BADGE}
            </p>

          </div>

          <p className="mt-2 text-[11px] text-slate-500">
            Need more capacity?{" "}
            <Link to="/pricing" className="text-cyan-200 underline-offset-4 hover:underline">
              Pro and Studio
            </Link>{" "}
            are available.
          </p>

          <Button
            onClick={() => {
              track("guest_checkout_started", { template_id: templateId });
              track("template_unlock_click", { template_id: templateId, surface: "access_modal" });
              void startPlanCheckout("starter", {
                templateId: templateId ?? undefined,
                templateName: fullName,
                returnPath,
              });
            }}
            disabled={busy}
            className="mt-5 w-full justify-center rounded-full bg-cyan-300 py-6 font-display text-[12px] font-semibold uppercase tracking-[0.16em] text-slate-950 hover:bg-cyan-200"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Start creating
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Button>

          <p className="mt-4 text-center text-[11px] leading-5 text-slate-500">
            Your uploads and campaign setup will be preserved.
          </p>

          <p className="mt-1.5 text-center text-[11px] leading-5 text-slate-500">
            By continuing, you agree to the{" "}
            <Link to="/terms" className="text-slate-300 underline underline-offset-2 hover:text-cyan-200">
              Terms
            </Link>{" "}
            and{" "}
            <Link to="/privacy" className="text-slate-300 underline underline-offset-2 hover:text-cyan-200">
              Privacy Policy
            </Link>
            .
          </p>

          <p className="mt-3 text-center text-[11px] text-slate-500">
            Already have an account?{" "}
            <Link
              to={`/auth?mode=signin&next=${encodeURIComponent(returnPath)}`}
              className="text-slate-300 underline underline-offset-2 hover:text-cyan-200"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
