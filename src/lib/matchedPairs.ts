/**
 * MATCHED-PAIR MANUFACTURING (§29) — client types + pure helpers.
 *
 * A matched pair is TWO plates of the SAME physical piece in two different
 * MANUFACTURING STATES (FINISHED ↔ PRE-SETTING), where camera, crop,
 * composition, lighting, object orientation, scale and background are all held
 * identical — only the manufacturing stage changes. That is what makes the two
 * plates usable as Photoshop overlays.
 *
 * This module contains NO product-type knowledge and NO generation: eligibility
 * comes from what the Master Product Lock recorded, and rendering is an explicit
 * user action on the existing Nano path.
 */

import type { MasterProductLock } from "@/lib/masterProductLock";
import type { CanonicalMaster } from "@/lib/canonicalMasterViews";
import { isMasterValidated } from "@/lib/canonicalMasterViews";

export type ManufacturingStage = "finished" | "pre_setting";

export function manufacturingStageLabel(stage: ManufacturingStage): string {
  return stage === "pre_setting" ? "Pre-setting (no stones)" : "Finished (stones set)";
}

export function oppositeManufacturingStage(stage: ManufacturingStage): ManufacturingStage {
  return stage === "finished" ? "pre_setting" : "finished";
}

/** A generated counterpart plate, linked back to the plate it was derived from. */
export type MatchedPair = {
  /** Stable state key: `${sourceId}:${targetStage}`. */
  key: string;
  /** The plate this pair was derived from (canonical-master key or frame id). */
  sourceId: string;
  sourceLabel: string;
  sourceUrl: string;
  sourceStage: ManufacturingStage;
  /** The manufacturing state THIS plate represents. */
  targetStage: ManufacturingStage;
  generationId: string;
  status: "queued" | "running" | "complete" | "failed" | "canceled";
  outputUrl: string | null;
  error: string | null;
  /** The lock the pair was rendered under (staleness / audit). */
  lockVersion: string | null;
  createdAt: string | null;
};

export function matchedPairKey(sourceId: string, targetStage: ManufacturingStage): string {
  return `${sourceId}:${targetStage}`;
}

/** A plate that a matched pair can be derived from. */
export type MatchedPairSource = {
  id: string;
  label: string;
  url: string;
  stage: ManufacturingStage;
  /** Why it is offered (audit friendly, shown in the UI). */
  reason: string;
};

/**
 * Only stone-bearing products have a meaningful pre-stone state, and that is
 * read from the lock — never from a product-name match.
 */
export function productSupportsMatchedPairs(lock: MasterProductLock | null): boolean {
  if (!lock) return false;
  const anyLock = lock as any;
  const text = (value: unknown) => String(value ?? "").trim();
  const hasStones =
    (Array.isArray(anyLock.stoneCuts) && anyLock.stoneCuts.length > 0) ||
    !!text(anyLock.stonePlacement) ||
    !!text(anyLock.settingConstruction?.topology) ||
    !!text(anyLock.settingConstruction?.retention) ||
    !!text(anyLock.settingConstruction?.coverage) ||
    (Array.isArray(anyLock.settingConstruction?.regions) &&
      anyLock.settingConstruction.regions.length > 0);
  return hasStones;
}

/**
 * The plates worth pairing: QC-passed canonical masters that actually rendered.
 * Approved (validated) only — an unvalidated plate is not a trustworthy
 * photographic authority for a matched pair.
 */
export function planMatchedPairSources(args: {
  masters: Record<string, CanonicalMaster>;
}): MatchedPairSource[] {
  return Object.values(args.masters ?? {})
    .filter((master) => master.status === "complete" && !!master.outputUrl)
    .filter((master) => master.validated || isMasterValidated(master.validation))
    .map((master) => ({
      id: master.key,
      label: master.label,
      url: master.outputUrl as string,
      // A canonical master is always the finished piece.
      stage: "finished" as ManufacturingStage,
      reason: "Approved canonical master",
    }));
}

/** Why pairing is unavailable right now (null = available). */
export function matchedPairBlockedReason(args: {
  lock: MasterProductLock | null;
  sources: MatchedPairSource[];
}): string | null {
  if (!args.lock) return "Confirm the product to lock its identity first.";
  if (!productSupportsMatchedPairs(args.lock)) {
    return "This product's locked construction has no stones, so there is no pre-setting state.";
  }
  if (!args.sources.length) {
    return "Generate and approve a canonical master first — a pair is derived from an approved plate.";
  }
  return null;
}

/** One-line lineage read-out for the UI. */
export function matchedPairSummary(pair: MatchedPair): string {
  return `${manufacturingStageLabel(pair.sourceStage)} → ${manufacturingStageLabel(
    pair.targetStage,
  )} · same camera, crop, lighting and orientation`;
}
