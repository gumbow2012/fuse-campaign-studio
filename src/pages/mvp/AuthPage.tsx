/**
 * AUTH — one universal, instant flow.
 *
 * No mode toggle, no marketing media, no name field. OAuth or a 6-digit email
 * code. Intended destination + referral code survive the OAuth round-trip via
 * pendingAuthIntent.
 */
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import SiteShell from "@/components/mvp/SiteShell";
import PageMeta from "@/components/mvp/PageMeta";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { getAbsoluteSiteUrl } from "@/lib/site-url";
import { checkoutEventId, clearPendingCheckout, readPendingCheckout, trackEventOnce } from "@/lib/metaPixel";
import { track } from "@/lib/analytics/track";
import { readPendingReferralCode, storePendingReferralCode } from "@/lib/pendingReferral";
import { usePendingReferral } from "@/hooks/usePendingReferral";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { ArrowLeft, ArrowRight, Loader2, Sparkles } from "lucide-react";
import {
  readPendingAuthIntent,
  resolveIntentDestination,
  sanitizeReturnTo,
  writePendingAuthIntent,
} from "@/lib/pendingAuthIntent";

const FUSE_ICON_SRC = "/fuse-icon.png?v=20260519";
const FUSE_WORDMARK_SRC = "/fuse-wordmark.png?v=20260519";

const CARD_SHELL =
  "rounded-[2rem] border border-white/10 bg-slate-950/75 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:p-8";
const FIELD =
  "h-12 rounded-2xl border-white/10 bg-white/[0.04] text-white transition-colors focus-visible:border-cyan-300/60 focus-visible:ring-cyan-300/20";
const PRIMARY_CTA =
  "w-full rounded-full bg-cyan-300 py-6 text-[13px] font-semibold uppercase tracking-[0.14em] text-slate-950 shadow-[0_18px_50px_-18px_rgba(103,232,249,0.7)] transition-transform hover:bg-cyan-200 hover:-translate-y-0.5";
const OAUTH_BTN =
  "flex h-12 w-full items-center justify-center gap-3 rounded-2xl border border-white/12 bg-white/[0.04] text-sm font-semibold text-white transition-colors hover:border-cyan-300/40 hover:bg-white/[0.08] disabled:opacity-60";

const APPLE_ENABLED = import.meta.env.VITE_ENABLE_APPLE_AUTH === "true";
const MICROSOFT_ENABLED = import.meta.env.VITE_ENABLE_MICROSOFT_AUTH === "true";

/** k***@gmail.com — never render the full address back at the user. */
function maskEmail(value: string) {
  const [local, domain] = value.split("@");
  if (!local || !domain) return value;
  return `${local.slice(0, 1)}***@${domain}`;
}

