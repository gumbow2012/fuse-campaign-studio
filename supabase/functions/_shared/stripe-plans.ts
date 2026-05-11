import type { StripeBillingMode } from "./stripe.ts";

export type StripePlanKey = "starter" | "pro" | "studio";

export type StripePlanDefinition = {
  key: StripePlanKey;
  name: string;
  priceId: string;
  productId: string;
  monthlyCredits: number;
  price: number;
};

const FALLBACK_PRICE_IDS = {
  starter: "price_1T5gW5AWgNdlZ1x0Qkr6636B",
  pro: "price_1T5gXSAWgNdlZ1x0ME7M4q3N",
  studio: "price_1T5gXmAWgNdlZ1x05tVYQLqb",
} as const satisfies Record<StripePlanKey, string>;

const FALLBACK_PRODUCT_IDS = {
  starter: "prod_U3o88Rn0fn4P2w",
  pro: "prod_U3o9Beo3BdMnId",
  studio: "prod_U3oAl1dM2orh9D",
} as const satisfies Record<StripePlanKey, string>;

const PLAN_META = {
  starter: {
    key: "starter" as const,
    name: "Starter",
    monthlyCredits: 500,
    price: 25,
  },
  pro: {
    key: "pro" as const,
    name: "Pro",
    monthlyCredits: 2000,
    price: 149,
  },
  studio: {
    key: "studio" as const,
    name: "Studio",
    monthlyCredits: 6000,
    price: 399,
  },
} as const;

function firstNonEmptyEnv(names: string[]) {
  for (const name of names) {
    const value = Deno.env.get(name)?.trim();
    if (value) return value;
  }

  return null;
}

function getPlanEnvValue(
  mode: StripeBillingMode,
  planKey: StripePlanKey,
  kind: "PRICE" | "PRODUCT",
) {
  const upperKey = planKey.toUpperCase();
  const explicitNames = mode === "live"
    ? [`STRIPE_${upperKey}_${kind}_ID_LIVE`, `STRIPE_${upperKey}_${kind}_ID`]
    : [`STRIPE_${upperKey}_${kind}_ID_TEST`];

  const explicitValue = firstNonEmptyEnv(explicitNames);
  if (explicitValue) return explicitValue;

  if (mode === "live") {
    return kind === "PRICE"
      ? FALLBACK_PRICE_IDS[planKey]
      : FALLBACK_PRODUCT_IDS[planKey];
  }

  throw new Error(`${explicitNames[0]} not set`);
}

export function getStripePlans(mode: StripeBillingMode = "live") {
  return {
    starter: {
      ...PLAN_META.starter,
      priceId: getPlanEnvValue(mode, "starter", "PRICE"),
      productId: getPlanEnvValue(mode, "starter", "PRODUCT"),
    },
    pro: {
      ...PLAN_META.pro,
      priceId: getPlanEnvValue(mode, "pro", "PRICE"),
      productId: getPlanEnvValue(mode, "pro", "PRODUCT"),
    },
    studio: {
      ...PLAN_META.studio,
      priceId: getPlanEnvValue(mode, "studio", "PRICE"),
      productId: getPlanEnvValue(mode, "studio", "PRODUCT"),
    },
  } as const satisfies Record<StripePlanKey, StripePlanDefinition>;
}

export type StripePlan = StripePlanDefinition;

export function isLegacyStarterFallbackPrice(plan: StripePlanDefinition, mode: StripeBillingMode) {
  return mode === "live" && plan.key === "starter" && plan.priceId === FALLBACK_PRICE_IDS.starter;
}

export function planFromKey(
  planKey: string | null | undefined,
  mode: StripeBillingMode = "live",
) {
  const plans = getStripePlans(mode);
  if (!planKey || !(planKey in plans)) return null;
  return plans[planKey as StripePlanKey];
}

export function planFromPriceId(
  priceId: string | null | undefined,
  mode: StripeBillingMode = "live",
) {
  if (!priceId) return null;
  const plans = getStripePlans(mode);
  return Object.values(plans).find((plan) => plan.priceId === priceId) ?? null;
}

export function planFromProductId(
  productId: string | null | undefined,
  mode: StripeBillingMode = "live",
) {
  if (!productId) return null;
  const plans = getStripePlans(mode);
  return Object.values(plans).find((plan) => plan.productId === productId) ?? null;
}
