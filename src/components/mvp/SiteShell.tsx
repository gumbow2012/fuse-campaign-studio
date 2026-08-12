import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { ClipboardCheck, Home, Info, Layers3, Mail, RefreshCw, Star, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import CreditPackDialog from "./CreditPackDialog";

const iconNavLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    "inline-flex h-9 w-9 items-center justify-center rounded-full border text-sm transition-colors sm:h-10 sm:w-10",
    isActive
      ? "border-cyan-200/30 bg-white/10 text-cyan-100"
      : "border-white/10 bg-white/[0.03] text-muted-foreground hover:border-white/20 hover:text-foreground",
  );

const adminNavLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[11px] font-medium transition-colors sm:gap-2 sm:px-3 sm:text-xs",
    isActive
      ? "border-cyan-200/30 bg-white/10 text-foreground"
      : "border-white/10 bg-white/[0.03] text-muted-foreground hover:border-white/20 hover:text-foreground",
  );

const FUSE_ICON_SRC = "/fuse-icon.png?v=20260519";
const FUSE_WORDMARK_SRC = "/fuse-wordmark.png?v=20260519";
const BILLING_CORRECTION_NOTICE_KEY = "fuse.billingCorrectionNotice.dismissed.";

type BillingCorrectionNotice = {
  id: string;
  amount: number;
};

