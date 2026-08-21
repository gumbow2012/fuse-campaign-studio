import type { MasterProductLock } from "@/lib/masterProductLock";
import {
  type CanonicalMaster,
  type CanonicalMasterPlanEntry,
  type CanonicalMasterView,
  planCanonicalComponentMasters,
} from "@/lib/canonicalMasterViews";

/**
 * SHOT COVERAGE PLANNER (§25)
 * ---------------------------------------------------------------------------
 * Works out which views and details are needed to thoroughly document THIS
 * product, then compares that plan against what already exists (uploaded
 * references + already-generated canonical / component masters).
 *
 * Everything is derived from the topology recorded in the Master Product Lock.
 * There is NO static shot list and no per-product-type table: a pendant, a
 * Cuban chain and a ring end up with different coverage sets purely because
 * their locks describe different construction. Absent evidence simply produces
 * a smaller plan.
 *
 * This module is PLANNING AND LOGIC ONLY. It never generates anything, never
 * calls a provider, and never spends credits — it only tells the existing D1
 * canonical-master flow which views are worth rendering.
 */

export const SHOT_COVERAGE_VERSION = "shot-coverage-plan-v1";

export type ShotCoverageEntry = {
  /** Stable key — also the canonical-master state key for this shot. */
  key: string;
  kind: "view" | "detail" | "component";
  /** Which generic camera view the existing backend renders this shot as. */
  view: CanonicalMasterView;
  label: string;
  /** Component / detail name when the shot isolates a part of the product. */
  componentLabel: string | null;
  /** What in the lock justified this shot (audit friendly, shown in UI). */
  reason: string;
  /** Required shots are the documentation baseline; others are nice-to-have. */
  required: boolean;
  covered: boolean;
  coveredBy: "master" | "reference" | null;
};

export type ShotCoveragePlan = {
  version: string;
  lockVersion: string | null;
  computedAt: string;
  entries: ShotCoverageEntry[];
  requiredCount: number;
  coveredCount: number;
  missingCount: number;
};

const clean = (value: unknown): string | null => {
  const text = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!text) return null;
  if (/^(auto|unknown|null|n\/a|none)$/i.test(text)) return null;
  return text;
};

const list = (value: unknown): string[] =>
  Array.isArray(value) ? (value.map(clean).filter(Boolean) as string[]) : [];

type Planned = Omit<ShotCoverageEntry, "covered" | "coveredBy">;

/**
 * The topology-derived shot set. Every entry exists because the lock recorded
 * something concrete: volume, a rear architecture, stone setting construction,
 * repeated modules, a named mechanical component, and so on.
 */
function planShots(lock: MasterProductLock | null): Planned[] {
  const out: Planned[] = [];
  const add = (entry: Planned) => {
    if (out.some((existing) => existing.key === entry.key)) return;
    out.push(entry);
  };
  if (!lock) return out;

  const topology = list((lock as any).componentTopology);
  const modules = Array.isArray((lock as any).repeatedModules)
    ? ((lock as any).repeatedModules as any[])
    : [];
  const repeated = modules.some((module) => Number(module?.repeatCount) > 1);
  const sidewalls = clean((lock as any).sidewalls);
  const relief = clean((lock as any).reliefLayers);
  const proportions = clean((lock as any).proportions);
  const hasDepth = !!sidewalls || !!relief || !!proportions;
  const hasBack = !!clean((lock as any).backArchitecture);
  const setting = (lock as any).settingConstruction ?? null;
  const hasSetting =
    !!clean(setting?.topology) ||
    !!clean(setting?.retention) ||
    list((lock as any).stoneCuts).length > 0 ||
    !!clean((lock as any).stonePlacement);
  const hasStones =
    list((lock as any).stoneCuts).length > 0 ||
    list((lock as any).stoneSizeClasses).length > 0 ||
    !!clean((lock as any).stoneOrientation);

  // Baseline elevation — the one shot any physical object has.
  add({
    key: "front",
    kind: "view",
    view: "front",
    label: "Front",
    componentLabel: null,
    reason: "Baseline elevation for any product",
    required: true,
  });

  // Rotated planes: only once the lock says there is volume or multi-part
  // topology to follow around the object.
  if (hasDepth || repeated || topology.length > 1) {
    add({
      key: "three_quarter",
      kind: "view",
      view: "three_quarter",
      label: "Three-quarter (right)",
      componentLabel: null,
      reason: repeated
        ? "Repeated modules read best across a rotated plane"
        : "Locked volume / multi-part topology",
      required: true,
    });
    add({
      key: "three_quarter_left",
      kind: "view",
      view: "three_quarter",
      label: "Three-quarter (left)",
      componentLabel: "mirrored three-quarter, rotated to the opposite side",
      reason: "Second angle documents the opposite side of the locked volume",
      required: false,
    });
  }

  // Profile: depth stack, sidewalls, relief layers.
  if (sidewalls || relief) {
    add({
      key: "side",
      kind: "view",
      view: "side",
      label: "Side / profile",
      componentLabel: null,
      reason: "Locked sidewall / relief construction",
      required: true,
    });
  }

  // Rear + rear three-quarter: only when the lock describes the back.
  if (hasBack) {
    add({
      key: "back",
      kind: "view",
      view: "back",
      label: "Back / underside",
      componentLabel: null,
      reason: "Locked back architecture",
      required: true,
    });
    if (hasDepth) {
      add({
        key: "back_three_quarter",
        kind: "detail",
        view: "back",
        label: "Rear three-quarter",
        componentLabel: "rear three-quarter, rotated ~40 degrees off the back face",
        reason: "Locked back architecture with readable depth",
        required: false,
      });
    }
  }

  // Plan / underside plates: only meaningful for an object with recorded depth.
  if (hasDepth) {
    add({
      key: "top_plan",
      kind: "detail",
      view: "component",
      label: "Top-down plan",
      componentLabel: "straight top-down plan view of the whole product",
      reason: "Locked proportions / depth stack",
      required: false,
    });
    add({
      key: "bottom_plan",
      kind: "detail",
      view: "component",
      label: "Underside plan",
      componentLabel: "straight bottom-up view of the whole product",
      reason: "Locked proportions / depth stack",
      required: false,
    });
  }

  // Setting macro: only when stone-setting construction is part of the identity.
  if (hasSetting) {
    add({
      key: "macro_setting",
      kind: "view",
      view: "macro_setting",
      label: "Macro (setting)",
      componentLabel: null,
      reason: "Locked stone-setting construction",
      required: true,
    });
  }

  // Stone macro: separate from the setting macro — documents the stones.
  if (hasStones) {
    add({
      key: "macro_stones",
      kind: "detail",
      view: "macro_setting",
      label: "Macro (stones)",
      componentLabel: "extreme close-up of the stones themselves: cuts, sizes and orientation",
      reason: "Locked stone cuts / size classes",
      required: false,
    });
  }

  // Components: whatever mechanical/structural parts the lock recorded (§24).
  for (const component of planCanonicalComponentMasters(lock)) {
    add({
      key: component.key,
      kind: "component",
      view: "component",
      label: component.label,
      componentLabel: component.geometry,
      reason: component.reason,
      required: true,
    });
  }

  return out;
}

