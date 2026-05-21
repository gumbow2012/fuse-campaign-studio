import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Stripe promotion code support", () => {
  it("keeps promotion code entry enabled for membership and credit-pack checkout", async () => {
    const source = await readFile(resolve(process.cwd(), "supabase/functions/_shared/stripe-billing.ts"), "utf8");

    expect(source.match(/allow_promotion_codes: true/g)).toHaveLength(2);
    expect(source).toContain('new URL("/pricing", origin)');
  });

  it("ships an idempotent launch discount script for first-user and mass-market codes", async () => {
    const source = await readFile(resolve(process.cwd(), "scripts/create-launch-promotion-codes.mjs"), "utf8");
    const docs = await readFile(resolve(process.cwd(), "docs/launch-discounts.md"), "utf8");

    expect(source).toContain('code: "ACCESS19"');
    expect(source).toContain("percentOff: 100");
    expect(source).toContain("maxRedemptions: 5");
    expect(source).toContain('code: "LAUNCH30"');
    expect(source).toContain("percentOff: 30");
    expect(source).toContain("findPromotionCode");
    expect(docs).toContain("Stripe Promotion Codes");
  });
});
