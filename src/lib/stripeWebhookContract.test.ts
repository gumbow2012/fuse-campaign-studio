import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Stripe subscription credit webhook contract", () => {
  it("grants monthly credits from Stripe successful invoice events", async () => {
    const source = await readFile(resolve(process.cwd(), "supabase/functions/_shared/stripe-billing.ts"), "utf8");

    expect(source).toContain("SUBSCRIPTION_CREDIT_GRANT_EVENTS");
    expect(source).toContain('"invoice.paid"');
    expect(source).toContain('"invoice.payment_succeeded"');
    expect(source).toContain("grantSubscriptionCredits");
  });

  it("keeps invoice-level idempotency for subscription grants", async () => {
    const migration = await readFile(
      resolve(process.cwd(), "supabase/migrations/20260522011500_harden_subscription_invoice_credit_grants.sql"),
      "utf8",
    );

    expect(migration).toContain("subscription_period_grants_stripe_invoice_id_key");
    expect(migration).toContain("WHERE stripe_invoice_id IS NOT NULL");
    expect(migration).toContain("ON CONFLICT DO NOTHING");
  });
});
