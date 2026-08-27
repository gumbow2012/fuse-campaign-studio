/**
 * AUTH — one universal, instant flow.
 *
 * No mode toggle, no marketing media, no name field. The auth mechanics live in
 * UniversalAuthPanel (shared with the generate auth gate) — this page only owns
 * intent capture, referral survival and post-auth routing.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import SiteShell from "@/components/mvp/SiteShell";
import PageMeta from "@/components/mvp/PageMeta";
import { useAuth } from "@/contexts/AuthContext";
import { getAbsoluteSiteUrl } from "@/lib/site-url";
import { checkoutEventId, clearPendingCheckout, readPendingCheckout, trackEventOnce } from "@/lib/metaPixel";
import { track } from "@/lib/analytics/track";
import { readPendingReferralCode, storePendingReferralCode } from "@/lib/pendingReferral";
import { usePendingReferral } from "@/hooks/usePendingReferral";
import UniversalAuthPanel from "@/components/auth/UniversalAuthPanel";
import { Sparkles } from "lucide-react";
import {
  resolveIntentDestination,
  sanitizeReturnTo,
  writePendingAuthIntent,
} from "@/lib/pendingAuthIntent";

const FUSE_ICON_SRC = "/fuse-icon.png?v=20260519";
const FUSE_WORDMARK_SRC = "/fuse-wordmark.png?v=20260519";

const CARD_SHELL =
  "rounded-[2rem] border border-white/10 bg-slate-950/75 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:p-8";

export default function AuthPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  const paidAccess = searchParams.get("paid") === "true";
  const [invited, setInvited] = useState(false);
  const [authStep, setAuthStep] = useState<"email" | "code">("email");

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

  const authRedirect = getAbsoluteSiteUrl(`/auth${paidAccess ? "?paid=true" : ""}`);

  // Paid checkout hand-off: prefill and send the code automatically.
  const autoRequestEmail = useMemo(() => {
    if (!paidAccess || typeof window === "undefined") return null;
    const stored = window.localStorage.getItem("fuse.n");
    return stored && stored.includes("@") ? stored : null;
  }, [paidAccess]);

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

              <h1 className="mt-7 font-display text-[2rem] font-bold leading-none tracking-[-0.04em] text-white">
                {authStep === "code" ? "CHECK YOUR EMAIL." : "ENTER FUSE."}
              </h1>
              {authStep === "email" ? (
                <p className="mt-3 text-sm leading-6 text-slate-400">
                  Create an account or sign in to continue.
                </p>
              ) : null}

              <UniversalAuthPanel
                authSurface="auth_page"
                className="mt-7"
                oauthRedirectTo={getAbsoluteSiteUrl("/auth")}
                emailRedirectTo={authRedirect}
                autoRequestEmail={autoRequestEmail}
                onStepChange={setAuthStep}
                onBeforeRedirect={() => writePendingAuthIntent(intent)}
                onAuthenticated={({ userId, isNewAccount }) => {
                  if (isNewAccount) {
                    trackEventOnce(`completeRegistration.${userId}`, "CompleteRegistration");
                    track("sign_up", { method: "email_otp", paid_access: Boolean(paidAccess) });
                  }
                  navigate(destination, { replace: true });
                }}
              />
            </div>

            <p className="mt-6 text-center text-[11px] leading-5 text-slate-500">
              Need help?{" "}
              <Link to="/contact" className="text-slate-300 underline decoration-white/20 hover:text-white">
                Contact us
              </Link>
              .
            </p>
          </div>
        </div>
      </section>
    </SiteShell>
  );
}
