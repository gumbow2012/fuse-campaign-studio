/**
 * Phase 10 — deterministic template-input autofill from the ACTIVE brand.
 *
 * Rule-based only: no AI, no guessing, no network calls. Given the template's
 * input fields plus the assets already saved for the active brand, this returns
 * the candidate values for EMPTY slots. Filling and merging is the caller's job
 * (see TemplateStudioPage), and the run/submit payload path is untouched — the
 * result is exactly the same `libraryAssets` / `textInputs` state the customer
 * would have produced by hand through the existing pickers.
 */

import { brandProfileAssets, type BrandProfile } from "@/services/brandProfiles";
import type { ProductProfile } from "@/services/productProfiles";
import type { AvatarProfile } from "@/services/avatarProfiles";
import type { TemplateAssetType } from "@/lib/templateAssetRequirements";
import { resolveInputRole, type InputRole } from "@/lib/templateInputSources";

/** Roles that best match an FT2 assetType — shared with ProfileAssetPicker. */
export function preferredRoles(assetType?: TemplateAssetType | null): string[] {
  switch (assetType) {
    case "garment-front":
      return ["front"];
    case "garment-back":
      return ["back"];
    case "logo":
      return ["logo", "primary logo", "secondary logo"];
    case "packaging":
      return ["packaging"];
    case "product":
    case "jewelry":
      return ["front", "macro", "detail"];
    default:
      return [];
  }
}

export interface AutofillField {
  key: string;
  label: string;
  type: string;
  assetType?: TemplateAssetType | null;
}

export interface AutofillSources {
  brand: BrandProfile;
  /** Already scoped to the active brand by the caller. */
  products: ProductProfile[];
  /** Models associated with the active brand, in metadata.modelIds order. */
  models: AvatarProfile[];
}

export interface AutofillPlan {
  images: Record<string, { url: string; name: string }>;
  texts: Record<string, string>;
}

interface Candidate {
  role: string;
  url: string;
  owner: string;
}

/** Rank helper — identical scoring to the manual ProfileAssetPicker sort. */
function rankRole(role: string, roles: string[]): number {
  const index = roles.findIndex((preferred) => role.toLowerCase().includes(preferred));
  return index === -1 ? roles.length : index;
}

function garmentFallbackRoles(label: string): string[] {
  if (/back/i.test(label)) return ["back"];
  return ["front"];
}

/** Deterministic candidate pool for an image slot, scoped to the active brand. */
function imageCandidates(
  role: InputRole,
  sources: AutofillSources,
): Candidate[] {
  const { brand, products, models } = sources;

  if (role === "logo") {
    return brandProfileAssets(brand).map((asset) => ({ ...asset, owner: brand.name }));
  }

  if (role === "face") {
    const model = models[0];
    const url = model?.thumbnail_url ?? model?.reference_assets?.[0] ?? null;
    return url && model ? [{ role: "model", url, owner: model.name }] : [];
  }

  if (role === "garment") {
    return products
      .filter((profile) => profile.type === "garment")
      .flatMap((profile) => profile.assets.map((asset) => ({ ...asset, owner: profile.name })));
  }

  if (role === "product" || role === "jewelry") {
    return products.flatMap((profile) =>
      profile.assets.map((asset) => ({ ...asset, owner: profile.name })),
    );
  }

  // "car" and "generic" have no deterministic brand source — never guess.
  return [];
}

/** Unambiguous text-field rules only. Anything else stays empty. */
function textValue(field: AutofillField, brand: BrandProfile): string | null {
  const token = `${field.key} ${field.label}`.toLowerCase();

  if (/(brand[_\s-]?name|^brand$|\bbrand\b.*\bname\b|company[_\s-]?name)/.test(token)) {
    return brand.name || null;
  }
  if (/(colour|color)/.test(token)) {
    return brand.colors.length ? brand.colors.join(", ") : null;
  }
  if (/(brand[_\s-]?(description|brief|bio|story|about)|^(description|brief)$)/.test(token)) {
    return brand.description || null;
  }
  return null;
}

/**
 * Builds the autofill plan. Only keys present in the returned maps should be
 * written, and only into slots the caller has verified are EMPTY.
 */
export function planBrandAutofill(fields: AutofillField[], sources: AutofillSources): AutofillPlan {
  const plan: AutofillPlan = { images: {}, texts: {} };

  for (const field of fields) {
    if (field.type === "image") {
      const role = resolveInputRole(field.label, field.assetType ?? undefined);
      const candidates = imageCandidates(role, sources);
      if (!candidates.length) continue;

      const roles = preferredRoles(field.assetType ?? undefined);
      const ranking = roles.length
        ? roles
        : role === "garment"
          ? garmentFallbackRoles(field.label)
          : role === "logo"
            ? ["primary logo", "logo"]
            : [];

      const best = ranking.length
        ? [...candidates].sort((a, b) => rankRole(a.role, ranking) - rankRole(b.role, ranking))[0]
        : candidates[0];

      // A ranked pool with zero role affinity is not a confident match.
      if (ranking.length && role !== "face" && rankRole(best.role, ranking) === ranking.length) continue;

      plan.images[field.key] = { url: best.url, name: `${best.owner} · ${best.role}` };
      continue;
    }

    const value = textValue(field, sources.brand);
    if (value) plan.texts[field.key] = value;
  }

  return plan;
}
