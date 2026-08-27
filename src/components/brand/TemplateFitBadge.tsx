/**
 * BRAND ACTIVATION — Phase 5: per-template compatibility badge.
 * Renders nothing when compatibility cannot be judged truthfully.
 */
import { Check, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TemplateFit } from "@/lib/brandTemplateFit";

export default function TemplateFitBadge({
  fit,
  brandName,
  className,
}: {
  fit: TemplateFit;
  brandName: string;
  className?: string;
}) {
  if (fit.status === "unknown") return null;

  const ready = fit.status === "ready";
  const gap = fit.gaps[0];
  if (!ready && !gap) return null;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-display text-[9px] uppercase tracking-[0.16em]",
        ready
          ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-200"
          : "border-white/12 bg-white/[0.04] text-slate-300",
        className,
      )}
    >
      {ready ? (
        <>
          <Check className="h-3 w-3" aria-hidden />
          Ready for {brandName}
        </>
      ) : (
        <>
          <Plus className="h-3 w-3" aria-hidden />
          {gap.label}
        </>
      )}
    </span>
  );
}
