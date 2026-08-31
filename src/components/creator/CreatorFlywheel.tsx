import { useEffect, useState } from "react";
import { Layers3, Rocket, Share2, Coins } from "lucide-react";
import { cn } from "@/lib/utils";

const STAGES = [
  { icon: Layers3, label: "CREATE", line: "Build reusable campaign templates" },
  { icon: Rocket, label: "PUBLISH", line: "Add them to your Creator profile" },
  { icon: Share2, label: "SHARE", line: "Get your creator + template links" },
  { icon: Coins, label: "EARN", line: "Earn when eligible templates are run" },
];

const useReducedMotion = () => {
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

/**
 * Customer-safe creator flywheel: CREATE → PUBLISH → SHARE → EARN.
 * Horizontal on desktop, stacked on mobile. No provider names or workflow internals.
 */
const CreatorFlywheel = () => {
  const reduced = useReducedMotion();
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (reduced) return;
    const timer = window.setInterval(() => setActive((index) => (index + 1) % STAGES.length), 1600);
    return () => window.clearInterval(timer);
  }, [reduced]);

  return (
    <ul className="mt-7 grid grid-cols-1 gap-2.5 sm:grid-cols-4 sm:gap-2">
      {STAGES.map(({ icon: Icon, label, line }, index) => {
        const isActive = !reduced && index === active;
        return (
          <li
            key={label}
            className={cn(
              "flex items-start gap-3 rounded-xl border p-3.5 transition-colors duration-500 sm:flex-col sm:items-start",
              isActive
                ? "border-cyan-300/50 bg-cyan-300/[0.07]"
                : "border-white/10 bg-white/[0.03]",
            )}
          >
            <span
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors duration-500",
                isActive ? "border-cyan-300/60 bg-cyan-300/15" : "border-white/12 bg-white/[0.05]",
              )}
            >
              <Icon className={cn("h-4 w-4 transition-colors duration-500", isActive ? "text-cyan-300" : "text-white/55")} />
            </span>
            <span className="min-w-0 sm:mt-2.5">
              <span className="block font-display text-[11px] font-bold uppercase tracking-[0.18em] text-white">
                {label}
              </span>
              <span className="mt-1 block text-[13px] leading-snug text-white/55">{line}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
};

export default CreatorFlywheel;
