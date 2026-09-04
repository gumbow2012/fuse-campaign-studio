/**
 * G2 — the "fusing wire".
 *
 * Two gunmetal strands separated on the unfused side, welded into one solid
 * line behind a white-hot fusion point. Position is driven ONLY by the
 * server-reported percentage (already clamped to max-seen by the caller).
 * CSS/SVG only, no canvas, no particles, reduced-motion safe.
 */
import { useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "@/hooks/useAnimatedNumber";
import { cn } from "@/lib/utils";

export interface FusingProgressBarProps {
  /** 0–100, server truth. */
  percent: number;
  complete?: boolean;
  failed?: boolean;
  className?: string;
}

export function FusingProgressBar({ percent, complete, failed, className }: FusingProgressBarProps) {
  const reduced = usePrefersReducedMotion();
  const value = Math.max(0, Math.min(100, Math.round(percent)));
  const [pulse, setPulse] = useState(false);
  const wasComplete = useRef(false);

  useEffect(() => {
    if (complete && !wasComplete.current) {
      wasComplete.current = true;
      if (reduced) return;
      setPulse(true);
      const timer = window.setTimeout(() => setPulse(false), 900);
      return () => window.clearTimeout(timer);
    }
    if (!complete) wasComplete.current = false;
  }, [complete, reduced]);

  const fused = complete ? 100 : value;
  const seam = failed ? "hsl(350 85% 72%)" : "hsl(186 100% 62%)";

  return (
    <div
      className={cn("relative h-6 w-full select-none", className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={fused}
      aria-valuetext={`${fused} percent fused`}
    >
      {/* unfused strands — two separated gunmetal lines */}
      <span className="pointer-events-none absolute left-0 right-0 top-[7px] h-px bg-gradient-to-r from-slate-600/40 to-slate-600/25" />
      <span className="pointer-events-none absolute left-0 right-0 bottom-[7px] h-px bg-gradient-to-r from-slate-600/40 to-slate-600/25" />

      {/* fused seam — the two strands welded into one solid line */}
      <span
        className="pointer-events-none absolute left-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full"
        style={{
          width: `${fused}%`,
          background: failed
            ? "linear-gradient(90deg, hsl(215 20% 45%), hsl(350 85% 72% / 0.85))"
            : "linear-gradient(90deg, hsl(210 16% 62%), hsl(186 100% 62%))",
          boxShadow: `0 0 12px -2px ${seam}`,
          transition: reduced ? undefined : "width 700ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      />

      {/* fusion point — white-hot frontier with a restrained heat glow */}
      {fused > 0 && fused < 100 && !failed ? (
        <span
          className="pointer-events-none absolute top-1/2 -translate-y-1/2"
          style={{
            left: `calc(${fused}% - 5px)`,
            transition: reduced ? undefined : "left 700ms cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        >
          <span
            className={cn(
              "block h-2.5 w-2.5 rounded-full bg-white",
              reduced ? "" : "animate-pulse",
            )}
            style={{
              boxShadow:
                "0 0 8px 2px hsl(186 100% 78% / 0.9), 0 0 22px 6px hsl(186 100% 62% / 0.35)",
            }}
          />
        </span>
      ) : null}

      {/* one subtle completion pulse */}
      {pulse ? (
        <span
          className="pointer-events-none absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full"
          style={{
            background: "hsl(186 100% 78%)",
            animation: "fade-out 800ms ease-out forwards",
          }}
        />
      ) : null}
    </div>
  );
}

export default FusingProgressBar;
