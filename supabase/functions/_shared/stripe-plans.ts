export type StripePlanKey = "starter" | "pro" | "studio";

export const STRIPE_PLANS = {
  starter: {
    key: "starter" as const,
    name: "Starter",
    priceId: "price_1T5gW5AWgNdlZ1x0Qkr6636B",
    productId: "prod_U3o88Rn0fn4P2w",
    monthlyCredits: 560,
    price: 49,
  },
  pro: {
    key: "pro" as const,
    name: "Pro",
    priceId: "price_1T5gXSAWgNdlZ1x0ME7M4q3N",
    productId: "prod_U3o9Beo3BdMnId",
    monthlyCredits: 1700,
    price: 149,
  },
  studio: {
    key: "studio" as const,
    name: "Studio",
    priceId: "price_1T5gXmAWgNdlZ1x05tVYQLqb",
    productId: "prod_U3oAl1dM2orh9D",
    monthlyCredits: 4560,
    price: 399,
  },
} as const;

export const STRIPE_PLAN_BY_PRICE_ID = Object.fromEntries(
  Object.values(STRIPE_PLANS).map((plan) => [plan.priceId, plan]),
) as Record<string, (typeof STRIPE_PLANS)[StripePlanKey]>;

export const STRIPE_PLAN_BY_PRODUCT_ID = Object.fromEntries(
  Object.values(STRIPE_PLANS).map((plan) => [plan.productId, plan]),
) as Record<string, (typeof STRIPE_PLANS)[StripePlanKey]>;

export function planFromPriceId(priceId: string | null | undefined) {
  if (!priceId) return null;
  return STRIPE_PLAN_BY_PRICE_ID[priceId] ?? null;
}

export function planFromProductId(productId: string | null | undefined) {
  if (!productId) return null;
  return STRIPE_PLAN_BY_PRODUCT_ID[productId] ?? null;
}
