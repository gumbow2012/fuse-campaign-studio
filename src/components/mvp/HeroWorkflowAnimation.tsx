import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { track } from "@/lib/analytics/track";

/**
 * Explanatory (NOT live) diagram of how a FUSE campaign runs.
 * Pure SVG + CSS. Honors prefers-reduced-motion by showing the final state.
 * Never exposes prompts, providers, models or internal ids — abstract nodes only.
 */

type Stage = 0 | 1 | 2 | 3;

const CYAN = "#22d3ee";
const MUTED = "rgba(148,163,184,0.45)";

const IMAGE_YS = [34, 66, 98, 130];
const VIDEO_YS = [52, 82, 112];

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

export default function HeroWorkflowAnimation({
  compact = false,
  grand = false,
}: {
  compact?: boolean;
  /** Desktop hero: larger, brighter, slightly more dimensional centrepiece. */
  grand?: boolean;
}) {
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
    // ~6s loop: illuminate, image branches, video branches, then hold the finished state.
    const timings = [1100, 1600, 1600, 2200];
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

  return (
    <div ref={wrapRef} className="relative">
      <div
        className={cn(
          "relative overflow-hidden rounded-[1.25rem] border border-white/10 bg-[#0B1120]",
          compact ? "px-3 py-3" : "p-4 sm:p-5",
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

        <svg
          viewBox="0 0 360 168"
          className={cn("relative w-full", compact ? "h-[190px]" : "h-[168px] sm:h-[188px]")}
          role="img"
          aria-label="Diagram: products branch into campaign images and video clips, then a final campaign."
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

          {/* connectors: input -> image branches */}
          {IMAGE_YS.map((y, idx) => (
            <path
              key={`c1-${y}`}
              d={`M62 82 C 94 82, 94 ${y}, 126 ${y}`}
              fill="none"
              strokeWidth={1.3}
              stroke={lineStroke(on(1))}
              style={{ transition: "stroke 600ms ease", transitionDelay: `${idx * 110}ms` }}
            />
          ))}

          {/* connectors: image branches -> video branches (cross-linked) */}
          {[
            [IMAGE_YS[0], VIDEO_YS[0]],
            [IMAGE_YS[1], VIDEO_YS[0]],
            [IMAGE_YS[1], VIDEO_YS[1]],
            [IMAGE_YS[2], VIDEO_YS[1]],
            [IMAGE_YS[2], VIDEO_YS[2]],
            [IMAGE_YS[3], VIDEO_YS[2]],
          ].map(([from, to], idx) => (
            <path
              key={`c2-${idx}`}
              d={`M164 ${from} C 192 ${from}, 194 ${to}, 222 ${to}`}
              fill="none"
              strokeWidth={1.2}
              stroke={lineStroke(on(2))}
              style={{ transition: "stroke 600ms ease", transitionDelay: `${idx * 90}ms` }}
            />
          ))}

          {/* connectors: video branches -> final */}
          {VIDEO_YS.map((y, idx) => (
            <path
              key={`c3-${y}`}
              d={`M260 ${y} C 286 ${y}, 286 82, 310 82`}
              fill="none"
              strokeWidth={1.3}
              stroke={lineStroke(on(3))}
              style={{ transition: "stroke 600ms ease", transitionDelay: `${idx * 90}ms` }}
            />
          ))}

          {/* input node */}
          <g filter="url(#fuse-glow)">
            <rect
              x={26}
              y={66}
              width={36}
              height={32}
              rx={7}
              fill={nodeFill(true)}
              stroke={nodeStroke(true)}
              strokeWidth={1.3}
            />
          </g>

          {/* image branch nodes */}
          {IMAGE_YS.map((y, idx) => (
            <rect
              key={`img-${y}`}
              x={126}
              y={y - 12}
              width={38}
              height={24}
              rx={6}
              fill={nodeFill(on(1))}
              stroke={nodeStroke(on(1))}
              strokeWidth={1.2}
              filter={on(1) ? "url(#fuse-glow)" : undefined}
              style={{ transition: "fill 500ms ease, stroke 500ms ease", transitionDelay: `${idx * 130}ms` }}
            />
          ))}

          {/* video branch nodes */}
          {VIDEO_YS.map((y, idx) => (
            <rect
              key={`vid-${y}`}
              x={222}
              y={y - 11}
              width={38}
              height={22}
              rx={6}
              fill={nodeFill(on(2))}
              stroke={nodeStroke(on(2))}
              strokeWidth={1.2}
              filter={on(2) ? "url(#fuse-glow)" : undefined}
              style={{ transition: "fill 500ms ease, stroke 500ms ease", transitionDelay: `${idx * 130}ms` }}
            />
          ))}

          {/* final node */}
          <rect
            x={310}
            y={62}
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
          <g fontSize="6.6" fontWeight="700" letterSpacing="0.7" fill="rgba(226,232,240,0.92)">
            <text x={2} y={155} textAnchor="start">YOUR PRODUCTS</text>
            <text x={145} y={155} textAnchor="middle">CAMPAIGN IMAGES</text>
            <text x={241} y={155} textAnchor="middle">VIDEO CLIPS</text>
            <text x={358} y={155} textAnchor="end">FINAL</text>
          </g>

          {/* finished badge */}
          <text
            x={358}
            y={22}
            textAnchor="end"
            fontSize="8"
            fontWeight="700"
            letterSpacing="0.9"
            fill={CYAN}
            style={{ transition: "opacity 500ms ease", opacity: on(3) ? 1 : 0 }}
          >
            CAMPAIGN READY ✓
          </text>
        </svg>
      </div>
    </div>
  );
}
