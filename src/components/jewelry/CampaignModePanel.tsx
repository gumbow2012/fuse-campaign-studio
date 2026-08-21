/**
 * JEWELRY CAMPAIGN MODE (§26) — surface only.
 *
 * Campaign produces clean product photography FROM SCRATCH (no source video),
 * reusing the exact same intelligence stack as Jewelry Swap:
 *   product references → JewelryProductCase / PKM → Master Product Lock (D-B)
 *   → Campaign Photography Profile (C4) → Shot Coverage Planner (D4)
 *   → canonical / component masters on the existing Nano path (D1 / D3)
 *   → validation as QC (D2 / C2).
 *
 * This component owns NO logic: the lock, profile, planner, master generation
 * and validation all stay where they already live. Every generation control it
 * renders is one of the existing user-triggered paid actions — nothing here
 * auto-runs.
 */

import type { ReactNode } from "react";
import { Gem } from "lucide-react";
import type { ShotCoveragePlan } from "@/lib/shotCoveragePlanner";

export type JewelryWorkspaceMode = "swap" | "campaign";

function Stage({
  index,
  label,
  state,
  detail,
}: {
  index: number;
  label: string;
  state: "ready" | "pending";
  detail: string;
}) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-white/10 bg-black/30 px-2.5 py-2">
      <span
        className={
          state === "ready"
            ? "mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-md border border-cyan-200/50 bg-cyan-400/15 text-[9px] font-semibold text-cyan-100"
            : "mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-md border border-white/15 bg-white/[0.03] text-[9px] font-semibold text-foreground/50"
        }
      >
        {index}
      </span>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-[0.14em] text-foreground/65">{label}</p>
        <p className="text-[10px] leading-relaxed text-foreground/45">{detail}</p>
      </div>
    </div>
  );
}

/**
 * The campaign workspace: pipeline read-out plus the SAME photography-profile
 * and canonical-master panels the Swap surface uses (passed in as slots so
 * there is exactly one implementation of each).
 */
export function CampaignModePanel({
  hasLock,
  lockSummary,
  referenceCount,
  hasPhotographyProfile,
  coveragePlan,
  masterCount,
  validatedMasterCount,
  photographySlot,
  mastersSlot,
  batchesSlot,
  matchedPairsSlot,
}: {
  hasLock: boolean;
  lockSummary: string | null;
  referenceCount: number;
  hasPhotographyProfile: boolean;
  coveragePlan: ShotCoveragePlan | null;
  masterCount: number;
  validatedMasterCount: number;
  photographySlot: ReactNode;
  mastersSlot: ReactNode;
  /** BATCH CONTINUATION (§28) — lineage read-out + start/approve controls. */
  batchesSlot?: ReactNode;
  /** MATCHED PAIRS (§29) — manufacturing-state counterparts of approved plates. */
  matchedPairsSlot?: ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-cyan-200/25 bg-cyan-400/[0.04] px-3 py-2.5">
        <p className="text-[10px] uppercase tracking-[0.16em] text-cyan-200/80">
          Campaign mode · product photography from scratch
        </p>
        <p className="mt-1 text-[11px] leading-relaxed text-foreground/60">
          No source clip. FUSE builds campaign plates straight from your product references using the
          same product understanding as Swap — the locked product identity, your campaign look, and the
          shot plan for this exact piece. Every render is started by you.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <Stage
          index={1}
          label="Product references"
          state={referenceCount ? "ready" : "pending"}
          detail={
            referenceCount
              ? `${referenceCount} reference${referenceCount === 1 ? "" : "s"} in this product case.`
              : "Add product references in step 3."
          }
        />
        <Stage
          index={2}
          label="Product identity lock"
          state={hasLock ? "ready" : "pending"}
          detail={hasLock ? lockSummary ?? "Product identity locked." : "Confirm the product to lock it."}
        />
        <Stage
          index={3}
          label="Campaign look"
          state={hasPhotographyProfile ? "ready" : "pending"}
          detail={
            hasPhotographyProfile
              ? "Photography profile read — lens, lighting, surface, depth of field."
              : "Optional: add look references and read the look."
          }
        />
        <Stage
          index={4}
          label="Shot plan"
          state={coveragePlan ? "ready" : "pending"}
          detail={
            coveragePlan
              ? `${coveragePlan.coveredCount} of ${coveragePlan.entries.length} planned shots covered · ${coveragePlan.missingCount} missing.`
              : "The shot plan appears once the product is locked."
          }
        />
        <Stage
          index={5}
          label="Campaign plates"
          state={masterCount ? "ready" : "pending"}
          detail={
            masterCount
              ? `${masterCount} plate${masterCount === 1 ? "" : "s"} rendered.`
              : "Generate the missing shots below."
          }
        />
        <Stage
          index={6}
          label="Quality check"
          state={validatedMasterCount ? "ready" : "pending"}
          detail={
            validatedMasterCount
              ? `${validatedMasterCount} plate${validatedMasterCount === 1 ? "" : "s"} passed product QC.`
              : "Check each plate against the locked product."
          }
        />
      </div>

      {batchesSlot}
      {mastersSlot}
      {matchedPairsSlot}
      {photographySlot}

      {!hasLock ? (
        <p className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/25 px-3 py-6 text-[11px] text-muted-foreground">
          <Gem size={13} /> Add product references and confirm the product — campaign plates come from
          the locked product identity.
        </p>
      ) : null}
    </div>
  );
}

export default CampaignModePanel;
