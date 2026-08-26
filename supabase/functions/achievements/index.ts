/**
 * achievements — auth-required progress engine (additive, no billing).
 *
 * Actions:
 *   { action: "list" }     → read-only definitions + stored progress + summary
 *   { action: "evaluate" } → recompute from REAL data and idempotently unlock
 *
 * NEVER grants credits: no credit_ledger / Stripe / balance code is reachable
 * from here. reward_type/reward_amount are pure config passed to the client.
 */

import {
  corsHeaders,
  createAdminClient,
  errorMessage,
  json,
  requireUser,
} from "../_shared/supabase-admin.ts";
import {
  type AchievementDefinition,
  collectSignals,
  EMPTY_SIGNALS,
  planEvaluation,
  summarize,
  type UserAchievementRow,
} from "../_shared/achievements.ts";

async function isCreatorUser(admin: ReturnType<typeof createAdminClient>, userId: string) {
  const [{ data: profile }, { data: roles }] = await Promise.all([
    admin.from("creator_profiles").select("user_id").eq("user_id", userId).maybeSingle(),
    admin.from("user_roles").select("role").eq("user_id", userId).eq("role", "creator"),
  ]);
  return Boolean(profile) || Boolean((roles ?? []).length);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createAdminClient();

  try {
    const user = await requireUser(req, admin);
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const action = String((body as Record<string, unknown>).action ?? "list");
    if (action !== "list" && action !== "evaluate") {
      return json({ error: `Unknown action: ${action}` }, 400);
    }

    const { data: definitionRows, error: definitionError } = await admin
      .from("achievement_definitions")
      .select(
        "key,title,description,icon,category,tier,audience,criteria,reward_type,reward_amount,action_label,action_url,active,sort_order",
      )
      .eq("active", true)
      .order("sort_order", { ascending: true });
    if (definitionError) throw new Error(definitionError.message);

    const { data: existingRows, error: existingError } = await admin
      .from("user_achievements")
      .select("achievement_key,progress,unlocked_at")
      .eq("user_id", user.id);
    if (existingError) throw new Error(existingError.message);

    const isCreator = await isCreatorUser(admin, user.id);
    const definitions = (definitionRows ?? []) as AchievementDefinition[];
    const existing = (existingRows ?? []) as UserAchievementRow[];

    // "list" is strictly read-only: no signal recomputation writes, no unlocks.
    const signals = action === "evaluate"
      ? await collectSignals(admin, user.id)
      : { ...EMPTY_SIGNALS };

    const plan = planEvaluation({
      userId: user.id,
      definitions,
      existing,
      signals,
      isCreator,
      unlock: action === "evaluate",
    });

    if (action === "evaluate" && plan.upserts.length) {
      const { error: writeError } = await admin
        .from("user_achievements")
        .upsert(plan.upserts, { onConflict: "user_id,achievement_key" });
      if (writeError) throw new Error(writeError.message);
    }

    return json({
      achievements: plan.achievements,
      newlyUnlocked: action === "evaluate" ? plan.newlyUnlocked : [],
      summary: summarize(plan.achievements),
      isCreator,
    });
  } catch (error) {
    const message = errorMessage(error);
    const unauthenticated = /authoriz|authentic|bearer/i.test(message);
    return json({ error: message }, unauthenticated ? 401 : 400);
  }
});
