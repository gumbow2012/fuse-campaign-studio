/**
 * Shared product/garment category classification.
 * Single source of truth for the Brand Workspace (onboarding import step +
 * Brand Assets resolver). Keep in sync with nothing else — import from here.
 */

import type { ProductProfileType } from "@/services/productProfiles";

export const PRODUCT_CATEGORIES = [
  "Tops",
  "Bottoms",
  "Outerwear",
  "Accessories",
  "Jewelry",
  "Other",
] as const;

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

export const PRODUCT_FILTERS = ["All", ...PRODUCT_CATEGORIES] as const;
export type ProductFilterId = (typeof PRODUCT_FILTERS)[number];

export interface ProductClassification {
  filter: ProductCategory;
  base: ProductProfileType;
  productType: string;
}

/** Classifies a product by its title + raw type string. */
export function classifyProduct(title: string, rawType = ""): ProductClassification {
  const text = `${title} ${rawType}`.toLowerCase();
  const has = (...words: string[]) => words.some((word) => text.includes(word));
  if (has("ring", "necklace", "chain", "bracelet", "earring", "pendant", "jewel")) {
    return { filter: "Jewelry", base: "product", productType: rawType || "jewelry" };
  }
  if (has("jacket", "coat", "parka", "vest", "bomber", "puffer")) {
    return { filter: "Outerwear", base: "garment", productType: rawType || "jacket" };
  }
  if (has("pant", "jean", "short", "trouser", "sweatpant", "cargo", "skirt")) {
    return { filter: "Bottoms", base: "garment", productType: rawType || "pants" };
  }
  if (has("tee", "shirt", "hoodie", "crewneck", "sweater", "top", "jersey", "longsleeve")) {
    return { filter: "Tops", base: "garment", productType: rawType || "tee" };
  }
  if (has("hat", "cap", "beanie", "bag", "belt", "sock", "glove", "scarf", "shoe", "sneaker")) {
    return { filter: "Accessories", base: "product", productType: rawType || "accessory" };
  }
  return { filter: "Other", base: "product", productType: rawType || "other" };
}
