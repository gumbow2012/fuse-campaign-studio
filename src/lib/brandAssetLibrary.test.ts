import { describe, expect, it } from "vitest";
import { buildBrandAssetLibrary } from "@/services/brandAssetLibrary";
import type { BrandProfile } from "@/services/brandProfiles";
import type { ProductProfile } from "@/services/productProfiles";
import type { LibraryAsset } from "@/services/libraryAssets";

const brand = {
  id: "brand-1",
  user_id: "u1",
  name: "FUSE",
  primary_logo_url: "https://cdn/logo.png",
  secondary_logo_url: null,
  colors: ["#111111", "#ff0044"],
  metadata: { invertedLogoUrl: "https://cdn/logo-inv.png" },
} as unknown as BrandProfile;

function product(partial: Partial<ProductProfile>): ProductProfile {
  return {
    id: "p1",
    user_id: "u1",
    brand_id: "brand-1",
    name: "Heavyweight Hoodie",
    type: "garment",
    description: null,
    attributes: {},
    assets: [{ role: "Front", url: "https://cdn/hoodie-front.jpg" }],
    created_at: "",
    updated_at: "",
    ...partial,
  } as ProductProfile;
}

function libraryAsset(partial: Partial<LibraryAsset>): LibraryAsset {
  return {
    id: "l1",
    user_id: "u1",
    kind: "garment",
    url: "https://cdn/upload.jpg",
    name: "Upload",
    metadata: null,
    created_at: "",
    ...partial,
  } as LibraryAsset;
}

describe("buildBrandAssetLibrary", () => {
  it("auto-derives identity logos and color swatches", () => {
    const lib = buildBrandAssetLibrary({ brand, products: [], avatars: [], libraryAssets: [] });
    expect(lib.identity.map((item) => item.subtype)).toEqual([
      "primary_logo",
      "inverted_logo",
      "color",
      "color",
    ]);
    expect(lib.counts.identity).toBe(4);
  });

  it("categorizes products by the shared classifier and splits garments", () => {
    const lib = buildBrandAssetLibrary({
      brand,
      products: [
        product({}),
        product({ id: "p2", name: "Gold Cuban Chain", type: "product", assets: [{ role: "Front", url: "https://cdn/chain.jpg" }] }),
        product({ id: "p3", name: "Cargo Pants", assets: [{ role: "Front", url: "https://cdn/cargo.jpg" }] }),
      ],
      avatars: [],
      libraryAssets: [],
    });
    expect(lib.garmentGroups.map((group) => group.key).sort()).toEqual(["Bottoms", "Tops"]);
    expect(lib.productGroups.map((group) => group.key)).toEqual(["Jewelry"]);
  });

  it("dedupes by URL preferring product_profile over library_asset", () => {
    const lib = buildBrandAssetLibrary({
      brand,
      products: [product({})],
      avatars: [],
      libraryAssets: [
        libraryAsset({ url: "https://cdn/hoodie-front.jpg", metadata: { brand_id: "brand-1" } }),
      ],
    });
    const matches = lib.items.filter((item) => item.url === "https://cdn/hoodie-front.jpg");
    expect(matches).toHaveLength(1);
    expect(matches[0].source).toBe("product_profile");
    expect(matches[0].meta.origins).toEqual([
      { source: "library_asset", sourceId: "l1", category: "campaign_uploads" },
    ]);
  });

  it("keeps library assets with no brand association unassigned and excludes other brands", () => {
    const lib = buildBrandAssetLibrary({
      brand,
      products: [],
      avatars: [],
      libraryAssets: [
        libraryAsset({ id: "l1", url: "https://cdn/a.jpg" }),
        libraryAsset({ id: "l2", url: "https://cdn/b.jpg", metadata: { brand_id: "other" } }),
        libraryAsset({ id: "l3", url: "https://cdn/c.jpg", metadata: { brand_id: "brand-1" } }),
      ],
    });
    expect(lib.unassigned.map((item) => item.sourceId)).toEqual(["l1"]);
    expect(lib.campaignGroups.flatMap((group) => group.items).map((item) => item.sourceId)).toEqual(["l3"]);
  });

  it("surfaces website-import metadata on products", () => {
    const lib = buildBrandAssetLibrary({
      brand,
      products: [
        product({
          attributes: {
            source: "website_import",
            source_domain: "fuse-us.com",
            original_url: "https://fuse-us.com/p/hoodie",
            imported_at: "2026-01-01",
            product_type: "hoodie",
          },
        }),
      ],
      avatars: [],
      libraryAssets: [],
    });
    expect(lib.products[0]).toMatchObject({
      importedFromStore: true,
      sourceDomain: "fuse-us.com",
      type: "hoodie",
      category: "Tops",
    });
  });
});
