// auto-creator-payouts — scheduled sweeper that pays every creator whose Stripe
// account is ready and whose available balance clears the minimum payout.
// Auth: scheduled-job secret (service_config.reconcile_secret) OR admin/dev JWT.
// All money movement is delegated to process-creator-payout (single source of truth).
import {
  createAdminClient, requireUser, getUserRoles, json, errorMessage, corsHeaders,
} from "../_shared/supabase-admin.ts";

const MAX_CREATORS_PER_RUN = 50;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const admin = createAdminClient();

    const { data: sc } = await admin
      .from("service_config").select("value").eq("key", "reconcile_secret").maybeSingle();
    const jobSecret = sc?.value ?? null;

    let authed = false;
    const provided = req.headers.get("x-admin-secret");
    if (provided && jobSecret) authed = provided === jobSecret;
    if (!authed) {
      const authUser = await requireUser(req, admin);
      const roles = await getUserRoles(authUser.id, admin);
      authed = roles.includes("admin") || roles.includes("dev");
    }
    if (!authed) return json({ error: "Admin access required" }, 403);
    if (!jobSecret) return json({ error: "reconcile_secret is not configured" }, 500);

    const body = await req.json().catch(() => ({}));
    const dryRun = body?.dry_run === true;

    const { data: policy } = await admin
      .from("creator_payout_policy").select("*").eq("id", true).maybeSingle();
    const minCents = policy?.min_payout_cents ?? 2500;
    if (policy && policy.auto_payouts_enabled === false && !dryRun) {
      return json({ skipped: "automatic payouts disabled", processed: 0, paid: 0 });
    }

    const nowIso = new Date().toISOString();
    const { data: earnings, error: earnErr } = await admin
      .from("creator_earnings")
      .select("creator_id, creator_earning_cents")
      .is("payout_id", null)
      .in("status", ["available", "pending"])
      .lte("available_at", nowIso);
    if (earnErr) throw new Error(earnErr.message);

    const totals = new Map<string, number>();
    for (const row of earnings ?? []) {
      const cents = Number(row.creator_earning_cents);
      if (!row.creator_id || !Number.isFinite(cents) || cents <= 0) continue;
      totals.set(row.creator_id, (totals.get(row.creator_id) ?? 0) + cents);
    }

    const candidates = [...totals.entries()]
      .filter(([, cents]) => cents >= minCents)
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_CREATORS_PER_RUN);

    if (dryRun) {
      return json({
        dry_run: true,
        min_payout_cents: minCents,
        candidates: candidates.map(([creator_id, amount_cents]) => ({ creator_id, amount_cents })),
      });
    }

    const fnUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/process-creator-payout`;
    const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    const results: Array<Record<string, unknown>> = [];
    let paid = 0;
    let paidCents = 0;

    for (const [creatorId, amountCents] of candidates) {
      try {
        const res = await fetch(fnUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: anon,
            Authorization: `Bearer ${anon}`,
            "x-admin-secret": jobSecret,
          },
          body: JSON.stringify({ action: "execute", creatorId }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data?.status === "transferred") {
          paid += 1;
          paidCents += Number(data.amount_cents ?? 0);
          results.push({ creator_id: creatorId, ok: true, payout_id: data.payout_id, amount_cents: data.amount_cents });
        } else {
          // Not an outage: most misses are "payouts not enabled on Stripe" yet.
          results.push({
            creator_id: creatorId,
            ok: false,
            amount_cents: amountCents,
            reason: String(data?.error ?? `HTTP ${res.status}`).slice(0, 500),
          });
        }
      } catch (e) {
        results.push({ creator_id: creatorId, ok: false, reason: errorMessage(e).slice(0, 500) });
      }
    }

    console.log(JSON.stringify({
      job: "auto-creator-payouts", at: nowIso,
      considered: totals.size, attempted: candidates.length, paid, paid_cents: paidCents,
    }));

    return json({
      considered: totals.size,
      attempted: candidates.length,
      paid,
      paid_cents: paidCents,
      min_payout_cents: minCents,
      results,
    });
  } catch (e) {
    return json({ error: errorMessage(e) }, 500);
  }
});
