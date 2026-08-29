/**
 * Phase 11 — deterministic marketplace relevance for the ACTIVE brand.
 *
 * No AI, no fabricated affinity: a template only scores when a real, saved
 * brand signal literally matches a field the catalog already returns
 * (category / tags / output_type). A zero score means "no signal", and the
 * caller must not render a recommendation for it.
 */

import type { ApiTemplate } from "@/services/fuseApi";
import type { ProductProfileType } from "@/services/productProfiles";

/** Catalog vocabulary that corresponds to a saved product-profile type. */
const PRODUCT_TYPE_TERMS: Record<ProductProfileType, string[]> = {
  garment: [
    "garment",
    "apparel",
    "clothing",
    "streetwear",
    "fashion",
    "outfit",
    "shirt",
    "tee",
    "hoodie",
    "jacket",
    "pant",
    "jeans",
    "short",
  ],
  product: [
    "product",
    "packaging",
    "unboxing",
    "bottle",
    "can",
    "box",
    "jewelry",
    "ecommerce",
    "e-commerce",
  ],
};

const WEIGHT_PRODUCT_TYPE = 2;
const WEIGHT_STYLE_TAG = 3;

export interface BrandRelevanceSignals {
  /** Distinct product_profiles.type values for the ACTIVE brand only. */
  productTypes: ProductProfileType[];
  /** brand_profiles.metadata.visualStyle.tags */
  styleTags: string[];
}

export interface BrandRelevanceScore {
  score: number;
  /** Human-readable reasons, derived only from matched signals. */
  reasons: string[];
}

function templateTokens(template: ApiTemplate): string[] {
  return [template.category ?? "", template.output_type ?? "", ...(template.tags ?? [])]
    .map((value) => String(value).toLowerCase().trim())
    .filter(Boolean);
}

/** Deterministic score for one template against the active brand's signals. */
export function scoreTemplateForBrand(
  template: ApiTemplate,
  signals: BrandRelevanceSignals,
): BrandRelevanceScore {
  const tokens = templateTokens(template);
  if (!tokens.length) return { score: 0, reasons: [] };

  let score = 0;
  const reasons: string[] = [];

  for (const type of signals.productTypes) {
    const terms = PRODUCT_TYPE_TERMS[type] ?? [];
    if (terms.some((term) => tokens.some((token) => token.includes(term)))) {
      score += WEIGHT_PRODUCT_TYPE;
      reasons.push(type === "garment" ? "Fits your garments" : "Fits your products");
    }
  }

  for (const rawTag of signals.styleTags) {
    const tag = rawTag.toLowerCase().trim();
    if (!tag) continue;
    if (tokens.some((token) => token === tag || token.includes(tag) || tag.includes(token))) {
      score += WEIGHT_STYLE_TAG;
      reasons.push(rawTag);
    }
  }

  return { score, reasons: Array.from(new Set(reasons)).slice(0, 2) };
}

/**
 * Ranks the catalog for the active brand. Only positively-scoring templates are
 * returned — an empty array means "no real signal", so no shelf should render.
 * Ties keep the catalog's incoming order (stable sort on the original index).
 */
export function rankTemplatesForBrand(
  templates: ApiTemplate[],
  signals: BrandRelevanceSignals,
  limit = 6,
): { template: ApiTemplate; score: number; reasons: string[] }[] {
  if (!signals.productTypes.length && !signals.styleTags.length) return [];

  return templates
    .map((template, index) => ({ template, index, ...scoreTemplateForBrand(template, signals) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map(({ template, score, reasons }) => ({ template, score, reasons }));
}
