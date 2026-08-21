import type {
  ProductKnowledgeMap,
  ResolvedJewelrySpec,
  UserConfirmedFact,
} from "@/services/jewelrySwap";

/**
 * MASTER PRODUCT LOCK (§2)
 * ------------------------------------------------------------------
 * The immutable physical identity of the ACTIVE product, DERIVED from the
 * fused Product Knowledge Map (plus the resolved setting spec). It is computed
 * once per reference set and then inherited by EVERY generation in the project
 * so the product is never re-decided per frame.
 *
 * Universal: nothing about any specific product type is hardcoded. Every field
 * is populated only when the evidence supports it and stays `null` otherwise.
 */

export const MASTER_PRODUCT_LOCK_VERSION = "master-product-lock-v1";

export type MasterLockModule = {
  moduleId: string | null;
  masterGeometry: string | null;
  masterStoneMap: string | null;
  repeatCount: number | null;
  exceptions: string[] | null;
};

export type MasterLockSettingRegion = {
  region: string | null;
  setting: string | null;
  construction: string | null;
  userConfirmedTerm: boolean;
};

export type MasterProductLock = {
  version: string;
  /**
   * §E5 — CONTENT VERSION STAMP. `${version}:${hash-of-locked-content}`. It
   * changes only when the locked product identity itself changes, so a
   * generation can record exactly WHICH lock drove it and be validated against
   * that same lock later instead of whatever the lock is now.
   */
  lockVersion: string;
  /** Stable id of the locked product case (one card = one physical product). */
  lockId: string | null;
  /** The reference-set fingerprint this lock was derived from. */
  referenceSetVersion: string | null;

  derivedFrom: {
    pkmVersion: string | null;
    productCaseId: string | null;
    productCaseName: string | null;
    referenceCount: number | null;
    classificationStatus: string | null;
  };

  /* identity + geometry */
  productType: string | null;
  overallSilhouette: string | null;
  proportions: string | null;
  componentTopology: string[] | null;
  frontArchitecture: string | null;
  backArchitecture: string | null;
  sidewalls: string | null;
  reliefLayers: string | null;

  /* attachment / mechanics */
  bail: string | null;
  clasp: string | null;
  hinge: string | null;
  connector: string | null;
  chainIntegration: string | null;
  mechanicalConstruction: string | null;

  /* repetition */
  repeatedModules: MasterLockModule[] | null;

  /* stones */
  stoneCuts: string[] | null;
  stoneSizeClasses: string[] | null;
  stonePlacement: string | null;
  stoneOrientation: string | null;
  gemstonePlacement: string | null;
  gemstoneColors: string[] | null;

  /* setting construction */
  settingConstruction: {
    topology: string | null;
    retention: string | null;
    coverage: string | null;
    terminology: string | null;
    regions: MasterLockSettingRegion[] | null;
  } | null;

  /* surface language */
  exposedMetalPattern: string | null;
  borders: string | null;
  engraving: string | null;
  lettering: string | null;
  negativeSpace: string | null;
  gallery: string | null;

  /** USER_CONFIRMED facts — they outrank every derived field in the lock. */
  userConfirmedFacts: UserConfirmedFact[];
  confidence: number | null;
};

const clean = (value: unknown): string | null => {
  const text = String(value ?? "").trim();
  if (!text) return null;
  if (/^(auto|unknown|n\/a|none)$/i.test(text)) return null;
  return text;
};

const list = (values: unknown[]): string[] | null => {
  const out: string[] = [];
  for (const value of values) {
    const text = clean(value);
    if (text && !out.includes(text)) out.push(text);
  }
  return out.length ? out : null;
};

/** Components whose role/label matches a hint — role words come from the PKM. */
function componentText(pkm: ProductKnowledgeMap, hint: RegExp): string | null {
  const parts: string[] = [];
  for (const component of pkm.components ?? []) {
    const label = `${component.role ?? ""} ${component.label ?? ""} ${component.componentId ?? ""}`;
    if (!hint.test(label)) continue;
    const text = clean(component.geometry) ?? clean(component.label);
    if (text) parts.push(`${clean(component.label) ?? clean(component.role) ?? "component"}: ${text}`);
  }
  return parts.length ? parts.slice(0, 3).join("; ") : null;
}

