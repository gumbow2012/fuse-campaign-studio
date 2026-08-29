import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { Clapperboard, ClipboardCheck, Film, Gem, Home, Layers3, Mail, Menu, Shirt, Sparkles, Star, UsersRound } from "lucide-react";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { CreditChip } from "@/components/CreditChip";
import { StreakChip } from "@/components/StreakChip";
import NotificationCenter from "@/components/NotificationCenter";
import { AccountPopover } from "@/components/AccountMenu";
import FeatureNewBadge from "@/components/FeatureNewBadge";
import SiteFooter from "@/components/mvp/SiteFooter";
import type { FeatureKey } from "@/lib/featureRegistry";


const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/80 focus-visible:ring-offset-2 focus-visible:ring-offset-background";

type PrimaryLink = { label: string; to?: string; href?: string; end?: boolean };

const PRIMARY_LINKS: PrimaryLink[] = [
  { label: "Home", to: "/", end: true },
  { label: "Explore", to: "/app/templates" },
  { label: "New Drops", href: "/#new-today" },
  { label: "Creators", to: "/creators" },
  { label: "Pricing", to: "/pricing" },
  { label: "Contact", to: "/contact" },
];

const drawerLinkClass = cn(
  "flex min-h-11 items-center rounded-lg px-3 py-2.5 text-sm text-foreground/80 transition-colors hover:bg-white/5 hover:text-foreground motion-reduce:transition-none",
  focusRing,
);

const drawerNavLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(drawerLinkClass, isActive && "bg-white/[0.08] font-semibold text-foreground");

const iconNavLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    "inline-flex h-9 w-9 items-center justify-center rounded-full border text-sm transition-colors sm:h-10 sm:w-10",
    isActive
      ? "border-cyan-200/30 bg-white/10 text-cyan-100"
      : "border-white/10 bg-white/[0.03] text-muted-foreground hover:border-white/20 hover:text-foreground",
    focusRing,
  );

const textNavLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    "inline-flex items-center rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] transition-colors sm:text-xs",
    isActive
      ? "border-cyan-200/30 bg-white/10 text-cyan-100"
      : "border-white/10 bg-white/[0.03] text-muted-foreground hover:border-white/20 hover:text-foreground",
    focusRing,
  );

const adminNavLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[11px] font-medium transition-colors sm:gap-2 sm:px-3 sm:text-xs",
    isActive
      ? "border-cyan-200/30 bg-white/10 text-foreground"
      : "border-white/10 bg-white/[0.03] text-muted-foreground hover:border-white/20 hover:text-foreground",
    focusRing,
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
  const { user, profile, isAdmin, isCreator, hasAppAccess, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);
  const toolLinks: Array<{ to: string; label: string; icon: typeof Layers3; featureKey?: FeatureKey }> = [
    { to: "/admin/templates", label: "Admin Templates", icon: Layers3 },
    { to: "/app/lab/studio", label: "Image Studio", icon: Sparkles },
    { to: "/app/lab/cinema", label: "Cinema Studio", icon: Clapperboard, featureKey: "cinema_studio" },
    { to: "/app/lab/madden-media", label: "Madden Media Studio", icon: Film },
    { to: "/app/lab/outfit-swap", label: "Outfit Swap", icon: Shirt },
    { to: "/app/lab/jewelry-swap", label: "Jewelry Swap", icon: Gem },
    { to: "/admin/audits", label: "Output Audit", icon: ClipboardCheck },
    ...(isAdmin ? [{ to: "/admin/creators", label: "Creators", icon: UsersRound }] : []),
  ];
  const [billingCorrectionNotice, setBillingCorrectionNotice] = useState<BillingCorrectionNotice | null>(null);
  const accountLabel = isAdmin ? "Admin account" : "Account";
  const creditDisplay = profile ? `${profile.credits_balance.toLocaleString()} credits` : "Checking credits";

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


  return (
    <div className="min-h-screen text-foreground">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.18),transparent_28%),radial-gradient(circle_at_80%_20%,rgba(255,255,255,0.08),transparent_18%)]" />
      <header className="sticky top-0 z-40 border-b border-white/10 bg-background/75 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-2 px-3 py-3 sm:px-4 md:px-6 md:py-4 lg:items-start lg:px-8">
          <Link
            to="/"
            aria-label="FUSE home"
            className={cn("flex min-w-0 shrink items-center gap-2.5 rounded-xl md:gap-3", focusRing)}
          >
            <img src={FUSE_ICON_SRC} alt="" className="h-8 w-8 shrink-0 rounded-xl object-contain sm:h-9 sm:w-9 md:h-10 md:w-10 lg:h-11 lg:w-11" />
            <div className="min-w-0">
              <img src={FUSE_WORDMARK_SRC} alt="FUSE" className="h-4 w-auto object-contain sm:h-5" />
              <p className="truncate text-[9px] uppercase tracking-[0.22em] text-muted-foreground sm:text-[10px] sm:tracking-[0.28em]">AI Campaign Engine for Streetwear</p>
            </div>
          </Link>

          {/* ── Mobile / tablet cluster: credits + account + menu ── */}
          <div className="flex shrink-0 items-center gap-1.5 lg:hidden">
            {/* Tablet: key sections inline, everything else in the More menu */}
            <nav className="hidden items-center gap-1.5 md:flex" aria-label="Primary">
              <NavLink to="/app/templates" className={textNavLinkClass}>
                Explore
              </NavLink>
              {user ? (
                <NavLink to="/creators" className={textNavLinkClass}>
                  Creators
                </NavLink>
              ) : null}
              <NavLink to="/pricing" className={textNavLinkClass}>
                Pricing
              </NavLink>
            </nav>
            {user ? (
              /* ONE cohesive cluster: credits · notifications · account */
              <div className="flex min-w-0 shrink items-center gap-1 sm:gap-1.5">
                {/* Streak is the first thing to yield on very small screens. */}
                <div className="hidden sm:flex">
                  <StreakChip />
                </div>
                <CreditChip />
                <NotificationCenter />
                <AccountPopover />
              </div>
            ) : (
              <div className="flex items-center gap-1">
                <Button
                  asChild
                  variant="ghost"
                  className={cn("h-9 rounded-full px-2.5 text-sm text-foreground/80 hover:bg-white/10 hover:text-foreground", focusRing)}
                >
                  <Link to="/auth?mode=signin">Sign in</Link>
                </Button>
                <Button asChild className={cn("h-9 rounded-full bg-cyan-300 px-3 text-sm font-semibold text-slate-950 hover:bg-cyan-200", focusRing)}>
                  <Link to="/auth?mode=signup">Try FUSE</Link>
                </Button>
              </div>
            )}


            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetTrigger asChild>
                <button
                  type="button"
                  aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
                  aria-expanded={menuOpen}
                  className={cn(
                    "inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-muted-foreground transition-colors hover:text-foreground motion-reduce:transition-none",
                    focusRing,
                  )}
                >
                  <Menu className="h-5 w-5" aria-hidden="true" />
                </button>
              </SheetTrigger>
              <SheetContent
                side="right"
                className="w-[min(340px,90vw)] overflow-y-auto border-white/10 bg-[#0B1120]/95 p-0 motion-reduce:animate-none motion-reduce:transition-none motion-reduce:duration-0"
              >
                <SheetTitle className="sr-only">Navigation menu</SheetTitle>
                <div className="flex flex-col gap-6 px-4 py-6">
                  <nav aria-label="Primary" className="space-y-1">
                    <p className="px-3 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Browse</p>
                    {PRIMARY_LINKS.map((link) =>
                      link.href ? (
                        <a key={link.label} href={link.href} onClick={closeMenu} className={drawerLinkClass}>
                          {link.label}
                        </a>
                      ) : (
                        <NavLink
                          key={link.label}
                          to={link.to!}
                          end={link.end}
                          onClick={closeMenu}
                          className={drawerNavLinkClass}
                        >
                          {link.label}
                        </NavLink>
                      ),
                    )}
                  </nav>

                  {user && hasAppAccess ? (
                    <nav aria-label="Tools" className="space-y-1">
                      <p className="px-3 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Tools</p>
                      {toolLinks.map((link) => (
                        <NavLink key={link.to} to={link.to} onClick={closeMenu} className={drawerNavLinkClass}>
                          {link.label}
                        </NavLink>
                      ))}
                    </nav>
                  ) : null}

                  {user && isCreator ? (
                    <nav aria-label="Creator" className="space-y-1">
                      <p className="px-3 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Creator</p>
                      <NavLink to="/app/creator" onClick={closeMenu} className={drawerNavLinkClass}>
                        Creator Studio
                      </NavLink>
                    </nav>
                  ) : null}

                  <div className="space-y-2">
                    {user ? (
                      <>
                        <NavLink to="/account" onClick={closeMenu} className={drawerNavLinkClass}>
                          {accountLabel}
                        </NavLink>
                        {!isAdmin ? (
                          <p className="px-3 text-xs uppercase tracking-[0.22em] text-muted-foreground">{creditDisplay}</p>
                        ) : null}
                        <Button
                          variant="outline"
                          onClick={() => {
                            closeMenu();
                            void handleSignOut();
                          }}
                          className={cn("min-h-11 w-full rounded-full border-white/15 bg-white/5 text-foreground hover:bg-white/10", focusRing)}
                        >
                          Sign out
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button asChild className={cn("min-h-11 w-full rounded-full bg-cyan-300 text-slate-950 hover:bg-cyan-200", focusRing)}>
                          <Link to="/auth?mode=signup" onClick={closeMenu}>
                            Sign up
                          </Link>
                        </Button>
                        <Button
                          asChild
                          variant="outline"
                          className={cn("min-h-11 w-full rounded-full border-white/15 bg-white/5 text-foreground hover:bg-white/10", focusRing)}
                        >
                          <Link to="/auth?mode=signin" onClick={closeMenu}>
                            Sign in
                          </Link>
                        </Button>
                        <Button
                          asChild
                          variant="outline"
                          className={cn("min-h-11 w-full rounded-full border-white/15 bg-white/5 text-foreground hover:bg-white/10", focusRing)}
                        >
                          <Link to="/app/templates" onClick={closeMenu}>
                            <Layers3 className="h-4 w-4" aria-hidden="true" />
                            Try templates
                          </Link>
                        </Button>
                      </>
                    )}

                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>

          {/* ── Desktop nav ── */}
          <div className="hidden flex-col gap-2 lg:flex lg:items-end">
            <div className="flex flex-wrap items-center justify-end gap-2">
              <nav className="flex w-auto flex-wrap items-center justify-end gap-1.5" aria-label="Primary">
                {user ? (
                  <NavLink to="/" className={iconNavLinkClass} end aria-label="Home" title="Home">
                    <Home className="h-4 w-4" aria-hidden="true" />
                  </NavLink>
                ) : null}
                <NavLink to="/app/templates" className={textNavLinkClass}>
                  Explore
                </NavLink>
                {user ? (
                  <>
                    <a
                      href="/#new-today"
                      className={cn(
                        "inline-flex items-center rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:border-white/20 hover:text-foreground motion-reduce:transition-none sm:text-xs",
                        focusRing,
                      )}
                    >
                      New Drops
                    </a>
                    <NavLink to="/creators" className={textNavLinkClass}>
                      Creators
                    </NavLink>
                  </>
                ) : null}
                <NavLink to="/pricing" className={textNavLinkClass}>
                  Pricing
                </NavLink>
                {user ? (
                  <NavLink to="/contact" className={iconNavLinkClass} aria-label="Contact" title="Contact">
                    <Mail className="h-4 w-4" aria-hidden="true" />
                  </NavLink>
                ) : null}

                <div className="flex items-center gap-2">
                  {user ? (
                    /* ONE cohesive cluster: credits · notifications · account */
                    <>
                      <StreakChip />
                      <CreditChip />
                      <NotificationCenter />
                      <AccountPopover />
                    </>
                  ) : (
                    <>
                      <Button
                        asChild
                        variant="ghost"
                        className={cn("h-10 rounded-full px-4 text-sm text-foreground/80 hover:bg-white/10 hover:text-foreground", focusRing)}
                      >
                        <Link to="/auth?mode=signin">Sign in</Link>
                      </Button>
                      <Button asChild className={cn("h-10 rounded-full bg-cyan-300 px-5 text-sm font-semibold text-slate-950 hover:bg-cyan-200", focusRing)}>
                        <Link to="/auth?mode=signup">Try FUSE</Link>
                      </Button>
                    </>

                  )}
                </div>

              </nav>
            </div>

            {user && hasAppAccess ? (
              <nav className="flex w-auto flex-wrap items-center justify-end gap-1.5" aria-label="Tools">
                {toolLinks.map((link) => {
                  const Icon = link.icon;
                  return (
                    <NavLink key={link.to} to={link.to} className={adminNavLinkClass}>
                      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                      {link.label}
                      {link.featureKey ? <FeatureNewBadge featureKey={link.featureKey} /> : null}
                    </NavLink>
                  );
                })}
              </nav>
            ) : null}

            {user && isCreator ? (
              <nav className="flex w-auto flex-wrap items-center justify-end gap-1.5" aria-label="Creator">
                <NavLink to="/app/creator" className={adminNavLinkClass}>
                  <Star className="h-3.5 w-3.5" aria-hidden="true" />
                  Creator Studio
                </NavLink>
              </nav>
            ) : null}

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

      <SiteFooter />

    </div>
  );
}
