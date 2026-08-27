/**
 * The SINGLE consumer surface for brand activation state.
 *
 * Later phases (modals, banners, notifications, contextual prompts) read this
 * hook instead of scattering `if (!brand)` checks. Read-only: no writes here.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useBrand } from "@/contexts/BrandContext";
import { listProductProfiles } from "@/services/productProfiles";
import { readModelIds, readVisualStyle } from "@/services/brandProfiles";
import { deriveBrandReadiness, type BrandReadiness } from "@/lib/brandReadiness";
import {
  computeBrandCompletion,
  readActivationState,
  resolveBrandActivationNudge,
  type BrandActivationNudge,
  type BrandActivationState,
} from "@/lib/brandActivation";

export interface UseBrandActivation {
  nudge: BrandActivationNudge;
  completionPercent: number;
  readiness: BrandReadiness | null;
  activationState: BrandActivationState;
  loading: boolean;
}

export function useBrandActivation(): UseBrandActivation {
  const { user } = useAuth();
  const { activeBrand, loading: brandsLoading } = useBrand();
  const userId = user?.id ?? "";

  const productsQuery = useQuery({
    queryKey: ["product-profiles", userId || "anon"],
    queryFn: () => listProductProfiles(userId),
    enabled: !!userId,
  });

  const readiness = useMemo(() => {
    if (!activeBrand) return null;
    return deriveBrandReadiness(
      activeBrand,
      productsQuery.data ?? [],
      readModelIds(activeBrand),
      readVisualStyle(activeBrand),
    );
  }, [activeBrand, productsQuery.data]);

  const activationState = useMemo(() => readActivationState(activeBrand), [activeBrand]);

  const completionPercent = useMemo(() => computeBrandCompletion(readiness).percent, [readiness]);

  const nudge = useMemo(
    () =>
      resolveBrandActivationNudge({
        brand: activeBrand,
        readiness,
        nudgeState: activationState,
        signupAt: user?.created_at ?? null,
      }),
    [activeBrand, readiness, activationState, user?.created_at],
  );

  return {
    nudge,
    completionPercent,
    readiness,
    activationState,
    loading: brandsLoading || (!!userId && productsQuery.isLoading),
  };
}