/** Feature statements inferred/observed by the PKM that match a hint. */
function featureText(pkm: ProductKnowledgeMap, hint: RegExp): string | null {
  const parts: string[] = [];
  for (const entry of pkm.inferredFeatures ?? []) {
    const feature = clean(entry.feature);
    if (feature && hint.test(feature)) parts.push(feature);
  }
  for (const region of pkm.regions ?? []) {
    const label = `${region.label ?? ""} ${region.surfaceType ?? ""}`;
    if (hint.test(label)) {
      const text = clean(region.surfaceType) ?? clean(region.label);
      if (text) parts.push(text);
    }
  }
  return list(parts)?.slice(0, 3).join("; ") ?? null;
}

/**
 * Derives the lock from the ACTIVE fused PKM. Returns null when there is not
 * enough evidence yet (no PKM), so a project without a lock keeps working.
 */
export function buildMasterProductLock(args: {
  knowledgeMap: ProductKnowledgeMap | null | undefined;
  resolvedSpec?: ResolvedJewelrySpec | null;
  referenceSetVersion?: string | null;
}): MasterProductLock | null {
  const pkm = args.knowledgeMap;
  if (!pkm) return null;

  const stones = pkm.physicalStones?.length
    ? pkm.physicalStones
    : (pkm.stones ?? []);
  const stoneCuts = list(stones.map((stone) => (stone as any).cut));
  const sizeClasses = list([
    ...(pkm.settingAnalysis?.physicalSizeClasses ?? []),
    ...stones.map((stone) => (stone as any).physicalSizeClass ?? (stone as any).relativeSizeClass),
    ...(pkm.stoneGroups ?? []).flatMap((group) => group.sizeClasses ?? []),
  ]);

  const placement = list(
    (pkm.stoneGroups ?? []).map((group) =>
      [
        group.regionId ? `${group.regionId}` : null,
        group.repeatPattern,
        group.gradient,
        group.anchorToFillerRatio ? `anchor:filler ${group.anchorToFillerRatio}` : null,
        group.physicalSizeDifference,
      ]
        .filter(Boolean)
        .join(" — "),
    ),
  );

  const regions: MasterLockSettingRegion[] | null = (() => {
    const rows: MasterLockSettingRegion[] = [];
    for (const setting of args.resolvedSpec?.settings ?? []) {
      rows.push({
        region: clean(setting.region),
        setting: clean(setting.displayLabel) ?? clean(setting.setting) ?? clean(setting.detectedSetting),
        construction: clean(setting.reason),
        userConfirmedTerm: setting.userConfirmedTerm === true,
      });
    }
    if (!rows.length) {
      for (const setting of pkm.settings ?? []) {
        rows.push({
          region: clean(setting.regionId) ?? clean(setting.componentId),
          setting: clean(setting.canonicalSetting) ?? clean(setting.detectedSetting),
          construction: clean(setting.settingVisualSignature),
          userConfirmedTerm: setting.userConfirmedTerm === true,
        });
      }
    }
    const filtered = rows.filter((row) => row.setting || row.construction);
    return filtered.length ? filtered.slice(0, 8) : null;
  })();

  const settingConstruction = (() => {
    const topology = clean(pkm.settingAnalysis?.stoneFieldTopology);
    const retention = clean(pkm.settingAnalysis?.retentionConstruction);
    const coverage = clean(pkm.settingAnalysis?.coverageStyle);
    const terminology =
      clean(args.resolvedSpec?.userFacingTerminology) ?? clean(pkm.resolvedSettingTerminology);
    if (!topology && !retention && !coverage && !terminology && !regions) return null;
    return { topology, retention, coverage, terminology, regions };
  })();

  const modules: MasterLockModule[] | null = (() => {
    const rows = (pkm.repeatedModules ?? []).map((module) => ({
      moduleId: clean(module.masterModuleId) ?? clean(module.repeatModuleId),
      masterGeometry: clean(module.masterGeometry),
      masterStoneMap: clean(module.masterStoneMap),
      repeatCount: Number.isFinite(Number(module.repeatCount)) ? Number(module.repeatCount) : null,
      exceptions: list(module.exceptions ?? []),
    }));
    const filtered = rows.filter((row) => row.masterGeometry || row.masterStoneMap || row.moduleId);
    return filtered.length ? filtered.slice(0, 6) : null;
  })();

  const confidences = [
    pkm.productTypeConfidence,
    pkm.settingAnalysis?.confidence,
    pkm.dimensions?.confidence,
  ]
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0);

  const lock: MasterProductLock = {
    version: MASTER_PRODUCT_LOCK_VERSION,
    lockVersion: MASTER_PRODUCT_LOCK_VERSION,
    lockId: clean(pkm.productCaseId) ?? clean(args.referenceSetVersion),

    referenceSetVersion: clean(args.referenceSetVersion),
    derivedFrom: {
      pkmVersion: clean(pkm.version),
      productCaseId: clean(pkm.productCaseId),
      productCaseName: clean(pkm.productCaseName),
      referenceCount:
        pkm.fusionState?.referenceCount ?? pkm.perReferenceObservations?.length ?? null,
      classificationStatus: clean(pkm.fusionState?.classificationStatus),
    },

    productType: clean(pkm.productType),
    overallSilhouette:
      componentText(pkm, /silhouette|outline|overall|body|frame|shape/i) ??
      featureText(pkm, /silhouette|outline|profile/i),
    proportions: clean(pkm.dimensions?.summary) ?? list(pkm.dimensions?.relativeRatios ?? [])?.join("; ") ?? null,
    componentTopology: list(
      (pkm.components ?? []).map((component) => {
        const label = clean(component.label) ?? clean(component.componentId);
        const connections = (component.connectedTo ?? []).filter(Boolean);
        if (!label) return null;
        return connections.length ? `${label} → ${connections.join(", ")}` : label;
      }),
    ),
    frontArchitecture: componentText(pkm, /front|face|top plate|obverse/i),
    backArchitecture: componentText(pkm, /back|rear|reverse|underside/i),
    sidewalls: componentText(pkm, /side ?wall|side|edge|girdle|band wall/i),
    reliefLayers: componentText(pkm, /relief|layer|tier|stack|step/i) ?? featureText(pkm, /relief|layer|tier/i),

    bail: componentText(pkm, /bail|loop|jump ?ring/i) ?? featureText(pkm, /bail/i),
    clasp: componentText(pkm, /clasp|lock|box lock|lobster/i) ?? clean(pkm.coverage?.clasp),
    hinge: componentText(pkm, /hinge|pivot/i),
    connector: componentText(pkm, /connector|link ?joint|shackle|attachment/i),
    chainIntegration: componentText(pkm, /chain|strand|cable|rope|band/i),
    mechanicalConstruction: featureText(pkm, /mechanic|hinge|articul|closure|tension|spring|screw|solder/i),

    repeatedModules: modules,

    stoneCuts,
    stoneSizeClasses: sizeClasses,
    stonePlacement: placement?.slice(0, 6).join(" | ") ?? null,
    stoneOrientation: list(stones.map((stone) => (stone as any).orientation))?.slice(0, 6).join("; ") ?? null,
    gemstonePlacement: clean(pkm.coverage?.stoneLayout),
    gemstoneColors: list([
      ...(pkm.settings ?? []).map((setting) => (setting as any).color),
      ...(pkm.materialRegions ?? []).map((region) => region.metalColor),
    ]),

    settingConstruction,

    exposedMetalPattern:
      featureText(pkm, /exposed metal|metal pattern|bead|wall|prong|channel|bezel|surround/i) ??
      list((pkm.materialRegions ?? []).map((region) =>
        [clean(region.regionId), clean(region.metalColor), clean(region.finish)].filter(Boolean).join(" "),
      ))?.slice(0, 4).join("; ") ?? null,
    borders: featureText(pkm, /border|frame|outline|halo edge|rim/i),
    engraving: featureText(pkm, /engrav|etch|hallmark|stamp/i),
    lettering: featureText(pkm, /letter|text|script|initial|typograph|word/i),
    negativeSpace: featureText(pkm, /negative space|cut ?out|opening|void|window/i),
    gallery: featureText(pkm, /gallery|under ?gallery|basket|open ?back/i),

    userConfirmedFacts: (pkm.userConfirmedFacts ?? []).filter(
      (fact) => !!clean(fact?.attribute) && !!clean(fact?.value),
    ),
    confidence: confidences.length
      ? Math.round((confidences.reduce((sum, value) => sum + value, 0) / confidences.length) * 100) / 100
      : null,
  };

  // §E5 — stamp the lock with a hash of its own locked content.
  lock.lockVersion = computeMasterLockVersion(lock);
  return lock;
}

