import type { MasterProductLock } from "@/lib/masterProductLock";

/**
 * CANONICAL MASTER VIEW PLANNER (§22)
 * ---------------------------------------------------------------------------
 * Derives WHICH canonical-master views make sense for the ACTIVE product from
 * the topology recorded in the Master Product Lock. Nothing about any specific
 * product type is hardcoded: there is no per-type list and no product-name
 * matching. A pendant, a Cuban chain and a ring end up with different sets
 * purely because their locks describe different topology.
 *
 * A formal coverage planner arrives in a later commit; this is the sensible
 * topology-derived default set.
 */

/** Generic camera views the backend can render (mirrors the edge module). */
export type CanonicalMasterView =
  | "front"
  | "three_quarter"
  | "side"
  | "back"
  | "macro_setting"
  | "component";

export type CanonicalMasterPlanEntry = {
  /** Stable key for state + storage (`component` views are suffixed). */
  key: string;
  view: CanonicalMasterView;
  label: string;
  /** Component name for a component view, else null. */
  componentLabel: string | null;
  /** Why the topology asked for this view (shown in the UI, audit friendly). */
  reason: string;
};

const clean = (value: unknown): string | null => {
  const text = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!text) return null;
  if (/^(auto|unknown|null|n\/a|none)$/i.test(text)) return null;
  return text;
};

const list = (value: unknown): string[] =>
  Array.isArray(value) ? (value.map(clean).filter(Boolean) as string[]) : [];

/** Mechanical components the lock recorded, in lock order — never a fixed list. */
function lockComponents(lock: MasterProductLock | null): { field: string; label: string }[] {
  if (!lock) return [];
  const candidates: [string, unknown][] = [
    ["bail", (lock as any).bail],
    ["clasp", (lock as any).clasp],
    ["hinge", (lock as any).hinge],
    ["connector", (lock as any).connector],
    ["chainIntegration", (lock as any).chainIntegration],
    ["gallery", (lock as any).gallery],
    ["mechanicalConstruction", (lock as any).mechanicalConstruction],
  ];
  const out: { field: string; label: string }[] = [];
  for (const [field, value] of candidates) {
    const text = clean(value);
    if (!text) continue;
    out.push({ field, label: text.slice(0, 60) });
  }
  return out;
}

/**
 * The topology-derived master set. Every entry is justified by something the
 * lock actually recorded, so absent evidence simply means fewer masters.
 */
export function planCanonicalMasterViews(
  lock: MasterProductLock | null,
): CanonicalMasterPlanEntry[] {
  const plan: CanonicalMasterPlanEntry[] = [];
  const add = (entry: CanonicalMasterPlanEntry) => {
    if (plan.some((existing) => existing.key === entry.key)) return;
    plan.push(entry);
  };

  // FRONT: the one view every physical object has. Always planned.
  add({
    key: "front",
    view: "front",
    label: "Front",
    componentLabel: null,
    reason: "Baseline elevation for any product",
  });

  const topology = list((lock as any)?.componentTopology);
  const modules = Array.isArray((lock as any)?.repeatedModules)
    ? ((lock as any).repeatedModules as any[])
    : [];
  const hasDepth = !!clean((lock as any)?.sidewalls) ||
    !!clean((lock as any)?.reliefLayers) ||
    !!clean((lock as any)?.proportions);
  const hasBack = !!clean((lock as any)?.backArchitecture);
  const hasSetting = !!clean((lock as any)?.settingConstruction?.topology) ||
    !!clean((lock as any)?.settingConstruction?.retention) ||
    list((lock as any)?.stoneCuts).length > 0 ||
    !!clean((lock as any)?.stonePlacement);
  const components = lockComponents(lock);
  const repeated = modules.some((module) => Number(module?.repeatCount) > 1);

  // THREE-QUARTER: only meaningful once the lock says the object has readable
  // volume (sidewalls / relief / proportions) or repeated modules to follow.
  if (hasDepth || repeated || topology.length > 1) {
    add({
      key: "three_quarter",
      view: "three_quarter",
      label: "Three-quarter",
      componentLabel: null,
      reason: repeated
        ? "Repeated modules read best across a rotated plane"
        : "Locked volume / multi-part topology",
    });
  }

  // SIDE: depth stack, sidewalls, relief layers.
  if (clean((lock as any)?.sidewalls) || clean((lock as any)?.reliefLayers)) {
    add({
      key: "side",
      view: "side",
      label: "Side / profile",
      componentLabel: null,
      reason: "Locked sidewall / relief construction",
    });
  }

  // BACK: only when the lock actually describes the rear architecture.
  if (hasBack) {
    add({
      key: "back",
      view: "back",
      label: "Back / underside",
      componentLabel: null,
      reason: "Locked back architecture",
    });
  }

  // MACRO: only when stones / setting construction are part of the identity.
  if (hasSetting) {
    add({
      key: "macro_setting",
      view: "macro_setting",
      label: "Macro (setting)",
      componentLabel: null,
      reason: "Locked stone-setting construction",
    });
  }

  // COMPONENT: one master per key mechanical component the lock recorded
  // (bail, clasp, hinge, connector, gallery…). Capped to keep the set small.
  for (const component of components.slice(0, 2)) {
    add({
      key: `component_${component.field}`,
      view: "component",
      label: component.label,
      componentLabel: component.label,
      reason: "Locked mechanical component",
    });
  }

  return plan;
}

/** A generated canonical master, stored per project and tagged with its view. */
export type CanonicalMaster = {
  /** The plan key this master answers (`front`, `component_bail`, …). */
  key: string;
  view: CanonicalMasterView;
  label: string;
  componentLabel: string | null;
  generationId: string;
  status: "queued" | "running" | "complete" | "failed" | "canceled";
  outputUrl: string | null;
  error: string | null;
  /** The lock the master was rendered from (staleness / audit). */
  lockVersion: string | null;
  createdAt: string | null;
  /**
   * Masters are NOT auto-trusted — fidelity validation arrives in a later
   * commit, so nothing downstream may treat these as verified yet.
   */
  validated: false;
};
