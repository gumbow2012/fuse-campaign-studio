/**
 * POST /api/enqueue — accepts { projectId }, kicks off the job runner.
 * GET /api/projects/:id — returns job status, progress, logs, result_url.
 *
 * The runner executes template steps by calling external model APIs
 * (fal nano-banana-2 for images, Kling for video), updates progress/logs
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

/* ── POST /api/projects — Create a project (V6 flow) ── */

export async function handleCreateProject(request: Request, env: Env): Promise<Response> {
  const userId = await verifyToken(request, env);

  const body = await request.json() as {
    template_name?: string;
    template_id?: string;
    inputs?: Record<string, string>;
    user_inputs?: Record<string, string>;
  };

  const templateName = (body.template_name || "").trim();
  const templateId = (body.template_id || "").trim() || null;

  if (!templateName && !templateId) {
    return Response.json({ error: "template_name or template_id is required" }, { status: 400 });
  }

  // Accept both inputs (frontend) and user_inputs (autorun script)
  const inputs = body.inputs || body.user_inputs || {};

  const now = new Date().toISOString();
  const projRes = await supabaseFetch(env, "/projects", {
    method: "POST",
    body: {
      template_id: templateId,
      template_name: templateName || null,
      user_id: userId,
      status: "queued",
      progress: 0,
      inputs,
      user_inputs: inputs,
      outputs: { items: [] },
      logs: [`[${now}] Project created`],
      error: null,
    },
    headers: { Prefer: "return=representation" },
  });

  if (!projRes.ok) {
    const txt = await projRes.text();
    return Response.json({ error: "Project creation failed", details: txt }, { status: 500 });
  }

  const [project] = await projRes.json() as { id: string }[];
  const id = project.id;

  return Response.json({
    ok: true,
    project_id: id,   // snake_case for autorun script
    projectId: id,    // camelCase for frontend
  }, { status: 201 });
}

/* ── POST /api/enqueue — Trigger job execution ── */

export async function handleEnqueue(request: Request, env: Env): Promise<Response> {
  const isServiceCall = request.headers.get("X-Service-Call") === "true";
  if (!isServiceCall) {
    await verifyToken(request, env);
  }

  // Accept both projectId (camelCase, frontend) and project_id (snake_case, autorun script)
  const body = await request.json() as { projectId?: string; project_id?: string };
  const rawId = body.projectId || body.project_id;
  if (!rawId) {
    return Response.json({ error: "projectId (or project_id) required" }, { status: 400 });
  }

  // Fire and forget
  const ctx = { waitUntil: (p: Promise<unknown>) => p.catch(console.error) };
  ctx.waitUntil(runJob(env, rawId));

  return Response.json({ queued: true, projectId: rawId });
}

/* ══════════════════════════════════════════════════════════════
 *  Input helpers
 * ══════════════════════════════════════════════════════════════ */

const R2_PUBLIC_DOMAIN = "https://pub-18eb2ae6df714575853d0d459e18b74b.r2.dev";

/**
 * Resolve an image input value to a usable URL.
 * Supports:
 *   - R2 key (starts with "uploads/") → convert to Worker asset URL
 *   - Full URL (http/https) → use as-is
 */
function resolveImageUrl(value: string): string {
  if (value.startsWith("uploads/") || value.startsWith("outputs/") || value.startsWith("projects/")) {
    return `${R2_PUBLIC_DOMAIN}/${value}`;
  }
  return value;
}

/** Find the first image value from inputs. */
function findImageUrl(inputs: Record<string, string>): string | undefined {
  for (const key of ["product_image", "image", "image_url", "clothing_item", "photo", "input_image", "image_key"]) {
    if (inputs[key]?.trim()) return resolveImageUrl(inputs[key]);
  }
  // Fallback: first value that looks like a URL or R2 key
  for (const v of Object.values(inputs)) {
    if (typeof v === "string" && (v.startsWith("http") || v.startsWith("uploads/"))) {
      return resolveImageUrl(v);
    }
  }
  return undefined;
}

function findPrompt(inputs: Record<string, string>): string {
  for (const key of ["prompt", "text", "description"]) {
    if (inputs[key]?.trim()) return inputs[key].trim();
  }
  return "professional product photo, high quality";
}

/* ══════════════════════════════════════════════════════════════
 *  Model API Calls
 * ══════════════════════════════════════════════════════════════ */

/**
 * Call fal.ai nano-banana-2/edit via REST queue API.
 * Docs: https://fal.ai/models/fal-ai/nano-banana-2/edit/api
 */
