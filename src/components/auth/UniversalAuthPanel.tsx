/**
 * UNIVERSAL AUTH PANEL
 *
 * The single set of auth actions used everywhere (the /auth page and the
 * generate gate modal): OAuth (Google always, Apple / Microsoft behind env
 * flags) + a 6-digit email code. No passwords, no name field.
 *
 * Callers own the surrounding layout, copy and post-auth routing — this panel
 * only owns the auth mechanics so there is never a second auth flow.
 */
import { FormEvent, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { toast } from "@/hooks/use-toast";
import { track } from "@/lib/analytics/track";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";

export const APPLE_AUTH_ENABLED = import.meta.env.VITE_ENABLE_APPLE_AUTH === "true";
export const MICROSOFT_AUTH_ENABLED = import.meta.env.VITE_ENABLE_MICROSOFT_AUTH === "true";

const FIELD =
  "h-12 rounded-2xl border-white/10 bg-white/[0.04] text-white transition-colors focus-visible:border-cyan-300/60 focus-visible:ring-cyan-300/20";
const PRIMARY_CTA =
  "w-full rounded-full bg-cyan-300 py-6 text-[13px] font-semibold uppercase tracking-[0.14em] text-slate-950 shadow-[0_18px_50px_-18px_rgba(103,232,249,0.7)] transition-transform hover:bg-cyan-200 hover:-translate-y-0.5";
const OAUTH_BTN =
  "flex h-12 w-full items-center justify-center gap-3 rounded-2xl border border-white/12 bg-white/[0.04] text-sm font-semibold text-white transition-colors hover:border-cyan-300/40 hover:bg-white/[0.08] disabled:opacity-60";

/** k***@gmail.com — never render the full address back at the user. */
export function maskEmail(value: string) {
  const [local, domain] = value.split("@");
  if (!local || !domain) return value;
  return `${local.slice(0, 1)}***@${domain}`;
}

export function authErrorDescription(error: unknown, fallback: string) {
  if (!(error instanceof Error)) return fallback;
  const message = error.message;
  const normalized = message.toLowerCase();
  if (normalized.includes("security purposes") || normalized.includes("rate limit")) {
    return "Too many code requests. Wait a minute and try again.";
  }
  if (message === "Invalid login credentials") return "Invalid email or code.";
  return message;
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden width="18" height="18">
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.4a5.5 5.5 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.6-5.2 3.6-8.8Z" />
      <path fill="#34A853" d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.9-3a7.2 7.2 0 0 1-10.7-3.8H1.3v3.1A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.3a12 12 0 0 0 0 10.8l4-3.1Z" />
      <path fill="#EA4335" d="M12 4.8c1.8 0 3.4.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1A7.2 7.2 0 0 1 12 4.8Z" />
    </svg>
  );
}

function AppleMark() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden className="fill-white">
      <path d="M16.4 12.7c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.7-1.8-3.3-1.8-1.5-.1-2.8.8-3.5.8-.7 0-1.8-.8-3-.8-1.6 0-3 .9-3.9 2.3-1.7 2.9-.4 7.2 1.2 9.5.8 1.2 1.7 2.4 3 2.4 1.2 0 1.6-.8 3.1-.8 1.4 0 1.8.8 3 .7 1.3 0 2.1-1.2 2.9-2.3.9-1.3 1.3-2.6 1.3-2.7-.1 0-2.8-1.1-2.8-3.8ZM14.3 5.3c.6-.8 1-1.9.9-3-1 0-2.2.7-2.9 1.5-.6.7-1.1 1.8-1 2.9 1.1.1 2.3-.6 3-1.4Z" />
    </svg>
  );
}

function MicrosoftMark() {
  return (
    <svg viewBox="0 0 23 23" width="18" height="18" aria-hidden>
      <path fill="#F25022" d="M1 1h10v10H1z" />
      <path fill="#7FBA00" d="M12 1h10v10H12z" />
      <path fill="#00A4EF" d="M1 12h10v10H1z" />
      <path fill="#FFB900" d="M12 12h10v10H12z" />
    </svg>
  );
}

