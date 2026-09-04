/**
 * G1 — live activity. Text changes only when the real active step changes.
 * Labels and model names arrive customer-safe from the server; rendered as-is.
 */
import { usePrefersReducedMotion } from "@/hooks/useAnimatedNumber";
import type { LiveActiveStep, LiveRecentStep } from "@/services/campaignLiveStatus";
import { cn } from "@/lib/utils";

export interface LiveActivityFeedProps {
  active: LiveActiveStep[];
  recent: LiveRecentStep[];
  className?: string;
}

export function LiveActivityFeed({ active, recent, className }: LiveActivityFeedProps) {
  const reduced = usePrefersReducedMotion();

  return (
    <div className={cn("space-y-2.5", className)}>
      {active.length > 0 ? (
        <ul className="space-y-1.5">
          {active.map((step, index) => (
            <li
              key={`${step.label}-${step.output_number ?? index}`}
              className="flex items-center gap-2.5 text-sm text-slate-100"
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 shrink-0 rounded-full bg-[hsl(186_100%_62%)]",
                  reduced ? "" : "animate-pulse",
                )}
                style={{ boxShadow: "0 0 10px 1px hsl(186 100% 62% / 0.7)" }}
                aria-hidden
              />
              <span className="truncate">
                {step.label}
                {step.model ? (
                  <span className="text-slate-400"> · {step.model}</span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {recent.length > 0 ? (
        <ul className="space-y-1">
          {recent.map((step, index) => (
            <li
              key={`${step.label}-${step.at ?? index}`}
              className="flex items-center gap-2.5 text-[13px] text-slate-500"
            >
              <span className="shrink-0 text-[hsl(186_100%_62%)]/70" aria-hidden>
                ✓
              </span>
              <span className="truncate">{step.label}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export default LiveActivityFeed;