function authErrorDescription(error: unknown, fallback: string) {
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
    <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" aria-hidden width="18" height="18">
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

export default function AuthPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  const paidAccess = searchParams.get("paid") === "true";

  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [submitting, setSubmitting] = useState(false);
  const [oauthPending, setOauthPending] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [invited, setInvited] = useState(false);
  const autoRequested = useRef(false);

  // ---- pending intent: captured on arrival, replayed after auth ----------
  const intent = useMemo(() => {
    const templateId =
      searchParams.get("template") ||
      (typeof window !== "undefined" ? window.localStorage.getItem("fuse.n") : null);
    const referral = storePendingReferralCode(searchParams.get("ref")) ?? readPendingReferralCode();
    return writePendingAuthIntent({
      returnTo: sanitizeReturnTo(searchParams.get("returnTo")),
      templateId: templateId ?? undefined,
      referralCode: referral ?? undefined,
    });
  }, [searchParams]);

  const destination = resolveIntentDestination(intent);

  useEffect(() => {
    const referred = Boolean(searchParams.get("ref")) || Boolean(intent.referralCode);
    setInvited(referred || searchParams.get("invite") === "creator");
    if (searchParams.get("ref")) track("referral_landing", { source: "auth_query" });
  }, [intent.referralCode, searchParams]);

  usePendingReferral();

  // Paid checkout return telemetry (unchanged behaviour).
  useEffect(() => {
    if (searchParams.get("success") !== "true" && !paidAccess) return;
    const pending = readPendingCheckout();
    const sessionId = searchParams.get("session_id");
    const onceKey = sessionId ?? pending?.startedAt ?? searchParams.toString();
    trackEventOnce(
      `purchase.${onceKey}`,
      "Purchase",
      { value: pending?.value, currency: "USD", content_type: "product" },
      sessionId ? checkoutEventId("Purchase", sessionId) : undefined,
    );
    if (!pending || pending.mode === "subscription") {
      trackEventOnce(
        `subscribe.${onceKey}`,
        "Subscribe",
        { value: pending?.value, currency: "USD" },
        sessionId ? checkoutEventId("Subscribe", sessionId) : undefined,
      );
    }
    clearPendingCheckout();
  }, [paidAccess, searchParams]);

  // Already signed in (including an OAuth redirect return) → intended destination.
  useEffect(() => {
    if (!user || authLoading) return;
    navigate(destination, { replace: true });
  }, [authLoading, destination, navigate, user]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = window.setTimeout(() => setResendCooldown((current) => Math.max(current - 1, 0)), 1000);
    return () => window.clearTimeout(timer);
  }, [resendCooldown]);

  const emailRedirectTo = getAbsoluteSiteUrl(`/auth${paidAccess ? "?paid=true" : ""}`);

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

  // Paid checkout hand-off: pre-fill and send the code automatically.
  useEffect(() => {
    if (!paidAccess || autoRequested.current || step !== "email") return;
    const storedEmail = typeof window !== "undefined" ? window.localStorage.getItem("fuse.n") : null;
    if (!storedEmail || !storedEmail.includes("@")) return;
    autoRequested.current = true;
    setEmail(storedEmail);
    setSubmitting(true);
    void (async () => {
      try {
        await requestCode(storedEmail);
        setStep("code");
        setResendCooldown(60);
      } catch {
        /* let the user submit manually */
      } finally {
        setSubmitting(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paidAccess, step]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);

    try {
      if (step === "email") {
        await requestCode(email);
        setStep("code");
        setResendCooldown(60);
        toast({ title: "Code sent", description: `Enter the 6-digit code we sent to ${maskEmail(email)}.` });
      } else {
        const { data: verified, error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
        if (error) throw error;

        const verifiedUser = verified?.user;
        const createdAt = verifiedUser?.created_at ? new Date(verifiedUser.created_at).getTime() : NaN;
        // Genuinely new FUSE account → new-user activation (handled in the app shell).
        if (Number.isFinite(createdAt) && Date.now() - createdAt < 60_000) {
          trackEventOnce(`completeRegistration.${verifiedUser?.id}`, "CompleteRegistration");
          track("sign_up", { method: "email_otp", paid_access: Boolean(paidAccess) });
        }
        navigate(destination, { replace: true });
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
    if (!email || resendCooldown > 0) return;
    setSubmitting(true);
    try {
      await requestCode(email);
      setResendCooldown(60);
      toast({ title: "New code sent", description: `We sent another code to ${maskEmail(email)}.` });
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
    // Intent is already persisted — it survives the provider round-trip.
    writePendingAuthIntent(intent);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: getAbsoluteSiteUrl("/auth"),
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
    <SiteShell>
      <PageMeta
        title="Sign In or Create Your FUSE Account — FUSE"
        description="Enter FUSE. Continue with Google or your email — no password required."
        path="/auth"
      />

      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            background:
              "radial-gradient(60% 45% at 20% 5%, rgba(103,232,249,0.10), transparent 70%), radial-gradient(50% 40% at 85% 90%, rgba(56,189,248,0.07), transparent 70%)",
          }}
        />

        <div className="container relative flex min-h-[calc(100vh-90px)] items-center justify-center py-12">
          <div className="w-full max-w-[500px]">
            {invited ? (
              <p className="mb-4 flex items-center justify-center gap-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-200">
                <Sparkles className="h-3.5 w-3.5" /> You&apos;ve been invited to FUSE
              </p>
            ) : null}

            <div className={CARD_SHELL}>
              <div className="flex items-center gap-3">
                <img src={FUSE_ICON_SRC} alt="" className="h-9 w-9 rounded-xl object-contain" />
                <img src={FUSE_WORDMARK_SRC} alt="FUSE" className="h-4 w-auto object-contain" />
              </div>

              {step === "email" ? (
                <>
                  <h1 className="mt-7 font-display text-[2rem] font-bold leading-none tracking-[-0.04em] text-white">
                    ENTER FUSE.
                  </h1>
                  <p className="mt-3 text-sm leading-6 text-slate-400">
                    Create an account or sign in to continue.
                  </p>

                  <div className="mt-7 space-y-2.5">
                    <button
                      type="button"
                      className={OAUTH_BTN}
                      disabled={busy}
                      onClick={() => void handleOAuth("google", "Google")}
                    >
                      {oauthPending === "google" ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleMark />}
                      Continue with Google
                    </button>

                    {APPLE_ENABLED ? (
                      <button
                        type="button"
                        className={OAUTH_BTN}
                        disabled={busy}
                        onClick={() => void handleOAuth("apple", "Apple")}
                      >
                        {oauthPending === "apple" ? <Loader2 className="h-4 w-4 animate-spin" /> : <AppleMark />}
                        Continue with Apple
                      </button>
                    ) : null}

                    {MICROSOFT_ENABLED ? (
                      <button
                        type="button"
                        className={OAUTH_BTN}
                        disabled={busy}
                        onClick={() => void handleOAuth("azure", "Microsoft")}
                      >
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
                      Continue with email <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                    <p className="text-center text-xs text-slate-500">No password required.</p>
                  </form>
                </>
              ) : (
                <>
                  <h1 className="mt-7 font-display text-[2rem] font-bold leading-none tracking-[-0.04em] text-white">
                    CHECK YOUR EMAIL.
                  </h1>
                  <p className="mt-3 text-sm leading-6 text-slate-400">
                    We sent a six-digit code to <span className="text-slate-200">{maskEmail(email)}</span>
                  </p>

                  <form onSubmit={handleSubmit} className="mt-7 space-y-5">
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
            </div>
          </div>
        </div>
      </section>
    </SiteShell>
  );
}
