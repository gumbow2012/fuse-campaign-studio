/**
 * BRAND WORKSPACE — Phase 3: unified Brand Assets resolver.
 *
 * Pure aggregation over the EXISTING authoritative sources
 * (brand_profiles, product_profiles, avatar_profiles, library_assets).
 * Nothing is duplicated into library_assets — this only normalizes what
 * already exists into display items for the Brand Assets UI.
 */

import type { BrandProfile } from "@/services/brandProfiles";
import type { ProductProfile } from "@/services/productProfiles";
import type { AvatarProfile } from "@/services/avatarProfiles";
import { LIBRARY_CATEGORIES, type LibraryAsset } from "@/services/libraryAssets";
import { classifyProduct, type ProductCategory } from "@/lib/productCategories";

export type BrandAssetCategory =
  | "identity"
  | "products"
  | "garments"
  | "cast"
  | "campaign_uploads"
  | "references";

export type BrandAssetSource =
  | "brand_profile"
  | "product_profile"
  | "avatar_profile"
  | "library_asset";

export interface BrandAssetItem {
  id: string;
  /** Image/video URL, or a color value for identity swatches. */
  url: string;
  title: string;
  category: BrandAssetCategory;
  /** Fine-grained kind: "primary_logo", "color", "Front", "garment", library kind… */
  subtype: string;
  source: BrandAssetSource;
  sourceId: string;
  meta: Record<string, unknown>;
}

export interface BrandAssetGroup {
  key: string;
  label: string;
  items: BrandAssetItem[];
}

export interface BrandAssetProductDetail {
  id: string;
  name: string;
  category: ProductCategory;
  type: string;
  profileType: ProductProfile["type"];
  importedFromStore: boolean;
  sourceDomain: string | null;
  originalUrl: string | null;
  importedAt: string | null;
  images: { role: string; url: string }[];
  description: string | null;
}

export interface BrandAssetLibrary {
  items: BrandAssetItem[];
  identity: BrandAssetItem[];
  /** Product profile items grouped by category (Tops/Bottoms/…). */
  productGroups: BrandAssetGroup[];
  garmentGroups: BrandAssetGroup[];
  cast: BrandAssetItem[];
  /** library_assets grouped by LIBRARY_CATEGORIES kind. */
  campaignGroups: BrandAssetGroup[];
  references: BrandAssetItem[];
  /** library_assets with no brand association. */
  unassigned: BrandAssetItem[];
  products: BrandAssetProductDetail[];
  counts: Record<BrandAssetCategory | "unassigned" | "all", number>;
}

const LIBRARY_KIND_LABELS: Record<string, string> = {
  ...Object.fromEntries(LIBRARY_CATEGORIES.map((entry) => [entry.kind, entry.label])),
  image: "Images",
  video: "Videos",
};

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

/** Best-effort brand association for a library asset (no DB column in this phase). */
export function libraryAssetBrandId(asset: LibraryAsset): string | null {
  const meta = (asset.metadata ?? {}) as Record<string, unknown>;
  return (
    str(meta.brand_id) ??
    str(meta.brandId) ??
    str(meta.brand_profile_id) ??
    str((meta.brand as Record<string, unknown> | undefined)?.id)
  );
}

function productDetail(profile: ProductProfile): BrandAssetProductDetail {
  const attrs = (profile.attributes ?? {}) as Record<string, unknown>;
  const rawType = str(attrs.product_type) ?? str(attrs.type) ?? "";
  const classification = classifyProduct(profile.name, rawType);
  return {
    id: profile.id,
    name: profile.name,
    category: classification.filter,
    type: rawType || classification.productType,
    profileType: profile.type,
    importedFromStore: str(attrs.source) === "website_import",
    sourceDomain: str(attrs.source_domain),
    originalUrl: str(attrs.original_url),
    importedAt: str(attrs.imported_at),
    images: profile.assets.map((asset) => ({ role: asset.role, url: asset.url })),
    description: profile.description,
  };
}

