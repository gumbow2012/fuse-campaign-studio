import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "npm:stripe";
import {
  corsHeaders,
  createAdminClient,
  errorMessage,
  getUserRoles,
  json,
  requireUser,
} from "../_shared/supabase-admin.ts";

const EXPECTED_ACCOUNT_ID = "acct_AWgNdlZ1x0";
const CURRENCY = "usd";

type PlanSpec = {
  planKey: string;
  label: string;
  credits: number;
  monthly: number;
  annual: number;
};

const PLANS: PlanSpec[] = [
  { planKey: "starter", label: "Starter", credits: 3000, monthly: 2500, annual: 24000 },
  { planKey: "plus", label: "Plus", credits: 7500, monthly: 5900, annual: 56400 },
  { planKey: "pro", label: "Pro", credits: 18000, monthly: 14900, annual: 142800 },
  { planKey: "studio", label: "Studio", credits: 55000, monthly: 39900, annual: 382800 },
  { planKey: "team", label: "Team", credits: 100000, monthly: 69900, annual: 670800 },
];

type PackSpec = { packKey: string; label: string; credits: number; amount: number };

const PACKS: PackSpec[] = [
  { packKey: "p500", label: "500 Credits", credits: 500, amount: 2500 },
  { packKey: "p1000", label: "1,000 Credits", credits: 1000, amount: 4500 },
  { packKey: "p1500", label: "1,500 Credits", credits: 1500, amount: 6500 },
  { packKey: "p2000", label: "2,000 Credits", credits: 2000, amount: 8000 },
  { packKey: "p4000", label: "4,000 Credits", credits: 4000, amount: 15000 },
  { packKey: "p10000", label: "10,000 Credits", credits: 10000, amount: 32500 },
];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const admin = createAdminClient();

  try {
    const user = await requireUser(req, admin);
    const roles = await getUserRoles(user.id, admin);
    if (!roles.some((role) => role === "admin" || role === "dev")) {
      return json({ error: "Admin access required" }, 403);
    }

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY_LIVE");
    if (!stripeKey) return json({ error: "LIVE_STRIPE_SECRET_NOT_AVAILABLE" }, 400);

    const body = (await req.json().catch(() => ({}))) as { confirmAccountId?: string };
    const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" });

    const account = await stripe.accounts.retrieve();
    if (account.id !== EXPECTED_ACCOUNT_ID && body.confirmAccountId !== account.id) {
      return json(
        {
          error: "LIVE_STRIPE_ACCOUNT_MISMATCH",
          accountId: account.id,
          displayName: (account as any).settings?.dashboard?.display_name ?? null,
        },
        409,
      );
    }

    const created: string[] = [];
    const reused: string[] = [];
    const prices: Record<string, string> = {};
    const rows: Record<string, unknown>[] = [];

    // Load existing catalog once (bounded).
    const allProducts: Stripe.Product[] = [];
    for await (const product of stripe.products.list({ limit: 100, active: true })) {
      allProducts.push(product);
      if (allProducts.length >= 300) break;
    }
    const allPrices: Stripe.Price[] = [];
    for await (const price of stripe.prices.list({ limit: 100, active: true })) {
      allPrices.push(price);
      if (allPrices.length >= 500) break;
    }

    const findProduct = (matchKey: string, metaField: string, name: string) =>
      allProducts.find((p) => (p.metadata ?? {})[metaField] === matchKey) ??
      allProducts.find((p) => p.name.trim().toLowerCase() === name.trim().toLowerCase());

    // ---- Subscriptions ----
    for (const plan of PLANS) {
      const name = `FUSE ${plan.label}`;
      let product = findProduct(plan.planKey, "fuse_plan", name);
      if (!product) {
        product = await stripe.products.create({
          name,
          metadata: {
            fuse_plan: plan.planKey,
            product_type: "subscription",
            monthly_credit_allowance: String(plan.credits),
          },
        });
        allProducts.push(product);
        created.push(`product:${name}`);
      } else {
        await stripe.products.update(product.id, {
          metadata: {
            ...(product.metadata ?? {}),
            fuse_plan: plan.planKey,
            product_type: "subscription",
            monthly_credit_allowance: String(plan.credits),
          },
        });
        reused.push(`product:${name}`);
      }

      const intervals: Array<{ key: "monthly" | "annual"; interval: "month" | "year"; amount: number }> = [
        { key: "monthly", interval: "month", amount: plan.monthly },
        { key: "annual", interval: "year", amount: plan.annual },
      ];

      for (const spec of intervals) {
        const matches = (p: Stripe.Price) =>
          p.active &&
          p.currency === CURRENCY &&
          p.unit_amount === spec.amount &&
          p.recurring?.interval === spec.interval;

        let price =
          allPrices.find((p) => p.product === product!.id && matches(p)) ??
          allPrices.find((p) => matches(p) && (p.metadata ?? {}).fuse_plan === plan.planKey);

        if (price) {
          reused.push(`price:${plan.planKey}_${spec.key}`);
        } else {
          price = await stripe.prices.create({
            product: product.id,
            currency: CURRENCY,
            unit_amount: spec.amount,
            recurring: { interval: spec.interval },
            metadata: {
              fuse_plan: plan.planKey,
              billing_interval: spec.key,
              monthly_credit_allowance: String(plan.credits),
              credits: String(plan.credits),
              product_type: "subscription",
            },
          });
          allPrices.push(price);
          created.push(`price:${plan.planKey}_${spec.key}`);
        }

        prices[`${plan.planKey}_${spec.key}`] = price.id;
        rows.push({
          kind: "subscription",
          plan_key: plan.planKey,
          billing_interval: spec.key,
          pack_key: null,
          credits: plan.credits,
          amount_cents: spec.amount,
          currency: CURRENCY,
          stripe_product_id: product.id,
          stripe_price_id: price.id,
          stripe_account_id: account.id,
          active: true,
        });
      }
    }

    // ---- Credit packs ----
    for (const pack of PACKS) {
      const name = `FUSE ${pack.label}`;
      let product = findProduct(pack.packKey, "pack_key", name);
      if (!product) {
        product = await stripe.products.create({
          name,
          metadata: {
            pack_key: pack.packKey,
            product_type: "credit_pack",
            credit_amount: String(pack.credits),
          },
        });
        allProducts.push(product);
        created.push(`product:${name}`);
      } else {
        await stripe.products.update(product.id, {
          metadata: {
            ...(product.metadata ?? {}),
            pack_key: pack.packKey,
            product_type: "credit_pack",
            credit_amount: String(pack.credits),
          },
        });
        reused.push(`product:${name}`);
      }

      const matches = (p: Stripe.Price) =>
        p.active && p.currency === CURRENCY && p.unit_amount === pack.amount && !p.recurring;

      let price =
        allPrices.find((p) => p.product === product!.id && matches(p)) ??
        allPrices.find((p) => matches(p) && (p.metadata ?? {}).pack_key === pack.packKey);

      if (price) {
        reused.push(`price:pack_${pack.packKey}`);
      } else {
        price = await stripe.prices.create({
          product: product.id,
          currency: CURRENCY,
          unit_amount: pack.amount,
          metadata: {
            pack_key: pack.packKey,
            product_type: "credit_pack",
            credit_amount: String(pack.credits),
            credits: String(pack.credits),
          },
        });
        allPrices.push(price);
        created.push(`price:pack_${pack.packKey}`);
      }

      prices[`pack_${pack.packKey}`] = price.id;
      rows.push({
        kind: "credit_pack",
        plan_key: null,
        billing_interval: null,
        pack_key: pack.packKey,
        credits: pack.credits,
        amount_cents: pack.amount,
        currency: CURRENCY,
        stripe_product_id: product.id,
        stripe_price_id: price.id,
        stripe_account_id: account.id,
        active: true,
      });
    }

    const { error: upsertError } = await admin
      .from("billing_prices")
      .upsert(rows, { onConflict: "stripe_price_id" });
    if (upsertError) throw new Error(upsertError.message);

    return json({ accountId: account.id, verified: true, created, reused, prices });
  } catch (error) {
    const message = errorMessage(error);
    if (/authoriz|authentic|bearer/i.test(message)) return json({ error: message }, 401);
    console.error("provision-live-billing failed:", message);
    return json({ error: message }, 500);
  }
});
