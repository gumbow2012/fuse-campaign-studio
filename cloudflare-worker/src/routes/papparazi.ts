import { Env } from "../types";
import { verifyToken } from "../auth";
import { supabaseFetch, updateProjectStatus, getProject, getTemplate } from "../supabase";
import { weavyRun, weavyStatus } from "../weavy";

/**
 * POST /api/upload
 * Accepts a multipart form file, stores it in R2, returns the proxied URL.
 */
export async function handleUpload(request: Request, env: Env): Promise<Response> {
  const userId = await verifyToken(request, env);

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  if (!file) {
    return Response.json({ error: "No file provided" }, { status: 400 });
  }

  const ext = file.name.split(".").pop() || "png";
  const key = `uploads/${userId}/${Date.now()}.${ext}`;

  await env.ASSETS.put(key, file.stream(), {
    httpMetadata: { contentType: file.type || "image/png" },
  });

  // Return worker-proxied URL
  const workerUrl = new URL(request.url).origin;
  const imageUrl = `${workerUrl}/assets/${encodeURIComponent(key)}`;

  console.log(`[upload] stored key=${key} for user=${userId}`);

  return Response.json({ imageUrl, key });
}

/**
 * POST /api/run-template
 * Creates a project, deducts credits, triggers Weavy recipe.
 */
export async function handleRunTemplate(request: Request, env: Env): Promise<Response> {
  const userId = await verifyToken(request, env);
  const body = await request.json() as {
    templateId: string;
    inputs: Record<string, string>;
  };

  if (!body.templateId) {
    return Response.json({ error: "templateId is required" }, { status: 400 });
  }

  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.templateId);

  let recipeId: string;
  let creditCost = 0;
  let templateName = body.templateId;
  let supabaseTemplateId: string | null = null;

  if (isUUID) {
    // Supabase template lookup
    const template = await getTemplate(env, body.templateId);
    if (!template) {
      return Response.json({ error: "Template not found" }, { status: 404 });
    }
    recipeId = template.weavy_recipe_id as string;
    if (!recipeId) {
      return Response.json({ error: "Template has no weavy_recipe_id" }, { status: 400 });
    }
    creditCost = (template.estimated_credits_per_run as number) || 0;
    templateName = (template.name as string) || body.templateId;
    supabaseTemplateId = body.templateId;
  } else {
    // Direct Weavy recipe ID (e.g. "dvgEXt4aeShCeokMq5MIpZ")
    recipeId = body.templateId;

    // Try to find matching Supabase template by weavy_recipe_id for credit tracking
    const tplRes = await supabaseFetch(env, `/templates?weavy_recipe_id=eq.${recipeId}&select=*&limit=1`);
    if (tplRes.ok) {
      const rows = await tplRes.json() as Record<string, unknown>[];
      if (rows[0]) {
        creditCost = (rows[0].estimated_credits_per_run as number) || 0;
        templateName = (rows[0].name as string) || recipeId;
        supabaseTemplateId = rows[0].id as string;
      }
    }
  }

  console.log(`[run-template] recipeId=${recipeId} creditCost=${creditCost} inputKeys=${Object.keys(body.inputs || {})}`);

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

  // ── Create project row ──
  // Use supabaseTemplateId if available; otherwise we need a fallback template row
  const projectTemplateId = supabaseTemplateId;
  if (!projectTemplateId) {
    return Response.json(
      { error: `No matching template found in DB for recipe ${recipeId}. Create a template row with weavy_recipe_id = "${recipeId}".` },
      { status: 400 },
    );
  }

  const projRes = await supabaseFetch(env, "/projects", {
    method: "POST",
    body: {
      user_id: userId,
      template_id: projectTemplateId,
      status: "queued",
      inputs: body.inputs,
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
        template_id: projectTemplateId,
        project_id: project.id,
        description: `Run template: ${templateName}`,
      },
    });
  }

  // ── Trigger Weavy ──
  try {
    const weavy = await weavyRun(env, recipeId, body.inputs);

    await updateProjectStatus(env, project.id, "running", {
      weavy_run_id: weavy.id,
      started_at: new Date().toISOString(),
      debug_trace: {
        weavy_recipe_id: recipeId,
        weavy_run_id: weavy.id,
        inputs: body.inputs,
      },
    });

    return Response.json({ jobId: project.id, status: "running", weavyRunId: weavy.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[papparazi] Weavy trigger error: ${msg}`);

    await updateProjectStatus(env, project.id, "failed", {
      error: msg.slice(0, 5000),
      failed_at: new Date().toISOString(),
      failed_source: "weavy_trigger",
    });

    return Response.json({ jobId: project.id, status: "failed", error: msg }, { status: 500 });
  }
}

/**
 * GET /api/job/:jobId
 * Returns the current job status. If running, polls Weavy for updates.
 */
export async function handleJobStatus(request: Request, env: Env, jobId: string): Promise<Response> {
  const userId = await verifyToken(request, env);

  const project = await getProject(env, jobId);
  if (!project || project.user_id !== userId) {
    return Response.json({ error: "Job not found" }, { status: 404 });
  }

  // If already terminal, return immediately
  if (project.status === "complete" || project.status === "failed") {
    const outputs = project.outputs as { items?: { type: string; url: string }[] } | null;
    return Response.json({
      status: project.status,
      outputImageUrl: outputs?.items?.find((i: any) => i.type === "image")?.url ?? null,
      outputVideoUrl: outputs?.items?.find((i: any) => i.type === "video")?.url ?? null,
      error: project.error ?? undefined,
    });
  }

  // If running with a weavy_run_id, poll Weavy
  if (project.status === "running" && project.weavy_run_id) {
    try {
      const ws = await weavyStatus(env, project.weavy_run_id as string);
      console.log(`[papparazi] Weavy status for ${jobId}:`, JSON.stringify(ws));

      // Normalize status (Weavy varies between status/state)
      const wStatus = ((ws.status || ws.state || "running") as string).toLowerCase();

      if (wStatus === "completed" || wStatus === "complete" || wStatus === "succeeded" || wStatus === "success") {
        // Extract outputs from result or outputs field
        const rawOutputs = ws.outputs || ws.result || [];
        const items: { type: string; url: string }[] = [];

        for (const out of (Array.isArray(rawOutputs) ? rawOutputs : [rawOutputs])) {
          if (!out) continue;
          const url = (out as any)?.url || (out as any)?.output_url || (out as any)?.value;
          if (url) {
            const isVideo = /\.(mp4|mov|webm)/i.test(url) || (out as any)?.type === "video";
            items.push({ type: isVideo ? "video" : "image", url });
          }
        }

        await updateProjectStatus(env, jobId, "complete", {
          completed_at: new Date().toISOString(),
          outputs: { items },
        });

        return Response.json({
          status: "succeeded",
          outputImageUrl: items.find(i => i.type === "image")?.url ?? null,
          outputVideoUrl: items.find(i => i.type === "video")?.url ?? null,
        });
      }

      if (wStatus === "failed" || wStatus === "error") {
        const errMsg = ws.error || ws.message || "Weavy job failed";
        await updateProjectStatus(env, jobId, "failed", {
          error: errMsg,
          failed_at: new Date().toISOString(),
          failed_source: "weavy_run",
        });

        return Response.json({ status: "failed", error: errMsg });
      }

      // Still running
      return Response.json({
        status: "running",
        progress: ws.progress ?? undefined,
      });
    } catch (err) {
      console.error(`[papparazi] status poll error: ${err}`);
      // Don't fail — just return current DB status
    }
  }

  return Response.json({ status: project.status });
}
