/**
 * BRAND ACTIVATION — Phase 5: named missing requirement for a saved brand.
 * Deep-links the brand step that resolves it. No fabricated unlock counts:
 * a count only renders when the caller calculated it from real template data.
 */
import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { useBrand } from "@/contexts/BrandContext";
import { ONBOARDING_ROUTE } from "@/lib/brandActivation";
import { track } from "@/lib/analytics/track";
import { cn } from "@/lib/utils";
import type { TemplateFit } from "@/lib/brandTemplateFit";

export default function TemplateRequirementNudge({
  fit,
  unlockCount,
  className,
}: {
  fit: TemplateFit;
  /** Only pass a real, calculated number of additionally compatible templates. */
  unlockCount?: number;
  className?: string;
}) {
  const navigate = useNavigate();
  const { activeBrand } = useBrand();
  const gap = fit.gaps[0];
  if (!activeBrand || fit.status !== "missing" || !gap) return null;

  const unlockLine =
    typeof unlockCount === "number" && unlockCount > 0
      ? `Unlock ${unlockCount} more compatible campaign${unlockCount === 1 ? "" : "s"}.`
      : "Unlock more compatible campaigns.";

  return (
    <div
      className={cn(
        "rounded-[1rem] border border-white/12 bg-white/[0.04] px-3.5 py-3",
        className,
      )}
    >
      <p className="font-display text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-200">
        <Plus className="mr-1 inline h-3 w-3" aria-hidden />
        {gap.label}
      </p>
      <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{unlockLine}</p>
      <button
        type="button"
        onClick={() => {
          try {
            track("template_requirement_nudge_clicked", {
              asset_role: gap.role,
              brand_id: activeBrand.id,
            });
          } catch {
            /* ignore */
          }
          navigate(
            `${ONBOARDING_ROUTE}?brand=${encodeURIComponent(activeBrand.id)}&step=${gap.step}`,
          );
        }}
        className="mt-2 rounded-full border border-cyan-300/35 bg-cyan-300/10 px-3 py-1 font-display text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-100 transition hover:bg-cyan-300/20"
      >
        {gap.label}
      </button>
    </div>
  );
}
