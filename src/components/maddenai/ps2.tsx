import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * MADDEN AI "PS2" look: deep-blue fog, glossy translucent panels with a lit
 * top edge, Orbitron headings, and controller-glyph buttons.
 */
export const PS2 = {
  accent: "#4DA8FF",
  glow: "#7CE3FF",
  ground: "#020617",
  text: "#EAF4FF",
};

/** Glossy blue panel — the base surface for every card. */
export const ps2Panel =
  "relative rounded-2xl border border-sky-300/25 bg-[linear-gradient(180deg,rgba(45,105,230,0.20)_0%,rgba(8,20,60,0.55)_45%,rgba(3,9,30,0.7)_100%)] shadow-[inset_0_1px_0_rgba(180,225,255,0.35),0_24px_60px_-30px_rgba(40,130,255,0.65)] backdrop-blur-md";

/** Inset well for inputs / empty states inside a panel. */
export const ps2Well = "rounded-xl border border-sky-200/15 bg-[#020a24]/70 shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)]";

/** Primary action: chrome-blue pill. */
export const ps2Button =
  "group inline-flex items-center justify-center gap-2.5 rounded-xl border border-sky-200/60 bg-[linear-gradient(180deg,#8FD0FF_0%,#3C8CFF_45%,#1A4FD6_100%)] px-5 py-3.5 font-display text-[13px] font-bold uppercase tracking-[0.14em] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_12px_30px_-12px_rgba(60,150,255,0.9)] transition hover:brightness-110 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:brightness-100";

/** Secondary action: glass outline. */
export const ps2Ghost =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-sky-200/30 bg-sky-400/[0.06] px-5 py-3 font-display text-[12px] font-bold uppercase tracking-[0.14em] text-sky-50 transition hover:border-sky-200/60 hover:bg-sky-400/10 disabled:cursor-not-allowed disabled:opacity-40";

export const ps2Heading = "font-display uppercase tracking-[0.08em] text-white";

/** PS2 controller glyph (✕ ○ △ □) in a small glossy disc. */
export function Ps2Glyph({ glyph = "✕", className = "" }: { glyph?: "✕" | "○" | "△" | "□"; className?: string }) {
  const tint = { "✕": "#9FC7FF", "○": "#FF8C9A", "△": "#7FF0C8", "□": "#F2A7FF" }[glyph];
  return (
    <span
      aria-hidden
      className={`inline-grid h-6 w-6 shrink-0 place-items-center rounded-full border border-white/40 bg-[radial-gradient(circle_at_35%_30%,#3a4466,#0b1024)] text-[12px] leading-none shadow-[inset_0_1px_0_rgba(255,255,255,0.4)] ${className}`}
      style={{ color: tint }}
    >
      {glyph}
    </span>
  );
}

/** Full-page backdrop: blue fog, horizon glow, perspective floor grid, scanlines. */
export function Ps2Backdrop({ children }: { children: ReactNode }) {
  return (
    <div className="relative isolate min-h-screen overflow-hidden" style={{ background: PS2.ground, color: PS2.text }}>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% -5%, rgba(70,150,255,0.38), transparent 65%), radial-gradient(ellipse 60% 40% at 85% 100%, rgba(30,80,255,0.22), transparent 60%), linear-gradient(180deg, #04103a 0%, #020617 55%, #01030d 100%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-[-25%] bottom-0 -z-10 h-[45vh] origin-bottom opacity-40"
        style={{
          transform: "perspective(600px) rotateX(62deg)",
          backgroundImage:
            "linear-gradient(rgba(110,180,255,0.35) 1px, transparent 1px), linear-gradient(90deg, rgba(110,180,255,0.35) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage: "linear-gradient(to top, black 10%, transparent 90%)",
          WebkitMaskImage: "linear-gradient(to top, black 10%, transparent 90%)",
        }}
      />
      <div aria-hidden className="crt-overlay fixed" />
      {children}
    </div>
  );
}

/** Video-game option cycler: ◀ VALUE ▶ (also arrow keys when focused). */
export function OptionCycler({ options, value, onChange, label }: { options: { label: string; value: string }[]; value: string; onChange: (v: string) => void; label: string }) {
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const step = (d: number) => onChange(options[(index + d + options.length) % options.length].value);
  return (
    <div
      role="spinbutton"
      tabIndex={0}
      aria-label={label}
      aria-valuetext={options[index].label}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") { e.preventDefault(); step(-1); }
        if (e.key === "ArrowRight") { e.preventDefault(); step(1); }
      }}
      className="flex items-center gap-1 rounded-lg border border-sky-300/30 bg-[#020a24]/80 p-1 outline-none focus-visible:border-sky-200 focus-visible:shadow-[0_0_0_2px_rgba(124,227,255,0.35)]"
    >
      <button type="button" tabIndex={-1} aria-label="Previous" onClick={() => step(-1)} className="grid h-7 w-7 place-items-center rounded-md text-sky-200 hover:bg-sky-400/15 hover:text-white">
        <ChevronLeft size={16} />
      </button>
      <span className="min-w-0 flex-1 truncate text-center font-display text-[11px] font-bold uppercase tracking-[0.14em] text-white">{options[index].label}</span>
      <button type="button" tabIndex={-1} aria-label="Next" onClick={() => step(1)} className="grid h-7 w-7 place-items-center rounded-md text-sky-200 hover:bg-sky-400/15 hover:text-white">
        <ChevronRight size={16} />
      </button>
    </div>
  );
}

