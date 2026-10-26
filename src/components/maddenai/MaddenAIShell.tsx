import type { ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { PS2, Ps2Backdrop } from "@/components/maddenai/ps2";

/** MADDEN AI brand shell: its own header, same FUSE account and credits underneath. */
export const MADDENAI = PS2;

export function MaddenAIWordmark({ size = 20 }: { size?: number }) {
  return <img src="/maddenai/wordmark.png" alt="MADDEN AI" className="maddenai-glow" style={{ height: size * 1.25, width: "auto" }} />;
}

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `whitespace-nowrap rounded-lg border px-3 py-1.5 font-display text-[11px] font-bold uppercase tracking-[0.14em] transition-colors ${
    isActive
      ? "border-sky-300/50 bg-sky-400/15 text-white shadow-[inset_0_1px_0_rgba(180,225,255,0.35)]"
      : "border-transparent text-sky-100/60 hover:text-white"
  }`;

const NAV = [
  { to: "/maddenai", label: "Outfit Swap", end: true },
  { to: "/maddenai/create", label: "Image & Video" },
  { to: "/maddenai/pro", label: "Pro editor" },
];

export default function MaddenAIShell({ children }: { children: ReactNode }) {
  const { user, profile, isAdmin, signOut } = useAuth();
  return (
    <Ps2Backdrop>
      <div className="dark">
        <header className="sticky top-0 z-40 border-b border-sky-300/15 bg-[#020820]/75 backdrop-blur-md">
          <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-4 px-4 sm:px-6">
            <Link to="/maddenai" aria-label="MADDEN AI home"><MaddenAIWordmark size={16} /></Link>
            <nav className="hidden items-center gap-1 md:flex">
              {NAV.map((item) => <NavLink key={item.to} to={item.to} end={item.end} className={linkClass}>{item.label}</NavLink>)}
            </nav>
            <div className="ml-auto flex items-center gap-3 text-sm">
              {user ? (
                <>
                  {!isAdmin && profile ? (
                    <Link to="/pricing" className="whitespace-nowrap rounded-lg border border-sky-300/30 bg-sky-400/10 px-3 py-1 font-display text-[11px] font-bold tracking-[0.1em] text-sky-50 hover:border-sky-200/60" title="Credits">
                      {(profile.credits_balance ?? 0).toLocaleString()} CR
                    </Link>
                  ) : null}
                  <Link to="/account" className="hidden text-sky-100/60 hover:text-white sm:inline">Account</Link>
                  <button type="button" onClick={() => void signOut()} className="hidden text-sky-100/60 hover:text-white sm:inline">Sign out</button>
                </>
              ) : (
                <Link
                  to="/auth?returnTo=/maddenai"
                  className="whitespace-nowrap rounded-lg border border-sky-200/60 bg-[linear-gradient(180deg,#8FD0FF,#2F6FF0)] px-4 py-1.5 font-display text-[11px] font-bold uppercase tracking-[0.14em] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]"
                >
                  Sign in
                </Link>
              )}
            </div>
          </div>
          <nav className="flex gap-1 overflow-x-auto px-3 pb-2 md:hidden">
            {NAV.map((item) => <NavLink key={item.to} to={item.to} end={item.end} className={linkClass}>{item.label}</NavLink>)}
          </nav>
        </header>
        <main>{children}</main>
        <footer className="border-t border-sky-300/10 px-4 py-6 text-center text-xs text-sky-100/40">
          MADDEN AI by Madden Media · <Link to="/" className="hover:text-white/70">FUSE</Link> · <Link to="/terms" className="hover:text-white/70">Terms</Link> · <Link to="/privacy" className="hover:text-white/70">Privacy</Link>
        </footer>
      </div>
    </Ps2Backdrop>
  );
}
