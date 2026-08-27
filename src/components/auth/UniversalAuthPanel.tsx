/**
 * UNIVERSAL AUTH PANEL
 *
 * The single set of auth actions used everywhere (the /auth page and the
 * generate gate modal): OAuth (Google always, Apple / Microsoft behind env
 * flags) + email & password. Email confirmation is disabled, so signUp returns
 * an active session immediately.
 *
 * Callers own the surrounding layout, copy and post-auth routing — this panel
 * only owns the auth mechanics so there is never a second auth flow.
 */
import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { track } from "@/lib/analytics/track";
import { supabase } from "@/integrations/supabase/client";
import { getAbsoluteSiteUrl } from "@/lib/site-url";
import { ArrowRight, Eye, EyeOff, Loader2 } from "lucide-react";

export const APPLE_AUTH_ENABLED = import.meta.env.VITE_ENABLE_APPLE_AUTH === "true";
export const MICROSOFT_AUTH_ENABLED = import.meta.env.VITE_ENABLE_MICROSOFT_AUTH === "true";

export const MIN_PASSWORD_LENGTH = 8;

const FIELD =
  "h-12 rounded-2xl border-white/10 bg-white/[0.04] text-white transition-colors focus-visible:border-cyan-300/60 focus-visible:ring-cyan-300/20";
const PRIMARY_CTA =
  "w-full rounded-full bg-cyan-300 py-6 text-[13px] font-semibold uppercase tracking-[0.14em] text-slate-950 shadow-[0_18px_50px_-18px_rgba(103,232,249,0.7)] transition-transform hover:bg-cyan-200 hover:-translate-y-0.5";
const OAUTH_BTN =
  "flex h-12 w-full items-center justify-center gap-3 rounded-2xl border border-white/12 bg-white/[0.04] text-sm font-semibold text-white transition-colors hover:border-cyan-300/40 hover:bg-white/[0.08] disabled:opacity-60";

