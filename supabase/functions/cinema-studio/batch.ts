// FUSE CINEMA — token-gated preview batch runner.
//
// SCOPE: this file ONLY drives handlePreviewGenerate for kind="still". It never
// generates loops/video, never touches customer credits or billing, and never
// exceeds public.cinema_batch_config.usd_ceiling.
//
// AUTH: a private token in public.cinema_batch_config (NOT a user JWT), so
// pg_cron / a scheduler can call it.

import { createAdminClient, errorMessage, json } from "../_shared/supabase-admin.ts";
import { handlePreviewGenerate } from "./previews.ts";

/** Flat per-still estimate — must match the admin batch UI readout. */
const STILL_USD = 0.05;
const DEFAULT_MAX_ITEMS = 6;
const HARD_MAX_ITEMS = 6;

type QueueRow = {
  id: string;
  preset_id: string;
  category: string;
  name: string | null;
  scene: string | null;
  attempts: number | null;
};

async function readSpend(admin: ReturnType<typeof createAdminClient>) {
  const { data, error } = await admin.from("cinema_batch_spend").select("usd");
  if (error) throw new Error(error.message);
  return (data ?? []).reduce((sum: number, row: any) => sum + Number(row?.usd ?? 0), 0);
}

export async function handleBatchRun(body: any) {
  const admin = createAdminClient();

  const { data: config, error: configError } = await admin
    .from("cinema_batch_config")
    .select("token, enabled, usd_ceiling")
    .limit(1)
    .maybeSingle();
  if (configError) throw new Error(configError.message);

  const token = typeof body?.token === "string" ? body.token : "";
  if (!config?.token || !token || token !== config.token) {
    return json({ error: "unauthorized" }, 401);
  }

  const dryRun = body?.dryRun === true;
  if (config.enabled !== true && !dryRun) {
    return json({ skipped: "disabled" });
  }

  const ceiling = Number(config.usd_ceiling ?? 0);
  const spentStart = await readSpend(admin);
  const remainingBudget = ceiling - spentStart;
  if (remainingBudget <= 0) {
    return json({ done: true, reason: "ceiling", spent: spentStart });
  }

  const requested = Number(body?.maxItems);
  const maxItems = Number.isFinite(requested) && requested > 0
    ? Math.min(Math.floor(requested), HARD_MAX_ITEMS)
    : DEFAULT_MAX_ITEMS;
  const limit = Math.max(0, Math.min(maxItems, Math.floor(remainingBudget / STILL_USD)));

  const { data: pendingRows, error: pendingError } = await admin
    .from("cinema_batch_queue")
    .select("id, preset_id, category, name, scene, attempts")
    .eq("status", "pending")
    .eq("kind", "still")
    .order("created_at", { ascending: true })
    .limit(Math.max(limit, 1));
  if (pendingError) throw new Error(pendingError.message);

  if (dryRun) {
    const { count } = await admin
      .from("cinema_batch_queue")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
      .eq("kind", "still");
    return json({
      dryRun: true,
      pendingStills: count ?? 0,
      spent: spentStart,
      remainingBudget,
      wouldProcess: limit,
    });
  }

  const rows = (pendingRows ?? []).slice(0, limit) as QueueRow[];
  let processed = 0;
  let done = 0;
  let failed = 0;
  let skipped = 0;
  let spent = spentStart;

  for (const row of rows) {
    try {
      const response = await handlePreviewGenerate({
        presetId: row.preset_id,
        category: row.category,
        name: row.name ?? undefined,
        scene: row.scene ?? undefined,
        kind: "still",
      });
      const result = await response.json().catch(() => ({}));

      if (result?.error) throw new Error(String(result.error));

      if (result?.skipped === true) {
        skipped += 1;
        await admin
          .from("cinema_batch_queue")
          .update({
            status: "done",
            generated_src: result?.src ?? null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", row.id);
      } else if (result?.src) {
        done += 1;
        await admin
          .from("cinema_batch_queue")
          .update({
            status: "done",
            generated_src: result.src,
            updated_at: new Date().toISOString(),
          })
          .eq("id", row.id);
        await admin
          .from("cinema_batch_spend")
          .insert({ preset_id: row.preset_id, kind: "still", usd: STILL_USD });
      } else {
        throw new Error("Preview generation returned no image");
      }
    } catch (error) {
      failed += 1;
      await admin
        .from("cinema_batch_queue")
        .update({
          status: "failed",
          error: errorMessage(error).slice(0, 2000),
          attempts: Number(row.attempts ?? 0) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
    }

    processed += 1;
    spent = await readSpend(admin);
    if (spent >= ceiling) break;
  }

  const { count: pendingRemaining } = await admin
    .from("cinema_batch_queue")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending")
    .eq("kind", "still");

  return json({
    processed,
    done,
    failed,
    skipped,
    spent,
    remainingBudget: ceiling - spent,
    pendingRemaining: pendingRemaining ?? 0,
  });
}
