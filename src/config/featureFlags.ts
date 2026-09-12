/**
 * CRO preview feature flags.
 *
 * `croPreview` only gates the hidden `/preview/cro` route. Every `*Default`
 * flag stays FALSE: the public pages must not render any CRO section until the
 * owner approves the copy. Nothing here touches billing or generation.
 */
export const FEATURE_FLAGS = {
  croPreview: true,
  croHomepageDefault: false,
  croPricingDefault: false,
  croCampaignPagesDefault: false,
  croPostPurchaseTourDefault: false,
} as const;

export type FeatureFlagKey = keyof typeof FEATURE_FLAGS;

/** No-op guard for public surfaces: returns false for every default flag today. */
export function croEnabled(flag: FeatureFlagKey): boolean {
  return FEATURE_FLAGS[flag] === true;
}
