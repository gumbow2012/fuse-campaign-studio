import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import SiteShell from "@/components/mvp/SiteShell";
import PageMeta from "@/components/mvp/PageMeta";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { getAbsoluteSiteUrl } from "@/lib/site-url";
import { checkoutEventId, clearPendingCheckout, readPendingCheckout, trackEvent, trackEventOnce } from "@/lib/metaPixel";

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

export default function AuthPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, loading: authLoading, signOut } = useAuth();

  const paidAccess = searchParams.get("paid") === "true";
  const selectedTemplateParam = searchParams.get("template") || (typeof window !== "undefined" ? window.localStorage.getItem("fuse.checkoutTemplate") : null);
  const studioPath = selectedTemplateParam
    ? `/app/templates?template=${encodeURIComponent(selectedTemplateParam)}`
    : "/app/templates";
  const [mode, setMode] = useState<"signin" | "signup">(searchParams.get("mode") === "signup" ? "signup" : "signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [step, setStep] = useState<"request" | "verify">("request");
  const [submitting, setSubmitting] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [autoCodeRequested, setAutoCodeRequested] = useState(false);

  useEffect(() => {
    setMode(paidAccess ? "signin" : searchParams.get("mode") === "signup" ? "signup" : "signin");
    setStep("request");
    setToken("");
    setResendCooldown(0);
  }, [paidAccess, searchParams]);

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

  useEffect(() => {
    if (!user || authLoading) return;
    navigate(studioPath, { replace: true });
  }, [authLoading, navigate, studioPath, user]);

  useEffect(() => {
    if (resendCooldown <= 0) return;

    const timer = window.setTimeout(() => {
      setResendCooldown((current) => Math.max(current - 1, 0));
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [resendCooldown]);

  useEffect(() => {
    if (!paidAccess || autoCodeRequested || step !== "request" || submitting) return;
    const storedEmail = typeof window !== "undefined" ? window.localStorage.getItem("fuse.checkoutAccessEmail") : null;
    if (!storedEmail) return;

    setEmail(storedEmail);
    setAutoCodeRequested(true);
    window.setTimeout(() => {
      const form = document.getElementById("studio-access-form") as HTMLFormElement | null;
      form?.requestSubmit();
    }, 50);
  }, [autoCodeRequested, paidAccess, step, submitting]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);

    try {
      if (step === "request") {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: {
            // Use one code-based auth path so a fresh email never silently dead-ends.
            shouldCreateUser: true,
            data: name ? { full_name: name } : undefined,
            emailRedirectTo: getAbsoluteSiteUrl(`/auth${paidAccess && selectedTemplateParam ? `?paid=true&template=${encodeURIComponent(selectedTemplateParam)}` : ""}`),
          },
        });
        if (error) throw error;
        setStep("verify");
        toast({
          title: "Code sent",
          description: `Enter the 6-digit code we sent to ${email}.`,
        });
        setResendCooldown(60);
      } else {
        const { data: verified, error } = await supabase.auth.verifyOtp({
          email,
          token,
          type: "email",
        });
        if (error) throw error;

        const verifiedUser = verified?.user;
        if (verifiedUser?.created_at) {
          const createdAt = new Date(verifiedUser.created_at).getTime();
          const isNewAccount = Number.isFinite(createdAt) && Date.now() - createdAt < 5 * 60 * 1000;
          if (isNewAccount) {
            trackEventOnce(`completeRegistration.${verifiedUser.id}`, "CompleteRegistration");
          }
        }
        toast({
          title: "Verified",
          description: paidAccess ? "Opening your Fuse studio." : "Your access is active.",
        });
        navigate(studioPath, { replace: true });
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
    if (!email) return;
    setSubmitting(true);

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: true,
          data: name ? { full_name: name } : undefined,
          emailRedirectTo: getAbsoluteSiteUrl(`/auth${paidAccess && selectedTemplateParam ? `?paid=true&template=${encodeURIComponent(selectedTemplateParam)}` : ""}`),
        },
      });
      if (error) throw error;
      toast({
        title: "Code resent",
        description: `A new code was sent to ${email}.`,
      });
      setResendCooldown(60);
    } catch (error) {
      toast({
        title: "Could not resend code",
        description: authErrorDescription(error, "Try again."),
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setSubmitting(true);

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: getAbsoluteSiteUrl("/auth"),
          queryParams: {
            prompt: "select_account",
          },
        },
      });
      if (error) throw error;
    } catch (error) {
      toast({
        title: "Google sign-in failed",
        description: error instanceof Error ? error.message : "Could not start Google sign-in.",
        variant: "destructive",
      });
      setSubmitting(false);
    }
  };

  return (
    <SiteShell>
      <PageMeta
        title={mode === "signup" ? "Start Your First Campaign — FUSE" : "Sign In — FUSE"}
        description={
          mode === "signup"
            ? "Create your free Fuse account and launch your first streetwear drop campaign in minutes."
            : "Sign in to your Fuse account. No password needed — just your email."
        }
        path="/auth"
      />
      <section className="container flex min-h-[calc(100vh-90px)] items-center py-12">
        <div className="mx-auto grid w-full max-w-5xl gap-6 lg:grid-cols-[0.85fr_1.15fr]">
          <div className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-7">
            <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-cyan-100">Access</p>
            <h1 className="mt-4 font-display text-4xl font-bold tracking-[-0.05em] text-white md:text-5xl">
              {paidAccess
                ? "Check your email to open your Fuse studio."
                : mode === "signup"
                  ? "Start your first campaign."
                  : "Welcome back."}
            </h1>
            <p className="mt-4 text-base leading-7 text-slate-300">
              {paidAccess
                ? "We sent a secure access code to your email. Enter the code below to open your selected template and start uploading assets."
                : mode === "signup"
                  ? "Free to start. No password needed. Your first drop campaign is minutes away."
                  : "Enter your email. We'll send a code. You're in. No passwords."}
            </p>

            <p className="mt-8 text-sm leading-6 text-slate-400">
              {mode === "signup"
                ? "Built for brands that take their visuals as seriously as their designs."
                : "No password needed. We'll email you a one-time code."}
            </p>
          </div>


          <div className="rounded-[2rem] border border-white/10 bg-slate-950/75 p-7 shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl">
            <div className="inline-flex rounded-full border border-white/10 bg-white/[0.04] p-1">
              {paidAccess ? (
                <span className="rounded-full bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950">
                  Studio access
                </span>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setMode("signin")}
                    className={`rounded-full px-4 py-2 text-sm transition-colors ${mode === "signin" ? "bg-cyan-300 text-slate-950" : "text-slate-300"}`}
                  >
                    Sign in
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("signup")}
                    className={`rounded-full px-4 py-2 text-sm transition-colors ${mode === "signup" ? "bg-cyan-300 text-slate-950" : "text-slate-300"}`}
                  >
                    New email
                  </button>
                </>
              )}
            </div>

            {user ? (
              <div className="mt-6 rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-5">
                <p className="text-sm text-slate-200">You are already authenticated.</p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Button asChild className="rounded-full bg-cyan-300 text-slate-950 hover:bg-cyan-200">
                    <Link to={studioPath}>Open Studio</Link>
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => void signOut()}
                    className="rounded-full border-white/15 bg-white/5 text-foreground hover:bg-white/10"
                  >
                    Sign out
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-6 space-y-5">
                {step === "request" && !paidAccess ? (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={submitting}
                      onClick={() => void handleGoogleSignIn()}
                      className="w-full rounded-full border-white/15 bg-white/[0.04] text-white hover:bg-white/10"
                    >
                      Continue with Google
                    </Button>

                    <div className="flex items-center gap-3 text-xs uppercase tracking-[0.24em] text-slate-500">
                      <span className="h-px flex-1 bg-white/10" />
                      <span>Email code</span>
                      <span className="h-px flex-1 bg-white/10" />
                    </div>
                  </>
                ) : null}

                <form id="studio-access-form" onSubmit={handleSubmit} className="space-y-5">
                {!paidAccess && mode === "signup" && step === "request" ? (
                  <div className="space-y-2">
                    <Label htmlFor="auth-name" className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                      Name
                    </Label>
                    <Input
                      id="auth-name"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      required
                      className="rounded-2xl border-white/10 bg-white/[0.03] text-white"
                    />
                  </div>
                ) : null}

                <div className="space-y-2">
                  <Label htmlFor="auth-email" className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    {paidAccess ? "Checkout email" : "Email"}
                  </Label>
                  <Input
                    id="auth-email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                    disabled={step === "verify"}
                    className="rounded-2xl border-white/10 bg-white/[0.03] text-white"
                  />
                </div>

                {step === "verify" ? (
                  <div className="space-y-2">
                    <Label htmlFor="auth-token" className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                      Enter code
                    </Label>
                    <Input
                      id="auth-token"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern="[0-9]*"
                      maxLength={6}
                      value={token}
                      onChange={(event) => setToken(event.target.value.replace(/\D/g, "").slice(0, 6))}
                      required
                      className="rounded-2xl border-white/10 bg-white/[0.03] text-white tracking-[0.4em]"
                    />
                    <p className="text-xs text-slate-400">We sent the code to {email}.</p>
                    <p className="text-xs text-slate-400">
                      Enter it here to open your selected template.
                    </p>
                  </div>
                ) : null}

                <Button
                  type="submit"
                  disabled={submitting}
                  className="w-full rounded-full bg-cyan-300 text-slate-950 hover:bg-cyan-200"
                >
                  {submitting
                    ? "Working..."
                    : step === "request"
                      ? mode === "signin"
                        ? paidAccess ? "Send studio access code" : "Send sign-in code"
                        : "Send access code"
                      : paidAccess ? "Open Studio" : "Verify code"}
                </Button>

                <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-400">
                  {step === "request" && !paidAccess ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
                        className="hover:text-white"
                      >
                        {mode === "signin" ? "Need a name field?" : "Already have access?"}
                      </button>
                      <span>Same secure email code either way.</span>
                    </>
                  ) : step === "verify" ? (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setStep("request");
                          setToken("");
                        }}
                        className="hover:text-white"
                      >
                        Change email
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleResend()}
                        className="hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={submitting || resendCooldown > 0}
                      >
                        {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend code"}
                      </button>
                    </>
                  ) : null}
                </div>
                </form>
              </div>
            )}
          </div>
        </div>
      </section>
    </SiteShell>
  );
}
