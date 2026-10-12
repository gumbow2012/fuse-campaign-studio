import type { ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

/** MADDENAI brand shell: its own header, same FUSE account and credits underneath. */
export const MADDENAI = { accent: "#FF3B2F", ground: "#0B0B0D", text: "#F4F1EC" };

export function MaddenAIWordmark({ size = 20 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2">
      <img src="/maddenai/mark.svg" alt="" width={size + 8} height={size + 8} />
      <span style={{ fontFamily: "Archivo, system-ui, sans-serif", fontWeight: 800, fontSize: size, letterSpacing: "0.04em", color: MADDENAI.text }}>
        MADDEN<span style={{ color: MADDENAI.accent }}>AI</span>
      </span>
    </span>
  );
}

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${isActive ? "bg-white/10 text-white" : "text-white/60 hover:text-white"}`;

export default function MaddenAIShell({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  return (
    <div className="dark min-h-screen" style={{ background: MADDENAI.ground, color: MADDENAI.text }}>
      <header className="sticky top-0 z-40 border-b border-white/10 backdrop-blur" style={{ background: "rgba(11,11,13,0.85)" }}>
        <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-4 px-4 sm:px-6">
          <Link to="/maddenai" aria-label="MADDENAI home"><MaddenAIWordmark size={18} /></Link>
          <nav className="hidden items-center gap-1 sm:flex">
            <NavLink to="/maddenai/create" className={linkClass}>Create</NavLink>
            <NavLink to="/maddenai/outfit-swap" className={linkClass}>Outfit Swap</NavLink>
          </nav>
          <div className="ml-auto flex items-center gap-2 text-sm">
            {user ? (
              <>
                <Link to="/account" className="text-white/60 hover:text-white">Account</Link>
                <button type="button" onClick={() => void signOut()} className="text-white/60 hover:text-white">Sign out</button>
              </>
            ) : (
              <Link to="/auth" className="whitespace-nowrap rounded-full px-4 py-1.5 font-semibold text-white" style={{ background: MADDENAI.accent }}>Sign in</Link>
            )}
          </div>
        </div>
      </header>
      <main>{children}</main>
      <footer className="border-t border-white/10 px-4 py-6 text-center text-xs text-white/40">
        MADDENAI by Madden Media · <Link to="/terms" className="hover:text-white/70">Terms</Link> · <Link to="/privacy" className="hover:text-white/70">Privacy</Link>
      </footer>
    </div>
  );
}
