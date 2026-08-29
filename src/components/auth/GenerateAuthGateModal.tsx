/**
 * GENERATE AUTH GATE (Conversion pass P2)
 *
 * A logged-out visitor who clicks "Generate campaign →" never leaves the
 * builder: the page behind is dimmed/blurred (their work is still right there)
 * and this split-screen modal offers the SAME universal auth actions used on
 * /auth — campaign media on the left, auth on the right.
 *
 * Nothing has been generated at this point — the copy never claims otherwise.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import UniversalAuthPanel from "@/components/auth/UniversalAuthPanel";
import { usePendingReferral } from "@/hooks/usePendingReferral";
import { getAbsoluteSiteUrl } from "@/lib/site-url";
import { writePendingAuthIntent } from "@/lib/pendingAuthIntent";
import { getPendingGenerationIntent } from "@/lib/pendingGenerationIntent";
import { track } from "@/lib/analytics/track";
import { useMembershipCheckout } from "@/hooks/useMembershipCheckout";


type Props = {
  open: boolean;
  onClose: () => void;
  templateId?: string | null;
  /** Internal path to come back to after auth. */
  returnTo: string;
};

/** Existing, already-optimized campaign previews from /public/template-previews. */
const SLIDES = [
  { src: "/template-previews/paparazzi.gif", title: "Paparazzi", line: "Rebuild proven campaign structures for your brand." },
  { src: "/template-previews/ugc-mirror.gif", title: "Outfit Swap", line: "Paste the campaign. Add your product." },
  { src: "/template-previews/garage.gif", title: "Garage", line: "One template. Your version." },
  { src: "/template-previews/armored-truck.gif", title: "Armored Truck", line: "Cinematic drops without a production crew." },
] as const;

const SLIDE_MS = 5200;

function GateMediaPanel() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [loaded, setLoaded] = useState<number[]>([0]);

  useEffect(() => {
    if (paused) return;
    const timer = window.setTimeout(() => setIndex((current) => (current + 1) % SLIDES.length), SLIDE_MS);
    return () => window.clearTimeout(timer);
  }, [index, paused]);

  // Only mount slides we have actually reached (keeps the gif payload lazy).
  useEffect(() => {
    setLoaded((current) => (current.includes(index) ? current : [...current, index]));
  }, [index]);

  const active = SLIDES[index];

  return (
    <div
      className="relative min-h-[220px] overflow-hidden bg-black md:min-h-full"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      {SLIDES.map((slide, slideIndex) =>
        loaded.includes(slideIndex) ? (
          <img
            key={slide.src}
            src={slide.src}
            alt={`${slide.title} campaign preview`}
            aria-hidden={slideIndex !== index}
            className={cn(
              "absolute inset-0 h-full w-full object-cover transition-opacity duration-700 motion-reduce:transition-none",
              slideIndex === index ? "opacity-100" : "opacity-0",
            )}
          />
        ) : null,
      )}

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/25 to-transparent" />

      <div className="absolute inset-x-0 bottom-0 p-5 md:p-7">
        <p className="font-display text-[10px] font-bold uppercase tracking-[0.28em] text-cyan-200">{active.title}</p>
        <p className="mt-1.5 max-w-[22rem] font-display text-base font-semibold leading-snug tracking-[-0.02em] text-white md:text-lg">
          {active.line}
        </p>

        <div className="mt-4 flex items-center gap-1.5" role="tablist" aria-label="Campaign previews">
          {SLIDES.map((slide, slideIndex) => (
            <button
              key={slide.src}
              type="button"
              role="tab"
              aria-selected={slideIndex === index}
              aria-label={slide.title}
              onClick={() => {
                setIndex(slideIndex);
                setPaused(true);
              }}
              className={cn(
                "h-1 rounded-full transition-all motion-reduce:transition-none",
                slideIndex === index ? "w-7 bg-cyan-300" : "w-3 bg-white/25 hover:bg-white/50",
              )}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function GenerateAuthGateModal({ open, onClose, templateId, returnTo }: Props) {
  // Referral capture keeps working exactly as it does on /auth.
  usePendingReferral();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose, open]);

  // The intended destination + template must survive an OAuth round-trip.
  useEffect(() => {
    if (!open) return;
    writePendingAuthIntent({ returnTo, templateId: templateId ?? undefined });
  }, [open, returnTo, templateId]);

  const redirectTo = useMemo(() => getAbsoluteSiteUrl("/auth"), []);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4">
      {/* Blur + dim: the builder stays faintly visible behind the gate. */}
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-slate-950/70 backdrop-blur-md"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Create a free account to generate"
        className="relative grid max-h-[92vh] w-full max-w-[1040px] overflow-y-auto rounded-[1.75rem] border border-white/10 bg-slate-950/95 shadow-[0_28px_90px_rgba(0,0,0,0.6)] md:max-h-[86vh] md:grid-cols-[1.05fr_1fr] md:overflow-hidden md:rounded-[2rem]"
      >
        <GateMediaPanel />

        <div className="relative flex flex-col justify-center p-5 sm:p-8 md:overflow-y-auto">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-3 top-3 rounded-full p-2 text-slate-400 transition-colors hover:bg-white/5 hover:text-white sm:right-4 sm:top-4"
          >
            <X className="h-4 w-4" />
          </button>

          <h2 className="pr-8 font-display text-[1.5rem] font-bold leading-tight tracking-[-0.03em] text-white sm:text-[1.75rem]">
            YOUR CAMPAIGN IS READY.
          </h2>
          <p className="mt-2.5 text-sm leading-6 text-slate-400">
            Create your FUSE account to generate the version you just built.
          </p>

          <UniversalAuthPanel
            className="mt-6"
            oauthRedirectTo={redirectTo}
            initialMode="signup"
            emailCtaLabel={"Create account & generate"}
            authSurface="generate_gate"
            onBeforeRedirect={() => writePendingAuthIntent({ returnTo, templateId: templateId ?? undefined })}
            onAuthenticated={() => {
              track("generate_auth_completed", { template_id: templateId ?? null });
              // Leave the captured intent in place, then CLOSE the gate so the
              // normal post-auth flow can advance (plan offer → restore/auto-run).
              // Never leave the user staring at the gate after a successful auth.
              void getPendingGenerationIntent();
              onClose();
            }}
          />

          {/* CHECKOUT-FIRST: buy now, no account/OTP. Stripe collects the email. */}
          <button
            type="button"
            disabled={Boolean(checkoutLoading)}
            onClick={() => {
              track("guest_checkout_started", { template_id: templateId ?? null });
              void startPlanCheckout("starter", { returnPath: returnTo, templateId: templateId ?? undefined });
            }}
            className="mt-4 w-full rounded-full border border-cyan-300/40 px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100 transition-colors hover:bg-cyan-300/10 disabled:opacity-60"
          >
            {checkoutLoading ? "Opening checkout…" : "Skip signup — pay & generate"}
          </button>

          <p className="mt-5 text-center text-[11px] leading-5 text-slate-500">
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
        </div>
      </div>
    </div>
  );
}
