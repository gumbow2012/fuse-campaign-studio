export const STRIPE_TIERS = {
  starter: {
    name: "Starter",
    price_id: "price_1T5gW5AWgNdlZ1x0Qkr6636B",
    product_id: "prod_U3o88Rn0fn4P2w",
    monthlyCredits: 500,
    price: 49,
  },
  pro: {
    name: "Pro",
    price_id: "price_1T5gXSAWgNdlZ1x0ME7M4q3N",
    product_id: "prod_U3o9Beo3BdMnId",
    monthlyCredits: 2000,
    price: 149,
  },
  studio: {
    name: "Studio",
    price_id: "price_1T5gXmAWgNdlZ1x05tVYQLqb",
    product_id: "prod_U3oAl1dM2orh9D",
    monthlyCredits: 6000,
    price: 399,
  },
} as const;

export const PRODUCT_TO_PLAN: Record<string, keyof typeof STRIPE_TIERS> = {
  [STRIPE_TIERS.starter.product_id]: "starter",
  [STRIPE_TIERS.pro.product_id]: "pro",
  [STRIPE_TIERS.studio.product_id]: "studio",
};
