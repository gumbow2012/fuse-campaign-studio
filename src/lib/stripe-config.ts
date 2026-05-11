export type StripeTierKey = "starter" | "pro" | "studio";
export type CreditPackKey = "boost" | "growth" | "bulk";

export const STRIPE_TIERS = {
  starter: {
    name: "Starter",
    monthlyCredits: 500,
    price: 25,
  },
  pro: {
    name: "Pro",
    monthlyCredits: 2000,
    price: 149,
  },
  studio: {
    name: "Studio",
    monthlyCredits: 6000,
    price: 399,
  },
} as const satisfies Record<StripeTierKey, {
  name: string;
  monthlyCredits: number;
  price: number;
}>;

export const CREDIT_PACKS = {
  boost: {
    name: "Boost",
    credits: 500,
    price: 25,
  },
  growth: {
    name: "Growth",
    credits: 1500,
    price: 65,
  },
  bulk: {
    name: "Bulk",
    credits: 4000,
    price: 150,
  },
} as const satisfies Record<CreditPackKey, {
  name: string;
  credits: number;
  price: number;
}>;
