export type StripeTierKey = "starter" | "pro" | "studio";

export const STRIPE_TIERS = {
  starter: {
    name: "Starter",
    monthlyCredits: 500,
    price: 49,
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
