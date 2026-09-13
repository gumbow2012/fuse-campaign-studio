/**
 * CRO feature flags.
 *
 * `croPreview` gates the hidden `/preview/cro` route. The `*Default` flags gate
 * the CRO treatment on the live public pages: when a flag is false the page
 * renders exactly today's UI. Nothing here touches billing or generation.
 */
export const FEATURE_FLAGS = {
  croPreview: true,
  croHomepageDefault: false,
  croOfferDefault: true,
  croPricingDefault: true,
  croCampaignPagesDefault: true,
  croPostPurchaseTourDefault: true,
} as const;

export type FeatureFlagKey = keyof typeof FEATURE_FLAGS;

/** Guard for public surfaces. */
export function croEnabled(flag: FeatureFlagKey): boolean {
  return FEATURE_FLAGS[flag] === true;
}
