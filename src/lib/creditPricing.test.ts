import { describe, expect, it } from "vitest";

import {
  creditTopUpPurchaseType,
  normalizeCreditAmount,
  quoteCreditTopUp,
  resolveCreditTopUpPurchase,
} from "../../supabase/functions/_shared/credit-pricing";

describe("quoteCreditTopUp anchors", () => {
  it("returns exact anchor prices", () => {
    const cases: Array<[number, number]> = [
      [500, 2500],
      [1000, 4500],
      [1500, 6500],
      [2000, 8000],
      [4000, 15000],
      [10000, 32500],
    ];
    for (const [credits, cents] of cases) {
      expect(quoteCreditTopUp(credits).amountCents).toBe(cents);
    }
  });

  it("interpolates linearly between anchors (3000 -> $115)", () => {
    expect(quoteCreditTopUp(3000).amountCents).toBe(11500);
  });

  it("applies the flat 10k rate above 10000 credits", () => {
    expect(quoteCreditTopUp(20000).amountCents).toBe(65000);
    expect(quoteCreditTopUp(50000).amountCents).toBe(162500);
  });

  it("is monotonic across the full valid range", () => {
    let previous = 0;
    for (let credits = 500; credits <= 50000; credits += 100) {
      const cents = quoteCreditTopUp(credits).amountCents;
      expect(cents).toBeGreaterThanOrEqual(previous);
      previous = cents;
    }
    // Spot-check: 1499-equivalent boundary — 1400 must not cost more than 1500.
    expect(quoteCreditTopUp(1400).amountCents).toBeLessThanOrEqual(quoteCreditTopUp(1500).amountCents);
  });

  it("returns integer cents and a pricing version", () => {
    for (const credits of [700, 900, 3300, 7500, 12300, 49900]) {
      const quote = quoteCreditTopUp(credits);
      expect(Number.isInteger(quote.amountCents)).toBe(true);
      expect(quote.pricingVersion).toBe("v1");
      expect(quote.credits).toBe(credits);
    }
  });
});

describe("quoteCreditTopUp validation", () => {
  it("rejects invalid amounts", () => {
    for (const bad of [0, 100, 499, -500, Number.NaN, 50100, 60000, 550, 1000.5]) {
      expect(() => quoteCreditTopUp(bad)).toThrow();
    }
  });

  it("normalizes '3,300' to 3300 and quotes it", () => {
    expect(normalizeCreditAmount("3,300")).toBe(3300);
    expect(quoteCreditTopUp("3,300").credits).toBe(3300);
    expect(quoteCreditTopUp(" 3300 ").amountCents).toBe(quoteCreditTopUp(3300).amountCents);
  });

  it("rejects garbage strings", () => {
    for (const bad of ["", "abc", "1,2,3,", "$$"]) {
      expect(() => quoteCreditTopUp(bad)).toThrow();
    }
  });
});

describe("creditTopUpPurchaseType", () => {
  it("marks preset sizes", () => {
    expect(creditTopUpPurchaseType(500)).toBe("preset");
    expect(creditTopUpPurchaseType(1500)).toBe("preset");
    expect(creditTopUpPurchaseType(4000)).toBe("preset");
    expect(creditTopUpPurchaseType(3300)).toBe("custom");
    expect(creditTopUpPurchaseType(20000)).toBe("custom");
  });
});

describe("resolveCreditTopUpPurchase (webhook verification)", () => {
  const sessionFor = (credits: number, amountTotal: number, currency = "usd") => ({
    amount_total: amountTotal,
    currency,
    metadata: {
      checkout_type: "credit_topup",
      credits: String(credits),
      amount_cents: String(amountTotal),
      pricing_version: "v1",
      purchase_type: creditTopUpPurchaseType(credits),
    },
  });

  it("accepts a correctly-priced session and resolves the purchase", () => {
    const resolved = resolveCreditTopUpPurchase(sessionFor(3300, quoteCreditTopUp(3300).amountCents));
    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(resolved.purchase.credits).toBe(3300);
      expect(resolved.purchase.amountCents).toBe(quoteCreditTopUp(3300).amountCents);
      expect(resolved.purchase.key).toBe("custom");
    }
  });

  it("uses preset_<n> pack keys for preset amounts", () => {
    const resolved = resolveCreditTopUpPurchase(sessionFor(1500, 6500));
    expect(resolved.ok).toBe(true);
    if (resolved.ok) expect(resolved.purchase.key).toBe("preset_1500");
  });

  it("REFUSES to grant when session.amount_total != server quote", () => {
    // Attacker tampers metadata amount, or amount_total was discounted.
    const tampered = resolveCreditTopUpPurchase(sessionFor(3300, 100));
    expect(tampered.ok).toBe(false);

    const offByOne = resolveCreditTopUpPurchase(
      sessionFor(3300, quoteCreditTopUp(3300).amountCents - 1),
    );
    expect(offByOne.ok).toBe(false);
  });

  it("refuses non-usd currency and invalid credits", () => {
    expect(
      resolveCreditTopUpPurchase(sessionFor(3300, quoteCreditTopUp(3300).amountCents, "eur")).ok,
    ).toBe(false);
    expect(resolveCreditTopUpPurchase(sessionFor(0, 0)).ok).toBe(false);
    expect(resolveCreditTopUpPurchase({ amount_total: 11500, currency: "usd", metadata: {} }).ok).toBe(
      false,
    );
  });

  it("re-quotes independently of metadata.amount_cents", () => {
    // metadata.amount_cents lies, but amount_total matches the true quote → still fine.
    const session = sessionFor(3000, 11500);
    session.metadata.amount_cents = "100";
    const resolved = resolveCreditTopUpPurchase(session);
    expect(resolved.ok).toBe(true);
    if (resolved.ok) expect(resolved.purchase.amountCents).toBe(11500);
  });
});