export type AuthMode = "signup" | "signin";

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
  if (normalized.includes("rate limit") || normalized.includes("security purposes")) {
    return "Too many attempts. Wait a minute and try again.";
  }
  if (normalized.includes("invalid login credentials")) {
    return "That email and password don’t match. Try again or reset your password.";
  }
  if (normalized.includes("password should be") || normalized.includes("password is too short")) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters for your password.`;
  }
  return message;
}

/** Supabase reports an existing account in a couple of shapes. */
function isEmailAlreadyRegistered(error: unknown) {
  if (!(error instanceof Error)) return false;
  const normalized = error.message.toLowerCase();
  return (
    normalized.includes("already registered") ||
    normalized.includes("already exists") ||
    normalized.includes("user already")
  );
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
  /** Absolute URL the provider returns to. */
  oauthRedirectTo: string;
  /** Which email flow to open with (driven by ?mode / the caller's surface). */
  initialMode?: AuthMode;
  /** Label for the email submit button (create-account mode). */
  emailCtaLabel?: string;
  /** Persist the caller's intent right before a provider round-trip. */
  onBeforeRedirect?: () => void;
  /** Fired after a successful sign-up / sign-in. */
  onAuthenticated?: (args: { userId?: string; isNewAccount: boolean }) => void;
  /** Optional email prefill (paid checkout hand-off). */
  autoRequestEmail?: string | null;
  /** Lets the caller mirror the current mode in its own headline. */
  onModeChange?: (mode: AuthMode) => void;
  showTerms?: boolean;
  className?: string;
  /** Non-PII label for analytics (e.g. "generate_gate", "auth_page"). */
  authSurface?: string;
};

export default function UniversalAuthPanel({
  oauthRedirectTo,
  initialMode = "signup",
  emailCtaLabel = "Create account",
  onBeforeRedirect,
  onAuthenticated,
  autoRequestEmail,
  onModeChange,
  showTerms = true,
  className,
  authSurface,
}: UniversalAuthPanelProps) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState(autoRequestEmail ?? "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existingAccount, setExistingAccount] = useState(false);
  const [oauthPending, setOauthPending] = useState<string | null>(null);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    onModeChange?.(mode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  useEffect(() => {
    if (autoRequestEmail && autoRequestEmail.includes("@")) setEmail(autoRequestEmail);
  }, [autoRequestEmail]);

  const switchMode = (next: AuthMode) => {
    setMode(next);
    setError(null);
    setExistingAccount(false);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setExistingAccount(false);

    if (mode === "signup" && password.length < MIN_PASSWORD_LENGTH) {
      setError(`Use at least ${MIN_PASSWORD_LENGTH} characters for your password.`);
      return;
    }

    setSubmitting(true);
    try {
      track("auth_provider_selected", { provider: "email", surface: authSurface ?? null });

      if (mode === "signup") {
        const { data, error: signUpError } = await supabase.auth.signUp({ email, password });
        if (signUpError) throw signUpError;
        // Email confirmation is off → a session is returned immediately.
        onAuthenticated?.({ userId: data?.user?.id, isNewAccount: true });
      } else {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
        onAuthenticated?.({ userId: data?.user?.id, isNewAccount: false });
      }
    } catch (caught) {
      if (mode === "signup" && isEmailAlreadyRegistered(caught)) {
        setExistingAccount(true);
        setError("That email already has an account.");
      } else {
        setError(authErrorDescription(caught, "Could not complete authentication."));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email.includes("@")) {
      setError("Enter your email first, then tap “Forgot password?”.");
      return;
    }
    setResetting(true);
    setError(null);
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: getAbsoluteSiteUrl("/reset-password"),
      });
      if (resetError) throw resetError;
      toast({
        title: "Reset link sent",
        description: `Follow the link we sent to ${maskEmail(email)} to set a new password.`,
      });
    } catch (caught) {
      setError(authErrorDescription(caught, "Could not send the reset link."));
    } finally {
      setResetting(false);
    }
  };

  const handleOAuth = async (provider: "google" | "apple" | "azure", label: string) => {
    setOauthPending(provider);
    track("auth_provider_selected", { provider, surface: authSurface ?? null });
    onBeforeRedirect?.();
    try {
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: oauthRedirectTo,
          ...(provider === "google" ? { queryParams: { prompt: "select_account" } } : {}),
        },
      });
      if (oauthError) throw oauthError;
    } catch (caught) {
      toast({
        title: `${label} sign-in failed`,
        description: caught instanceof Error ? caught.message : `Could not start ${label} sign-in.`,
        variant: "destructive",
      });
      setOauthPending(null);
    }
  };

  const busy = submitting || resetting || Boolean(oauthPending);
  const submitLabel = mode === "signup" ? emailCtaLabel : "Sign in";

  return (
    <div className={className}>
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

        <div className="relative">
          <Input
            type={showPassword ? "text" : "password"}
            required
            minLength={mode === "signup" ? MIN_PASSWORD_LENGTH : undefined}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            placeholder={mode === "signup" ? `Password (${MIN_PASSWORD_LENGTH}+ characters)` : "Password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className={`${FIELD} pr-12`}
            aria-label="Password"
          />
          <button
            type="button"
            onClick={() => setShowPassword((current) => !current)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-slate-400 transition-colors hover:text-white"
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>

        {error ? (
          <p role="alert" className="text-xs leading-5 text-rose-300">
            {error}{" "}
            {existingAccount ? (
              <button
                type="button"
                onClick={() => switchMode("signin")}
                className="font-semibold text-cyan-200 underline decoration-cyan-300/40 hover:text-cyan-100"
              >
                Sign in instead
              </button>
            ) : null}
          </p>
        ) : null}

        <Button type="submit" disabled={busy || !email || !password} className={PRIMARY_CTA}>
          {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {submitLabel} <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </form>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs">
        {mode === "signup" ? (
          <button type="button" onClick={() => switchMode("signin")} className="text-slate-400 hover:text-white">
            Already have an account? <span className="font-semibold text-cyan-200">Sign in</span>
          </button>
        ) : (
          <button type="button" onClick={() => switchMode("signup")} className="text-slate-400 hover:text-white">
            New here? <span className="font-semibold text-cyan-200">Create account</span>
          </button>
        )}
        <button
          type="button"
          onClick={() => void handleForgotPassword()}
          disabled={resetting}
          className="text-slate-400 hover:text-white disabled:opacity-60"
        >
          {resetting ? "Sending…" : "Forgot password?"}
        </button>
      </div>

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