export default function SiteShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { user, profile, isAdmin, hasAppAccess, signOut, refreshProfile } = useAuth();
  const [refreshingCredits, setRefreshingCredits] = useState(false);
  const [billingCorrectionNotice, setBillingCorrectionNotice] = useState<BillingCorrectionNotice | null>(null);
  const accountLabel = isAdmin ? "Admin account" : "Account";
  const creditDisplay = profile ? `${profile.credits_balance.toLocaleString()} credits` : "Checking credits";
  const hasActivePaidMembership =
    !!profile &&
    profile.plan !== "free" &&
    (profile.subscription_status === "active" || profile.subscription_status === "trialing");
  const shouldShowCreditTopUp = !!user && !!profile && !isAdmin && hasActivePaidMembership && profile.credits_balance <= 0;

  useEffect(() => {
    if (!user || isAdmin) {
      setBillingCorrectionNotice(null);
      return;
    }

    let cancelled = false;

    const loadBillingCorrectionNotice = async () => {
      const { data } = await supabase
        .from("credit_ledger")
        .select("id, amount, description")
        .eq("type", "adjustment")
        .ilike("description", "%Starter membership correction%")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cancelled || !data?.id) return;
      const storageKey = `${BILLING_CORRECTION_NOTICE_KEY}${data.id}`;
      if (window.localStorage.getItem(storageKey) === "1") return;
      setBillingCorrectionNotice({ id: data.id, amount: Math.max(Number(data.amount) || 0, 0) });
    };

    void loadBillingCorrectionNotice();

    return () => {
      cancelled = true;
    };
  }, [isAdmin, user]);

  const dismissBillingCorrectionNotice = () => {
    if (billingCorrectionNotice) {
      window.localStorage.setItem(`${BILLING_CORRECTION_NOTICE_KEY}${billingCorrectionNotice.id}`, "1");
    }
    setBillingCorrectionNotice(null);
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/", { replace: true });
  };

  const handleRefreshCredits = async () => {
    if (!user || isAdmin || refreshingCredits) return;
    setRefreshingCredits(true);
    try {
      await refreshProfile();
    } finally {
      setRefreshingCredits(false);
    }
  };

  return (
    <div className="min-h-screen text-foreground">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.18),transparent_28%),radial-gradient(circle_at_80%_20%,rgba(255,255,255,0.08),transparent_18%)]" />
      <header className="sticky top-0 z-40 border-b border-white/10 bg-background/75 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-2 px-3 py-3 sm:px-4 md:flex-row md:items-start md:justify-between md:px-6 md:py-4 lg:px-8">
          <Link to="/" className="flex items-center justify-center gap-2.5 md:justify-start md:gap-3">
            <img src={FUSE_ICON_SRC} alt="" className="h-8 w-8 rounded-xl object-contain sm:h-9 sm:w-9 md:h-10 md:w-10 lg:h-11 lg:w-11" />
            <div>
              <img src={FUSE_WORDMARK_SRC} alt="FUSE" className="h-4 w-auto object-contain sm:h-5" />
              <p className="text-[9px] uppercase tracking-[0.22em] text-muted-foreground sm:text-[10px] sm:tracking-[0.28em]">AI Campaign Engine for Streetwear</p>
            </div>
          </Link>

          <div className="flex flex-col gap-2 md:items-end">
            <div className="flex flex-wrap items-center justify-end gap-2">
              <nav className="flex w-full flex-wrap items-center justify-center gap-1.5 md:w-auto md:justify-end" aria-label="Primary">
                <NavLink to="/" className={iconNavLinkClass} end aria-label="Home" title="Home">
                  <Home className="h-4 w-4" />
                </NavLink>
                <NavLink to="/about" className={iconNavLinkClass} aria-label="About" title="About">
                  <Info className="h-4 w-4" />
                </NavLink>
                <NavLink to="/pricing" className={iconNavLinkClass} aria-label="Membership" title="Membership">
                  <Star className="h-4 w-4" />
                </NavLink>
                <NavLink to="/contact" className={iconNavLinkClass} aria-label="Contact" title="Contact">
                  <Mail className="h-4 w-4" />
                </NavLink>
                <NavLink to="/app/templates" className={iconNavLinkClass} aria-label="Templates" title="Templates">
                  <Layers3 className="h-4 w-4" />
                </NavLink>

                <div className="flex items-center gap-1.5">
                  {user ? (
                    <>
                      <NavLink
                        to="/account"
                        className={({ isActive }) =>
                          cn(
                            "inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-colors lg:h-10 lg:gap-2 lg:px-4 lg:text-sm",
                            isActive ? "bg-cyan-200 text-slate-950" : "bg-cyan-300 text-slate-950 hover:bg-cyan-200",
                          )
                        }
                      >
                        <UserRound className="h-3.5 w-3.5 lg:h-4 lg:w-4" />
                        {accountLabel}
                      </NavLink>
                      <Button
                        variant="outline"
                        onClick={() => void handleSignOut()}
                        className="h-9 rounded-full border-white/15 bg-white/5 px-3 text-xs text-foreground hover:bg-white/10 lg:h-10 lg:px-4 lg:text-sm"
                      >
                        Sign out
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        asChild
                        variant="outline"
                        className="h-9 rounded-full border-white/15 bg-white/5 px-3 text-sm text-foreground hover:bg-white/10 sm:h-10 sm:px-4"
                      >
                        <Link to="/auth">Sign in</Link>
                      </Button>
                      <Button asChild className="h-9 rounded-full bg-cyan-300 px-3 text-sm text-slate-950 hover:bg-cyan-200 sm:h-10 sm:px-4">
                        <Link to="/app/templates">
                          <Layers3 className="h-4 w-4" />
                          Try templates
                        </Link>
                      </Button>
                    </>
                  )}
                </div>
              </nav>
            </div>

            {user && hasAppAccess ? (
              <nav className="flex w-full flex-wrap items-center justify-center gap-1.5 md:w-auto md:justify-end" aria-label="Admin">
                <NavLink to="/admin/templates" className={adminNavLinkClass}>
                  <Layers3 className="h-3.5 w-3.5" />
                  Admin Templates
                </NavLink>
                <NavLink to="/admin/audits" className={adminNavLinkClass}>
                  <ClipboardCheck className="h-3.5 w-3.5" />
                  Output Audit
                </NavLink>
              </nav>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              {user && !isAdmin ? (
                <>
                  <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.22em] text-muted-foreground">
                    {creditDisplay}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    title="Refresh credits"
                    aria-label="Refresh credits"
                    onClick={() => void handleRefreshCredits()}
                    disabled={refreshingCredits}
                    className="h-9 w-9 rounded-full border-white/15 bg-white/5 text-foreground hover:bg-white/10"
                  >
                    <RefreshCw className={`h-4 w-4 ${refreshingCredits ? "animate-spin" : ""}`} />
                  </Button>
                  {shouldShowCreditTopUp ? (
                    <CreditPackDialog
                      trigger={
                        <Button className="rounded-full bg-cyan-300 px-4 text-slate-950 hover:bg-cyan-200">
                          Get credits
                        </Button>
                      }
                    />
                  ) : null}
                </>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      {billingCorrectionNotice ? (
        <section className="relative border-b border-cyan-300/20 bg-cyan-300/[0.08]">
          <div className="container flex flex-col gap-3 py-4 text-sm leading-6 text-cyan-50 md:flex-row md:items-center md:justify-between">
            <p>
              <span className="font-semibold text-white">Sorry about the checkout confusion.</span>
              {" "}
              We corrected your account and added {billingCorrectionNotice.amount.toLocaleString()} credits so your balance reflects the Starter credit amount.
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={dismissBillingCorrectionNotice}
              className="shrink-0 rounded-full border-cyan-100/30 bg-cyan-50/10 text-cyan-50 hover:bg-cyan-50/15"
            >
              Got it
            </Button>
          </div>
        </section>
      ) : null}

      <main className="relative">{children}</main>

      <footer className="relative border-t border-white/10 py-8">
        <div className="container flex flex-col items-center gap-2 text-center text-xs text-muted-foreground sm:flex-row sm:justify-between sm:text-left">
          <p>© {new Date().getFullYear()} FUSE</p>
          <p>
            Built by{" "}
            <a
              href="https://maddenmedia.ai"
              target="_blank"
              rel="noreferrer"
              className="text-foreground underline underline-offset-4 hover:text-cyan-100"
            >
              Madden Media
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
