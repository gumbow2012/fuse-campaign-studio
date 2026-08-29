import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { track } from "@/lib/analytics/track";

/**
 * Explanatory (NOT live) diagram of how a FUSE campaign runs.
 * Pure SVG + CSS. Honors prefers-reduced-motion by showing the final state.
 * Never exposes prompts, providers, models or internal ids.
 */

type Stage = 0 | 1 | 2 | 3;

const STAGE_LABELS: Record<Stage, string> = {
  0: "Products loaded",
  1: "Building image steps",
  2: "Creating video clips",
  3: "Campaign ready ✓",
};


const CYAN = "#22d3ee";
const MUTED = "rgba(148,163,184,0.45)";

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

export default function HeroWorkflowAnimation({ compact = false }: { compact?: boolean }) {
  const reduced = useReducedMotion();
  const [stage, setStage] = useState<Stage>(reduced ? 3 : 0);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const seen = useRef(false);

  useEffect(() => {
    if (reduced) {
      setStage(3);
      return;
    }
    let i = 0;
    // ~6s loop: 1.2s per phase, then a short hold on the finished state.
    const timings = [1200, 1500, 1500, 2200];
    let timer: number;
    const advance = () => {
      timer = window.setTimeout(() => {
        i = (i + 1) % 4;
        setStage(i as Stage);
        advance();
      }, timings[i]);
    };
    advance();
    return () => window.clearTimeout(timer);
  }, [reduced]);

  useEffect(() => {
    const node = wrapRef.current;
    if (!node) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && !seen.current) {
            seen.current = true;
            track("hero_workflow_visible");
            io.disconnect();
          }
        }
      },
      { threshold: 0.35 },
    );
    io.observe(node);
    return () => io.disconnect();
  }, []);

  const on = (min: Stage) => stage >= min;

  const nodeFill = (active: boolean) => (active ? "rgba(34,211,238,0.16)" : "rgba(148,163,184,0.06)");
  const nodeStroke = (active: boolean) => (active ? CYAN : MUTED);
  const lineStroke = (active: boolean) => (active ? CYAN : "rgba(148,163,184,0.25)");

  if (compact) {
    const steps: Array<{ label: string; active: boolean }> = [
      { label: "Your products", active: true },
      { label: "FUSE", active: on(1) },
      { label: "Images + video clips", active: on(3) },
    ];
    return (
      <div
        ref={wrapRef}
        className="relative overflow-hidden rounded-[1.25rem] border border-white/10 bg-[#0B1120] px-4 py-4"
      >
        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-400">
          How a FUSE campaign runs
        </p>
        <div className="mt-3 flex flex-col items-center gap-1.5">
          {steps.map((s, i) => (
            <div key={s.label} className="flex w-full flex-col items-center gap-1.5">
              <div
                className={cn(
                  "w-full rounded-lg border px-3 py-2 text-center font-sans text-[12px] font-bold uppercase tracking-[0.12em] transition-colors duration-500",
                  s.active
                    ? "border-cyan-300/70 bg-cyan-300/10 text-cyan-100"
                    : "border-white/10 bg-white/[0.03] text-slate-400",
                )}
              >
                {s.label}
              </div>
              {i < steps.length - 1 ? (
                <span
                  className={cn(
                    "text-[13px] leading-none transition-colors duration-500",
                    steps[i + 1].active ? "text-cyan-300" : "text-slate-600",
                  )}
                  aria-hidden="true"
                >
                  ↓
                </span>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    );
  }


  return (
    <div ref={wrapRef} className="relative">
      <div
        className={cn(
          "relative overflow-hidden rounded-[1.25rem] border border-white/10 bg-[#0B1120]",
          compact ? "p-3" : "p-4 sm:p-5",
        )}
      >
        {/* faint grid */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage:
              "linear-gradient(to right, rgba(148,163,184,0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(148,163,184,0.08) 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }}
        />

        <p className="relative text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-400">
          How a FUSE campaign runs
        </p>

        <svg
          viewBox="0 0 360 168"
          className={cn("relative mt-3 w-full", compact ? "h-[132px]" : "h-[168px] sm:h-[188px]")}
          role="img"
          aria-label="Diagram: products become campaign images and video clips, then a final campaign."
        >
          <defs>
            <filter id="fuse-glow" x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="3" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* connectors: input -> images */}
          {[46, 84, 122].map((y, idx) => (
            <path
              key={`c1-${y}`}
              d={`M64 84 C 96 84, 96 ${y}, 128 ${y}`}
              fill="none"
              strokeWidth={1.4}
              stroke={lineStroke(on(1))}
              style={{
                transition: "stroke 600ms ease",
                transitionDelay: `${idx * 120}ms`,
              }}
            />
          ))}

          {/* connectors: images -> videos */}
          {[
            [46, 60],
            [84, 84],
            [122, 108],
          ].map(([from, to], idx) => (
            <path
              key={`c2-${from}`}
              d={`M168 ${from} C 196 ${from}, 196 ${to}, 224 ${to}`}
              fill="none"
              strokeWidth={1.4}
              stroke={lineStroke(on(2))}
              style={{ transition: "stroke 600ms ease", transitionDelay: `${idx * 120}ms` }}
            />
          ))}

          {/* connectors: videos -> final */}
          {[60, 84, 108].map((y) => (
            <path
              key={`c3-${y}`}
              d={`M264 ${y} C 288 ${y}, 288 84, 312 84`}
              fill="none"
              strokeWidth={1.4}
              stroke={lineStroke(on(3))}
              style={{ transition: "stroke 600ms ease" }}
            />
          ))}

          {/* input node */}
          <g filter={on(0) ? "url(#fuse-glow)" : undefined}>
            <rect
              x={28}
              y={68}
              width={36}
              height={32}
              rx={7}
              fill={nodeFill(true)}
              stroke={nodeStroke(true)}
              strokeWidth={1.3}
            />
          </g>

          {/* image nodes */}
          {[46, 84, 122].map((y, idx) => (
            <rect
              key={`img-${y}`}
              x={130}
              y={y - 15}
              width={38}
              height={30}
              rx={6}
              fill={nodeFill(on(1))}
              stroke={nodeStroke(on(1))}
              strokeWidth={1.2}
              filter={on(1) ? "url(#fuse-glow)" : undefined}
              style={{ transition: "fill 500ms ease, stroke 500ms ease", transitionDelay: `${idx * 140}ms` }}
            />
          ))}

          {/* video nodes */}
          {[60, 84, 108].map((y, idx) => (
            <rect
              key={`vid-${y}`}
              x={226}
              y={y - 13}
              width={38}
              height={26}
              rx={6}
              fill={nodeFill(on(2))}
              stroke={nodeStroke(on(2))}
              strokeWidth={1.2}
              filter={on(2) ? "url(#fuse-glow)" : undefined}
              style={{ transition: "fill 500ms ease, stroke 500ms ease", transitionDelay: `${idx * 140}ms` }}
            />
          ))}

          {/* final node */}
          <rect
            x={310}
            y={64}
            width={40}
            height={40}
            rx={9}
            fill={nodeFill(on(3))}
            stroke={nodeStroke(on(3))}
            strokeWidth={1.5}
            filter={on(3) ? "url(#fuse-glow)" : undefined}
            style={{ transition: "fill 500ms ease, stroke 500ms ease" }}
          />

          {/* stage labels */}
          <g fontSize="7.5" fontWeight="600" letterSpacing="1.1" fill="rgba(203,213,225,0.75)">
            <text x={4} y={148} textAnchor="start">PRODUCTS</text>
            <text x={149} y={148} textAnchor="middle">IMAGE STEPS</text>
            <text x={245} y={148} textAnchor="middle">VIDEO CLIPS</text>
            <text x={358} y={148} textAnchor="end">CAMPAIGN READY ✓</text>
          </g>

        </svg>

        <p
          className={cn(
            "relative mt-1 font-sans font-bold uppercase tracking-[0.16em]",
            stage === 3 ? "text-cyan-200" : "text-slate-300",
            compact ? "text-[11px]" : "text-[12px] sm:text-[13px]",
          )}
        >
          {STAGE_LABELS[stage]}
        </p>
      </div>
    </div>
  );
}
