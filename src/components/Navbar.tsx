import fuseLogo from "@/assets/fuse-logo.png";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

const navLinks = [
  { label: "Features", href: "/features" },
  { label: "Templates", href: "/templates" },
  { label: "Pricing", href: "/pricing" },
  { label: "Enterprise", href: "/enterprise" },
];

const Navbar = () => {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 glass">
      <div className="container mx-auto flex items-center justify-between h-16 px-6">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2">
          <img src={fuseLogo} alt="FUSE" className="h-8 w-auto" />
          <span className="font-display text-xl font-bold tracking-tight text-foreground">FUSE</span>
        </Link>

        {/* Center nav links */}
        <div className="hidden md:flex items-center gap-8">
          {navLinks.map((link) => (
            <Link
              key={link.label}
              to={link.href}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200"
            >
              {link.label}
            </Link>
          ))}
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            className="rounded-full border-border/60 text-muted-foreground hover:text-foreground hover:border-foreground/30 bg-transparent"
          >
            Login
          </Button>
          <Button
            size="sm"
            className="rounded-full gradient-primary text-primary-foreground font-medium glow-blue-sm hover:opacity-90 transition-opacity border-0"
          >
            Get Started
          </Button>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
