// process-creator-payout — platform-initiated creator payouts (TEST MODE only).
// Sums a creator's MATURED, unpaid earnings and moves money via a Stripe TRANSFER
// (platform balance -> creator's connected balance). Idempotent per creator per month.
// Payout-ready is verified LIVE from Stripe, never a flag. Auth: scheduled-job secret OR admin/dev JWT.
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
  const headers: Record<string, string> = {
    Authorization: `Bearer ${stripeKey()}`, "Content-Type": "application/x-www-form-urlencoded",
  };
  if (idem) headers["Idempotency-Key"] = idem;
  const res = await fetch(`https://api.stripe.com/v1/${path}`, { method: "POST", headers, body: new URLSearchParams(form).toString() });
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
    // Auth: either the scheduled-job secret (x-admin-secret) OR an admin/dev JWT.
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

    const { action = "preview", creatorId } = await req.json().catch(() => ({}));
    if (!creatorId) return json({ error: "creatorId required" }, 400);

    const { data: policy } = await admin.from("creator_payout_policy").select("*").eq("id", true).maybeSingle();
    const minCents = policy?.min_payout_cents ?? 2500;
    const currency = policy?.currency ?? "usd";

    const nowIso = new Date().toISOString();
    const { data: earnings } = await admin
      .from("creator_earnings")
      .select("id, creator_earning_cents, status, available_at, payout_id")
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

    const { data: acct } = await admin
      .from("creator_connect_accounts").select("stripe_account_id").eq("user_id", creatorId).eq("livemode", LIVEMODE).maybeSingle();
    if (!acct?.stripe_account_id) return json({ error: "Creator has no connected account" }, 400);
    const liveAcct = await stripeGetV2(`v2/core/accounts/${acct.stripe_account_id}?include=configuration.recipient`);
    const transfersActive = liveAcct?.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status === "active";
    if (!transfersActive) return json({ error: "Creator payouts not enabled on Stripe" }, 400);

    const period = nowIso.slice(0, 7);
    const idemKey = `payout-${creatorId}-${LIVEMODE}-${period}`;
    const periodStart = eligible.reduce((min, e) => (e.available_at && e.available_at < min ? e.available_at : min), nowIso);

    const { data: payout, error: insErr } = await admin
      .from("creator_payouts")
      .insert({ creator_id: creatorId, livemode: LIVEMODE, currency, amount_cents: amount, earning_count: eligible.length, status: "pending", idempotency_key: idemKey, period_start: periodStart, period_end: nowIso })
      .select().single();
    if (insErr) {
      const { data: existingP } = await admin.from("creator_payouts").select("*").eq("idempotency_key", idemKey).maybeSingle();
      if (existingP) return json({ payout_id: existingP.id, status: existingP.status, stripe_transfer_id: existingP.stripe_transfer_id, amount_cents: existingP.amount_cents, idempotent: true });
      throw new Error(insErr.message);
    }

    let transfer: any;
    try {
      transfer = await stripeForm("transfers", { amount: String(amount), currency, destination: acct.stripe_account_id, "metadata[fuse_payout_id]": payout.id, "metadata[fuse_creator_id]": creatorId }, idemKey);
    } catch (e) {
      await admin.from("creator_payouts").update({ status: "failed", failure_reason: String((e as any)?.message ?? e), updated_at: nowIso }).eq("id", payout.id);
      return json({ error: `Transfer failed: ${(e as any)?.message ?? e}`, payout_id: payout.id }, 502);
    }

    await admin.from("creator_earnings").update({ status: "paid", paid_at: nowIso, payout_id: payout.id }).in("id", eligible.map((e) => e.id)).is("payout_id", null);
    await admin.from("creator_payouts").update({ status: "transferred", stripe_transfer_id: transfer.id, transfer_created_at: nowIso, updated_at: nowIso }).eq("id", payout.id);

    return json({ payout_id: payout.id, status: "transferred", stripe_transfer_id: transfer.id, amount_cents: amount, earning_count: eligible.length });
  } catch (e) {
    return json({ error: errorMessage(e) }, 500);
  }
});
