/**
 * Brand Workspace — active brand state.
 *
 * Server-persistent: the active brand is stored on profiles.active_brand_id for
 * the signed-in user. Falls back to the most recently created brand, else null.
 * Public pages never need this provider's data (queries stay disabled without a
 * user), so it is safe to mount app-wide.
 */
import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import {
  getActiveBrandId,
  listBrandProfiles,
  setActiveBrand as persistActiveBrand,
  type BrandProfile,
} from "@/services/brandProfiles";

interface BrandContextValue {
  brands: BrandProfile[];
  activeBrand: BrandProfile | null;
  activeBrandId: string | null;
  setActiveBrand: (id: string) => void;
  loading: boolean;
}

const BrandContext = createContext<BrandContextValue>({
  brands: [],
  activeBrand: null,
  activeBrandId: null,
  setActiveBrand: () => {},
  loading: false,
});

export const useBrand = () => useContext(BrandContext);

export function BrandProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id ?? "";

  const brandsQuery = useQuery({
    queryKey: ["brand-profiles", userId || "anon"],
    queryFn: () => listBrandProfiles(userId),
    enabled: !!userId,
  });

  const activeIdQuery = useQuery({
    queryKey: ["active-brand-id", userId || "anon"],
    queryFn: () => getActiveBrandId(),
    enabled: !!userId,
  });

  const brands = useMemo(() => brandsQuery.data ?? [], [brandsQuery.data]);

  // brands are ordered created_at desc, so brands[0] is the newest.
  const activeBrand = useMemo(() => {
    if (!brands.length) return null;
    const stored = activeIdQuery.data
      ? brands.find((brand) => brand.id === activeIdQuery.data) ?? null
      : null;
    return stored ?? brands[0];
  }, [brands, activeIdQuery.data]);

  const mutation = useMutation({
    mutationFn: (id: string) => persistActiveBrand(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["active-brand-id"] });
      queryClient.invalidateQueries({ queryKey: ["brand-profiles"] });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
  });

  const setActiveBrand = useCallback((id: string) => mutation.mutate(id), [mutation]);

  const value = useMemo<BrandContextValue>(
    () => ({
      brands,
      activeBrand,
      activeBrandId: activeBrand?.id ?? null,
      setActiveBrand,
      loading: brandsQuery.isLoading || activeIdQuery.isLoading,
    }),
    [brands, activeBrand, setActiveBrand, brandsQuery.isLoading, activeIdQuery.isLoading],
  );

  return <BrandContext.Provider value={value}>{children}</BrandContext.Provider>;
}
