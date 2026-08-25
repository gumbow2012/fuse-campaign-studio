import { useEffect, useId, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * FUSE CORE — proprietary account symbol.
 * Two opposing wire paths fuse into a central connection node,
 * with an abstract "F" read formed by the upper spine + two arms.
 * Self-contained, monochrome-friendly, crisp at 28-36px.
 */
export interface FuseCoreProps {
  size?: number;
  active?: boolean;
  className?: string;
}

const usePrefersReducedMotion = () => {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
};

export function FuseCore({ size = 30, active = false, className }: FuseCoreProps) {
  const uid = useId().replace(/[:]/g, "");
  const reduced = usePrefersReducedMotion();
  const [pulseKey, setPulseKey] = useState(0);

  // one-shot energy pulse on hover / when the panel opens
  useEffect(() => {
    if (active && !reduced) setPulseKey((k) => k + 1);
  }, [active, reduced]);

  const stroke = active ? "hsl(186 100% 62%)" : "hsl(215 16% 68%)";
  const wire = "M6 7 H21 M6 7 C6 12.5 10.5 15.5 16 16 M6 25 C6 19.5 10.5 16.5 16 16 M6 16 H13";
  const opposing = "M26 25 H17.5 M26 25 C26 19.5 21.5 16.5 16 16";

  return (
    <span
      className={cn("relative inline-flex items-center justify-center", className)}
      onMouseEnter={() => !reduced && setPulseKey((k) => k + 1)}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        aria-hidden="true"
        style={{
          filter: active
            ? "drop-shadow(0 0 4px hsl(186 100% 62% / 0.85)) drop-shadow(0 0 10px hsl(186 100% 62% / 0.35))"
            : undefined,
          transition: reduced ? undefined : "filter 200ms ease-out",
        }}
      >
        <g
          stroke={stroke}
          strokeWidth={1.9}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ transition: reduced ? undefined : "stroke 200ms ease-out" }}
        >
          <path d={wire} />
          <path d={opposing} opacity={0.7} />
        </g>

        {/* central fused connection node */}
        <circle cx="16" cy="16" r="2.6" fill={active ? "hsl(186 100% 62%)" : "hsl(215 16% 72%)"} />
        <circle cx="16" cy="16" r="4.6" stroke={stroke} strokeWidth={0.9} opacity={active ? 0.55 : 0.25} fill="none" />

        {/* one-shot energy pulse travelling through the fused wires */}
        {!reduced && pulseKey > 0 && (
          <g key={`${uid}-${pulseKey}`}>
            <path
              d={wire}
              stroke="hsl(186 100% 78%)"
              strokeWidth={2.2}
              strokeLinecap="round"
              fill="none"
              pathLength={1}
              strokeDasharray="0.18 0.82"
            >
              <animate attributeName="stroke-dashoffset" from="1" to="0" dur="0.24s" fill="freeze" />
              <animate attributeName="opacity" from="0.9" to="0" dur="0.25s" fill="freeze" />
            </path>
          </g>
        )}
      </svg>
    </span>
  );
}

export default FuseCore;
