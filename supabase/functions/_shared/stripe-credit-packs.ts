export type CreditPackKey = "boost" | "growth" | "bulk";

export type CreditPackDefinition = {
  key: CreditPackKey;
  name: string;
  credits: number;
  amountCents: number;
  currency: "usd";
};

export const CREDIT_PACKS = {
  boost: {
    key: "boost",
    name: "Boost",
    credits: 500,
    amountCents: 2500,
    currency: "usd",
  },
  growth: {
    key: "growth",
    name: "Growth",
    credits: 1500,
    amountCents: 6500,
    currency: "usd",
  },
  bulk: {
    key: "bulk",
    name: "Bulk",
    credits: 4000,
    amountCents: 15000,
    currency: "usd",
  },
} as const satisfies Record<CreditPackKey, CreditPackDefinition>;

export function creditPackFromKey(value: string | null | undefined) {
  if (!value || !(value in CREDIT_PACKS)) return null;
  return CREDIT_PACKS[value as CreditPackKey];
}
