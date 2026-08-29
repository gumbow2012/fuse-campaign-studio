import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Link, useLocation } from "react-router-dom";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { User, LayoutGrid, ImageIcon, Clapperboard, Menu, Shield, ChevronDown } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { AccountPopover, AccountMenuContent } from "@/components/AccountMenu";
import { CreditChip } from "@/components/CreditChip";

const FUSE_ICON_SRC = "/fuse-icon.png?v=20260519";
const FUSE_WORDMARK_SRC = "/fuse-wordmark.png?v=20260519";

/* ─── Primary product destinations (real routes only) ───
   Note: "Video" is handled by the same Generation Studio route, so it is not
   duplicated here. "Madden Media" has no route yet and is intentionally omitted. */
type NavDestination = {
  label: string;
  to: string;
  icon: typeof ImageIcon;
  match: (pathname: string) => boolean;
};

const DESTINATIONS: NavDestination[] = [
  {
    label: "Explore",
    to: "/app/templates",
    icon: LayoutGrid,
    match: (p) => p === "/app/templates",
  },
  {
    label: "Image",
    to: "/app/lab/studio",
    icon: ImageIcon,
    match: (p) => p.startsWith("/app/lab/studio"),
  },
  {
    label: "Cinema",
    to: "/app/lab/cinema",
    icon: Clapperboard,
    match: (p) => p.startsWith("/app/lab/cinema"),
  },
];

/* Consistent brand focus ring for all nav controls */
const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/80 focus-visible:ring-offset-2 focus-visible:ring-offset-background";

const NavItem = ({ item, active }: { item: NavDestination; active: boolean }) => {
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      aria-current={active ? "page" : undefined}
      className={`group relative flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors duration-200 motion-reduce:transition-none ${FOCUS_RING} ${
        active
          ? "bg-primary/10 font-semibold text-foreground"
          : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
      }`}
    >
      <Icon size={15} className={active ? "text-primary" : "text-muted-foreground/70 group-hover:text-foreground"} />
      {item.label}
      {active && (
        <span className="absolute inset-x-2 -bottom-[1px] h-[2px] rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary)/0.8)]" />
      )}
    </Link>
  );
};

/* ─── Admin tools — demoted into a single quiet group (admin/dev only) ─── */
const ADMIN_LINKS = [
  { label: "Admin Home", to: "/admin" },
  { label: "Analytics", to: "/admin/analytics" },
  { label: "Template Builder", to: "/app/lab/canvas" },
  { label: "Template Import", to: "/admin/templates/import" },
  { label: "Creators", to: "/admin/creators" },
  { label: "Creator Program", to: "/admin/creator-program" },
  { label: "FUSE Cast", to: "/admin/fuse-cast" },
  { label: "Output Audit", to: "/admin/audits" },
];

