// reverse-creator-earning — reverse a creator earning when its run is refunded or disputed.
// Auth: scheduled-job secret (x-admin-secret) OR admin/dev JWT. Marks the earning 'reversed'.
// If it was already PAID (a transfer was sent), we flag clawback_needed — a sent transfer can't
// be silently pulled back; it's recorded for manual reconciliation / negative-balance recovery.
import { createAdminClient, requireUser, getUserRoles, json, errorMessage, corsHeaders } from "../_shared/supabase-admin.ts";

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
      const u = await requireUser(req, admin);
      const roles = await getUserRoles(u.id, admin);
      authed = roles.includes("admin") || roles.includes("dev");
    }
    if (!authed) return json({ error: "Admin access required" }, 403);

    const { campaignRunId, earningId, reason } = await req.json().catch(() => ({}));
    if (!campaignRunId && !earningId) return json({ error: "campaignRunId or earningId required" }, 400);

    let q = admin.from("creator_earnings").select("*");
    q = earningId ? q.eq("id", earningId) : q.eq("campaign_run_id", campaignRunId);
    const { data: earning } = await q.maybeSingle();
    if (!earning) return json({ error: "Earning not found" }, 404);
    if (earning.status === "reversed") {
      return json({ status: "reversed", already: true, earning_id: earning.id });
    }

    const wasPaid = earning.status === "paid" && !!earning.payout_id;
    const nowIso = new Date().toISOString();
    await admin.from("creator_earnings")
      .update({ status: "reversed", reversed_at: nowIso, reversal_reason: reason || "refund/dispute" })
      .eq("id", earning.id);

    return json({
      status: "reversed",
      earning_id: earning.id,
      amount_cents: earning.creator_earning_cents,
      was_paid: wasPaid,
      clawback_needed: wasPaid,
      note: wasPaid
        ? "Earning was already paid out — the transfer can't be auto-reversed; recorded for manual clawback / negative-balance recovery."
        : "Reversed before payout; the creator does not receive it.",
    });
  } catch (e) {
    return json({ error: errorMessage(e) }, 500);
  }
});
