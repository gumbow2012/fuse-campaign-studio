import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/80 focus-visible:ring-offset-2 focus-visible:ring-offset-background";

const FUSE_ICON_SRC = "/fuse-icon.png?v=20260519";

const COLUMNS: Array<{ title: string; links: Array<{ label: string; to: string }> }> = [
  {
    title: "Product",
    links: [
      { label: "Templates", to: "/app/templates" },
      { label: "Brand Workspace", to: "/app/brand" },
      { label: "Pricing", to: "/pricing" },
      { label: "New Drops", to: "/app/collections" },
    ],
  },
  {
    title: "Create",
    links: [
      { label: "Creator Program", to: "/creators" },
      { label: "Creator Studio", to: "/app/creator" },
      { label: "Contests", to: "/contests" },
      { label: "Refer & Earn", to: "/referrals" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", to: "/about" },
      { label: "Contact", to: "/contact" },
      { label: "FAQ", to: "/faq" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Terms", to: "/terms" },
      { label: "Privacy", to: "/privacy" },
    ],
  },
];

export default function SiteFooter() {
  return (
    <footer className="relative border-t border-white/10 bg-background/60">
      <div className="container grid gap-8 py-8 md:grid-cols-[1.3fr_repeat(4,minmax(0,1fr))] md:gap-6">
        <div className="space-y-3">
          <Link to="/" className={cn("inline-flex items-center gap-2.5 rounded-xl", focusRing)} aria-label="FUSE home">
            <img src={FUSE_ICON_SRC} alt="" className="h-7 w-7 rounded-lg object-contain" />
            <span className="font-display text-base font-bold uppercase tracking-[0.32em] text-foreground">FUSE</span>
          </Link>
          <p className="max-w-[22rem] text-xs leading-5 text-muted-foreground">
            Campaigns already built. Your brand makes them yours.
          </p>
          <Link
            to="/app/templates"
            className={cn(
              "group inline-flex items-center gap-1.5 rounded-full border border-cyan-300/30 bg-cyan-300/[0.07] px-3.5 py-1.5 font-display text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-100 transition-colors hover:bg-cyan-300/15 motion-reduce:transition-none",
              focusRing,
            )}
          >
            Explore campaigns
            <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" />
          </Link>
        </div>

        {COLUMNS.map((column) => (
          <nav key={column.title} aria-label={column.title} className="space-y-2.5">
            <p className="font-display text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-100/70">
              {column.title}
            </p>
            <ul className="space-y-1.5">
              {column.links.map((link) => (
                <li key={link.label}>
                  <Link
                    to={link.to}
                    className={cn(
                      "rounded text-[13px] font-medium text-foreground/70 transition-colors hover:text-cyan-100 motion-reduce:transition-none",
                      focusRing,
                    )}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      <div className="border-t border-white/5">
        <div className="container flex flex-col items-center gap-2 py-4 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground sm:flex-row sm:justify-between">
          <p>© {new Date().getFullYear()} FUSE</p>
          <a
            href="https://maddenmedia.ai"
            target="_blank"
            rel="noreferrer"
            className={cn("rounded transition-colors hover:text-cyan-100 motion-reduce:transition-none", focusRing)}
          >
            Built by Madden Media
          </a>
        </div>
      </div>
    </footer>
  );
}
