/**
 * Outfit Swap V2 — PHASE 6: per-frame QA badge + tucked-away manual override.
 *
 * ANALYSIS ONLY. Nothing in here calls a generation provider: overrides are
 * stored with the run and the user regenerates the frame explicitly.
 */

import { useState } from "react";
import { AlertTriangle, Check, RefreshCw, ShieldAlert, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import SubjectModelSelector from "@/components/outfitswap/SubjectModelSelector";
import {
  isBottomGarment,
  isTopGarment,
  KEEP_ORIGINAL_MODEL,
  type OutfitSwapCastAssignment,
  type OutfitSwapFrameOverride,
  type OutfitSwapFrameQa,
  type OutfitSwapFrameSubject,
  type OutfitSwapGarment,
  type OutfitSwapModelAssignment,
  type OutfitSwapQaStatus,
} from "@/services/outfitSwap";

const SELECT_CLASS =
  "w-full rounded-lg border border-white/12 bg-black/40 px-2.5 py-1.5 text-[11px] text-foreground outline-none transition-colors hover:border-cyan-200/40 focus:border-cyan-200/60";

const BADGE: Record<OutfitSwapQaStatus, { label: string; className: string }> = {
  PASSED: { label: "Passed", className: "border-emerald-300/40 bg-emerald-400/10 text-emerald-200" },
  CHECK: { label: "Check", className: "border-amber-300/40 bg-amber-400/10 text-amber-200" },
  FAILED: { label: "Failed", className: "border-red-400/40 bg-red-500/10 text-red-300" },
};

export function QaBadge({ qa }: { qa: OutfitSwapFrameQa | undefined }) {
  if (!qa) return null;
  const badge = BADGE[qa.status];
  const Icon = qa.status === "PASSED" ? Check : qa.status === "CHECK" ? AlertTriangle : ShieldAlert;
  return (
    <span
      title={qa.issues.join(" · ") || qa.notes || "Automatic QA"}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] uppercase tracking-[0.12em]",
        badge.className,
      )}
    >
      <Icon size={10} /> {badge.label}
    </span>
  );
}

export default function FrameQaPanel({
  qa,
  frameSubjects,
  garments,
  castAssignment,
  modelAssignment,
  overrides,
  userId,
  onOverride,
  onRegenerate,
}: {
  qa: OutfitSwapFrameQa | undefined;
  frameSubjects: OutfitSwapFrameSubject[];
  garments: OutfitSwapGarment[];
  castAssignment: OutfitSwapCastAssignment;
  modelAssignment: OutfitSwapModelAssignment;
  overrides: Record<string, OutfitSwapFrameOverride> | undefined;
  userId?: string | null;
  onOverride: (subjectId: string, patch: OutfitSwapFrameOverride) => void;
  onRegenerate: () => void;
}) {
  const [open, setOpen] = useState(false);
  const needsEyes = qa?.status === "CHECK" || qa?.status === "FAILED";
  if (!qa) return null;

  const tops = garments.filter(isTopGarment);
  const bottoms = garments.filter(isBottomGarment);
  // A frame with no analysed subject still gets one override row via a stable id.
  const subjects = frameSubjects.length
    ? frameSubjects
    : ([{ subjectId: "subject_1" }] as unknown as OutfitSwapFrameSubject[]);

  return (
    <div className="space-y-2">
      {needsEyes ? (
        <div className="rounded-xl border border-amber-300/25 bg-amber-400/[0.06] px-2.5 py-1.5">
          <p className="text-[11px] font-semibold text-amber-100">
            {qa.status === "FAILED" ? "This frame failed QA" : "Check assignment"}
          </p>
          {(qa.issues.length ? qa.issues : qa.notes ? [qa.notes] : []).length ? (
            <ul className="mt-0.5 space-y-0.5 text-[10px] text-amber-100/80">
              {(qa.issues.length ? qa.issues : [qa.notes as string]).slice(0, 3).map((issue) => (
                <li key={issue}>· {issue}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {qa.needsRegenerate ? (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-cyan-200/30 bg-cyan-400/[0.06] px-2.5 py-1.5">
          <span className="text-[10px] text-cyan-100">Override saved — regenerate to apply</span>
          <Button
            size="sm"
            variant="outline"
            onClick={onRegenerate}
            className="h-6 rounded-lg border-cyan-200/40 bg-transparent px-2 text-[10px] text-cyan-100"
          >
            <RefreshCw size={10} /> Regenerate
          </Button>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-cyan-100"
      >
        <SlidersHorizontal size={10} /> {open ? "Hide" : "Fix assignment"}
      </button>

      {open ? (
        <div className="space-y-2.5 rounded-xl border border-white/10 bg-black/30 p-2.5">
          <p className="text-[10px] text-muted-foreground">
            Advanced — applies to this frame only. Regenerate the frame to apply.
          </p>
          {subjects.map((subject) => {
            const override = overrides?.[subject.subjectId] ?? {};
            const wardrobe = castAssignment[subject.subjectId] ?? {
              topGarmentId: null,
              bottomGarmentId: null,
            };
            const topValue =
              override.topGarmentId !== undefined ? override.topGarmentId : wardrobe.topGarmentId;
            const bottomValue =
              override.bottomGarmentId !== undefined
                ? override.bottomGarmentId
                : wardrobe.bottomGarmentId;
            const side = override.forceGarmentSide ?? null;

            return (
              <div key={subject.subjectId} className="space-y-2 border-t border-white/10 pt-2 first:border-0 first:pt-0">
                <p className="text-[10px] uppercase tracking-[0.14em] text-cyan-200/70">
                  {subject.subjectId.replace(/_/g, " ")}
                </p>

                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="space-y-1">
                    <span className="text-[10px] text-muted-foreground">Top</span>
                    <select
                      className={SELECT_CLASS}
                      value={topValue ?? ""}
                      onChange={(event) =>
                        onOverride(subject.subjectId, { topGarmentId: event.target.value || null })
                      }
                    >
                      <option value="">None</option>
                      {tops.map((garment) => (
                        <option key={garment.id} value={garment.id}>
                          {garment.name || garment.type}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="text-[10px] text-muted-foreground">Bottom</span>
                    <select
                      className={SELECT_CLASS}
                      value={bottomValue ?? ""}
                      onChange={(event) =>
                        onOverride(subject.subjectId, { bottomGarmentId: event.target.value || null })
                      }
                    >
                      <option value="">None</option>
                      {bottoms.map((garment) => (
                        <option key={garment.id} value={garment.id}>
                          {garment.name || garment.type}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="space-y-1">
                  <span className="text-[10px] text-muted-foreground">Garment reference</span>
                  <div className="flex gap-1.5">
                    {([null, "front", "back"] as const).map((option) => (
                      <Button
                        key={option ?? "auto"}
                        size="sm"
                        variant="outline"
                        onClick={() => onOverride(subject.subjectId, { forceGarmentSide: option })}
                        className={cn(
                          "h-6 flex-1 rounded-lg border-white/15 bg-transparent text-[10px]",
                          side === option ? "border-cyan-200/60 text-cyan-100" : "",
                        )}
                      >
                        {option === null ? "Auto" : option === "front" ? "Force front" : "Force back"}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1">
                  <span className="text-[10px] text-muted-foreground">Model</span>
                  <SubjectModelSelector
                    userId={userId}
                    compact
                    model={
                      override.model ?? modelAssignment[subject.subjectId] ?? KEEP_ORIGINAL_MODEL
                    }
                    onChange={(next) => onOverride(subject.subjectId, { model: next })}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
