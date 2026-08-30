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
import { readLocalActivationState } from "@/lib/brandActivationLocal";

export interface UseBrandActivation {
  nudge: BrandActivationNudge;
  completionPercent: number;
  readiness: BrandReadiness | null;
  activationState: BrandActivationState;
  loading: boolean;
  /** Brand Setup is a paid-plan feature — free accounts see no brand surfaces. */
  brandSetupEnabled: boolean;
}

export function useBrandActivation(): UseBrandActivation {
  const { user, profile, isAdmin } = useAuth();
  const { activeBrand, loading: brandsLoading } = useBrand();
  const userId = user?.id ?? "";
  const brandSetupEnabled = isAdmin || isPaidPlan(profile?.plan);

  const productsQuery = useQuery({
    queryKey: ["product-profiles", userId || "anon"],
    queryFn: () => listProductProfiles(userId),
    enabled: !!userId && brandSetupEnabled,
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

  // Without a brand row there is nowhere on the server to keep cadence state,
  // so fall back to the local (non-critical) store.
  const activationState = useMemo(
    () => (activeBrand ? readActivationState(activeBrand) : readLocalActivationState(userId)),
    [activeBrand, userId],
  );

  const completionPercent = useMemo(() => computeBrandCompletion(readiness).percent, [readiness]);

  const nudge = useMemo(
    () =>
      brandSetupEnabled
        ? resolveBrandActivationNudge({
            brand: activeBrand,
            readiness,
            nudgeState: activationState,
            signupAt: user?.created_at ?? null,
          })
        : null,
    [brandSetupEnabled, activeBrand, readiness, activationState, user?.created_at],
  );

  if (!brandSetupEnabled) {
    return {
      nudge: null,
      completionPercent: 0,
      readiness: null,
      activationState: {},
      loading: false,
      brandSetupEnabled: false,
    };
  }

  return {
    nudge,
    completionPercent,
    readiness,
    activationState,
    loading: brandsLoading || (!!userId && productsQuery.isLoading),
    brandSetupEnabled,
  };
}

