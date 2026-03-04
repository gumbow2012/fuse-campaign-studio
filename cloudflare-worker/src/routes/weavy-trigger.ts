import { Env } from "../types";
import { verifyToken } from "../auth";
import { supabaseFetch, updateProjectStatus, getTemplate } from "../supabase";
import { weavyRun } from "../weavy";

/**
 * POST /weavy/trigger
 * Accepts { recipeId, imageUrl } — handles credits, project creation, and
 * Weavy trigger all in one call. Firebase token exchange happens server-side.
 */
export async function handleWeavyTrigger(request: Request, env: Env): Promise<Response> {
  const userId = await verifyToken(request, env);

  const body = await request.json() as {
    recipeId: string;
    imageUrl: string;
  };

  if (!body.recipeId || !body.imageUrl) {
    return Response.json({ error: "recipeId and imageUrl are required" }, { status: 400 });
  }

  console.log(`[weavy/trigger] user=${userId} recipe=${body.recipeId}`);

  // ── Look up template by weavy_recipe_id ──
  const tplRes = await supabaseFetch(env, `/templates?weavy_recipe_id=eq.${body.recipeId}&is_active=eq.true&select=*&limit=1`);
  if (!tplRes.ok) {
    return Response.json({ error: "Failed to look up template" }, { status: 500 });
  }
  const templates = await tplRes.json() as Record<string, unknown>[];
  const template = templates[0];
  if (!template) {
    return Response.json({ error: `No active template found for recipe ${body.recipeId}` }, { status: 404 });
  }

  const creditCost = (template.estimated_credits_per_run as number) || 0;
  const templateName = (template.name as string) || body.recipeId;
  const templateId = template.id as string;

  // ── Check credits ──
  const profRes = await supabaseFetch(env, `/profiles?user_id=eq.${userId}&select=credits_balance`);
  if (!profRes.ok) throw new Error("Failed to fetch profile");
  const profiles = await profRes.json() as { credits_balance: number }[];
  const profile = profiles[0];
  if (!profile) {
    return Response.json({ error: "Profile not found" }, { status: 404 });
  }
  if (creditCost > 0 && profile.credits_balance < creditCost) {
    return Response.json(
      { error: `Insufficient credits: have ${profile.credits_balance}, need ${creditCost}` },
      { status: 402 },
    );
  }

  // ── Create project ──
  const projRes = await supabaseFetch(env, "/projects", {
    method: "POST",
    body: {
      user_id: userId,
      template_id: templateId,
      status: "queued",
      inputs: { product_image: body.imageUrl },
    },
    headers: { Prefer: "return=representation" },
  });
  if (!projRes.ok) {
    const txt = await projRes.text();
    return Response.json({ error: `Project creation failed: ${txt}` }, { status: 500 });
  }
  const [project] = await projRes.json() as { id: string }[];

  // ── Deduct credits ──
  if (creditCost > 0) {
    await supabaseFetch(env, `/profiles?user_id=eq.${userId}`, {
      method: "PATCH",
      body: { credits_balance: profile.credits_balance - creditCost },
    });

    await supabaseFetch(env, "/credit_ledger", {
      method: "POST",
      body: {
        user_id: userId,
        type: "run_template",
        amount: -creditCost,
        template_id: templateId,
        project_id: project.id,
        description: `Run template: ${templateName}`,
      },
    });
  }

  // ── Trigger Weavy ──
  try {
    const weavy = await weavyRun(env, body.recipeId, { product_image: body.imageUrl });

    await updateProjectStatus(env, project.id, "running", {
      weavy_run_id: weavy.id,
      started_at: new Date().toISOString(),
      debug_trace: {
        weavy_recipe_id: body.recipeId,
        weavy_run_id: weavy.id,
        inputs: { product_image: body.imageUrl },
        triggered_via: "cf_worker",
      },
    });

    return Response.json({ projectId: project.id, weavyRunId: weavy.id, status: "running" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[weavy/trigger] error: ${msg}`);

    await updateProjectStatus(env, project.id, "failed", {
      error: msg.slice(0, 5000),
      failed_at: new Date().toISOString(),
      failed_source: "weavy_trigger",
    });

    return Response.json({ projectId: project.id, error: msg, status: "failed" }, { status: 500 });
  }
}