async function callFalNanoBanana(
  env: Env,
  imageUrl: string,
  prompt: string,
  onProgress?: (msg: string) => Promise<void>,
): Promise<string> {
  const apiKey = env.FAL_API_KEY;
  if (!apiKey) throw new Error("FAL_API_KEY not configured in Worker secrets");

  await onProgress?.("Calling fal nano-banana-pro edit...");

  // Try synchronous endpoint first (faster for short jobs)
  const directRes = await fetch("https://fal.run/fal-ai/nano-banana-pro/edit", {
    method: "POST",
    headers: {
      Authorization: `Key ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt,
      image_url: imageUrl,
    }),
  });

  if (directRes.ok) {
    const data = await directRes.json() as {
      images?: { url: string }[];
      image?: { url: string };
    };
    const url = data.images?.[0]?.url || data.image?.url;
    if (url) return url;
  }

  // Fallback: use queue API for longer jobs
  await onProgress?.("Direct call returned non-OK, falling back to queue API...");

  const submitRes = await fetch("https://queue.fal.run/fal-ai/nano-banana-pro/edit", {
    method: "POST",
    headers: {
      Authorization: `Key ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt,
      image_url: imageUrl,
    }),
  });

  if (!submitRes.ok) {
    const txt = await submitRes.text();
    throw new Error(`fal submit failed (${submitRes.status}): ${txt.slice(0, 500)}`);
  }

  const submitData = await submitRes.json() as { request_id: string };
  const requestId = submitData.request_id;
  if (!requestId) throw new Error("fal: no request_id returned");

  const statusUrl = `https://queue.fal.run/fal-ai/nano-banana-pro/edit/requests/${requestId}/status`;
  const responseUrl = `https://queue.fal.run/fal-ai/nano-banana-pro/edit/requests/${requestId}`;

  await onProgress?.(`fal queued (request: ${requestId.slice(0, 8)}...)`);

  // Poll for completion (max ~10 min)
  for (let i = 0; i < 120; i++) {
    await sleep(5000);
    try {
      const statusRes = await fetch(statusUrl, {
        headers: { Authorization: `Key ${apiKey}` },
      });
      if (!statusRes.ok) continue;
      const status = await statusRes.json() as { status: string };

      if (status.status === "COMPLETED") {
        const resultRes = await fetch(responseUrl, {
          headers: { Authorization: `Key ${apiKey}` },
        });
        const result = await resultRes.json() as {
          images?: { url: string }[];
          image?: { url: string };
        };
        const url = result.images?.[0]?.url || result.image?.url;
        if (!url) throw new Error("fal completed but no image URL in response");
        return url;
      }
      if (status.status === "FAILED") {
        throw new Error("fal job failed");
      }
    } catch (e) {
      if (e instanceof Error && (e.message.includes("fal job failed") || e.message.includes("no image URL"))) throw e;
    }
  }
  throw new Error("fal job timed out after 10 minutes");
}

/**
 * Generate a JWT for Kling API authentication.
 * Kling uses HS256 JWTs signed with the secret key.
 */
async function generateKlingJwt(accessKey: string, secretKey: string): Promise<string> {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: accessKey,
    exp: now + 1800, // 30 min
    nbf: now - 5,
    iat: now,
  };

  const enc = new TextEncoder();
  const b64url = (data: Uint8Array) => {
    let s = "";
    for (const b of data) s += String.fromCharCode(b);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  };
  const b64urlStr = (str: string) => b64url(enc.encode(str));

  const headerB64 = b64urlStr(JSON.stringify(header));
  const payloadB64 = b64urlStr(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;

  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secretKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(signingInput));
  const sigB64 = b64url(new Uint8Array(sig));

  return `${signingInput}.${sigB64}`;
}

/**
 * Call Kling image-to-video API.
 * Docs: https://app.klingai.com/global/dev/document-api
 */
async function callKling(
  env: Env,
  imageUrl: string,
  prompt: string,
  onProgress?: (msg: string) => Promise<void>,
): Promise<string> {
  const accessKey = env.KLING_ACCESS_KEY;
  const secretKey = env.KLING_SECRET_KEY;
  if (!accessKey || !secretKey) throw new Error("KLING_ACCESS_KEY / KLING_SECRET_KEY not configured");

  const jwt = await generateKlingJwt(accessKey, secretKey);

  // Submit image-to-video task
  const submitRes = await fetch("https://api.klingai.com/v1/videos/image2video", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt}`,
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

  const submitData = await submitRes.json() as { data?: { task_id: string }; code?: number; message?: string };
  const taskId = submitData.data?.task_id;
  if (!taskId) throw new Error(`Kling: no task_id — ${submitData.message || "unknown error"}`);

  await onProgress?.(`Kling task submitted (${taskId.slice(0, 8)}...)`);

  // Poll for completion (max ~30 min for video)
  for (let i = 0; i < 180; i++) {
    await sleep(10000);
    try {
      // Need fresh JWT for long polls
      const pollJwt = await generateKlingJwt(accessKey, secretKey);
      const statusRes = await fetch(`https://api.klingai.com/v1/videos/image2video/${taskId}`, {
        headers: { Authorization: `Bearer ${pollJwt}` },
      });
      if (!statusRes.ok) continue;
      const status = await statusRes.json() as {
        data?: { task_status: string; task_result?: { videos?: { url: string }[] } };
      };
      const taskStatus = status.data?.task_status;
      if (taskStatus === "succeed") {
        const videoUrl = status.data?.task_result?.videos?.[0]?.url;
        if (!videoUrl) throw new Error("Kling succeeded but no video URL");
        return videoUrl;
      }
      if (taskStatus === "failed") throw new Error("Kling video generation failed");
    } catch (e) {
      if (e instanceof Error && (e.message.includes("Kling") && (e.message.includes("failed") || e.message.includes("no video")))) throw e;
    }
  }
  throw new Error("Kling job timed out after 30 minutes");
}

