// Authoritative FUSE credit top-up pricing. The SERVER is the sole price authority:
// clients submit ONLY a credits integer; amounts are always computed here in
// integer cents. Never accept amountCents/price/costPerCredit from a client.

export const CREDIT_PRICING_VERSION = "v1";
export const CREDIT_TOPUP_MIN = 500;
export const CREDIT_TOPUP_MAX = 50_000;
export const CREDIT_TOPUP_STEP = 100;

// Piecewise-linear price anchors: [credits, amountCents]. Monotonic by design.
const PRICE_ANCHORS: ReadonlyArray<readonly [number, number]> = [
  [500, 2_500], // $25
  [1_000, 4_500], // $45
  [1_500, 6_500], // $65
  [2_000, 8_000], // $80
  [4_000, 15_000], // $150
  [10_000, 32_500], // $325
];

// Above the top anchor, the flat 10k effective rate applies: $325 / 10000 = 3.25 cents.
const TOP_ANCHOR_CREDITS = 10_000;
const TOP_ANCHOR_CENTS = 32_500;

export type CreditTopUpQuote = {
  credits: number;
  amountCents: number;
  dollars: number;
  costPerCredit: number; // dollars per credit
  costPer1000: number; // dollars per 1000 credits
  pricingVersion: string;
};

/**
 * Normalize messy client input ("3,300", " 3300 ", 3300) into a candidate
 * integer. Returns null when the input cannot be read as a finite number.
 */
export function normalizeCreditAmount(input: unknown): number | null {
  if (typeof input === "number") {
    return Number.isFinite(input) ? input : null;
  }
  if (typeof input === "string") {
    const cleaned = input.replace(/[,\s$]/g, "");
    if (cleaned === "") return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function validateCreditTopUpAmount(credits: number): string | null {
  if (!Number.isFinite(credits)) return "Credits must be a finite number.";
  if (!Number.isInteger(credits)) return "Credits must be a whole number.";
  if (credits < CREDIT_TOPUP_MIN) return `Minimum top-up is ${CREDIT_TOPUP_MIN} credits.`;
  if (credits > CREDIT_TOPUP_MAX) return `Maximum top-up is ${CREDIT_TOPUP_MAX} credits.`;
  if (credits % CREDIT_TOPUP_STEP !== 0) {
    return `Credits must be a multiple of ${CREDIT_TOPUP_STEP}.`;
  }
  return null;
}

function interpolatedAmountCents(credits: number): number {
  const last = PRICE_ANCHORS[PRICE_ANCHORS.length - 1];
  if (credits > last[0]) {
    // Flat 10k effective rate: 32500 cents / 10000 credits.
    return Math.round((credits * TOP_ANCHOR_CENTS) / TOP_ANCHOR_CREDITS);
  }
  for (let i = 0; i < PRICE_ANCHORS.length; i++) {
    const [anchorCredits, anchorCents] = PRICE_ANCHORS[i];
    if (credits === anchorCredits) return anchorCents;
    if (credits < anchorCredits && i > 0) {
      const [prevCredits, prevCents] = PRICE_ANCHORS[i - 1];
      // Linear interpolation on integer cents between the surrounding anchors.
      const ratio = (credits - prevCredits) / (anchorCredits - prevCredits);
      return Math.round(prevCents + ratio * (anchorCents - prevCents));
    }
  }
  // credits < first anchor — only reachable for invalid input; return the floor.
  return PRICE_ANCHORS[0][1];
}

/**
 * Authoritative server-side quote for a credit top-up. Throws on invalid input.
 * Returns integer cents — never floats.
 */
export function quoteCreditTopUp(input: unknown): CreditTopUpQuote {
  const credits = normalizeCreditAmount(input);
  if (credits === null) throw new Error("Credits must be a number.");
  const invalid = validateCreditTopUpAmount(credits);
  if (invalid) throw new Error(invalid);

  const amountCents = interpolatedAmountCents(credits);
  const dollars = amountCents / 100;
  const costPerCredit = amountCents / credits / 100;

  return {
    credits,
    amountCents,
    dollars,
    costPerCredit,
    costPer1000: costPerCredit * 1000,
    pricingVersion: CREDIT_PRICING_VERSION,
  };
}

// Credits amounts that match an existing preset pack size.
const PRESET_CREDIT_AMOUNTS = new Set([500, 1_500, 4_000]);

export type CreditTopUpPurchaseType = "preset" | "custom";

export function creditTopUpPurchaseType(credits: number): CreditTopUpPurchaseType {
  return PRESET_CREDIT_AMOUNTS.has(credits) ? "preset" : "custom";
}

export type ResolvedCreditTopUpPurchase = {
  key: string; // credit_pack_purchases.pack_key ("custom" or "preset_<n>")
  credits: number;
  amountCents: number;
  currency: "usd";
  pricingVersion: string;
  purchaseType: CreditTopUpPurchaseType;
};

type CheckoutSessionLike = {
  amount_total?: unknown;
  currency?: unknown;
  metadata?: Record<string, unknown> | null;
};

/**
 * Webhook-side resolution for checkout_type:"credit_topup" sessions.
 * INDEPENDENTLY re-quotes the server price from metadata.credits and verifies
 * the session's amount_total + currency against it. Never trusts any
 * client-supplied price. Returns ok:false (with a reason) when anything fails
 * verification — the caller must NOT grant credits in that case.
 */
export function resolveCreditTopUpPurchase(
  session: CheckoutSessionLike,
):
  | { ok: true; purchase: ResolvedCreditTopUpPurchase }
  | { ok: false; reason: string } {
  const metadata = session.metadata ?? {};
  const rawCredits = typeof metadata.credits === "string" || typeof metadata.credits === "number"
    ? metadata.credits
    : null;
  const credits = normalizeCreditAmount(rawCredits);
  if (credits === null) return { ok: false, reason: "missing_or_invalid_credits" };

  let quote: CreditTopUpQuote;
  try {
    quote = quoteCreditTopUp(credits);
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "invalid_credits" };
  }

  const amountTotal = typeof session.amount_total === "number" && Number.isFinite(session.amount_total)
    ? Math.trunc(session.amount_total)
    : null;
  if (amountTotal === null) return { ok: false, reason: "missing_amount_total" };
  if (amountTotal !== quote.amountCents) {
    return {
      ok: false,
      reason: `amount_mismatch: session ${amountTotal} != quote ${quote.amountCents}`,
    };
  }

  const currency = typeof session.currency === "string" ? session.currency.toLowerCase() : null;
  if (currency !== "usd") return { ok: false, reason: "currency_mismatch" };

  const metadataType = typeof metadata.purchase_type === "string" ? metadata.purchase_type : null;
  const purchaseType: CreditTopUpPurchaseType = metadataType === "preset" || metadataType === "custom"
    ? metadataType
    : creditTopUpPurchaseType(quote.credits);

  return {
    ok: true,
    purchase: {
      key: purchaseType === "preset" ? `preset_${quote.credits}` : "custom",
      credits: quote.credits,
      amountCents: quote.amountCents,
      currency: "usd",
      pricingVersion: typeof metadata.pricing_version === "string" && metadata.pricing_version
        ? metadata.pricing_version
        : quote.pricingVersion,
      purchaseType,
    },
  };
}
