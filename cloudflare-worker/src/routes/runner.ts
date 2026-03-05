/**
 * POST /api/enqueue — accepts { projectId }, kicks off the job runner.
 * GET /api/projects/:id — returns job status, progress, logs, result_url.
 *
 * The runner executes template steps, updates progress/logs in DB,
 * uploads final output to R2, and marks complete/failed.
 */

import { Env } from "../types";
import { verifyToken } from "../auth";
import { supabaseFetch, updateProjectStatus, getProject, getTemplate } from "../supabase";
import { triggerWeavyRecipe, getWeavyRunStatus } from "../weavy";

/* ── Helpers ── */

async function appendLog(env: Env, projectId: string, message: string) {
  const project = await getProject(env, projectId);
  const logs: string[] = (project?.logs as string[]) ?? [];
  logs.push(`[${new Date().toISOString()}] ${message}`);
  await supabaseFetch(env, `/projects?id=eq.${projectId}`, {
    method: "PATCH",
    body: { logs },
  });
}

async function setProgress(env: Env, projectId: string, progress: number, log?: string) {
  const update: Record<string, unknown> = { progress };
  if (log) {
    const project = await getProject(env, projectId);
    const logs: string[] = (project?.logs as string[]) ?? [];
    logs.push(`[${new Date().toISOString()}] ${log}`);
    update.logs = logs;
  }
  await supabaseFetch(env, `/projects?id=eq.${projectId}`, {
    method: "PATCH",
    body: update,
  });
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/* ── GET /api/projects/:id — Job status ── */

export async function handleProjectStatus(request: Request, env: Env, projectId: string): Promise<Response> {
  const userId = await verifyToken(request, env);

  const project = await getProject(env, projectId);
  if (!project || project.user_id !== userId) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  const outputs = project.outputs as { items?: { type: string; url: string; label?: string }[] } | null;
  const resultUrl = outputs?.items?.[0]?.url ?? null;

  return Response.json({
    status: project.status,
    progress: (project as any).progress ?? 0,
    logs: (project as any).logs ?? [],
    attempts: (project as any).attempts ?? 0,
    maxAttempts: (project as any).max_attempts ?? 3,
    result_url: resultUrl,
    outputs: outputs ?? null,
    error: project.error ?? null,
  });
}

/* ── POST /api/enqueue — Trigger job execution ── */

export async function handleEnqueue(request: Request, env: Env): Promise<Response> {
  // Accept service calls (from edge function) or authenticated users
  const isServiceCall = request.headers.get("X-Service-Call") === "true";
  if (!isServiceCall) {
    await verifyToken(request, env);
  }

  const body = await request.json() as { projectId: string };
  if (!body.projectId) {
    return Response.json({ error: "projectId required" }, { status: 400 });
  }

  // Fire and forget — run the job asynchronously
  // Using waitUntil would be ideal but for Workers we just run inline
  const ctx = { waitUntil: (p: Promise<unknown>) => p.catch(console.error) };

  ctx.waitUntil(runJob(env, body.projectId));

  return Response.json({ queued: true, projectId: body.projectId });
}

/* ── Job Runner ── */

async function runJob(env: Env, projectId: string) {
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await supabaseFetch(env, `/projects?id=eq.${projectId}`, {
        method: "PATCH",
        body: { status: "running", attempts: attempt, started_at: new Date().toISOString() },
      });

      await setProgress(env, projectId, 5, `Attempt ${attempt}/${maxAttempts} — starting`);

      // Load project + template
      const project = await getProject(env, projectId);
      if (!project) throw new Error("Project not found");

      const template = await getTemplate(env, project.template_id as string);
      if (!template) throw new Error("Template not found");

      const recipeId = template.weavy_recipe_id as string;
      if (!recipeId) throw new Error("Template has no weavy_recipe_id");

      const inputs = (project.inputs as Record<string, string>) || {};

      await setProgress(env, projectId, 15, "Inputs validated");

      // Trigger Weavy recipe
      await setProgress(env, projectId, 25, `Submitting to AI pipeline (recipe: ${recipeId})`);
      const { runId } = await triggerWeavyRecipe(env, recipeId, inputs);

      await supabaseFetch(env, `/projects?id=eq.${projectId}`, {
        method: "PATCH",
        body: { weavy_run_id: runId },
      });

      await setProgress(env, projectId, 35, `AI pipeline submitted (runId: ${runId})`);

      // Poll for completion
      let pollCount = 0;
      const maxPolls = 120; // ~10 minutes at 5s intervals

      while (pollCount < maxPolls) {
        await sleep(5000);
        pollCount++;

        const progressPct = Math.min(35 + Math.floor((pollCount / maxPolls) * 55), 90);
        await setProgress(env, projectId, progressPct, `Polling AI pipeline... (${pollCount})`);

        try {
          const weavyStatus = await getWeavyRunStatus(env, recipeId, runId);
          const statusData = Array.isArray(weavyStatus) ? weavyStatus[0] : weavyStatus;
          const wStatus = (statusData?.status || "running").toLowerCase();

          if (wStatus === "completed" || wStatus === "complete" || wStatus === "succeeded") {
            // Extract outputs
            const rawOutputs = statusData?.results || statusData?.outputs || [];
            const items: { type: string; url: string }[] = [];

            for (const out of (Array.isArray(rawOutputs) ? rawOutputs : [rawOutputs])) {
              const url = out?.url || out?.output_url || out?.value;
              if (url) {
                const isVideo = /\.(mp4|mov|webm)/i.test(url) || out?.type === "video";
                items.push({ type: isVideo ? "video" : "image", url });
              }
            }

            await setProgress(env, projectId, 95, "AI pipeline complete — saving results");

            // Upload to R2 if we have outputs
            const finalItems: { type: string; url: string }[] = [];
            for (const item of items) {
              try {
                const res = await fetch(item.url);
                if (res.ok && res.body) {
                  const ext = item.type === "video" ? "mp4" : "png";
                  const key = `outputs/${projectId}/${Date.now()}.${ext}`;
                  await env.ASSETS.put(key, res.body, {
                    httpMetadata: { contentType: item.type === "video" ? "video/mp4" : "image/png" },
                  });
                  const workerUrl = `https://shiny-rice-e95bfuse-api.kade-fc1.workers.dev`;
                  finalItems.push({ type: item.type, url: `${workerUrl}/assets/${encodeURIComponent(key)}` });
                } else {
                  finalItems.push(item); // Keep original URL as fallback
                }
              } catch {
                finalItems.push(item); // Keep original URL as fallback
              }
            }

            await updateProjectStatus(env, projectId, "complete", {
              completed_at: new Date().toISOString(),
              outputs: { items: finalItems },
              progress: 100,
            });
            await appendLog(env, projectId, "✅ Job complete — results saved to storage");
            return;
          }

          if (wStatus === "failed" || wStatus === "error") {
            throw new Error(statusData?.error || "AI pipeline returned failure");
          }
        } catch (pollErr) {
          const msg = pollErr instanceof Error ? pollErr.message : String(pollErr);
          if (msg.includes("AI pipeline returned failure")) throw pollErr;
          // Otherwise just log and continue polling
          console.error(`[runner] poll error (will retry): ${msg}`);
        }
      }

      throw new Error("Timed out waiting for AI pipeline after 10 minutes");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await appendLog(env, projectId, `❌ Attempt ${attempt} failed: ${msg}`);

      if (attempt >= maxAttempts) {
        await updateProjectStatus(env, projectId, "failed", {
          error: msg.slice(0, 5000),
          failed_at: new Date().toISOString(),
          failed_source: "job_runner",
          progress: 0,
        });
        await appendLog(env, projectId, `🛑 All ${maxAttempts} attempts exhausted`);
        return;
      }

      // Wait before retry
      const delay = Math.min(3000 * Math.pow(2, attempt - 1), 20000);
      await appendLog(env, projectId, `Waiting ${delay}ms before retry...`);
      await sleep(delay);
    }
  }
}
