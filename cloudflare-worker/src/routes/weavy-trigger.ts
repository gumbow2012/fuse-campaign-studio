import { Env } from "../types";
import { verifyToken } from "../auth";
import { updateProjectStatus } from "../supabase";
import { triggerWeavyRecipe } from "../weavy";

/**
 * POST /weavy/trigger
 * Accepts { projectId, recipeId, inputs } and triggers the Weavy recipe.
 * Firebase token exchange happens server-side in weavy.ts.
 */
export async function handleWeavyTrigger(request: Request, env: Env): Promise<Response> {
  const userId = await verifyToken(request, env);

  const body = await request.json() as {
    projectId: string;
    recipeId: string;
    inputs: Record<string, string>;
  };

  if (!body.projectId || !body.recipeId) {
    return Response.json({ error: "projectId and recipeId are required" }, { status: 400 });
  }

  console.log(`[weavy/trigger] user=${userId} project=${body.projectId} recipe=${body.recipeId}`);

  try {
    const { runId } = await triggerWeavyRecipe(env, body.recipeId, body.inputs || {});

    await updateProjectStatus(env, body.projectId, "running", {
      weavy_run_id: runId,
      started_at: new Date().toISOString(),
      debug_trace: {
        weavy_recipe_id: body.recipeId,
        weavy_run_id: runId,
        inputs: body.inputs,
        triggered_via: "cf_worker",
      },
    });

    return Response.json({ weavyRunId: runId, status: "running" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[weavy/trigger] error: ${msg}`);

    await updateProjectStatus(env, body.projectId, "failed", {
      error: msg.slice(0, 5000),
      failed_at: new Date().toISOString(),
      failed_source: "weavy_trigger",
    });

    return Response.json({ error: msg, status: "failed" }, { status: 500 });
  }
}
