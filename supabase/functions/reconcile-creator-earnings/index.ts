// reconcile-creator-earnings — off-hot-path engine that turns credit SPENDS into creator
// earnings using source-exact FIFO lots. For each unprocessed spend it draws the customer's
// oldest lots first, values only cash-backed (paid/subscription) credits, and — when the
// spent template belongs to a creator (created_by has creator_economics) and at least one
// cash-backed credit was used — records a snapshotted creator_earnings row (pending, held).
// Idempotent: a spend is processed once (keyed by ledger id); earnings unique per spend.
import {
  createAdminClient, requireUser, getUserRoles, json, errorMessage, corsHeaders,
} from "../_shared/supabase-admin.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const admin = createAdminClient();
    const user = await requireUser(req, admin);
    const roles = await getUserRoles(user.id, admin);
    if (!roles.includes("admin") && !roles.includes("dev")) return json({ error: "Admin access required" }, 403);

    const { action = "preview", limit = 200 } = await req.json().catch(() => ({}));
    const dry = action !== "run";

    const { data: policy } = await admin.from("creator_payout_policy").select("hold_days").eq("id", true).maybeSingle();
    const holdMs = (policy?.hold_days ?? 7) * 24 * 60 * 60 * 1000;

    // Unprocessed spends (oldest first). A spend is processed once its ledger id has consumptions.
    const { data: spends } = await admin
      .from("credit_ledger")
      .select("id, user_id, amount, template_id, created_at, type")
      .lt("amount", 0).in("type", ["run_template", "rerun_step"])
      .order("created_at", { ascending: true }).limit(limit);

    let processed = 0, earningsCreated = 0, cashBackedTotalCents = 0, skippedProcessed = 0;
    const samples: any[] = [];

    for (const spend of spends ?? []) {
      const { data: already } = await admin
        .from("credit_lot_consumptions").select("id").eq("ledger_id", spend.id).limit(1);
      if (already && already.length) { skippedProcessed++; continue; }

      let need = -Number(spend.amount);
      const { data: lots } = await admin
        .from("credit_lots").select("*").eq("user_id", spend.user_id).gt("credits_remaining", 0)
        .order("created_at", { ascending: true });

      const draws: any[] = [];
      let cashCents = 0, cashCredits = 0;
      for (const lot of lots ?? []) {
        if (need <= 0) break;
        const take = Math.min(need, Number(lot.credits_remaining));
        if (take <= 0) continue;
        draws.push({ lot, take });
        if (lot.is_cash_backed) { cashCents += take * Number(lot.cents_per_credit); cashCredits += take; }
        need -= take;
      }

      // creator behind the template (only creator-owned templates earn)
      let creatorId: string | null = null, shareBps = 0, econVersion = 1;
      if (spend.template_id) {
        const { data: tmpl } = await admin.from("fuse_templates").select("created_by").eq("id", spend.template_id).maybeSingle();
        if (tmpl?.created_by) {
          const { data: econ } = await admin.from("creator_economics").select("share_bps").eq("user_id", tmpl.created_by).maybeSingle();
          if (econ) { creatorId = tmpl.created_by; shareBps = Number(econ.share_bps); }
        }
      }
      const earningCents = Math.round((cashCents * shareBps) / 10000);
      const eligible = !!creatorId && cashCredits >= 1 && earningCents > 0;

      if (samples.length < 8) samples.push({
        ledger_id: spend.id, credits: -Number(spend.amount), cash_backed_credits: cashCredits,
        cash_backed_cents: Math.round(cashCents), creator: creatorId, earning_cents: eligible ? earningCents : 0,
      });

      if (!dry) {
        // record consumptions + decrement lots (FIFO)
        for (const d of draws) {
          await admin.from("credit_lot_consumptions").insert({
            user_id: spend.user_id, ledger_id: spend.id, campaign_run_id: spend.id, lot_id: d.lot.id,
            credits: d.take, cents_per_credit: d.lot.cents_per_credit, is_cash_backed: d.lot.is_cash_backed,
          });
          await admin.from("credit_lots").update({ credits_remaining: Number(d.lot.credits_remaining) - d.take })
            .eq("id", d.lot.id).gte("credits_remaining", d.take);
        }
        if (eligible) {
          const availableAt = new Date(new Date(spend.created_at).getTime() + holdMs).toISOString();
          const { error: eErr } = await admin.from("creator_earnings").insert({
            creator_id: creatorId, template_id: spend.template_id, campaign_run_id: spend.id, customer_id: spend.user_id,
            base_run_credits: -Number(spend.amount), marketplace_surcharge_credits: 0, total_customer_credits: -Number(spend.amount),
            creator_share_bps: shareBps, fuse_share_bps: 10000 - shareBps,
            creator_royalty_target_cents: earningCents, creator_earning_cents: earningCents,
            fuse_marketplace_revenue_cents: Math.round(cashCents) - earningCents,
            economics_version: econVersion, status: "pending", available_at: availableAt,
          });
          if (!eErr) earningsCreated++; // unique(campaign_run_id) makes this idempotent
        }
      }

      processed++;
      if (eligible) cashBackedTotalCents += earningCents;
    }

    return json({
      mode: dry ? "preview" : "run", spends_seen: (spends ?? []).length,
      processed, skipped_already_processed: skippedProcessed,
      earnings_created: earningsCreated, eligible_earning_cents_total: cashBackedTotalCents, samples,
    });
  } catch (e) {
    return json({ error: errorMessage(e) }, 500);
  }
});
