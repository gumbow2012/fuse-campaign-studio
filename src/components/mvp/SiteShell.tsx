import type { ReactNode } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    "rounded-full px-3 py-1.5 text-sm transition-colors",
    isActive ? "bg-white/10 text-foreground" : "text-muted-foreground hover:text-foreground",
  );

export default function SiteShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { user, profile, isAdmin, hasAppAccess, signOut } = useAuth();
  const creditDisplay = isAdmin ? "Admin access" : `${profile?.credits_balance ?? 0} credits`;

  const handleSignOut = async () => {
    await signOut();
    navigate("/", { replace: true });
  };

  return (
    <div className="min-h-screen text-foreground">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.18),transparent_28%),radial-gradient(circle_at_80%_20%,rgba(255,255,255,0.08),transparent_18%)]" />
      <header className="sticky top-0 z-40 border-b border-white/10 bg-background/75 backdrop-blur-xl">
        <div className="container flex flex-col gap-3 py-4 md:flex-row md:items-center md:justify-between">
          <Link to="/" className="flex items-center gap-3">
            <img src="/fuse-icon.png" alt="" className="h-11 w-11 rounded-2xl object-contain" />
            <div>
              <img src="/fuse-wordmark.png" alt="FUSE" className="h-5 w-auto object-contain" />
              <p className="text-[10px] uppercase tracking-[0.28em] text-muted-foreground">Campaign Asset Studio</p>
            </div>
          </Link>

          <div className="flex flex-col gap-3 md:items-end">
            <nav className="flex flex-wrap items-center gap-1.5">
              <NavLink to="/" className={navLinkClass} end>
                Home
              </NavLink>
              <NavLink to="/about" className={navLinkClass}>
                About
              </NavLink>
              <NavLink to="/pricing" className={navLinkClass}>
                Membership
              </NavLink>
              <NavLink to="/contact" className={navLinkClass}>
                Contact
              </NavLink>
              {user ? (
                <>
                  <NavLink to="/app/templates" className={navLinkClass}>
                    Templates
                  </NavLink>
                  <NavLink to="/account" className={navLinkClass}>
                    Account
                  </NavLink>
                  <NavLink to="/billing" className={navLinkClass}>
                    Billing
                  </NavLink>
                  {hasAppAccess ? (
                    <>
                      <NavLink to="/app/lab/canvas" className={navLinkClass}>
                        Node Workbench
                      </NavLink>
                      <NavLink to="/admin/templates" className={navLinkClass}>
                        Admin Templates
                      </NavLink>
                    </>
                  ) : null}
                </>
              ) : null}
            </nav>

            <div className="flex flex-wrap items-center gap-2">
              {user ? (
                <>
                  <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.22em] text-muted-foreground">
                    {creditDisplay}
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => void handleSignOut()}
                    className="rounded-full border-white/15 bg-white/5 text-foreground hover:bg-white/10"
                  >
                    Sign out
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    asChild
                    variant="outline"
                    className="rounded-full border-white/15 bg-white/5 text-foreground hover:bg-white/10"
                  >
                    <Link to="/auth">Sign in</Link>
                  </Button>
                  <Button asChild className="rounded-full bg-cyan-300 text-slate-950 hover:bg-cyan-200">
                    <Link to="/auth?mode=signup">Create account</Link>
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="relative">{children}</main>
    </div>
  );
}
