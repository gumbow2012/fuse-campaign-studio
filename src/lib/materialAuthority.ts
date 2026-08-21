import type { ProductKnowledgeMap } from "@/services/jewelrySwap";

/**
 * MATERIAL APPEARANCE AUTHORITY (§31)
 * ------------------------------------------------------------------
 * Some references are exceptional for MATERIAL REALISM — metal finish and
 * reflections, polish, microtexture, diamond/stone appearance, brilliance and
 * fire — while being weak or useless for geometry. This module identifies that
 * reference by REUSING the attribute-specific authority the reconstruction
 * engine already produces (`referenceCatalog[].evidenceStrength` +
 * `authorityFor` / `notAuthorityFor`). It builds NO parallel evidence system,
 * classifies nothing, and never touches geometry.
 *
 * Universal: no product-type assumptions anywhere.
 */

export const MATERIAL_AUTHORITY_VERSION = "material-appearance-authority-v1";

/** Attributes that describe how the MATERIAL looks (never geometry). */
const MATERIAL_ATTRIBUTES = [
  "materialAppearance",
  "manufacturedFinish",
  "manufacturedAppearance",
  "metalColor",
] as const;

/** Attributes that describe SHAPE / CONSTRUCTION — reported, never inherited. */
const GEOMETRY_ATTRIBUTES = [
  "silhouette",
  "overallGeometry",
  "dimensions",
  "componentTopology",
  "componentGeometry",
  "stoneSeatLayout",
  "stoneCut",
  "stoneSize",
  "stonePlacement",
  "settingMechanics",
  "prongConstruction",
  "thicknessDepth",
  "claspBailConnector",
] as const;

export type MaterialAppearanceAuthority = {
  version: string;
  /** "REF_3" — same id space the analysis and prompt numbering use. */
  referenceId: string;
  /** 1-based position in the flattened reference order. */
  referenceIndex: number | null;
  referenceUrl: string | null;
  role: string | null;
  /** Max evidence strength across the MATERIAL attributes (0..1). */
  materialStrength: number;
  /** Max evidence strength across the GEOMETRY attributes (0..1) — advisory. */
  geometryStrength: number;
  /** Which material attributes this reference is strongest for. */
  attributes: string[];
  source: "auto" | "user";
};

type FlatReference = { url: string; role?: string | null };

const strengthOf = (
  strength: Record<string, unknown> | undefined,
  claimed: Set<string>,
  notClaimed: Set<string>,
  keys: readonly string[],
) => {
  let best = 0;
  for (const key of keys) {
    if (notClaimed.has(key.toLowerCase())) continue;
    const raw = Number((strength ?? {})[key] ?? 0);
    const value = (Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : 0) +
      (claimed.has(key.toLowerCase()) ? 0.15 : 0);
    if (value > best) best = value;
  }
  return Math.min(1, best);
};

/**
 * Picks the single strongest MATERIAL-APPEARANCE reference from the active PKM.
 * Returns null when no reference is convincingly strong for material — silence
 * is correct; a weak winner would only add noise to the prompt.
 */
export function deriveMaterialAppearanceAuthority(args: {
  knowledgeMap: ProductKnowledgeMap | null | undefined;
  /** Flattened references in the SAME order the analysis batch saw them. */
  references: FlatReference[];
  /** Manual override from Engineering details ("REF_2"), advanced only. */
  override?: string | null;
}): MaterialAppearanceAuthority | null {
  const catalog = args.knowledgeMap?.referenceCatalog ?? [];
  const refs = args.references ?? [];
  if (!refs.length) return null;

  const indexOfId = (id: string) => {
    const match = /^ref[_-]?(\d+)$/i.exec(id.trim());
    return match ? Number(match[1]) : null;
  };

  const build = (
    id: string,
    materialStrength: number,
    geometryStrength: number,
    attributes: string[],
    source: "auto" | "user",
  ): MaterialAppearanceAuthority | null => {
    const referenceIndex = indexOfId(id);
    const ref = referenceIndex ? refs[referenceIndex - 1] ?? null : null;
    if (!ref) return null;
    return {
      version: MATERIAL_AUTHORITY_VERSION,
      referenceId: id.toUpperCase(),
      referenceIndex,
      referenceUrl: ref.url,
      role: String(ref.role ?? "").trim() || null,
      materialStrength: Number(materialStrength.toFixed(2)),
      geometryStrength: Number(geometryStrength.toFixed(2)),
      attributes,
      source,
    };
  };

  const scoreFor = (id: string) => {
    const entry = catalog.find((item) => String(item?.referenceId ?? "").trim().toUpperCase() === id.toUpperCase());
    const strength = (entry?.evidenceStrength ?? {}) as Record<string, unknown>;
    const claimed = new Set((entry?.authorityFor ?? []).map((value) => String(value).toLowerCase()));
    const notClaimed = new Set((entry?.notAuthorityFor ?? []).map((value) => String(value).toLowerCase()));
    const material = strengthOf(strength, claimed, notClaimed, MATERIAL_ATTRIBUTES);
    const geometry = strengthOf(strength, claimed, notClaimed, GEOMETRY_ATTRIBUTES);
    const attributes = MATERIAL_ATTRIBUTES.filter((key) => {
      const raw = Number(strength[key] ?? 0);
      return claimed.has(key.toLowerCase()) || (Number.isFinite(raw) && raw >= 0.6);
    });
    return { material, geometry, attributes: [...attributes] };
  };

  // MANUAL override (Engineering details only) always wins.
  const override = String(args.override ?? "").trim();
  if (override) {
    const scored = scoreFor(override);
    return build(override, scored.material, scored.geometry, scored.attributes, "user");
  }

  if (!catalog.length) return null;

  let winner: { id: string; material: number; geometry: number; attributes: string[] } | null = null;
  for (const entry of catalog) {
    const id = String(entry?.referenceId ?? "").trim();
    if (!id) continue;
    const scored = scoreFor(id);
    if (!winner || scored.material > winner.material) {
      winner = { id, material: scored.material, geometry: scored.geometry, attributes: scored.attributes };
    }
  }
  // Only a genuinely strong material reference is worth naming in the prompt.
  if (!winner || winner.material < 0.6) return null;
  return build(winner.id, winner.material, winner.geometry, winner.attributes, "auto");
}

/** Short read-out for the engineering surface. */
export function materialAuthorityLabel(authority: MaterialAppearanceAuthority | null) {
  if (!authority) return null;
  return `${authority.referenceId}${authority.role ? ` · ${authority.role}` : ""} — material realism ${
    Math.round(authority.materialStrength * 100)
  }%`;
}
