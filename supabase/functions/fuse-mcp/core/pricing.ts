/**
 * Pricing in human terms. Reads the live billing_prices catalog (new Stripe
 * account) and the shared credit tiers. Never touches Stripe.
 */
import type { Admin } from "../auth.ts";

const SITE = "https://fuse-us.com";
/** Median campaign ≈ 945 credits (the top pricing tier); plans are sold in campaigns. */
const CREDITS_PER_CAMPAIGN = 945;
const PLAN_ORDER = ["starter", "plus", "pro", "studio", "team"] as const;

export function campaignsPerMonth(plan: string, credits?: number): number {
  const fallback: Record<string, number> = { starter: 3, plus: 7, pro: 19, studio: 58, team: 105 };
  if (credits) return Math.max(1, Math.floor(credits / CREDITS_PER_CAMPAIGN));
  return fallback[plan] ?? 3;
}

/** Every public template fits inside a Starter month; plan gating is by credits, not by template. */
export function planRequiredFor(estimatedCredits: number): "starter" | "pro" | "studio" {
  if (estimatedCredits <= 3000) return "starter";
  if (estimatedCredits <= 18000) return "pro";
  return "studio";
}

export type PricingSummary = {
  currency: "usd";
  plans: Array<{ key: string; name: string; monthly_price_usd: number; annual_price_usd: number | null; credits_per_month: number; approximate_campaigns_per_month: number }>;
  starter_monthly_price_usd: number;
  promo_first_month_price_usd: number | null;
  promo_note: string | null;
  credit_packs: Array<{ key: string; credits: number; price_usd: number }>;
  selected_template: { slug: string; estimated_credits: number; included_in_starter: boolean; approximate_campaign_fraction: string } | null;
  pricing_url: string;
  billing_note: string;
};

export async function getPricingSummary(admin: Admin, selected?: { slug: string; estimated_credits: number } | null): Promise<PricingSummary> {
  const { data } = await admin
    .from("billing_prices")
    .select("kind, plan_key, billing_interval, pack_key, credits, amount_cents")
    .eq("active", true);
  const rows = data ?? [];
  const plans = PLAN_ORDER
    .map((key) => {
      const monthly = rows.find((r: any) => r.kind === "subscription" && r.plan_key === key && r.billing_interval === "monthly");
      if (!monthly) return null;
      const annual = rows.find((r: any) => r.kind === "subscription" && r.plan_key === key && r.billing_interval === "annual");
      return {
        key,
        name: key.charAt(0).toUpperCase() + key.slice(1),
        monthly_price_usd: (monthly as any).amount_cents / 100,
        annual_price_usd: annual ? (annual as any).amount_cents / 100 : null,
        credits_per_month: (monthly as any).credits,
        approximate_campaigns_per_month: campaignsPerMonth(key, (monthly as any).credits),
      };
    })
    .filter(Boolean) as PricingSummary["plans"];
  const starter = plans.find((p) => p.key === "starter");
  const starterPrice = starter?.monthly_price_usd ?? 25;
  const packs = rows
    .filter((r: any) => r.kind === "credit_pack")
    .map((r: any) => ({ key: r.pack_key, credits: r.credits, price_usd: r.amount_cents / 100 }))
    .sort((a: any, b: any) => a.credits - b.credits);
  return {
    currency: "usd",
    plans,
    starter_monthly_price_usd: starterPrice,
    promo_first_month_price_usd: Math.round(starterPrice * 0.8 * 100) / 100,
    promo_note: "20% off your first month on Starter (applied at checkout).",
    credit_packs: packs,
    selected_template: selected
      ? {
        slug: selected.slug,
        estimated_credits: selected.estimated_credits,
        included_in_starter: selected.estimated_credits <= (starter?.credits_per_month ?? 3000),
        approximate_campaign_fraction: selected.estimated_credits >= CREDITS_PER_CAMPAIGN
          ? "about one campaign worth of credits"
          : `about ${Math.max(1, Math.round((selected.estimated_credits / CREDITS_PER_CAMPAIGN) * 10)) / 10} of a campaign worth of credits`,
      }
      : null,
    pricing_url: `${SITE}/pricing`,
    billing_note: "Each campaign uses credits behind the scenes. Regenerations also use credits. Billed monthly, cancel anytime. Not happy with your first campaign? Email us and we'll make it right.",
  };
}