export type UniversalAuthPanelProps = {
  /** Absolute URL the provider / magic link returns to. */
  oauthRedirectTo: string;
  emailRedirectTo: string;
  /** Label for the email submit button on the first step. */
  emailCtaLabel?: string;
  /** Persist the caller's intent right before a provider round-trip. */
  onBeforeRedirect?: () => void;
  /** Fired after a successful OTP verification. */
  onAuthenticated?: (args: { userId?: string; isNewAccount: boolean }) => void;
  /** Optional prefill + auto-send (paid checkout hand-off). */
  autoRequestEmail?: string | null;
  /** Lets the caller swap its own headline when the code step opens. */
  onStepChange?: (step: "email" | "code") => void;
  showTerms?: boolean;
  className?: string;
  /** Non-PII label for analytics (e.g. "generate_gate", "auth_page"). */
  authSurface?: string;
};

export default function UniversalAuthPanel({
  oauthRedirectTo,
  emailRedirectTo,
  emailCtaLabel = "Continue with email",
  onBeforeRedirect,
  onAuthenticated,
  autoRequestEmail,
  onStepChange,
  showTerms = true,
  className,
  authSurface,
}: UniversalAuthPanelProps) {
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [submitting, setSubmitting] = useState(false);
  const [oauthPending, setOauthPending] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const autoRequested = useRef(false);

  useEffect(() => {
    onStepChange?.(step);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = window.setTimeout(() => setResendCooldown((current) => Math.max(current - 1, 0)), 1000);
    return () => window.clearTimeout(timer);
  }, [resendCooldown]);

  const requestCode = async (target: string) => {
    const { error } = await supabase.auth.signInWithOtp({
      email: target,
      options: {
        // One code path: existing email signs in, new email creates the account.
        shouldCreateUser: true,
        emailRedirectTo,
      },
    });
    if (error) throw error;
  };

  useEffect(() => {
    if (!autoRequestEmail || autoRequested.current || step !== "email") return;
    if (!autoRequestEmail.includes("@")) return;
    autoRequested.current = true;
    setEmail(autoRequestEmail);
    setSubmitting(true);
    void (async () => {
      try {
        await requestCode(autoRequestEmail);
        setStep("code");
        setResendCooldown(60);
      } catch {
        /* let the user submit manually */
      } finally {
        setSubmitting(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRequestEmail, step]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      if (step === "email") {
        track("auth_provider_selected", { provider: "email", surface: authSurface ?? null });
        await requestCode(email);
        setStep("code");
        setResendCooldown(60);
        toast({ title: "Code sent", description: `Enter the 6-digit code we sent to ${maskEmail(email)}.` });
      } else {
        const { data: verified, error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
        if (error) throw error;
        const verifiedUser = verified?.user;
        const createdAt = verifiedUser?.created_at ? new Date(verifiedUser.created_at).getTime() : NaN;
        const isNewAccount = Number.isFinite(createdAt) && Date.now() - createdAt < 60_000;
        onAuthenticated?.({ userId: verifiedUser?.id, isNewAccount });
      }
    } catch (error) {
      toast({
        title: "Authentication failed",
        description: authErrorDescription(error, "Could not complete authentication."),
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || !email) return;
    setSubmitting(true);
    try {
      await requestCode(email);
      setResendCooldown(60);
      toast({ title: "Code resent", description: `A new code is on the way to ${maskEmail(email)}.` });
    } catch (error) {
      toast({
        title: "Could not resend",
        description: authErrorDescription(error, "Could not resend the code."),
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleOAuth = async (provider: "google" | "apple" | "azure", label: string) => {
    setOauthPending(provider);
    track("auth_provider_selected", { provider, surface: authSurface ?? null });
    onBeforeRedirect?.();
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: oauthRedirectTo,
          ...(provider === "google" ? { queryParams: { prompt: "select_account" } } : {}),
        },
      });
      if (error) throw error;
    } catch (error) {
      toast({
        title: `${label} sign-in failed`,
        description: error instanceof Error ? error.message : `Could not start ${label} sign-in.`,
        variant: "destructive",
      });
      setOauthPending(null);
    }
  };

  const busy = submitting || Boolean(oauthPending);

  return (
    <div className={className}>
      {step === "email" ? (
        <>
          <div className="space-y-2.5">
            <button type="button" className={OAUTH_BTN} disabled={busy} onClick={() => void handleOAuth("google", "Google")}>
              {oauthPending === "google" ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleMark />}
              Continue with Google
            </button>

            {APPLE_AUTH_ENABLED ? (
              <button type="button" className={OAUTH_BTN} disabled={busy} onClick={() => void handleOAuth("apple", "Apple")}>
                {oauthPending === "apple" ? <Loader2 className="h-4 w-4 animate-spin" /> : <AppleMark />}
                Continue with Apple
              </button>
            ) : null}

            {MICROSOFT_AUTH_ENABLED ? (
              <button type="button" className={OAUTH_BTN} disabled={busy} onClick={() => void handleOAuth("azure", "Microsoft")}>
                {oauthPending === "azure" ? <Loader2 className="h-4 w-4 animate-spin" /> : <MicrosoftMark />}
                Continue with Microsoft
              </button>
            ) : null}
          </div>

          <div className="my-7 flex items-center gap-4">
            <span className="h-px flex-1 bg-white/10" />
            <span className="text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-500">or</span>
            <span className="h-px flex-1 bg-white/10" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <Input
              type="email"
              required
              autoComplete="email"
              inputMode="email"
              placeholder="you@brand.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className={FIELD}
              aria-label="Email address"
            />
            <Button type="submit" disabled={busy || !email} className={PRIMARY_CTA}>
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {emailCtaLabel} <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <p className="text-center text-xs text-slate-500">No password required.</p>
          </form>
        </>
      ) : (
        <>
          <p className="text-sm leading-6 text-slate-400">
            We sent a six-digit code to <span className="text-slate-200">{maskEmail(email)}</span>
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-5">
            <InputOTP
              maxLength={6}
              value={token}
              autoFocus
              onChange={(value) => setToken(value.replace(/\D/g, "").slice(0, 6))}
              containerClassName="justify-between gap-2"
            >
              <InputOTPGroup className="flex w-full justify-between gap-2">
                {[0, 1, 2, 3, 4, 5].map((index) => (
                  <InputOTPSlot
                    key={index}
                    index={index}
                    className="h-14 w-full rounded-2xl border border-white/10 bg-white/[0.04] font-display text-xl text-white first:rounded-l-2xl last:rounded-r-2xl"
                  />
                ))}
              </InputOTPGroup>
            </InputOTP>

            <Button type="submit" disabled={submitting || token.length < 6} className={PRIMARY_CTA}>
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Enter FUSE <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </form>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-xs">
            {resendCooldown > 0 ? (
              <span className="text-slate-500">Resend code in {resendCooldown}s</span>
            ) : (
              <button
                type="button"
                onClick={() => void handleResend()}
                disabled={submitting}
                className="font-semibold text-cyan-200 hover:text-cyan-100"
              >
                Resend code
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setStep("email");
                setToken("");
                setResendCooldown(0);
              }}
              className="inline-flex items-center gap-1.5 text-slate-400 hover:text-white"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Use a different email
            </button>
          </div>
        </>
      )}

      {showTerms ? (
        <p className="mt-8 text-center text-[11px] leading-5 text-slate-500">
          By continuing, you agree to the{" "}
          <Link to="/terms" className="text-slate-300 underline decoration-white/20 hover:text-white">
            Terms
          </Link>{" "}
          and{" "}
          <Link to="/privacy" className="text-slate-300 underline decoration-white/20 hover:text-white">
            Privacy Policy
          </Link>
          .
        </p>
      ) : null}
    </div>
  );
}
