// process-creator-payout — platform-initiated creator payouts (TEST MODE only).
// Claim-then-pay, idempotent, live payout-ready check. Auth: scheduled-job secret OR admin/dev JWT.
import {
  createAdminClient, requireUser, getUserRoles, json, errorMessage, corsHeaders,
} from "../_shared/supabase-admin.ts";

const LIVEMODE = false;
const STRIPE_VERSION = "2026-08-26.dahlia";

function stripeKey() {
  const k = Deno.env.get("STRIPE_SECRET_KEY_TEST") || "";
  if (!k || !k.startsWith("sk_test")) throw new Error("Stripe test key not configured (STRIPE_SECRET_KEY_TEST).");
  return k;
}
async function stripeForm(path: string, form: Record<string, string>, idem?: string) {
  const headers: Record<string, string> = { Authorization: `Bearer ${stripeKey()}`, "Content-Type": "application/x-www-form-urlencoded" };
  if (idem) headers["Idempotency-Key"] = idem;
  const res = await fetch(`https://api.stripe.com/v1/${path}`, { method: "POST", headers, body: new URLSearchParams(form).toString() });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `Stripe ${res.status}`);
  return data;
}
async function stripeGetV1(path: string) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, { headers: { Authorization: `Bearer ${stripeKey()}` } });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `Stripe ${res.status}`);
  return data;
}
async function stripeGetV2(path: string) {
  const res = await fetch(`https://api.stripe.com/${path}`, { headers: { Authorization: `Bearer ${stripeKey()}`, "Stripe-Version": STRIPE_VERSION } });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `Stripe ${res.status}`);
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const admin = createAdminClient();
    let authed = false;
    const secret = req.headers.get("x-admin-secret");
    if (secret) {
      const { data: sc } = await admin.from("service_config").select("value").eq("key", "reconcile_secret").maybeSingle();
      authed = !!sc?.value && sc.value === secret;
    }
    if (!authed) {
      const authUser = await requireUser(req, admin);
      const roles = await getUserRoles(authUser.id, admin);
      authed = roles.includes("admin") || roles.includes("dev");
    }
    if (!authed) return json({ error: "Admin access required" }, 403);

    const { action = "preview", creatorId, fundCents } = await req.json().catch(() => ({}));

    // Read-only: the platform Stripe account's names (to check the legal/business name).
    if (action === "account_info") {
      const a = await stripeGetV1("account");
      return json({
        id: a?.id ?? null,
        business_name: a?.business_profile?.name ?? null,
        dashboard_display_name: a?.settings?.dashboard?.display_name ?? null,
        statement_descriptor: a?.settings?.payments?.statement_descriptor ?? null,
        country: a?.country ?? null,
        email: a?.email ?? null,
      });
    }

    if (action === "fund") {
      if (LIVEMODE) return json({ error: "fund is test-mode only" }, 400);
      const charge = await stripeForm("charges", {
        amount: String(Number(fundCents) > 0 ? Number(fundCents) : 10000),
        currency: "usd", source: "tok_bypassPending", description: "FUSE test balance top-up",
      });
      return json({ funded: true, charge_id: charge.id, amount_cents: charge.amount });
    }

    if (!creatorId) return json({ error: "creatorId required" }, 400);

    const { data: policy } = await admin.from("creator_payout_policy").select("*").eq("id", true).maybeSingle();
    const minCents = policy?.min_payout_cents ?? 2500;
    const currency = policy?.currency ?? "usd";

    const nowIso = new Date().toISOString();
    const { data: earnings } = await admin
      .from("creator_earnings").select("id, creator_earning_cents, available_at, payout_id")
      .eq("creator_id", creatorId).is("payout_id", null)
      .in("status", ["available", "pending"]).lte("available_at", nowIso);
    const eligible = (earnings ?? []).filter((e) => Number(e.creator_earning_cents) > 0);
    const amount = eligible.reduce((s, e) => s + Number(e.creator_earning_cents), 0);

    if (action === "preview") {
      return json({ creator_id: creatorId, eligible_count: eligible.length, amount_cents: amount, min_payout_cents: minCents, meets_minimum: amount >= minCents });
    }
    if (action !== "execute") return json({ error: "Invalid action" }, 400);
    if (eligible.length === 0) return json({ error: "No eligible earnings" }, 400);
    if (amount < minCents) return json({ error: `Below minimum payout ($${(minCents / 100).toFixed(2)})`, amount_cents: amount }, 400);

    const { data: acct } = await admin.from("creator_connect_accounts").select("stripe_account_id").eq("user_id", creatorId).eq("livemode", LIVEMODE).maybeSingle();
    if (!acct?.stripe_account_id) return json({ error: "Creator has no connected account" }, 400);
    const liveAcct = await stripeGetV2(`v2/core/accounts/${acct.stripe_account_id}?include=configuration.recipient`);
    const transfersActive = liveAcct?.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status === "active";
    if (!transfersActive) return json({ error: "Creator payouts not enabled on Stripe" }, 400);

    const payoutId = crypto.randomUUID();
    const { data: payout, error: insErr } = await admin
      .from("creator_payouts")
      .insert({ id: payoutId, creator_id: creatorId, livemode: LIVEMODE, currency, amount_cents: amount, earning_count: eligible.length, status: "pending", idempotency_key: payoutId, period_start: nowIso, period_end: nowIso })
      .select().single();
    if (insErr || !payout) throw new Error(insErr?.message || "could not open payout");

    const { data: claimed } = await admin
      .from("creator_earnings").update({ payout_id: payoutId })
      .in("id", eligible.map((e) => e.id)).is("payout_id", null)
      .select("id, creator_earning_cents");
    const claimedAmount = (claimed ?? []).reduce((s, e) => s + Number(e.creator_earning_cents), 0);
    if (!claimed || claimed.length === 0 || claimedAmount <= 0) {
      await admin.from("creator_payouts").update({ status: "failed", failure_reason: "nothing to claim (already paid?)", updated_at: nowIso }).eq("id", payoutId);
      return json({ error: "Earnings already claimed by another payout", payout_id: payoutId }, 409);
    }

    let transfer: any;
    try {
      transfer = await stripeForm("transfers", { amount: String(claimedAmount), currency, destination: acct.stripe_account_id, "metadata[fuse_payout_id]": payoutId, "metadata[fuse_creator_id]": creatorId }, payoutId);
    } catch (e) {
      await admin.from("creator_earnings").update({ payout_id: null }).eq("payout_id", payoutId);
      await admin.from("creator_payouts").update({ status: "failed", amount_cents: claimedAmount, failure_reason: String((e as any)?.message ?? e), updated_at: nowIso }).eq("id", payoutId);
      return json({ error: `Transfer failed: ${(e as any)?.message ?? e}`, payout_id: payoutId }, 502);
    }

    await admin.from("creator_earnings").update({ status: "paid", paid_at: nowIso }).eq("payout_id", payoutId);
    await admin.from("creator_payouts").update({ status: "transferred", amount_cents: claimedAmount, stripe_transfer_id: transfer.id, transfer_created_at: nowIso, updated_at: nowIso }).eq("id", payoutId);

    return json({ payout_id: payoutId, status: "transferred", stripe_transfer_id: transfer.id, amount_cents: claimedAmount, earning_count: claimed.length });
  } catch (e) {
    return json({ error: errorMessage(e) }, 500);
  }
});