/** Loose keyword match so an existing reference can satisfy a planned shot. */
function referenceCovers(entry: Planned, referenceLabels: string[]): boolean {
  if (!referenceLabels.length) return false;
  const needle = `${entry.label} ${entry.componentLabel ?? ""}`.toLowerCase();
  const words = needle.split(/[^a-z0-9]+/).filter((word) => word.length > 3);
  if (!words.length) return false;
  return referenceLabels.some((label) => {
    const haystack = label.toLowerCase();
    return words.some((word) => haystack.includes(word));
  });
}

/**
 * The coverage read-out: the planned shot set for this product, each marked
 * COVERED (an existing master or reference already documents it) or MISSING.
 * A master only counts as coverage once it actually completed.
 */
export function planShotCoverage(args: {
  lock: MasterProductLock | null;
  masters: Record<string, CanonicalMaster>;
  /** Labels/roles of uploaded references — used to credit existing evidence. */
  referenceLabels?: string[];
}): ShotCoveragePlan {
  const planned = planShots(args.lock);
  const referenceLabels = (args.referenceLabels ?? []).filter(Boolean);

  const entries: ShotCoverageEntry[] = planned.map((entry) => {
    const master = args.masters[entry.key];
    if (master?.status === "complete" && master.outputUrl) {
      return { ...entry, covered: true, coveredBy: "master" };
    }
    if (referenceCovers(entry, referenceLabels)) {
      return { ...entry, covered: true, coveredBy: "reference" };
    }
    return { ...entry, covered: false, coveredBy: null };
  });

  const required = entries.filter((entry) => entry.required);
  return {
    version: SHOT_COVERAGE_VERSION,
    lockVersion: (args.lock as any)?.version ?? null,
    computedAt: new Date().toISOString(),
    entries,
    requiredCount: required.length,
    coveredCount: entries.filter((entry) => entry.covered).length,
    missingCount: entries.filter((entry) => !entry.covered).length,
  };
}

/**
 * Feeds the planner into the EXISTING D1 canonical-master view selection: the
 * whole-product views the coverage plan asks for, in plan order. Returning a
 * plan does NOT start anything — generation stays an explicit user action.
 */
export function canonicalMasterPlanFromCoverage(
  plan: ShotCoveragePlan | null,
): CanonicalMasterPlanEntry[] {
  if (!plan) return [];
  return plan.entries
    .filter((entry) => entry.kind !== "component")
    .map((entry) => ({
      key: entry.key,
      view: entry.view,
      label: entry.label,
      componentLabel: entry.componentLabel,
      reason: entry.covered ? `${entry.reason} — covered` : entry.reason,
    }));
}

/** Views still MISSING — what a "generate masters" press should actually render. */
export function missingCanonicalMasterViews(
  plan: ShotCoveragePlan | null,
): CanonicalMasterPlanEntry[] {
  if (!plan) return [];
  const missing = new Set(
    plan.entries.filter((entry) => !entry.covered).map((entry) => entry.key),
  );
  return canonicalMasterPlanFromCoverage(plan).filter((entry) => missing.has(entry.key));
}
