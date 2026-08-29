/**
 * BRAND ACTIVATION — Phase 2: the one-time welcome modal for new accounts.
 *
 * Mounted ONCE at the app root. It renders only when the Phase 1 resolver says
 * level === "modal", the user is inside the app shell, and it has not already
 * appeared this session. Onboarding is never forced — "Explore FUSE First"
 * always works and persists a deferral so this does not nag.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Check, Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useBrand } from "@/contexts/BrandContext";
import { useBrandActivation } from "@/hooks/useBrandActivation";
import {
  ACTIVATION_EVENTS,
  ONBOARDING_ROUTE,
  buildActivationStatePatch,
} from "@/lib/brandActivation";
import {
  markWelcomeShownThisSession,
  welcomeShownThisSession,
  writeLocalActivationState,
} from "@/lib/brandActivationLocal";
import { patchBrandMetadata } from "@/services/brandProfiles";
import { track } from "@/lib/analytics/track";

/** Signed-in product surfaces only — never over /auth or public marketing pages. */
function insideAppShell(pathname: string): boolean {
  if (pathname.startsWith("/auth")) return false;
  if (pathname.startsWith(ONBOARDING_ROUTE)) return false;
  return pathname.startsWith("/app") || pathname === "/account";
}

export default function WelcomeActivationModal() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { user, loading: authLoading } = useAuth();
  const { activeBrand } = useBrand();
  const { nudge, activationState, loading } = useBrandActivation();

  const [open, setOpen] = useState(false);
  const decided = useRef(false);

  const eligible = useMemo(
    () =>
      !authLoading &&
      !loading &&
      !!user &&
      nudge?.level === "modal" &&
      insideAppShell(pathname),
    [authLoading, loading, user, nudge?.level, pathname],
  );

  // Opens at most once per session and never reopens on route changes.
  useEffect(() => {
    if (decided.current || !eligible) return;
    if (welcomeShownThisSession()) {
      decided.current = true;
      return;
    }
    decided.current = true;
    markWelcomeShownThisSession();
    setOpen(true);
    track(ACTIVATION_EVENTS.nudgeShown, { level: "modal", reason: nudge?.reason ?? "no_brand" });
    void persist({ shownAt: new Date().toISOString() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eligible]);

  async function persist(change: Record<string, string>) {
    try {
      if (activeBrand) {
        await patchBrandMetadata(activeBrand, buildActivationStatePatch(activationState, change));
      } else {
        writeLocalActivationState(user?.id, change);
      }
    } catch {
      /* cadence state is best-effort — never block the UI */
    }
  }

  const build = () => {
    setOpen(false);
    track(ACTIVATION_EVENTS.onboardingStarted, { source: "welcome_modal" });
    navigate(nudge?.deepLink || ONBOARDING_ROUTE);
  };

  const explore = () => {
    setOpen(false);
    void persist({ deferredAt: new Date().toISOString() });
    track(ACTIVATION_EVENTS.onboardingDeferred, { source: "welcome_modal" });
  };

  const dismiss = () => {
    setOpen(false);
    void persist({ dismissedAt: new Date().toISOString() });
    track(ACTIVATION_EVENTS.nudgeDismissed, { level: "modal" });
  };

  if (!open) return null;

  return (
    <Dialog open onOpenChange={(next) => (next ? null : dismiss())}>
      <DialogContent className="max-w-lg overflow-hidden border-cyan-200/20 bg-[#070b16] p-0">
        <div className="pointer-events-none absolute inset-x-0 -top-24 h-48 bg-[radial-gradient(60%_100%_at_50%_100%,rgba(56,189,248,0.28),transparent)]" />
        <div className="relative space-y-6 p-7 sm:p-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200/25 bg-white/[0.04] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-100">
            <Sparkles className="h-3 w-3" aria-hidden />
            Brand workspace
          </div>

          <div className="space-y-3">
            <DialogTitle className="text-2xl font-semibold uppercase tracking-[0.12em] text-foreground sm:text-3xl">
              Welcome to FUSE.
            </DialogTitle>
            <DialogDescription className="text-sm leading-relaxed text-muted-foreground sm:text-base">
              Build your brand once. We&apos;ll remember it for every campaign.
            </DialogDescription>
          </div>

          <ul className="grid gap-2 text-sm text-foreground/85">
            {["Logos", "Colors", "Products"].map((item) => (
              <li key={item} className="flex items-center gap-2.5">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-cyan-200/30 bg-cyan-400/10 text-cyan-100">
                  <Check className="h-3 w-3" aria-hidden />
                </span>
                {item}
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            Then review everything before it&apos;s saved.
          </p>

          <div className="flex flex-col gap-2.5 sm:flex-row">
            <Button onClick={build} className="flex-1 gap-2 font-semibold uppercase tracking-[0.14em]">
              <Sparkles className="h-4 w-4" aria-hidden />
              Build My Brand
            </Button>
            <Button
              variant="outline"
              onClick={explore}
              className="flex-1 border-white/15 bg-white/[0.03] font-medium uppercase tracking-[0.14em]"
            >
              Explore FUSE First
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