/** FNV-1a over the locked content — stable, order-independent of nothing else. */
function hashText(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/**
 * §E5 — `${schema version}:${content hash}`. `lockVersion` itself is excluded
 * from the hash so re-stamping is idempotent.
 */
export function computeMasterLockVersion(lock: MasterProductLock): string {
  const { lockVersion: _ignored, ...content } = lock;
  return `${lock.version}:${hashText(JSON.stringify(content))}`;
}

/** The version stamp of a lock (legacy locks get one computed on the fly). */
export function masterLockVersionOf(lock: MasterProductLock | null | undefined): string | null {
  if (!lock) return null;
  const stored = String(lock.lockVersion ?? "").trim();
  return stored || computeMasterLockVersion(lock);
}

/**
 * §E5 — LOCK REGISTRY. Every lock version a project has ever generated with is
 * kept so a fidelity audit can compare a generation against the exact lock that
 * produced it. Keyed by version stamp; older entries are pruned (max 12).
 */
export type MasterLockRegistry = Record<string, MasterProductLock>;

const MAX_REGISTRY_ENTRIES = 12;

export function rememberMasterLock(
  registry: MasterLockRegistry | null | undefined,
  lock: MasterProductLock | null | undefined,
): MasterLockRegistry {
  const current = registry ?? {};
  const stamp = masterLockVersionOf(lock);
  if (!stamp || !lock) return current;
  if (current[stamp]) return current;
  const next: MasterLockRegistry = { ...current, [stamp]: { ...lock, lockVersion: stamp } };
  const keys = Object.keys(next);
  if (keys.length <= MAX_REGISTRY_ENTRIES) return next;
  for (const key of keys.slice(0, keys.length - MAX_REGISTRY_ENTRIES)) {
    if (key !== stamp) delete next[key];
  }
  return next;
}

/**
 * The lock a generation was produced with. Legacy generations (no stamp, or a
 * stamp whose lock is no longer stored) fall back to the CURRENT lock, so the
 * existing validate path keeps working unchanged.
 */
export function resolveMasterLockForVersion(
  registry: MasterLockRegistry | null | undefined,
  stamp: string | null | undefined,
  current: MasterProductLock | null,
): MasterProductLock | null {
  const key = String(stamp ?? "").trim();
  if (key) {
    if (registry?.[key]) return registry[key];
    if (current && masterLockVersionOf(current) === key) return current;
  }
  return current;
}


/** True when the stored lock still belongs to the active reference set. */
export function isMasterLockCurrent(
  lock: MasterProductLock | null | undefined,
  referenceSetVersion: string | null,
) {
  if (!lock) return false;
  if (!referenceSetVersion) return true;
  return (lock.referenceSetVersion ?? null) === referenceSetVersion;
}

/** Compact, user-facing read-out of what the lock actually pinned. */
export function masterLockSummary(lock: MasterProductLock | null | undefined): string[] {
  if (!lock) return [];
  const rows: string[] = [];
  if (lock.productType) rows.push(`Product: ${lock.productType}`);
  if (lock.settingConstruction?.terminology) rows.push(`Setting: ${lock.settingConstruction.terminology}`);
  if (lock.stoneCuts?.length) rows.push(`Cuts: ${lock.stoneCuts.slice(0, 4).join(", ")}`);
  if (lock.repeatedModules?.length) rows.push(`${lock.repeatedModules.length} master module(s)`);
  if (lock.userConfirmedFacts.length) rows.push(`${lock.userConfirmedFacts.length} confirmed fact(s)`);
  return rows;
}
