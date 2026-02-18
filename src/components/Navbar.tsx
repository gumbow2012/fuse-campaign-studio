import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Star, FolderArchive, FileText, Bell, User, Search, Lock, ChevronDown } from "lucide-react";

/* ─── Mode options ─── */
const modes = ["Streetwear", "Luxury", "Ecom", "UGC"] as const;

/* ─── Dropdown wrapper ─── */
const NavDropdown = ({
  label,
  children,
  pill,
}: {
  label: string;
  children: React.ReactNode;
  pill?: React.ReactNode;
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors duration-200"
      >
        {label}
        {pill}
        <ChevronDown size={12} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-2 min-w-[220px] rounded-lg border border-border bg-card shadow-xl z-[100] py-2">
          {children}
        </div>
      )}
    </div>
  );
};

const DropdownItem = ({
  label,
  locked,
  tier,
  href = "#",
}: {
  label: string;
  locked?: boolean;
  tier?: string;
  href?: string;
}) => (
  <Link
    to={href}
    className="flex items-center justify-between px-4 py-2 text-sm text-foreground/80 hover:bg-secondary/60 hover:text-foreground transition-colors"
  >
    <span>{label}</span>
    {locked && (
      <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
        <Lock size={10} /> {tier}
      </span>
    )}
  </Link>
);

const DropdownDivider = () => <div className="my-1.5 border-t border-border/50" />;
const DropdownLabel = ({ children }: { children: React.ReactNode }) => (
  <p className="px-4 pt-2 pb-1 text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">{children}</p>
);

/* ─── Templates Mega Menu ─── */
const TemplatesMegaMenu = () => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors duration-200"
      >
        Templates
        <ChevronDown size={12} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-[580px] rounded-xl border border-border bg-card shadow-2xl z-[100] p-5 grid grid-cols-3 gap-6">
          {/* Col 1 */}
          <div>
            <DropdownLabel>By Aesthetic</DropdownLabel>
            {["Raw Street", "Luxe Editorial", "Viral POV", "Underground", "Clean Commerce"].map((t) => (
              <Link key={t} to="#" className="block px-2 py-1.5 text-sm text-foreground/80 hover:text-foreground hover:bg-secondary/40 rounded transition-colors">
                {t}
              </Link>
            ))}
          </div>
          {/* Col 2 */}
          <div>
            <DropdownLabel>By Output Type</DropdownLabel>
            {["On-model", "Closeups", "Editorial", "Motion-ready", "Lookbook"].map((t) => (
              <Link key={t} to="#" className="block px-2 py-1.5 text-sm text-foreground/80 hover:text-foreground hover:bg-secondary/40 rounded transition-colors">
                {t}
              </Link>
            ))}
          </div>
          {/* Col 3 */}
          <div>
            <DropdownLabel>Featured</DropdownLabel>
            {["VOL 01 Pack", "Most Run This Week", "New Additions"].map((t) => (
              <Link key={t} to="#" className="block px-2 py-1.5 text-sm text-foreground/80 hover:text-foreground hover:bg-secondary/40 rounded transition-colors">
                {t}
              </Link>
            ))}
            <DropdownDivider />
            <Link to="#" className="block px-2 py-1.5 text-sm text-primary hover:text-primary/80 font-medium transition-colors">
              Browse All Templates →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
};

/* ─── Main Navbar ─── */
const Navbar = () => {
  const [activeMode, setActiveMode] = useState<typeof modes[number]>("Streetwear");
  const [scrolled, setScrolled] = useState(false);

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
        <Link to="/" className="flex items-center">
          <span className="font-display text-2xl font-extrabold tracking-tight text-foreground">FUSE</span>
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

          <Button
            variant="outline"
            size="sm"
            className="rounded-full border-border/60 text-foreground hover:text-foreground hover:border-foreground/30 bg-transparent px-5 text-xs"
          >
            <User size={14} className="mr-1.5" />
            Login
          </Button>
          <Button
            size="sm"
            className="rounded-full gradient-primary text-primary-foreground font-bold glow-blue-sm hover:opacity-90 transition-opacity border-0 px-5 text-xs tracking-wide"
          >
            Launch Drop
          </Button>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
