/**
 * Brand Workspace — Phase 4 completion celebration.
 *
 * Tasteful premium transition (no confetti). Only lists what is ACTUALLY
 * present on the brand — truthful, derived by the caller. Fires
 * ACTIVATION_EVENTS.onboardingCompleted once and self-guards replays.
 */

import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ACTIVATION_EVENTS } from "@/lib/brandActivation";
import { track } from "@/lib/analytics/track";

export const MARKETPLACE_ROUTE = "/app/templates";

/** localStorage guard so the celebration only ever plays once per brand. */
export function brandCelebrationKey(brandId: string) {
  return `fuse.brandReady.celebrated.${brandId}`;
}

export function hasCelebratedBrand(brandId: string | null | undefined): boolean {
  if (!brandId) return true;
  try {
    return localStorage.getItem(brandCelebrationKey(brandId)) === "1";
  } catch {
    return true;
  }
}

export function markBrandCelebrated(brandId: string | null | undefined) {
  if (!brandId) return;
  try {
    localStorage.setItem(brandCelebrationKey(brandId), "1");
  } catch {
    /* storage unavailable — celebration simply may replay */
  }
}

export default function BrandReadyCelebration({
  open,
  brandId,
  brandName,
  knows,
  onClose,
}: {
  open: boolean;
  brandId: string | null;
  brandName: string;
  /** Only the things actually present, e.g. ["Identity", "Products", "Brand colors"]. */
  knows: string[];
  onClose: () => void;
}) {
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    markBrandCelebrated(brandId);
    track(ACTIVATION_EVENTS.onboardingCompleted, { brand_id: brandId, knows: knows.join(",") });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, brandId]);

  const name = brandName.trim() || "Your brand";

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : undefined)}>
      <DialogContent className="max-w-lg overflow-hidden border-white/10 bg-[#080a0e] p-0">
        <div className="relative p-8">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-70"
            style={{
              background:
                "radial-gradient(120% 80% at 50% -10%, rgba(103,232,249,0.18), transparent 60%), linear-gradient(180deg, rgba(255,255,255,0.04), transparent)",
            }}
          />
          <div className="relative animate-in fade-in duration-700">
            <p className="text-[11px] uppercase tracking-[0.28em] text-cyan-200/80">Brand workspace</p>
            <h2 className="mt-3 font-display text-3xl leading-tight tracking-[-0.03em]">
              {name.toUpperCase()} IS READY.
            </h2>
            {knows.length ? (
              <>
                <p className="mt-4 text-sm text-slate-400">FUSE now knows your</p>
                <ul className="mt-3 space-y-2 text-sm text-slate-200">
                  {knows.map((entry) => (
                    <li key={entry} className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-cyan-300" /> {entry}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}

            <Button
              type="button"
              onClick={() => {
                onClose();
                navigate(MARKETPLACE_ROUTE);
              }}
              className="mt-7 w-full rounded-full bg-cyan-300 py-5 text-[12px] font-semibold uppercase tracking-[0.16em] text-slate-950 hover:bg-cyan-200"
            >
              Find campaigns for {name} <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
            <button
              type="button"
              onClick={onClose}
              className="mt-3 w-full text-[11px] uppercase tracking-[0.16em] text-slate-500 hover:text-slate-300"
            >
              Stay in my workspace
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