const AdminMenu = () => {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const isActive = pathname.startsWith("/admin") || pathname === "/app/lab/canvas";

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "hidden lg:inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors motion-reduce:transition-none",
            FOCUS_RING,
            isActive
              ? "border-white/15 bg-white/[0.08] text-foreground"
              : "border-white/10 bg-white/[0.03] text-muted-foreground hover:border-white/15 hover:bg-white/[0.06] hover:text-foreground"
          )}
          aria-label="Admin menu"
          aria-haspopup="menu"
          aria-expanded={open}
        >

          <Shield size={14} />
          Admin
          <ChevronDown
            size={12}
            className={cn("transition-transform duration-200", open && "rotate-180")}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-56 rounded-2xl border-white/10 bg-[#0B1120]/95 p-2 backdrop-blur-xl shadow-2xl"
      >
        <div className="space-y-0.5">
          {ADMIN_LINKS.map((link) => {
            const active =
              pathname === link.to || (link.to !== "/admin" && pathname.startsWith(link.to));
            return (
              <Link
                key={link.to}
                to={link.to}
                onClick={() => setOpen(false)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors motion-reduce:transition-none",
                  FOCUS_RING,
                  active
                    ? "bg-white/[0.08] text-foreground"
                    : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                )}
              >
                {link.label}
                {active && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
              </Link>

            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
};

/* ─── Mobile menu content ─── */
const MobileMenu = ({ onClose }: { onClose: () => void }) => {
  const { user, isCreator, roles } = useAuth();
  const { pathname } = useLocation();
  const isAdminOrDev = roles.includes("admin") || roles.includes("dev");

  const linkClass = cn(
    "flex min-h-11 items-center rounded-lg px-3 py-2.5 text-sm text-foreground/80 hover:bg-white/5 hover:text-foreground transition-colors motion-reduce:transition-none",
    FOCUS_RING
  );

  const DrawerLink = ({ to, children }: { to: string; children: React.ReactNode }) => {
    const active = to === "/" ? pathname === "/" : pathname === to || pathname.startsWith(`${to}/`);
    return (
      <Link
        to={to}
        onClick={onClose}
        aria-current={active ? "page" : undefined}
        className={cn(linkClass, active && "bg-white/[0.08] font-semibold text-foreground")}
      >
        {children}
      </Link>
    );
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <span className="font-display text-sm font-black uppercase tracking-wider text-foreground">Menu</span>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-4 space-y-6">
        {/* Main nav */}
        <nav aria-label="Primary" className="space-y-1">
          <p className="px-3 text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Browse</p>
          <DrawerLink to="/">Home</DrawerLink>
          {DESTINATIONS.map((d) => (
            <DrawerLink key={d.label} to={d.to}>{d.label}</DrawerLink>
          ))}
          <DrawerLink to="/pricing">Pricing</DrawerLink>
        </nav>

        {user ? (
          <>
            <div className="space-y-1">
              <p className="px-3 text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Account</p>
              <DrawerLink to="/dashboard">Dashboard</DrawerLink>
              <DrawerLink to="/account">Account</DrawerLink>
              <DrawerLink to="/pricing">Plans &amp; Billing</DrawerLink>
              {isCreator && <DrawerLink to="/app/creator">Creator Studio</DrawerLink>}
              {isAdminOrDev && (
                <div className="space-y-1">
                  <p className="px-3 text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Admin</p>
                  {ADMIN_LINKS.map((link) => (
                    <DrawerLink key={link.to} to={link.to}>{link.label}</DrawerLink>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 backdrop-blur-sm">
              <AccountMenuContent onNavigate={onClose} />
            </div>
          </>
        ) : (

          <div className="space-y-2 pt-4">
            <Link to="/auth" onClick={onClose}>
              <Button variant="outline" className="w-full rounded-full border-white/15 bg-white/5 text-foreground hover:bg-white/10">
                Login
              </Button>
            </Link>
            <Link to="/auth" onClick={onClose}>
              <Button className="w-full rounded-full gradient-primary text-primary-foreground font-bold border-0">
                Launch Drop
              </Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
};

/* ─── Main Navbar ─── */
const Navbar = () => {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, roles } = useAuth();
  const { pathname } = useLocation();
  const isAdminOrDev = roles.includes("admin") || roles.includes("dev");

  const handleScroll = useCallback(() => {
    setScrolled(window.scrollY > 50);
  }, []);

  useEffect(() => {
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-background/85 backdrop-blur-xl border-b border-border/30 shadow-lg shadow-black/20"
          : "bg-transparent backdrop-blur-sm"
      }`}
      style={!scrolled ? { borderBottom: '1px solid rgba(255,255,255,0.04)' } : undefined}
    >
      <div className="container mx-auto flex items-center justify-between h-16 gap-2 px-4 sm:px-6">
        {/* Logo */}
        <Link
          to="/"
          aria-label="FUSE home"
          className={cn("flex shrink-0 items-center gap-2 rounded-lg sm:gap-3", FOCUS_RING)}
        >
          <img src={FUSE_ICON_SRC} alt="" className="h-8 w-8 rounded-xl object-contain sm:h-9 sm:w-9" />
          <img src={FUSE_WORDMARK_SRC} alt="FUSE" className="h-5 w-auto object-contain sm:h-6" />
        </Link>

        {/* Center nav — real product destinations (tablet and up) */}
        <div className="hidden md:flex min-w-0 items-center gap-1">
          {DESTINATIONS.map((item) => (
            <NavItem key={item.label} item={item} active={item.match(pathname)} />
          ))}
          <Link
            to="/pricing"
            aria-current={pathname === "/pricing" ? "page" : undefined}
            className={cn(
              "ml-2 hidden lg:inline-flex rounded-lg px-3 py-1.5 text-sm transition-colors duration-200 motion-reduce:transition-none",
              FOCUS_RING,
              pathname === "/pricing"
                ? "bg-primary/10 font-semibold text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Pricing
          </Link>
        </div>

        {/* Right side */}
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          {user && isAdminOrDev && <AdminMenu />}

          {/* Mobile / tablet overflow menu */}
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <button
                className={cn(
                  "lg:hidden inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors motion-reduce:transition-none",
                  FOCUS_RING
                )}
                aria-label={mobileOpen ? "Close navigation menu" : "Open navigation menu"}
                aria-expanded={mobileOpen}
              >
                <Menu size={20} aria-hidden="true" />
              </button>
            </SheetTrigger>
            <SheetContent
              side="right"
              className="w-[min(340px,90vw)] border-white/10 bg-[#0B1120]/95 p-0 motion-reduce:transition-none motion-reduce:animate-none motion-reduce:duration-0"
            >

              <SheetTitle className="sr-only">Navigation menu</SheetTitle>
              <MobileMenu onClose={() => setMobileOpen(false)} />
            </SheetContent>
          </Sheet>

          {user ? (
            <>
              <CreditChip />
              <AccountPopover />
            </>
          ) : (
            <>

              <Link to="/auth">
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full border-border/60 text-foreground hover:text-foreground hover:border-foreground/30 bg-transparent px-5 text-xs"
                >
                  <User size={14} className="mr-1.5" />
                  Login
                </Button>
              </Link>
              <Link to="/auth">
                <Button
                  size="sm"
                  className="rounded-full gradient-primary text-primary-foreground font-bold glow-blue-sm hover:opacity-90 transition-opacity border-0 px-5 text-xs tracking-wide"
                >
                  Get started
                </Button>
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
