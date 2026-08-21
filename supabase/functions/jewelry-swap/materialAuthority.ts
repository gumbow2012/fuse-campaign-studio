/**
 * MATERIAL APPEARANCE AUTHORITY — consumption side (edge).
 *
 * Derived on the client from the EXISTING attribute-specific authority
 * (`referenceCatalog[].evidenceStrength` / `authorityFor`) and sent with the
 * generation. This module only normalizes it and renders a material-realism
 * directive into the EXISTING prompts. It never grants geometry authority:
 * geometry, stone layout, setting and product identity stay with the Master
 * Product Lock and the geometry authorities.
 */

export type MaterialAppearanceAuthority = {
  referenceId?: string;
  referenceIndex?: number | null;
  referenceUrl?: string | null;
  role?: string | null;
  materialStrength?: number;
  geometryStrength?: number;
  attributes?: string[];
  source?: string;
  version?: string;
};

const clean = (value: unknown): string | null => {
  const text = String(value ?? "").trim();
  return text ? text.replace(/\s+/g, " ") : null;
};

export function normalizeMaterialAuthority(value: unknown): MaterialAppearanceAuthority | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entry = value as Record<string, unknown>;
  const referenceId = clean(entry.referenceId);
  if (!referenceId) return null;
  const index = Number(entry.referenceIndex);
  return {
    referenceId: referenceId.toUpperCase(),
    referenceIndex: Number.isFinite(index) ? index : null,
    referenceUrl: clean(entry.referenceUrl),
    role: clean(entry.role),
    materialStrength: Number(entry.materialStrength) || 0,
    geometryStrength: Number(entry.geometryStrength) || 0,
    attributes: Array.isArray(entry.attributes)
      ? (entry.attributes.map(clean).filter(Boolean) as string[])
      : [],
    source: clean(entry.source) ?? "auto",
    version: clean(entry.version),
  };
}

/**
 * The material-realism directive. `imageNumber` is the prompt's reference-image
 * number when that reference is actually in this frame's payload; otherwise the
 * reference is named by its analysis id / role only.
 */
export function materialAuthorityPromptLines(
  authority: MaterialAppearanceAuthority | null,
  opts?: { imageNumber?: number | null },
): string[] {
  if (!authority) return [];
  const imageNumber = Number(opts?.imageNumber);
  const named = Number.isFinite(imageNumber) && imageNumber > 1
    ? `reference image ${imageNumber} (${authority.referenceId})`
    : `${authority.referenceId}${authority.role ? ` — the "${authority.role}" view` : ""}`;

  return [
    `MATERIAL APPEARANCE AUTHORITY — ${named} is the authority for MATERIAL REALISM ONLY: match its metal finish and reflection behaviour, polish level, microtexture, stone/diamond appearance, brilliance and fire realism.`,
    `THIS REFERENCE CONTRIBUTES ZERO GEOMETRY: take NO silhouette, proportions, stone layout, stone sizes, setting construction, component topology or product identity from it — those come only from the MASTER PRODUCT LOCK and the geometry authorities. A reference can be strong for material and weak for geometry; treat it that way.`,
  ];
}

/** One-line read-out for the run's audit payload. */
export function materialAuthoritySummaryLine(authority: MaterialAppearanceAuthority | null) {
  if (!authority) return null;
  return [
    authority.referenceId,
    authority.role,
    `material ${Math.round((authority.materialStrength ?? 0) * 100)}%`,
    `geometry ${Math.round((authority.geometryStrength ?? 0) * 100)}%`,
    authority.source === "user" ? "manual" : "auto",
  ].filter(Boolean).join(" · ");
}
