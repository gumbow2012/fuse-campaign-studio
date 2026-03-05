/**
 * POST /api/enqueue — accepts { projectId }, kicks off the job runner.
 * GET /api/projects/:id — returns job status, progress, logs, result_url.
 *
 * The runner executes template steps by calling external model APIs
 * (fal nano-banana for images, Kling for video), updates progress/logs
 * in DB, uploads final output to R2, and marks complete/failed.
 */

import { Env } from "../types";
import { verifyToken } from "../auth";
import { supabaseFetch, updateProjectStatus, getProject, getTemplate } from "../supabase";

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
  const isServiceCall = request.headers.get("X-Service-Call") === "true";
  if (!isServiceCall) {
    await verifyToken(request, env);
  }

  const body = await request.json() as { projectId: string };
  if (!body.projectId) {
    return Response.json({ error: "projectId required" }, { status: 400 });
  }

  // Fire and forget
  const ctx = { waitUntil: (p: Promise<unknown>) => p.catch(console.error) };
  ctx.waitUntil(runJob(env, body.projectId));

  return Response.json({ queued: true, projectId: body.projectId });
}

/* ══════════════════════════════════════════════════════════════
 *  Step Interpreter — parse template graph, call model APIs
 * ══════════════════════════════════════════════════════════════ */

interface TemplateNode {
  id: string;
  type?: string;
  data?: Record<string, unknown>;
  [k: string]: unknown;
}

interface TemplateEdge {
  source: string;
  target: string;
  [k: string]: unknown;
}

interface StepPlan {
  nodeId: string;
  nodeType: "image_gen" | "video_gen" | "prompt" | "import" | "output" | "unknown";
  modelProvider: "fal" | "kling" | "passthrough";
  label: string;
}

/**
 * Classify a node from the raw_json graph into a step type.
 * This is a heuristic — we look for common node type strings from
 * Weavy-exported graphs and map them to our model providers.
 */
function classifyNode(node: TemplateNode): StepPlan["nodeType"] {
  const t = (node.type || "").toLowerCase();
  const label = ((node.data?.label || node.data?.title || "") as string).toLowerCase();
  const model = ((node.data?.model || node.data?.modelId || "") as string).toLowerCase();

  // Import / file nodes
  if (t.includes("import") || t.includes("file") || t.includes("upload")) return "import";
  // Prompt / text nodes
  if (t.includes("prompt") || t.includes("text") || t === "string") return "prompt";
  // Output nodes
  if (t.includes("output") || t.includes("export") || t.includes("preview")) return "output";

  // Model call nodes — check for known providers
  if (model.includes("kling") || label.includes("kling") || t.includes("kling")) return "video_gen";
  if (model.includes("nano") || model.includes("fal") || label.includes("nano") || label.includes("fal") || t.includes("fal")) return "image_gen";
  // Generic "custom model" or "api" nodes — default to image gen via fal
  if (t.includes("model") || t.includes("api") || t.includes("custom") || t.includes("generate")) return "image_gen";

  return "unknown";
}

function buildStepPlan(nodes: TemplateNode[], edges: TemplateEdge[]): StepPlan[] {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();

  for (const n of nodes) {
    inDegree.set(n.id, 0);
    adj.set(n.id, []);
  }
  for (const e of edges) {
    inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1);
    adj.get(e.source)?.push(e.target);
  }

  // Topological sort
  const queue = [...inDegree.entries()].filter(([, d]) => d === 0).map(([id]) => id);
  const sorted: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    sorted.push(id);
    for (const next of adj.get(id) || []) {
      const d = (inDegree.get(next) || 0) - 1;
      inDegree.set(next, d);
      if (d === 0) queue.push(next);
    }
  }

  const steps: StepPlan[] = [];
  for (const id of sorted) {
    const node = nodeMap.get(id);
    if (!node) continue;
    const nodeType = classifyNode(node);
    const label = (node.data?.label || node.data?.title || node.type || id) as string;
    let modelProvider: StepPlan["modelProvider"] = "passthrough";
    if (nodeType === "image_gen") modelProvider = "fal";
    if (nodeType === "video_gen") modelProvider = "kling";
    steps.push({ nodeId: id, nodeType, modelProvider, label });
  }

  return steps;
}

/* ── Model API Calls ── */

