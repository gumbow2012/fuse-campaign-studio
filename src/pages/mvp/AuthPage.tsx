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
import { track } from "@/lib/analytics/track";
import { readPendingReferralCode, storePendingReferralCode } from "@/lib/pendingReferral";
import { usePendingReferral } from "@/hooks/usePendingReferral";
import { useQuery } from "@tanstack/react-query";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { ArrowRight, Boxes, Check, Gift, Layers, Shirt, Sparkles, Wand2 } from "lucide-react";
import { FALLBACK_GIFS } from "@/lib/homeMediaAllocator";
import ExampleOutput from "@/components/ExampleOutput";

const BENEFITS = [
  { icon: Layers, title: "Campaign Templates", copy: "Pick creative instead of writing prompts." },
  { icon: Boxes, title: "Brand Workspace", copy: "Save your products, logos and identity once." },
  { icon: Wand2, title: "Image Templates", copy: "Flat lays, graphics, mockups and more." },
  { icon: Shirt, title: "Outfit Swap", copy: "Paste a campaign and rebuild it for your brand." },
];

const LOOP = [
  { step: "01", label: "Pick a campaign" },
  { step: "02", label: "Add your brand" },
  { step: "03", label: "Generate your version" },
];

const PREVIEW_MEDIA = FALLBACK_GIFS.slice(0, 3);

/** k***@gmail.com — never render the full address back at the user. */
function maskEmail(value: string) {
  const [local, domain] = value.split("@");
  if (!local || !domain) return value;
  return `${local.slice(0, 1)}***@${domain}`;
}

const CARD_SHELL =
  "rounded-[2rem] border border-white/10 bg-slate-950/75 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:p-8";
const FIELD =
  "h-12 rounded-2xl border-white/10 bg-white/[0.04] text-white transition-colors focus-visible:border-cyan-300/60 focus-visible:ring-cyan-300/20";
const PRIMARY_CTA =
  "w-full rounded-full bg-cyan-300 py-6 text-[13px] font-semibold uppercase tracking-[0.14em] text-slate-950 shadow-[0_18px_50px_-18px_rgba(103,232,249,0.7)] transition-transform hover:bg-cyan-200 hover:-translate-y-0.5";