export function buildBrandAssetLibrary({
  brand,
  products,
  avatars,
  libraryAssets,
}: {
  brand: BrandProfile | null | undefined;
  products: ProductProfile[];
  avatars: AvatarProfile[];
  libraryAssets: LibraryAsset[];
}): BrandAssetLibrary {
  const items: BrandAssetItem[] = [];
  /** url -> source precedence, to dedupe across sources. */
  const seen = new Map<string, BrandAssetItem>();
  const precedence: Record<BrandAssetSource, number> = {
    product_profile: 4,
    brand_profile: 3,
    avatar_profile: 2,
    library_asset: 1,
  };

  const push = (item: BrandAssetItem) => {
    const key = item.url.trim();
    if (!key) return;
    const existing = seen.get(key);
    if (existing) {
      // Keep the higher-precedence record, but retain the other origin internally.
      const origins = Array.isArray(existing.meta.origins) ? (existing.meta.origins as unknown[]) : [];
      const merged = [...origins, { source: item.source, sourceId: item.sourceId, category: item.category }];
      if (precedence[item.source] > precedence[existing.source]) {
        const replacement: BrandAssetItem = {
          ...item,
          meta: {
            ...item.meta,
            origins: [...merged, { source: existing.source, sourceId: existing.sourceId, category: existing.category }],
          },
        };
        seen.set(key, replacement);
        const index = items.indexOf(existing);
        if (index >= 0) items[index] = replacement;
      } else {
        existing.meta.origins = merged;
      }
      return;
    }
    seen.set(key, item);
    items.push(item);
  };

  // ── IDENTITY (auto from brand_profiles) ────────────────────────────────────
  const brandMeta = (brand?.metadata ?? {}) as Record<string, unknown>;
  if (brand) {
    if (brand.primary_logo_url) {
      push({
        id: `brand-${brand.id}-primary-logo`,
        url: brand.primary_logo_url,
        title: "Primary logo",
        category: "identity",
        subtype: "primary_logo",
        source: "brand_profile",
        sourceId: brand.id,
        meta: {},
      });
    }
    if (brand.secondary_logo_url) {
      push({
        id: `brand-${brand.id}-secondary-logo`,
        url: brand.secondary_logo_url,
        title: "Secondary logo",
        category: "identity",
        subtype: "secondary_logo",
        source: "brand_profile",
        sourceId: brand.id,
        meta: {},
      });
    }
    const inverted = str(brandMeta.invertedLogoUrl) ?? str(brandMeta.inverted_logo_url);
    if (inverted) {
      push({
        id: `brand-${brand.id}-inverted-logo`,
        url: inverted,
        title: "Inverted logo",
        category: "identity",
        subtype: "inverted_logo",
        source: "brand_profile",
        sourceId: brand.id,
        meta: {},
      });
    }
    brand.colors.forEach((color, index) => {
      push({
        id: `brand-${brand.id}-color-${index}`,
        url: color,
        title: color.toUpperCase(),
        category: "identity",
        subtype: "color",
        source: "brand_profile",
        sourceId: brand.id,
        meta: { swatch: true, color, index },
      });
    });
  }

  // ── PRODUCTS / GARMENTS (active brand scoped) ─────────────────────────────
  const brandProducts = brand ? products.filter((profile) => profile.brand_id === brand.id) : [];
  const details = brandProducts.map(productDetail);
  details.forEach((detail) => {
    detail.images.forEach((image, index) => {
      push({
        id: `product-${detail.id}-${index}`,
        url: image.url,
        title: detail.name,
        category: detail.profileType === "garment" ? "garments" : "products",
        subtype: image.role,
        source: "product_profile",
        sourceId: detail.id,
        meta: {
          productCategory: detail.category,
          productType: detail.type,
          role: image.role,
          importedFromStore: detail.importedFromStore,
          sourceDomain: detail.sourceDomain,
          originalUrl: detail.originalUrl,
          importedAt: detail.importedAt,
          isPrimary: index === 0,
        },
      });
    });
  });

  // ── CAST (avatar_profiles) ────────────────────────────────────────────────
  const brandModelIds = Array.isArray(brandMeta.modelIds)
    ? (brandMeta.modelIds as unknown[]).map((value) => String(value))
    : [];
  const castAvatars = brandModelIds.length
    ? avatars.filter((avatar) => brandModelIds.includes(avatar.id))
    : avatars;
  castAvatars.forEach((avatar) => {
    if (!avatar.thumbnail_url) return;
    push({
      id: `avatar-${avatar.id}`,
      url: avatar.thumbnail_url,
      title: avatar.name,
      category: "cast",
      subtype: avatar.source_type === "FUSE" ? "fuse_avatar" : "user_avatar",
      source: "avatar_profile",
      sourceId: avatar.id,
      meta: { styleTags: avatar.style_tags, sourceType: avatar.source_type },
    });
  });

  // ── CAMPAIGN UPLOADS (library_assets) ────────────────────────────────────
  const unassigned: BrandAssetItem[] = [];
  libraryAssets.forEach((asset) => {
    const assetBrandId = libraryAssetBrandId(asset);
    const isUnassigned = !assetBrandId;
    if (!isUnassigned && brand && assetBrandId !== brand.id) return; // belongs to another brand
    const item: BrandAssetItem = {
      id: `library-${asset.id}`,
      url: asset.url,
      title: asset.name ?? LIBRARY_KIND_LABELS[asset.kind] ?? asset.kind,
      category: asset.kind === "reference" ? "references" : "campaign_uploads",
      subtype: asset.kind,
      source: "library_asset",
      sourceId: asset.id,
      meta: {
        kind: asset.kind,
        kindLabel: LIBRARY_KIND_LABELS[asset.kind] ?? asset.kind,
        unassigned: isUnassigned,
        brandId: assetBrandId,
        createdAt: asset.created_at,
      },
    };
    push(item);
    if (isUnassigned && seen.get(asset.url.trim())?.source === "library_asset") unassigned.push(item);
  });

  const byCategory = (category: BrandAssetCategory) =>
    items.filter((item) => item.category === category && !item.meta.unassigned);

  const group = (source: BrandAssetItem[], keyOf: (item: BrandAssetItem) => string, labelOf: (key: string) => string) => {
    const map = new Map<string, BrandAssetItem[]>();
    source.forEach((item) => {
      const key = keyOf(item);
      const bucket = map.get(key) ?? [];
      bucket.push(item);
      map.set(key, bucket);
    });
    return Array.from(map.entries()).map(([key, groupItems]) => ({
      key,
      label: labelOf(key),
      items: groupItems,
    }));
  };

  const identity = byCategory("identity");
  const productItems = byCategory("products");
  const garmentItems = byCategory("garments");
  const cast = byCategory("cast");
  const campaign = byCategory("campaign_uploads");
  const references = byCategory("references");

  return {
    items,
    identity,
    productGroups: group(productItems, (item) => String(item.meta.productCategory ?? "Other"), (key) => key),
    garmentGroups: group(garmentItems, (item) => String(item.meta.productCategory ?? "Other"), (key) => key),
    cast,
    campaignGroups: group(
      campaign,
      (item) => item.subtype,
      (key) => LIBRARY_KIND_LABELS[key] ?? key,
    ),
    references,
    unassigned,
    products: details,
    counts: {
      all: items.filter((item) => !item.meta.unassigned).length,
      identity: identity.length,
      products: productItems.length,
      garments: garmentItems.length,
      cast: cast.length,
      campaign_uploads: campaign.length,
      references: references.length,
      unassigned: unassigned.length,
    },
  };
}