/* ══════════════════════════════════════════════════════════════
 *  Upload outputs to R2
 * ══════════════════════════════════════════════════════════════ */

async function uploadOutputsToR2(
  env: Env,
  projectId: string,
  items: { type: string; url: string }[],
): Promise<{ type: string; url: string }[]> {
  const finalItems: { type: string; url: string }[] = [];

  for (const item of items) {
    if (!item.url) continue;
    try {
      const res = await fetch(item.url);
      if (res.ok && res.body) {
        const ext = item.type === "video" ? "mp4" : "png";
        const ct = item.type === "video" ? "video/mp4" : "image/png";
        const key = `outputs/${projectId}/${Date.now()}.${ext}`;
        await env.FUSE_ASSETS.put(key, res.body, { httpMetadata: { contentType: ct } });
        finalItems.push({ type: item.type, url: `${R2_PUBLIC_DOMAIN}/${key}` });
      } else {
        finalItems.push(item);
      }
    } catch {
      finalItems.push(item);
    }
  }

  return finalItems;
}

/* ══════════════════════════════════════════════════════════════
 *  Job Runner — the main execution loop
 * ══════════════════════════════════════════════════════════════ */

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

      // V6: look up template by template_name (from R2) when template_id is null
      let template: Record<string, unknown> | undefined;
      const templateName = project.template_name as string | undefined;
      const templateId = project.template_id as string | undefined;

      if (templateId) {
        template = await getTemplate(env, templateId);
      } else if (templateName) {
        // Load template JSON directly from R2 by name
        const key = templateName.toLowerCase().replace(/\s+/g, "_") + "_template.json";
        const obj = await (env as any).FUSE_TEMPLATES?.get(key);
        if (obj) {
          try { template = JSON.parse(await obj.text()); } catch { /* ignore */ }
        }
        if (!template) throw new Error(`Template not found in R2: ${key}`);
      }

      if (!template) throw new Error("Template not found");

      // Check both inputs (frontend) and user_inputs (autorun script)
      const inputs = ((project.user_inputs || project.inputs) as Record<string, string>) || {};
      const imageUrl = findImageUrl(inputs);
      const prompt = findPrompt(inputs);

      await setProgress(env, projectId, 10, `Inputs validated — image: ${imageUrl ? "yes" : "no"}, prompt: "${prompt.slice(0, 40)}..."`);

      if (!imageUrl) {
        throw new Error("No image URL found in inputs. Ensure an image was uploaded.");
      }

      const outputType = (template as any).output_type || "video";

      // ── Step 1: Image generation via fal nano-banana-pro ──
      await setProgress(env, projectId, 15, "Submitting to nano-banana-pro (image edit)");

      const editedImageUrl = await callFalNanoBanana(env, imageUrl, prompt, async (msg) => {
        await setProgress(env, projectId, 20, msg);
      });

      await setProgress(env, projectId, 45, "nano-banana-pro complete — edited image ready");

      if (outputType !== "video") {
        // Image-only template — done
        await setProgress(env, projectId, 90, "Uploading to storage");
        const finalItems = await uploadOutputsToR2(env, projectId, [
          { type: "image", url: editedImageUrl },
        ]);
        await updateProjectStatus(env, projectId, "complete", {
          completed_at: new Date().toISOString(),
          outputs: { items: finalItems },
          progress: 100,
        });
        await appendLog(env, projectId, "✅ Job complete — image saved");
        return;
      }

      // ── Step 2: Video generation via Kling ──
      await setProgress(env, projectId, 50, "Submitting to Kling (image → video)");

      const videoUrl = await callKling(env, editedImageUrl, prompt, async (msg) => {
        await setProgress(env, projectId, 55, msg);
      });

      await setProgress(env, projectId, 90, "Kling complete — video ready, uploading to storage");

      // ── Step 3: Upload all outputs to R2 ──
      const finalItems = await uploadOutputsToR2(env, projectId, [
        { type: "image", url: editedImageUrl },
        { type: "video", url: videoUrl },
      ]);

      await updateProjectStatus(env, projectId, "complete", {
        completed_at: new Date().toISOString(),
        outputs: { items: finalItems },
        progress: 100,
      });
      await appendLog(env, projectId, "✅ Job complete — image + video saved to storage");
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