const LABEL_CLS = "text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-400";

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
  const [pendingReferral, setPendingReferral] = useState<string | null>(null);

  // Public, non-sensitive program settings — the bonus number is never hardcoded.
  const { data: referralProgram } = useQuery({
    queryKey: ["referral-program-config"],
    enabled: Boolean(pendingReferral),
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("referral_program_config")
        .select("enabled, signup_bonus_credits")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const referralBonus = Number(referralProgram?.signup_bonus_credits ?? 0);
  const showReferralClaim = Boolean(pendingReferral) && Boolean(referralProgram?.enabled) && referralBonus > 0;

  useEffect(() => {
    const invited = Boolean(searchParams.get("ref")) || Boolean(readPendingReferralCode());
    setMode(
      paidAccess
        ? "signin"
        : searchParams.get("mode") === "signup" || (invited && searchParams.get("mode") !== "signin")
          ? "signup"
          : "signin",
    );
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

  // Referral capture: ?ref=CODE must outlive the OTP round-trip / OAuth redirect.
  useEffect(() => {
    const stored = storePendingReferralCode(searchParams.get("ref"));
    if (stored) track("referral_landing", { source: "auth_query" });
    setPendingReferral(stored ?? readPendingReferralCode());
  }, [searchParams]);

  usePendingReferral();

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
            track("sign_up", { paid_access: Boolean(paidAccess) });
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

  const signup = mode === "signup";
  const verifying = step === "verify";

  const heroTitle = paidAccess
    ? "CHECK YOUR EMAIL TO OPEN YOUR FUSE STUDIO."
    : showReferralClaim
      ? "YOU'VE BEEN INVITED TO FUSE."
      : signup
        ? "YOUR NEXT CAMPAIGN IS ALREADY BUILT."
        : "WELCOME BACK.";

  const heroCopy = paidAccess
    ? "We sent a secure access code to your email. Enter it below to open your selected template."
    : showReferralClaim
      ? `Create your account and claim ${referralBonus.toLocaleString()} FUSE credits.`
      : signup
        ? "Pick proven creative. Add your brand. FUSE handles the rest."
        : "Your campaigns, brand and creative workspace are waiting.";

  return (
    <SiteShell>
      <PageMeta
        title={signup ? "Create Your Free FUSE Account — FUSE" : "Sign In — FUSE"}
        description={
          signup
            ? "Create your free FUSE account. Pick a proven campaign template, add your brand, and generate your version."
            : "Sign in to FUSE. No password needed — we email you a one-time code."
        }
        path="/auth"
      />

      <section className="relative overflow-hidden">
        {/* Subtle bloom — brand aesthetic, no neon SaaS gradients */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            background:
              "radial-gradient(60% 45% at 15% 10%, rgba(103,232,249,0.10), transparent 70%), radial-gradient(50% 40% at 90% 80%, rgba(56,189,248,0.07), transparent 70%)",
          }}
        />

        <div className="container relative flex min-h-[calc(100vh-90px)] items-center py-10 lg:py-14">
          <div className="mx-auto grid w-full max-w-6xl items-center gap-10 lg:grid-cols-[1fr_minmax(0,460px)] lg:gap-14">
            {/* ---------------- LEFT: value + visual proof ---------------- */}
            <div className="order-1">
              {showReferralClaim ? (
                <span className="inline-flex items-center gap-2 rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-100">
                  <Gift className="h-3.5 w-3.5" /> Invitation
                </span>
              ) : (
                <span className={LABEL_CLS}>{signup ? "Create account" : "Sign in"}</span>
              )}

              <h1 className="mt-4 font-display text-[2.35rem] font-bold leading-[1.02] tracking-[-0.045em] text-white sm:text-5xl lg:text-[3.4rem]">
                {heroTitle}
              </h1>
              <p className="mt-4 max-w-lg text-base leading-7 text-slate-300 sm:text-lg">{heroCopy}</p>

              {/* Visual proof — existing curated preview media only */}
              <div className="mt-8 flex items-end gap-3">
                {PREVIEW_MEDIA.map((src, index) => (
                  <div
                    key={src}
                    className={`relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] shadow-[0_20px_60px_-30px_rgba(0,0,0,0.9)] transition-transform duration-500 hover:-translate-y-1 ${
                      index === 1 ? "w-[36%] sm:w-[34%]" : "w-[30%] sm:w-[28%]"
                    } ${index === 1 ? "-mb-3" : ""}`}
                  >
                    <img
                      src={src}
                      alt="FUSE campaign template preview"
                      loading="lazy"
                      className="aspect-[9/16] h-full w-full object-cover"
                    />
                  </div>
                ))}
                <div className="hidden shrink-0 lg:block">
                  <div className="scale-[0.72] origin-bottom-left">
                    <ExampleOutput />
                  </div>
                </div>
              </div>

              {signup ? (
                <>
                  <ul className="mt-9 grid gap-4 sm:grid-cols-2">
                    {BENEFITS.map((benefit) => (
                      <li key={benefit.title} className="flex gap-3">
                        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-cyan-300/25 bg-cyan-300/10 text-cyan-200">
                          <benefit.icon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-white">{benefit.title}</span>
                          <span className="block text-sm leading-6 text-slate-400">{benefit.copy}</span>
                        </span>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-3">
                    {LOOP.map((item) => (
                      <div key={item.step} className="flex items-center gap-2">
                        <span className="font-display text-sm font-bold text-cyan-200">{item.step}</span>
                        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">
                          {item.label}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <ul className="mt-9 space-y-3">
                  {["Your saved brand, products and cast", "Every campaign you've generated", "Your credits and plan"].map(
                    (item) => (
                      <li key={item} className="flex items-center gap-3 text-sm text-slate-300">
                        <Check className="h-4 w-4 shrink-0 text-cyan-300" /> {item}
                      </li>
                    ),
                  )}
                </ul>
              )}
            </div>

            {/* ---------------- RIGHT: auth card ---------------- */}
            <div className="order-2 w-full">
              <div className={CARD_SHELL}>
                {/* Top-level modes */}
                {paidAccess ? (
                  <span className="inline-flex rounded-full bg-cyan-300 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-950">
                    Studio access
                  </span>
                ) : (
                  <div className="grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-1.5">
                    <button
                      type="button"
                      onClick={() => setMode("signup")}
                      className={`rounded-xl px-3 py-3 text-[11px] font-semibold uppercase tracking-[0.16em] transition-colors ${
                        signup ? "bg-cyan-300 text-slate-950" : "text-slate-300 hover:text-white"
                      }`}
                    >
                      Create account
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode("signin")}
                      className={`rounded-xl px-3 py-3 text-[11px] font-semibold uppercase tracking-[0.16em] transition-colors ${
                        !signup ? "bg-cyan-300 text-slate-950" : "text-slate-300 hover:text-white"
                      }`}
                    >
                      Sign in
                    </button>
                  </div>
                )}

                {user ? (
                  <div className="mt-6 rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-5">
                    <p className="text-sm text-slate-200">You are already signed in.</p>
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
                ) : verifying ? (
                  /* ---------- EMAIL CODE STEP ---------- */
                  <div className="mt-7">
                    <h2 className="font-display text-2xl font-bold tracking-[-0.03em] text-white">CHECK YOUR INBOX.</h2>
                    <p className="mt-2 text-sm leading-6 text-slate-400">
                      We sent a 6-digit code to <span className="text-slate-200">{maskEmail(email)}</span>
                    </p>

                    <form id="studio-access-form" onSubmit={handleSubmit} className="mt-6 space-y-6">
                      <InputOTP
                        maxLength={6}
                        value={token}
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
                        {submitting ? "Verifying…" : "Enter FUSE →"}
                      </Button>

                      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-400">
                        <button
                          type="button"
                          onClick={() => {
                            setStep("request");
                            setToken("");
                          }}
                          className="transition-colors hover:text-white"
                        >
                          ← Change email
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleResend()}
                          disabled={submitting || resendCooldown > 0}
                          className="transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend code"}
                        </button>
                      </div>
                    </form>
                  </div>
                ) : (
                  /* ---------- REQUEST STEP ---------- */
                  <div className="mt-7">
                    <h2 className="font-display text-xl font-bold uppercase tracking-[-0.01em] text-white">
                      {paidAccess ? "Studio access" : signup ? "Start creating" : "Sign in"}
                    </h2>

                    {!paidAccess ? (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={submitting}
                          onClick={() => void handleGoogleSignIn()}
                          className="mt-5 w-full rounded-full border-white/15 bg-white/[0.05] py-6 text-sm font-semibold text-white transition-colors hover:bg-white/10"
                        >
                          Continue with Google
                        </Button>

                        <div className="my-6 flex items-center gap-3 text-[10px] uppercase tracking-[0.24em] text-slate-500">
                          <span className="h-px flex-1 bg-white/10" />
                          <span>Or continue with email</span>
                          <span className="h-px flex-1 bg-white/10" />
                        </div>
                      </>
                    ) : null}

                    <form id="studio-access-form" onSubmit={handleSubmit} className="space-y-5">
                      {!paidAccess && signup ? (
                        <div className="space-y-2">
                          <Label htmlFor="auth-name" className={LABEL_CLS}>
                            Your name
                          </Label>
                          <Input
                            id="auth-name"
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            required
                            className={FIELD}
                          />
                        </div>
                      ) : null}

                      <div className="space-y-2">
                        <Label htmlFor="auth-email" className={LABEL_CLS}>
                          {paidAccess ? "Checkout email" : "Email"}
                        </Label>
                        <Input
                          id="auth-email"
                          type="email"
                          value={email}
                          onChange={(event) => setEmail(event.target.value)}
                          required
                          className={FIELD}
                        />
                      </div>

                      <Button type="submit" disabled={submitting} className={PRIMARY_CTA}>
                        {submitting
                          ? "Working…"
                          : paidAccess
                            ? "Send studio access code"
                            : signup
                              ? "Create free account →"
                              : "Send sign-in code →"}
                      </Button>
                    </form>

                    {!paidAccess ? (
                      <>
                        {signup ? (
                          <ul className="mt-6 space-y-2 text-xs text-slate-400">
                            {["No password required", "No credit card required to create an account", "Start with free Image Templates"].map(
                              (claim) => (
                                <li key={claim} className="flex items-center gap-2">
                                  <Check className="h-3.5 w-3.5 shrink-0 text-cyan-300" /> {claim}
                                </li>
                              ),
                            )}
                          </ul>
                        ) : null}

                        <p className="mt-6 text-sm text-slate-400">
                          {signup ? "Already have an account? " : "New to FUSE? "}
                          <button
                            type="button"
                            onClick={() => setMode(signup ? "signin" : "signup")}
                            className="font-semibold uppercase tracking-[0.14em] text-cyan-200 transition-colors hover:text-cyan-100"
                          >
                            {signup ? "Sign in →" : "Create free account →"}
                          </button>
                        </p>

                        {signup ? (
                          <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                            <p className={LABEL_CLS}>Next</p>
                            <p className="mt-2 text-sm leading-6 text-slate-300">
                              Build your Brand Workspace — save your logo, colors and products once and FUSE preloads
                              every campaign for you.
                            </p>
                            <div className="mt-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                              <span className="text-cyan-200">Account</span>
                              <ArrowRight className="h-3 w-3" />
                              <span>Brand</span>
                              <ArrowRight className="h-3 w-3" />
                              <span>Campaigns</span>
                            </div>
                          </div>
                        ) : null}

                        <p className="mt-6 text-xs leading-6 text-slate-500">
                          By continuing, you agree to the{" "}
                          <Link to="/terms" className="text-slate-300 underline underline-offset-4 hover:text-white">
                            Terms
                          </Link>{" "}
                          and{" "}
                          <Link to="/privacy" className="text-slate-300 underline underline-offset-4 hover:text-white">
                            Privacy Policy
                          </Link>
                          .
                        </p>
                      </>
                    ) : null}
                  </div>
                )}
              </div>

              {showReferralClaim ? (
                <p className="mt-4 flex items-center justify-center gap-2 text-xs text-cyan-100/80">
                  <Sparkles className="h-3.5 w-3.5" /> {referralBonus.toLocaleString()} credits are attached to this
                  invite — they land as soon as your account is created.
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </section>
    </SiteShell>
  );
}
