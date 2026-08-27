/**
 * BRAND ACTIVATION — Phase 5: post-success invitation (no active brand only).
 * Inline card, never a modal over the results.
 */
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, X } from "lucide-react";
import { useBrand } from "@/contexts/BrandContext";
import { ONBOARDING_ROUTE } from "@/lib/brandActivation";
import { track } from "@/lib/analytics/track";
import { cn } from "@/lib/utils";

export default function BuildBrandAfterRunCard({
  runId,
  className,
}: {
  runId?: string | null;
  className?: string;
}) {
  const navigate = useNavigate();
  const { activeBrandId } = useBrand();
  const [dismissed, setDismissed] = useState(false);
  const shownRef = useRef<string | null>(null);

  useEffect(() => {
    setDismissed(false);
  }, [runId]);

  useEffect(() => {
    if (activeBrandId || dismissed) return;
    const key = runId ?? "run";
    if (shownRef.current === key) return;
    shownRef.current = key;
    try {
      track("post_run_build_brand_shown", { has_brand: false });
    } catch {
      /* ignore */
    }
  }, [activeBrandId, dismissed, runId]);

  if (activeBrandId || dismissed) return null;

  return (
    <div
      className={cn(
        "relative rounded-[1.25rem] border border-cyan-200/20 bg-cyan-300/[0.05] p-4 pr-10",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="absolute right-3 top-3 text-slate-500 transition hover:text-white"
      >
        <X className="h-3.5 w-3.5" />
      </button>
      <p className="font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-100">
        <Sparkles className="mr-1.5 inline h-3.5 w-3.5" aria-hidden />
        Next time can be faster
      </p>
      <p className="mt-1.5 text-sm leading-relaxed text-slate-300">
        Save your products and identity once — FUSE can preload future campaigns.
      </p>
      <button
        type="button"
        onClick={() => {
          try {
            track("post_run_build_brand_clicked", { has_brand: false });
          } catch {
            /* ignore */
          }
          navigate(`${ONBOARDING_ROUTE}?step=1`);
        }}
        className="mt-3 rounded-full border border-cyan-300/40 bg-cyan-300/15 px-4 py-1.5 font-display text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-100 transition hover:bg-cyan-300/25"
      >
        Build my brand
      </button>
    </div>
  );
}
