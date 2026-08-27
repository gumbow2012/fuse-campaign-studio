/**
 * GENERATE AUTH GATE (P2)
 *
 * A logged-out visitor who clicks "Generate campaign →" never leaves the
 * builder: the page behind is dimmed/blurred (their work is still right there)
 * and this modal offers the SAME universal auth actions used on /auth.
 *
 * Nothing has been generated at this point — the copy never claims otherwise.
 */
import { useEffect } from "react";
import { X } from "lucide-react";
import UniversalAuthPanel from "@/components/auth/UniversalAuthPanel";
import { usePendingReferral } from "@/hooks/usePendingReferral";
import { getAbsoluteSiteUrl } from "@/lib/site-url";
import { writePendingAuthIntent } from "@/lib/pendingAuthIntent";
import { getPendingGenerationIntent } from "@/lib/pendingGenerationIntent";

type Props = {
  open: boolean;
  onClose: () => void;
  templateId?: string | null;
  /** Internal path to come back to after auth. */
  returnTo: string;
};

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

  if (!open) return null;

  const redirectTo = getAbsoluteSiteUrl("/auth");

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
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
        className="relative w-full max-w-[480px] rounded-[2rem] border border-white/10 bg-slate-950/90 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.55)] sm:p-8"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 rounded-full p-2 text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>

        <h2 className="pr-8 font-display text-[1.6rem] font-bold leading-tight tracking-[-0.03em] text-white">
          YOUR CAMPAIGN IS READY TO GENERATE.
        </h2>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          Create a free account to generate the version you just built.
        </p>

        <UniversalAuthPanel
          className="mt-7"
          oauthRedirectTo={redirectTo}
          emailRedirectTo={redirectTo}
          emailCtaLabel="Create account &amp; generate"
          onBeforeRedirect={() => writePendingAuthIntent({ returnTo, templateId: templateId ?? undefined })}
          onAuthenticated={() => {
            // P4 owns the auto-run; here we just leave the captured intent in
            // place and let the app continue on this route.
            void getPendingGenerationIntent();
          }}
          showTerms
        />

        <p className="mt-6 text-center text-[11px] leading-5 text-slate-500">
          Your uploads are saved for this session. You won&apos;t have to start over.
        </p>
        <p className="mt-2 text-center text-xs text-slate-400">
          Already have an account? <span className="font-semibold text-cyan-200">Sign in</span> with the same email or
          provider above.
        </p>
      </div>
    </div>
  );
}
