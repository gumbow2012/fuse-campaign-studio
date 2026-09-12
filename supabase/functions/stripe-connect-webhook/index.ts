// stripe-connect-webhook — Stripe Connect webhook. Public; verifies the Stripe-Signature (HMAC).
// - Connected-account payout.paid/failed  -> confirms the balance->BANK stage on creator_payouts.
// - account.* / v2 account events          -> re-syncs the connect account status from Stripe (truth).
// Setup (owner): register a Connect webhook endpoint at this function's URL in the Stripe
// dashboard of the Connect account and add its signing secret as the Supabase edge secret
// STRIPE_CONNECT_WEBHOOK_SECRET_LIVE (test mode falls back to STRIPE_WEBHOOK_SECRET_TEST).
import { createAdminClient, json, corsHeaders } from "../_shared/supabase-admin.ts";

const STRIPE_VERSION = "2026-08-26.dahlia";

async function verifySig(payload: string, header: string, secret: string): Promise<boolean> {
  const parts: Record<string, string> = {};
  for (const kv of header.split(",")) { const [k, v] = kv.split("="); if (k && v) parts[k.trim()] = v.trim(); }
  const t = parts["t"]; const v1 = parts["v1"];
  if (!t || !v1) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${payload}`));
  const expected = Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, "0")).join("");
  if (expected.length !== v1.length) return false;
  let diff = 0; for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ v1.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const admin = createAdminClient();
  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET_TEST") || "";
  const sig = req.headers.get("stripe-signature") || "";
  const body = await req.text();
  if (!secret) return json({ error: "webhook secret not configured (STRIPE_WEBHOOK_SECRET_TEST)" }, 500);
  if (!sig || !(await verifySig(body, sig, secret))) return json({ error: "invalid signature" }, 400);

  let event: any; try { event = JSON.parse(body); } catch { return json({ error: "bad json" }, 400); }
  const type = String(event.type || "");
  const acctId = event.account || event.data?.object?.account || event.data?.object?.id || null;

  try {
    if (type === "payout.paid" || type === "payout.failed" || type === "payout.canceled") {
      const status = type === "payout.paid" ? "paid" : "failed";
      const payoutObj = event.data?.object;
      if (acctId) {
        const { data: cca } = await admin.from("creator_connect_accounts").select("user_id").eq("stripe_account_id", acctId).maybeSingle();
        if (cca?.user_id) {
          const { data: row } = await admin.from("creator_payouts").select("id")
            .eq("creator_id", cca.user_id).eq("status", "transferred")
            .order("created_at", { ascending: false }).limit(1).maybeSingle();
          if (row?.id) {
            await admin.from("creator_payouts").update({
              status, stripe_payout_id: payoutObj?.id ?? null,
              paid_at: status === "paid" ? new Date().toISOString() : null,
              failure_reason: status === "failed" ? (payoutObj?.failure_message ?? "bank payout failed") : null,
              updated_at: new Date().toISOString(),
            }).eq("id", row.id);
          }
        }
      }
    }

    if (acctId && (type.startsWith("account.") || type.includes("account["))) {
      const key = Deno.env.get("STRIPE_SECRET_KEY_TEST") || "";
      if (key) {
        const q = "include=configuration.recipient&include=requirements&include=identity";
        const r = await fetch(`https://api.stripe.com/v2/core/accounts/${acctId}?${q}`, { headers: { Authorization: `Bearer ${key}`, "Stripe-Version": STRIPE_VERSION } });
        const a = await r.json();
        if (r.ok) {
          const cap = a?.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status;
          const onboarding = cap === "active" ? "ready" : cap === "pending" ? "verification_pending" : cap === "restricted" ? "restricted" : "action_required";
          await admin.from("creator_connect_accounts").update({
            payouts_enabled: cap === "active", onboarding_status: onboarding,
            requirements: a?.requirements ?? {}, country: a?.identity?.country ?? null,
            last_synced_at: new Date().toISOString(), updated_at: new Date().toISOString(),
          }).eq("stripe_account_id", acctId);
        }
      }
    }

    return json({ received: true, type });
  } catch (e) {
    return json({ received: true, note: String((e as any)?.message ?? e) });
  }
});
