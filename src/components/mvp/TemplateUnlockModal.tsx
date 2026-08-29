import { useEffect, useState } from "react";
import { ArrowRight, Loader2, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useMembershipCheckout } from "@/hooks/useMembershipCheckout";
import { STRIPE_TIERS } from "@/lib/stripe-config";
import { track } from "@/lib/analytics/track";
import {
  STARTER_WELCOME_BADGE,
  starterWelcomePrice,
} from "@/lib/starterWelcomeOffer";
import { Link } from "react-router-dom";

/**
 * ACQUISITION — guest UNLOCK flow for one template.
 *
 * Two concise steps inside one sheet:
 *  1. confirmation — what you add, what you get, what it costs
 *  2. plan/checkout — Starter offer → existing guest create-checkout path
 *
 * No uploads happen here and no credits/billing logic lives here: checkout is
 * delegated to the existing `startPlanCheckout` (checkout_intent + claim flow).
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
  assetCount: number;
  /** Friendly input labels, when the template exposes them. */
  assetLabels?: string[];
  creditsRequired: number;
  /** Deep link back to this exact template after payment. */
  returnPath: string;
};

const usd = (dollars: number) =>
  dollars.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 });

const LABEL = "text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500";

export default function TemplateUnlockModal({
  open,
  onOpenChange,
  templateId,
  displayName,
  fullName,
  previewUrl,
  isVideo,
  outputsLabel,
  assetCount,
  assetLabels,
  creditsRequired,
  returnPath,
}: Props) {
  const [step, setStep] = useState<"confirm" | "plan">("confirm");
  const { loading, startPlanCheckout } = useMembershipCheckout();
  const starter = STRIPE_TIERS.starter;
  const busy = Boolean(loading);

  useEffect(() => {
    if (!open) {
      setStep("confirm");
      return;
    }
    track("template_confirmation_view", { template_id: templateId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open || step !== "plan") return;
    track("plan_offer_view", { template_id: templateId, plan_key: "starter" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-white/10 bg-slate-950 text-white sm:max-w-md">
        {step === "confirm" ? (
          <>
            <DialogHeader>
              <DialogTitle className="font-display text-2xl uppercase tracking-[-0.02em]">
                {displayName}
              </DialogTitle>
              <DialogDescription className="text-slate-400">
                Locked-in campaign. You add the products — FUSE builds the rest.
              </DialogDescription>
            </DialogHeader>

            <div className="flex gap-3">
              <div className="h-32 w-24 shrink-0 overflow-hidden rounded-xl bg-black ring-1 ring-white/10">
                {previewUrl ? (
                  isVideo ? (
                    <video
                      src={previewUrl}
                      className="h-full w-full object-cover"
                      muted
                      loop
                      autoPlay
                      playsInline
                      preload="metadata"
                    />
                  ) : (
                    <img
                      src={previewUrl}
                      alt={`${fullName} preview`}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  )
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <Sparkles className="h-5 w-5 text-cyan-200/60" aria-hidden />
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1 space-y-3">
                <div>
                  <p className={LABEL}>You'll add</p>
                  <p className="mt-1 text-sm text-white/90">
                    {assetCount} campaign asset{assetCount === 1 ? "" : "s"}
                  </p>
                  {assetLabels?.length ? (
                    <p className="mt-0.5 truncate text-[11px] text-slate-400">
                      {assetLabels.slice(0, 3).join(" · ")}
                    </p>
                  ) : null}
                </div>
                {outputsLabel ? (
                  <div>
                    <p className={LABEL}>You'll get</p>
                    <p className="mt-1 text-sm text-white/90">{outputsLabel}</p>
                  </div>
                ) : null}
                <div>
                  <p className={LABEL}>Campaign cost</p>
                  <p className="mt-1 text-sm text-cyan-200">
                    {creditsRequired.toLocaleString()} credits
                  </p>
                </div>
              </div>
            </div>

            <Button
              onClick={() => {
                track("template_unlock_click", { template_id: templateId, surface: "confirmation" });
                setStep("plan");
              }}
              className="mt-2 w-full justify-center rounded-full bg-cyan-300 font-display text-[12px] font-semibold uppercase tracking-[0.14em] text-slate-950 hover:bg-cyan-200"
            >
              Unlock this template
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Button>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="font-display text-2xl uppercase tracking-[-0.02em]">
                Unlock {displayName}
              </DialogTitle>
              <DialogDescription className="text-slate-400">
                This template uses {creditsRequired.toLocaleString()} credits.
              </DialogDescription>
            </DialogHeader>

            <div className="rounded-2xl border border-cyan-200/30 bg-cyan-400/[0.06] p-4">
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
              <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-200/90">
                {STARTER_WELCOME_BADGE}
              </p>
            </div>

            <Button
              onClick={() => {
                track("template_unlock_click", { template_id: templateId, surface: "plan_offer" });
                void startPlanCheckout("starter", {
                  templateId: templateId ?? undefined,
                  templateName: fullName,
                  returnPath,
                });
              }}
              disabled={busy}
              className="w-full justify-center rounded-full bg-cyan-300 font-display text-[12px] font-semibold uppercase tracking-[0.14em] text-slate-950 hover:bg-cyan-200"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              Continue to payment
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Button>

            <p className="text-center text-xs text-slate-500">
              Need more capacity?{" "}
              <Link to="/pricing" className="text-cyan-200 underline-offset-4 hover:underline">
                Pro and Studio
              </Link>{" "}
              are available too.
            </p>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
