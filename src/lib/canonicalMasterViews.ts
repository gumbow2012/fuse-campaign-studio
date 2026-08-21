import type { MasterProductLock } from "@/lib/masterProductLock";
import type { FidelityAudit } from "@/lib/fidelityAudit";

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

/**
 * CANONICAL MASTER VALIDATION (§23) — the result of running the EXISTING
 * `mode: "validate"` path on a generated master. A master is only usable
 * downstream when the validation verdict contains no FAIL.
 */
export type CanonicalMasterValidation = FidelityAudit;

/** Verdict is trusted only when nothing materially changed the product. */
export function isMasterValidated(audit: FidelityAudit | null | undefined): boolean {
  if (!audit) return false;
  if (audit.rows.some((row) => row.verdict === "FAIL")) return false;
  // A "violation" verdict means the render materially changed the product.
  return audit.verdict !== "violation";
}

/** A generated canonical master, stored per project and tagged with its view. */
export type CanonicalMaster = {
  /** The plan key this master answers (`front`, `component_bail`, …). */
  key: string;
  /** Set for COMPONENT masters (§24): the locked component this master isolates. */
  componentId?: string | null;
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
   * Masters are NOT auto-trusted. This only becomes true after the existing
   * validate path returns a verdict with no FAIL (§23); a rejected master
   * stays false and may never be used downstream.
   */
  validated: boolean;
  /** Per-master validation read-out (silhouette, stones, settings, material…). */
  validation?: CanonicalMasterValidation | null;
  /** UI state of the validation call. Never auto-regenerates on failure. */
  validationState?: "idle" | "checking" | "done" | "failed" | "skipped";
  validationError?: string | null;
};

/**
 * CANONICAL COMPONENT MASTERS (§24)
 * ---------------------------------------------------------------------------
 * A component master is a canonical master of ONE mechanical/structural part of
 * the locked product (a bail, a clasp, a repeated link, a center setting…).
 * Reusing the exact same component render across frames improves temporal
 * consistency.
 *
 * The eligible component list is derived ENTIRELY from what the Master Product
 * Lock recorded for THIS product: there is no per-product-type list and no
 * product-name matching anywhere. A Cuban chain surfaces links + clasp because
 * its lock describes repeated modules and a clasp; a pendant surfaces bail +
 * center setting because its lock describes those. Absent evidence simply
 * means fewer eligible components.
 */
export type CanonicalComponentPlanEntry = {
  /** Stable per-project component id (also the master state key suffix). */
  componentId: string;
  /** Master state key — shared with the view planner so slots are reused. */
  key: string;
  label: string;
  /** The lock's own description of this component — used as prompt direction. */
  geometry: string;
  /** Which locked field justified this component (audit friendly). */
  reason: string;
};

const COMPONENT_LIMIT = 8;

export function planCanonicalComponentMasters(
  lock: MasterProductLock | null,
): CanonicalComponentPlanEntry[] {
  if (!lock) return [];
  const out: CanonicalComponentPlanEntry[] = [];
  const add = (entry: CanonicalComponentPlanEntry) => {
    if (out.length >= COMPONENT_LIMIT) return;
    if (out.some((existing) => existing.componentId === entry.componentId)) return;
    out.push(entry);
  };
  const slug = (value: string) =>
    value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) ||
    "component";

  // 1. Mechanical fields the lock actually filled in.
  const mechanical: [string, unknown][] = [
    ["bail", (lock as any).bail],
    ["clasp", (lock as any).clasp],
    ["hinge", (lock as any).hinge],
    ["connector", (lock as any).connector],
    ["chain_integration", (lock as any).chainIntegration],
    ["gallery", (lock as any).gallery],
    ["mechanical_construction", (lock as any).mechanicalConstruction],
  ];
  for (const [field, value] of mechanical) {
    const text = clean(value);
    if (!text) continue;
    add({
      componentId: field,
      key: `component_${field}`,
      label: text.slice(0, 60),
      geometry: text,
      reason: `Locked ${field.replace(/_/g, " ")}`,
    });
  }

  // 2. Repeated modules (links, stations, segments) the lock recovered.
  const modules = Array.isArray((lock as any)?.repeatedModules)
    ? ((lock as any).repeatedModules as any[])
    : [];
  for (const module of modules) {
    const geometry = [clean(module?.masterGeometry), clean(module?.masterStoneMap)]
      .filter(Boolean)
      .join(" — ");
    if (!geometry) continue;
    const id = slug(String(clean(module?.moduleId) ?? "module"));
    const count = Number(module?.repeatCount);
    add({
      componentId: `module_${id}`,
      key: `component_module_${id}`,
      label: `${clean(module?.moduleId) ?? "Repeated module"}${
        Number.isFinite(count) && count > 1 ? ` ×${count}` : ""
      }`.slice(0, 60),
      geometry,
      reason: "Locked repeated module",
    });
  }

  // 3. Setting construction — a center/region setting is a real component when
  // the lock describes its topology or per-region construction.
  const setting = (lock as any)?.settingConstruction ?? null;
  if (setting && typeof setting === "object") {
    const topology = clean(setting.topology);
    const retention = clean(setting.retention);
    if (topology || retention) {
      add({
        componentId: "center_setting",
        key: "component_center_setting",
        label: (clean(setting.terminology) ?? topology ?? "Center setting")!.slice(0, 60),
        geometry: [topology, retention, clean(setting.coverage)].filter(Boolean).join(" — "),
        reason: "Locked setting construction",
      });
    }
    const regions = Array.isArray(setting.regions) ? (setting.regions as any[]) : [];
    for (const region of regions) {
      const name = clean(region?.region);
      const geometry = [clean(region?.setting), clean(region?.construction)]
        .filter(Boolean)
        .join(" — ");
      if (!name || !geometry) continue;
      add({
        componentId: `setting_${slug(name)}`,
        key: `component_setting_${slug(name)}`,
        label: `${name} setting`.slice(0, 60),
        geometry,
        reason: "Locked setting region",
      });
    }
  }

  // 4. Anything else the lock itself named as part of the component topology.
  for (const part of list((lock as any)?.componentTopology)) {
    add({
      componentId: `topology_${slug(part)}`,
      key: `component_topology_${slug(part)}`,
      label: part.slice(0, 60),
      geometry: part,
      reason: "Named in locked component topology",
    });
  }

  return out;
}
