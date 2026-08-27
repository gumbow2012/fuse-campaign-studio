import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/80 focus-visible:ring-offset-2 focus-visible:ring-offset-background";

const FUSE_ICON_SRC = "/fuse-icon.png?v=20260519";

const COLUMNS: Array<{ title: string; links: Array<{ label: string; to: string }> }> = [
  {
    title: "Product",
    links: [
      { label: "Templates", to: "/app/templates" },
      { label: "Pricing", to: "/pricing" },
      { label: "Creators", to: "/creators" },
      { label: "Refer & earn", to: "/referrals" },
    ],
  },
  {
    title: "Community",
    links: [
      { label: "Contests", to: "/contests" },
      { label: "Creator program", to: "/creators" },
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
    <footer className="relative border-t border-white/10 bg-background/40 py-10">
      <div className="container grid gap-8 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div className="space-y-3">
          <Link to="/" className={cn("inline-flex items-center gap-2.5 rounded-xl", focusRing)} aria-label="FUSE home">
            <img src={FUSE_ICON_SRC} alt="" className="h-8 w-8 rounded-xl object-contain" />
            <span className="text-sm font-semibold uppercase tracking-[0.24em] text-foreground">FUSE</span>
          </Link>
          <p className="max-w-xs text-xs leading-5 text-muted-foreground">
            Viral campaigns, already built — production-ready creative for streetwear brands.
          </p>
        </div>

        {COLUMNS.map((column) => (
          <nav key={column.title} aria-label={column.title} className="space-y-2.5">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">{column.title}</p>
            <ul className="space-y-2">
              {column.links.map((link) => (
                <li key={link.label}>
                  <Link
                    to={link.to}
                    className={cn(
                      "rounded text-xs text-foreground/75 transition-colors hover:text-cyan-100 motion-reduce:transition-none",
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

      <div className="container mt-8 flex flex-col items-center gap-2 border-t border-white/5 pt-6 text-center text-xs text-muted-foreground sm:flex-row sm:justify-between sm:text-left">
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
  );
}
