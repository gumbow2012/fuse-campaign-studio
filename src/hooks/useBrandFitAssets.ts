/**
 * BRAND ACTIVATION — Phase 5: the saved-asset snapshot used for TRUTHFUL
 * template compatibility. Read-only aggregation over the existing sources
 * (brand row, product profiles, library assets, associated models).
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useBrand } from "@/contexts/BrandContext";
import { listProductProfiles } from "@/services/productProfiles";
import { listLibraryAssets } from "@/services/libraryAssets";
import { readModelIds } from "@/services/brandProfiles";
import type { BrandFitAssets } from "@/lib/brandTemplateFit";

export function useBrandFitAssets(): { assets: BrandFitAssets | null; loading: boolean } {
  const { user } = useAuth();
  const { activeBrand, activeBrandId } = useBrand();
  const userId = user?.id ?? "";

  const productsQuery = useQuery({
    queryKey: ["product-profiles", userId || "anon"],
    queryFn: () => listProductProfiles(userId),
    enabled: !!userId && !!activeBrandId,
    staleTime: 30_000,
  });

  const libraryQuery = useQuery({
    queryKey: ["library-assets", userId || "anon"],
    queryFn: () => listLibraryAssets(userId),
    enabled: !!userId && !!activeBrandId,
    staleTime: 30_000,
  });

  const assets = useMemo<BrandFitAssets | null>(() => {
    if (!activeBrand) return null;

    const products = (productsQuery.data ?? []).filter((entry) => entry.brand_id === activeBrand.id);
    const library = (libraryQuery.data ?? []).filter((asset) => {
      const meta = (asset.metadata ?? {}) as Record<string, unknown>;
      return meta.brand_id === activeBrand.id;
    });
    const libraryOf = (kind: string) => library.filter((asset) => asset.kind === kind).length;

    return {
      hasLogo: Boolean(activeBrand.primary_logo_url) || libraryOf("logo") > 0,
      garmentCount:
        products.filter((entry) => entry.type === "garment").length + libraryOf("garment"),
      productCount: products.length + libraryOf("product"),
      jewelryCount: libraryOf("jewelry"),
      castCount: readModelIds(activeBrand).length + libraryOf("avatar"),
    };
  }, [activeBrand, productsQuery.data, libraryQuery.data]);

  return {
    assets,
    loading: !!activeBrandId && (productsQuery.isLoading || libraryQuery.isLoading),
  };
}