async function callFalNanoBanana(env: Env, inputs: Record<string, string>): Promise<string> {
  const apiKey = env.FAL_API_KEY;
  if (!apiKey) throw new Error("FAL_API_KEY not configured");

  const imageUrl = inputs.image || Object.values(inputs).find((v) => v.startsWith("http"));
  const prompt = inputs.prompt || inputs.text || "professional product photo";

  // Submit to fal queue
  const submitRes = await fetch("https://queue.fal.run/fal-ai/nano-banana-pro/edit", {
    method: "POST",
    headers: {
      Authorization: `Key ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      image_url: imageUrl,
      prompt,
    }),
  });

  if (!submitRes.ok) {
    const txt = await submitRes.text();
    throw new Error(`fal submit failed (${submitRes.status}): ${txt.slice(0, 500)}`);
  }

  const submitData = await submitRes.json() as { request_id?: string; status_url?: string; response_url?: string };
  const requestId = submitData.request_id;
  const statusUrl = submitData.status_url || `https://queue.fal.run/fal-ai/nano-banana-pro/edit/requests/${requestId}/status`;
  const responseUrl = submitData.response_url || `https://queue.fal.run/fal-ai/nano-banana-pro/edit/requests/${requestId}`;

  // Poll for completion
  for (let i = 0; i < 120; i++) {
    await sleep(5000);
    const statusRes = await fetch(statusUrl, {
      headers: { Authorization: `Key ${apiKey}` },
    });
    if (!statusRes.ok) continue;
    const status = await statusRes.json() as { status: string };
    if (status.status === "COMPLETED") {
      const resultRes = await fetch(responseUrl, {
        headers: { Authorization: `Key ${apiKey}` },
      });
      const result = await resultRes.json() as { images?: { url: string }[]; image?: { url: string } };
      return result.images?.[0]?.url || result.image?.url || "";
    }
    if (status.status === "FAILED") throw new Error("fal job failed");
  }
  throw new Error("fal job timed out after 10 minutes");
}

async function callKling(env: Env, inputs: Record<string, string>): Promise<string> {
  const apiKey = env.KLING_API_KEY;
  if (!apiKey) throw new Error("KLING_API_KEY not configured");

  const imageUrl = inputs.image || Object.values(inputs).find((v) => v.startsWith("http"));
  const prompt = inputs.prompt || inputs.text || "cinematic product video";

  // Submit to Kling API
  const submitRes = await fetch("https://api.klingai.com/v1/videos/image2video", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model_name: "kling-v1",
      image: imageUrl,
      prompt,
      duration: "5",
      mode: "std",
    }),
  });

  if (!submitRes.ok) {
    const txt = await submitRes.text();
    throw new Error(`Kling submit failed (${submitRes.status}): ${txt.slice(0, 500)}`);
  }

  const submitData = await submitRes.json() as { data?: { task_id: string } };
  const taskId = submitData.data?.task_id;
  if (!taskId) throw new Error("Kling: no task_id returned");

  // Poll for completion
  for (let i = 0; i < 180; i++) {
    await sleep(10000);
    const statusRes = await fetch(`https://api.klingai.com/v1/videos/image2video/${taskId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!statusRes.ok) continue;
    const status = await statusRes.json() as {
      data?: { task_status: string; task_result?: { videos?: { url: string }[] } };
    };
    const taskStatus = status.data?.task_status;
    if (taskStatus === "succeed") {
      return status.data?.task_result?.videos?.[0]?.url || "";
    }
    if (taskStatus === "failed") throw new Error("Kling job failed");
  }
  throw new Error("Kling job timed out after 30 minutes");
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

      const inputs = (project.inputs as Record<string, string>) || {};
      await setProgress(env, projectId, 10, "Inputs validated");

      // Parse template graph
      const rawJson = template.raw_json as { nodes?: TemplateNode[]; edges?: TemplateEdge[] } | null;
      const nodes = rawJson?.nodes || [];
      const edges = rawJson?.edges || [];
      const steps = buildStepPlan(nodes, edges);

      // Filter to actionable steps (model calls)
      const modelSteps = steps.filter((s) => s.modelProvider !== "passthrough");

      if (modelSteps.length === 0) {
        // No graph or no model nodes — try a simple heuristic based on output_type
        const outputType = (template as any).output_type || "image";
        await setProgress(env, projectId, 15, `No graph found — running as single ${outputType} step`);

        if (outputType === "video") {
          await setProgress(env, projectId, 25, "Submitting to image generation (fal)");
          let imageResultUrl: string | undefined;
          try {
            imageResultUrl = await callFalNanoBanana(env, inputs);
            await setProgress(env, projectId, 50, "Image generation complete");
          } catch (e) {
            await setProgress(env, projectId, 50, `Image gen skipped: ${e instanceof Error ? e.message : String(e)}`);
          }

          await setProgress(env, projectId, 55, "Submitting to video generation (Kling)");
          const videoInputs = { ...inputs };
          if (imageResultUrl) videoInputs.image = imageResultUrl;
          const videoUrl = await callKling(env, videoInputs);
          await setProgress(env, projectId, 90, "Video generation complete");

          // Upload to R2
          const finalItems = await uploadOutputsToR2(env, projectId, [
            ...(imageResultUrl ? [{ type: "image", url: imageResultUrl }] : []),
            { type: "video", url: videoUrl },
          ]);

          await updateProjectStatus(env, projectId, "complete", {
            completed_at: new Date().toISOString(),
            outputs: { items: finalItems },
            progress: 100,
          });
          await appendLog(env, projectId, "✅ Job complete — results saved");
          return;
        } else {
          // Image-only template
          await setProgress(env, projectId, 25, "Submitting to image generation (fal)");
          const resultUrl = await callFalNanoBanana(env, inputs);
          await setProgress(env, projectId, 85, "Image generation complete");

          const finalItems = await uploadOutputsToR2(env, projectId, [
            { type: "image", url: resultUrl },
          ]);

          await updateProjectStatus(env, projectId, "complete", {
            completed_at: new Date().toISOString(),
            outputs: { items: finalItems },
            progress: 100,
          });
          await appendLog(env, projectId, "✅ Job complete — results saved");
          return;
        }
      }

      // Execute steps from graph
      const totalSteps = modelSteps.length;
      const stepOutputs: { type: string; url: string }[] = [];
      let currentInputs = { ...inputs };

      for (let i = 0; i < totalSteps; i++) {
        const step = modelSteps[i];
        const pctStart = 15 + Math.floor((i / totalSteps) * 70);
        const pctEnd = 15 + Math.floor(((i + 1) / totalSteps) * 70);

        await setProgress(env, projectId, pctStart, `Step ${i + 1}/${totalSteps}: ${step.label} submitted (${step.modelProvider})`);

        let outputUrl: string;
        if (step.modelProvider === "kling") {
          outputUrl = await callKling(env, currentInputs);
          stepOutputs.push({ type: "video", url: outputUrl });
        } else {
          outputUrl = await callFalNanoBanana(env, currentInputs);
          stepOutputs.push({ type: "image", url: outputUrl });
        }

        // Chain output as input for next step
        currentInputs = { ...currentInputs, image: outputUrl };
        await setProgress(env, projectId, pctEnd, `Step ${i + 1}/${totalSteps}: ${step.label} complete`);
      }

      await setProgress(env, projectId, 90, "Uploading results to storage");
      const finalItems = await uploadOutputsToR2(env, projectId, stepOutputs);

      await updateProjectStatus(env, projectId, "complete", {
        completed_at: new Date().toISOString(),
        outputs: { items: finalItems },
        progress: 100,
      });
      await appendLog(env, projectId, "✅ Job complete — results saved");
      return;

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

      const delay = Math.min(3000 * Math.pow(2, attempt - 1), 20000);
      await appendLog(env, projectId, `Waiting ${delay}ms before retry...`);
      await sleep(delay);
    }
  }
}

/* ── Upload outputs to R2 ── */

async function uploadOutputsToR2(
  env: Env,
  projectId: string,
  items: { type: string; url: string }[],
): Promise<{ type: string; url: string }[]> {
  const workerUrl = "https://shiny-rice-e95bfuse-api.kade-fc1.workers.dev";
  const finalItems: { type: string; url: string }[] = [];

  for (const item of items) {
    if (!item.url) continue;
    try {
      const res = await fetch(item.url);
      if (res.ok && res.body) {
        const ext = item.type === "video" ? "mp4" : "png";
        const key = `outputs/${projectId}/${Date.now()}.${ext}`;
        await env.ASSETS.put(key, res.body, {
          httpMetadata: { contentType: item.type === "video" ? "video/mp4" : "image/png" },
        });
        finalItems.push({ type: item.type, url: `${workerUrl}/assets/${encodeURIComponent(key)}` });
      } else {
        finalItems.push(item);
      }
    } catch {
      finalItems.push(item);
    }
  }

  return finalItems;
}
