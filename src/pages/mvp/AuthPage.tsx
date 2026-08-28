/**
 * AUTH — one universal, instant flow.
 *
 * Email + password (no email verification), plus OAuth. The mechanics live in
 * UniversalAuthPanel (shared with the generate auth gate) — this page only owns
 * intent capture, referral survival and post-auth routing.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import SiteShell from "@/components/mvp/SiteShell";
import PageMeta from "@/components/mvp/PageMeta";
import { useAuth } from "@/contexts/AuthContext";
import { getAbsoluteSiteUrl } from "@/lib/site-url";
import { clearPendingCheckout, trackEventOnce } from "@/lib/metaPixel";
import { track } from "@/lib/analytics/track";
import { readPendingReferralCode, storePendingReferralCode } from "@/lib/pendingReferral";
import { usePendingReferral } from "@/hooks/usePendingReferral";
import UniversalAuthPanel, { type AuthMode } from "@/components/auth/UniversalAuthPanel";
import { Loader2, Sparkles } from "lucide-react";
import {
  resolveIntentDestination,
  sanitizeReturnTo,
  writePendingAuthIntent,
} from "@/lib/pendingAuthIntent";

const CARD_SHELL =
  "rounded-[1.75rem] border border-white/10 bg-slate-950/75 px-6 py-7 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:px-8 sm:py-8";

export default function AuthPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  const paidAccess = searchParams.get("paid") === "true";
  const [invited, setInvited] = useState(false);
  const initialMode: AuthMode = searchParams.get("mode") === "signup" ? "signup" : "signin";


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

  // resolveIntentDestination already refuses /auth; keep the belt-and-braces default.
  const destination = resolveIntentDestination(intent) || "/app/templates";

  useEffect(() => {
    const referred = Boolean(searchParams.get("ref")) || Boolean(intent.referralCode);
    setInvited(referred || searchParams.get("invite") === "creator");
    if (searchParams.get("ref")) track("referral_landing", { source: "auth_query" });
  }, [intent.referralCode, searchParams]);

  usePendingReferral();

  // Paid checkout return: Meta Purchase/Subscribe are reported server-side via CAPI only.
  useEffect(() => {
    if (searchParams.get("success") !== "true" && !paidAccess) return;
    clearPendingCheckout();
  }, [paidAccess, searchParams]);


  // Already signed in (including an OAuth redirect return) → intended destination.
  useEffect(() => {
    if (!user || authLoading) return;
    navigate(destination, { replace: true });
  }, [authLoading, destination, navigate, user]);

  // Paid checkout hand-off: prefill the email field.
  const autoRequestEmail = useMemo(() => {
    if (!paidAccess || typeof window === "undefined") return null;
    const stored = window.localStorage.getItem("fuse.n");
    return stored && stored.includes("@") ? stored : null;
  }, [paidAccess]);

  // HARD INVARIANT: while auth is hydrating OR a session exists, the
  // account-creation UI must never render. Only an explicit sign-out brings it back.
  const sessionPresent = Boolean(user);
  if (authLoading || sessionPresent) {
    return (
      <SiteShell>
        <PageMeta title="Signing you in — FUSE" description="Restoring your FUSE session." path="/auth" noindex />
        <div className="container flex min-h-[calc(100vh-200px)] items-center justify-center py-8">
          <div className="flex items-center gap-3 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin text-cyan-300" />
            {sessionPresent ? "Opening FUSE…" : "Checking your session…"}
          </div>
        </div>
      </SiteShell>
    );
  }

  return (
    <SiteShell>
      <PageMeta
        title="Sign In or Create Your FUSE Account — FUSE"
        description="Enter FUSE. Continue with Google, or sign in with your email and password."
        path="/auth"
      />


      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(50% 40% at 50% 32%, rgba(103,232,249,0.10), transparent 72%)",
          }}
        />

        <div className="container relative flex min-h-[calc(100vh-200px)] items-center justify-center py-8">
          <div className="w-full max-w-[520px]">
            {invited ? (
              <p className="mb-3 flex items-center justify-center gap-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-200">
                <Sparkles className="h-3.5 w-3.5" /> You&apos;ve been invited to FUSE
              </p>
            ) : null}

            <div className={CARD_SHELL}>
              <h1 className="font-display text-[1.75rem] font-bold leading-none tracking-[-0.04em] text-white">
                ACCESS FUSE
              </h1>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Sign in or create your account to continue.
              </p>

              <UniversalAuthPanel
                authSurface="auth_page"
                className="mt-5"
                oauthRedirectTo={getAbsoluteSiteUrl("/auth")}
                initialMode={initialMode}
                emailCtaLabel="Continue"
                autoRequestEmail={autoRequestEmail}
                
                onBeforeRedirect={() => writePendingAuthIntent(intent)}
                onAuthenticated={({ userId, isNewAccount }) => {
                  if (isNewAccount) {
                    trackEventOnce(`completeRegistration.${userId}`, "CompleteRegistration");
                    track("sign_up", { method: "email_password", paid_access: Boolean(paidAccess) });
                  }
                  navigate(destination, { replace: true });
                }}
              />
            </div>
          </div>
        </div>
      </section>

    </SiteShell>
  );
}
