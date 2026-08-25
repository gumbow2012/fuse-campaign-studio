import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Link, useLocation } from "react-router-dom";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { User, LayoutGrid, ImageIcon, Clapperboard, Zap, Menu } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { AccountPopover, AccountMenuContent } from "@/components/AccountMenu";

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

const NavItem = ({ item, active }: { item: NavDestination; active: boolean }) => {
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      aria-current={active ? "page" : undefined}
      className={`group relative flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors duration-200 ${
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

/* ─── Mobile menu content ─── */
const MobileMenu = ({ onClose }: { onClose: () => void }) => {
  const { user, isCreator, roles } = useAuth();
  const isAdminOrDev = roles.includes("admin") || roles.includes("dev");

  const linkClass =
    "block rounded-lg px-3 py-2 text-sm text-foreground/80 hover:bg-white/5 hover:text-foreground transition-colors";

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <span className="font-display text-sm font-black uppercase tracking-wider text-foreground">Menu</span>
      </div>

      <div className="flex-1 overflow-auto px-4 py-4 space-y-6">
        {/* Main nav */}
        <div className="space-y-1">
          <p className="px-3 text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Browse</p>
          <Link to="/" onClick={onClose} className={linkClass}>Home</Link>
          <Link to="#drops" onClick={onClose} className={linkClass}>Drops</Link>
          <Link to="#create" onClick={onClose} className={linkClass}>Create</Link>
          <Link to="#" onClick={onClose} className={linkClass}>Templates</Link>
          <Link to="#" onClick={onClose} className={linkClass}>Vault</Link>
          <Link to="/pricing" onClick={onClose} className={linkClass}>Pricing</Link>
        </div>

        {user ? (
          <>
            <div className="space-y-1">
              <p className="px-3 text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Account</p>
              <Link to="/dashboard" onClick={onClose} className={linkClass}>Dashboard</Link>
              <Link to="/account" onClick={onClose} className={linkClass}>Account</Link>
              <Link to="/pricing" onClick={onClose} className={linkClass}>Plans & Billing</Link>
              {isCreator && <Link to="/app/creator" onClick={onClose} className={linkClass}>Creator Studio</Link>}
              {isAdminOrDev && <Link to="/admin" onClick={onClose} className={linkClass}>Admin</Link>}
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-sm">
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
  const [activeMode, setActiveMode] = useState<typeof modes[number]>("Streetwear");
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, profile } = useAuth();

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
      <div className="container mx-auto flex items-center justify-between h-16 px-6">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-3">
          <img src={FUSE_ICON_SRC} alt="" className="h-9 w-9 rounded-xl object-contain" />
          <img src={FUSE_WORDMARK_SRC} alt="FUSE" className="h-6 w-auto object-contain" />
        </Link>

        {/* Center nav */}
        <div className="hidden lg:flex items-center gap-6">
          {/* Drops dropdown */}
          <NavDropdown
            label="Drops"
            pill={
              <span className="ml-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-primary/20 text-[9px] font-bold uppercase tracking-wider text-primary">
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                Live
              </span>
            }
          >
            <DropdownItem label="🔥 Live Drop — VOL 01 RAW STREET" href="#drops" />
            <DropdownItem label="New This Week" />
            <DropdownItem label="Trending Packs" />
            <DropdownItem label="Seasonal Drops" />
            <DropdownDivider />
            <DropdownItem label="Archive (VOL 00–12)" />
          </NavDropdown>

          {/* Create dropdown */}
          <NavDropdown label="Create">
            <DropdownItem label="Run a Drop" href="#create" />
            <DropdownItem label="Build a Campaign Pack" />
            <DropdownItem label="Generate Product Photos" />
            <DropdownItem label="Generate UGC Variations" />
            <DropdownItem label="Make a Lookbook Grid" />
            <DropdownItem label="Create Store Assets" />
          </NavDropdown>

          {/* Templates mega menu */}
          <TemplatesMegaMenu />

          {/* Vault */}
          <Link to="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200">
            Vault
          </Link>

          {/* Boards — locked */}
          <Link to="#" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors duration-200">
            Boards
            <span className="inline-flex items-center gap-0.5 text-[9px] text-muted-foreground/60">
              <Lock size={9} /> Pro
            </span>
          </Link>

          {/* Explore */}
          <Link to="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200">
            Explore
          </Link>

          {/* Pricing */}
          <Link to="/pricing" className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200">
            Pricing
          </Link>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2">
          {/* Mode switch */}
          <div className="hidden xl:flex items-center gap-0.5 mr-3 px-1 py-0.5 rounded-full bg-secondary/50 border border-border/40">
            {modes.map((mode) => (
              <button
                key={mode}
                onClick={() => setActiveMode(mode)}
                className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-[0.1em] transition-all ${
                  activeMode === mode
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {mode}
              </button>
            ))}
          </div>

          {/* Mobile menu */}
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <button
                className="lg:hidden p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors"
                aria-label="Open menu"
              >
                <Menu size={20} />
              </button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[300px] border-white/10 bg-[#0B1120]/95 p-0">
              <SheetTitle className="sr-only">Navigation menu</SheetTitle>
              <MobileMenu onClose={() => setMobileOpen(false)} />
            </SheetContent>
          </Sheet>

          {user ? (
            <>
              {/* Credits badge */}
              <div className="hidden md:flex items-center gap-1 px-3 py-1.5 rounded-full bg-secondary/50 border border-border/40">
                <Zap size={12} className="text-primary" />
                <span className="text-[10px] font-bold text-foreground">{profile?.credits_balance ?? 0}</span>
              </div>

              {/* Quick action icons */}
              <div className="hidden md:flex items-center gap-1">
                {[
                  { icon: Search, label: "Search" },
                  { icon: Bell, label: "Updates" },
                  { icon: FolderArchive, label: "Vault" },
                ].map(({ icon: Icon, label }) => (
                  <button
                    key={label}
                    title={label}
                    className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors"
                  >
                    <Icon size={16} />
                  </button>
                ))}
              </div>

              <div className="w-px h-6 bg-border/40 mx-1 hidden md:block" />

              <Link to="/dashboard" className="hidden sm:block">
                <Button variant="outline" size="sm" className="rounded-full border-border/60 text-foreground hover:text-foreground hover:border-foreground/30 bg-transparent px-4 text-xs">
                  <LayoutDashboard size={14} className="mr-1.5" />
                  Dashboard
                </Button>
              </Link>

              <AccountPopover />
            </>
          ) : (
            <>
              {/* Quick action icons */}
              <div className="hidden md:flex items-center gap-1">
                {[
                  { icon: Search, label: "Search" },
                  { icon: Bell, label: "Updates" },
                  { icon: Star, label: "Saved" },
                  { icon: FolderArchive, label: "Vault" },
                  { icon: FileText, label: "Runs" },
                ].map(({ icon: Icon, label }) => (
                  <button
                    key={label}
                    title={label}
                    className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors"
                  >
                    <Icon size={16} />
                  </button>
                ))}
              </div>

              <div className="w-px h-6 bg-border/40 mx-1 hidden md:block" />

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
                  Launch Drop
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
