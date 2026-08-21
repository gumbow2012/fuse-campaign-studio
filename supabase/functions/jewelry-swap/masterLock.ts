/**
 * MASTER PRODUCT LOCK — consumption side (edge).
 *
 * The lock is DERIVED on the client from the fused Product Knowledge Map once
 * per reference set and then sent with every generation, so the product identity
 * is decided ONCE per project instead of per frame. This module only normalizes
 * the incoming object and renders it as prompt lines. It never classifies
 * anything and contains no product-type or setting values of its own.
 *
 * Authority order is unchanged: USER_CONFIRMED facts > direct evidence > CAD >
 * PKM / Master Lock.
 */

export type MasterProductLock = Record<string, any>;

const clean = (value: unknown): string | null => {
  const text = String(value ?? "").trim();
  if (!text) return null;
  if (/^(auto|unknown|null|n\/a|none)$/i.test(text)) return null;
  return text.replace(/\s+/g, " ");
};

const arr = (value: unknown): string[] =>
  Array.isArray(value) ? (value.map(clean).filter(Boolean) as string[]) : [];

/** Accepts the client lock, or null when absent/unusable. */
export function normalizeMasterLock(value: unknown): MasterProductLock | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const lock = value as Record<string, any>;
  if (!clean(lock.version)) return null;
  return lock;
}

/** The product type the lock pinned, or null. */
export function masterLockProductType(lock: MasterProductLock | null): string | null {
  return lock ? clean(lock.productType) : null;
}

/**
 * The authoritative PRODUCT IDENTITY block. Emitted inside the existing
 * TARGET IDENTITY section of the existing prompt — the prompt compiler itself
 * is unchanged.
 */
export function masterLockPromptLines(lock: MasterProductLock | null, opts?: { compact?: boolean }): string[] {
  if (!lock) return [];
  const rows: string[] = [];
  const add = (label: string, value: unknown) => {
    const text = clean(value);
    if (text) rows.push(`- ${label}: ${text.slice(0, 240)}`);
  };
  const addList = (label: string, value: unknown, max = 8) => {
    const values = arr(value);
    if (values.length) rows.push(`- ${label}: ${values.slice(0, max).join("; ").slice(0, 240)}`);
  };

  add("PRODUCT TYPE", lock.productType);
  add("SILHOUETTE", lock.overallSilhouette);
  add("PROPORTIONS", lock.proportions);
  addList("COMPONENT TOPOLOGY", lock.componentTopology, 6);
  add("FRONT ARCHITECTURE", lock.frontArchitecture);
  add("BACK ARCHITECTURE", lock.backArchitecture);
  add("SIDEWALLS", lock.sidewalls);
  add("RELIEF LAYERS", lock.reliefLayers);
  add("BAIL", lock.bail);
  add("CLASP", lock.clasp);
  add("HINGE", lock.hinge);
  add("CONNECTOR", lock.connector);
  add("CHAIN INTEGRATION", lock.chainIntegration);
  add("MECHANICAL CONSTRUCTION", lock.mechanicalConstruction);

  if (Array.isArray(lock.repeatedModules)) {
    for (const module of lock.repeatedModules.slice(0, 3)) {
      const parts = [
        clean(module?.masterGeometry),
        clean(module?.masterStoneMap),
        Number.isFinite(Number(module?.repeatCount)) ? `×${Number(module.repeatCount)}` : null,
      ].filter(Boolean);
      if (parts.length) {
        rows.push(
          `- REPEATED MODULE ${clean(module?.moduleId) ?? ""}: ${parts.join(" — ").slice(0, 240)}`.replace(
            /\s+:/,
            ":",
          ),
        );
      }
    }
  }

  addList("STONE CUTS", lock.stoneCuts, 6);
  addList("STONE SIZE CLASSES", lock.stoneSizeClasses, 6);
  add("STONE PLACEMENT", lock.stonePlacement);
  add("STONE ORIENTATION", lock.stoneOrientation);
  add("GEMSTONE PLACEMENT", lock.gemstonePlacement);
  addList("GEMSTONE / METAL COLORS", lock.gemstoneColors, 6);

  const setting = lock.settingConstruction ?? null;
  if (setting && typeof setting === "object") {
    add("SETTING TOPOLOGY", setting.topology);
    add("SETTING RETENTION", setting.retention);
    add("SETTING COVERAGE", setting.coverage);
    add("SETTING TERMINOLOGY", setting.terminology);
    if (Array.isArray(setting.regions)) {
      for (const region of setting.regions.slice(0, 4)) {
        const text = [clean(region?.setting), clean(region?.construction)].filter(Boolean).join(" — ");
        if (text) rows.push(`- SETTING ${clean(region?.region) ?? "region"}: ${text.slice(0, 240)}`);
      }
    }
  }

  add("EXPOSED-METAL PATTERN", lock.exposedMetalPattern);
  add("BORDERS", lock.borders);
  add("ENGRAVING", lock.engraving);
  add("LETTERING", lock.lettering);
  add("NEGATIVE SPACE", lock.negativeSpace);
  add("GALLERY", lock.gallery);

  if (!rows.length) return [];

  const confirmed = Array.isArray(lock.userConfirmedFacts)
    ? (lock.userConfirmedFacts as any[])
      .map((fact) => {
        const attribute = clean(fact?.attribute);
        const value = clean(fact?.value);
        if (!attribute || !value) return null;
        const applies = clean(fact?.appliesTo);
        return `${attribute} = ${value}${applies ? ` (${applies})` : ""}`;
      })
      .filter(Boolean) as string[]
    : [];

  const limit = opts?.compact ? 12 : 22;
  return [
    "MASTER PRODUCT LOCK — the ONE physical product for this project. It is the authoritative product identity for EVERY frame: do not re-decide, re-style or re-interpret the product per frame. Reproduce exactly what is locked below; anything not listed is unlocked and must follow the references.",
    ...rows.slice(0, limit),
    confirmed.length
      ? `USER-CONFIRMED FACTS (HIGHEST AUTHORITY — they override the lock and every analysis): ${
        confirmed.slice(0, 8).join("; ")
      }.`
      : null,
  ].filter(Boolean) as string[];
}

/** One-line lock read-out for the run's audit payload. */
export function masterLockSummaryLine(lock: MasterProductLock | null): string | null {
  if (!lock) return null;
  const parts = [
    clean(lock.productType),
    clean(lock.settingConstruction?.terminology),
    arr(lock.stoneCuts).slice(0, 3).join("/") || null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}
