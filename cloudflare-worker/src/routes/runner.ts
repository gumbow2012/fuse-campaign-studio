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
import { supabaseFetch, updateProjectStatus, getProject, getTemplate, getCreditBalance, deductCredits } from "../supabase";

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

// UUID v4 regex — used to validate user IDs before storing in UUID column
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/* ── GET /api/projects/:id — Job status ── */

export async function handleProjectStatus(request: Request, env: Env, projectId: string): Promise<Response> {
  const userId = await verifyToken(request, env);

  const project = await getProject(env, projectId);
  // Allow access if: user_id matches, or project has no user_id (service-created), or caller used non-UUID API key
  const callerIsUuid = UUID_RE.test(userId);
  if (!project || (callerIsUuid && project.user_id && project.user_id !== userId)) {
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

  // user_id must be a real Supabase auth UUID — use null for service/API-key calls
  const userIdForDb = UUID_RE.test(userId) ? userId : null;

  // ── Credit check & deduction for authenticated users ──────────────────────
  let creditCost = 10; // default
  if (userIdForDb) {
    // Determine credit cost from template
    if (templateId) {
      try {
        const tmpl = await getTemplate(env, templateId);
        creditCost = (tmpl?.estimated_credits_per_run as number) ?? 10;
      } catch { /* use default */ }
    }

    const balance = await getCreditBalance(env, userIdForDb);
    if (balance < creditCost) {
      return Response.json(
        { error: `Insufficient credits. Need ${creditCost}, have ${balance}.` },
        { status: 402 },
      );
    }
  }

  const now = new Date().toISOString();
  const projRes = await supabaseFetch(env, "/projects", {
    method: "POST",
    body: {
      template_id: templateId,
      template_name: templateName || null,
      user_id: userIdForDb,
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

  // Deduct credits after successful project creation
  if (userIdForDb) {
    await deductCredits(
      env,
      userIdForDb,
      creditCost,
      id,
      templateId,
      `Run template (${templateName || templateId})`,
    ).catch((e) => console.error("Credit deduction failed:", e));
  }

  return Response.json({
    ok: true,
    project_id: id,   // snake_case for autorun script
    projectId: id,    // camelCase for frontend
    credits_used: creditCost,
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

/** Find the first image value from inputs (legacy fallback for templates without steps). */
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
 *  Gemini image helpers (used by nano_banana_pro steps)
 * ══════════════════════════════════════════════════════════════ */

async function imageToBase64(url: string): Promise<{ base64: string; mimeType: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch image: ${url} (${res.status})`);
  const contentType = res.headers.get("content-type") || "image/png";
  const buf = await res.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return { base64: btoa(binary), mimeType: contentType };
}

async function uploadBase64ToR2(env: Env, dataUri: string, key: string): Promise<string> {
  const match = dataUri.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error("Invalid data URI from Gemini");
  const mimeType = match[1];
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  await env.FUSE_ASSETS.put(key, bytes, { httpMetadata: { contentType: mimeType } });
  return `${R2_PUBLIC_DOMAIN}/${key}`;
}

/**
 * Call Gemini image generation (nano_banana_pro) with multiple input images.
 * Returns the output image URL (uploaded to R2).
 */
async function callNanoBananaPro(
  env: Env,
  projectId: string,
  imageUrls: string[],
  prompt: string,
  onProgress?: (msg: string) => Promise<void>,
): Promise<string> {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured in Worker secrets");

  await onProgress?.(`Calling Gemini (nano_banana_pro) with ${imageUrls.length} image(s)...`);

  // Convert all images to base64
  const images: { base64: string; mimeType: string }[] = [];
  for (const url of imageUrls) {
    const img = await imageToBase64(resolveImageUrl(url));
    images.push(img);
  }

  // Build parts: images first, then text
  const parts: unknown[] = [
    ...images.map((img) => ({ inline_data: { mime_type: img.mimeType, data: img.base64 } })),
    { text: prompt },
  ];

  const model = "gemini-2.0-flash-exp-image-generation";
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Gemini API error (${res.status}): ${txt.slice(0, 1000)}`);
  }

  const data = await res.json() as { candidates?: { content?: { parts?: { inline_data?: { mime_type: string; data: string }; text?: string }[] } }[] };
  const candidates = data.candidates;
  if (!candidates?.length) throw new Error("Gemini returned no candidates");

  for (const part of candidates[0].content?.parts || []) {
    if (part.inline_data) {
      const dataUri = `data:${part.inline_data.mime_type};base64,${part.inline_data.data}`;
      const key = `outputs/${projectId}/${Date.now()}.png`;
      const url = await uploadBase64ToR2(env, dataUri, key);
      await onProgress?.("Gemini image generated and uploaded to R2");
      return url;
    }
  }

  const textParts = candidates[0].content?.parts?.filter((p) => p.text) || [];
  if (textParts.length) throw new Error(`Gemini returned text only: ${textParts[0].text?.slice(0, 200)}`);
  throw new Error("Gemini returned no image in response");
}

/* ══════════════════════════════════════════════════════════════
 *  Model API Calls
 * ══════════════════════════════════════════════════════════════ */

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

interface KlingSettings {
  model?: string;
  duration?: string;
  aspect_ratio?: string;
  cfg_scale?: number;
  mode?: string;
}

/**
 * Call Kling image-to-video API.
 * Docs: https://app.klingai.com/global/dev/document-api
 */
async function callKling(
  env: Env,
  imageUrl: string,
  prompt: string,
  settings?: KlingSettings,
  onProgress?: (msg: string) => Promise<void>,
): Promise<string> {
  const accessKey = env.KLING_ACCESS_KEY || env.KLING_AK;
  const secretKey = env.KLING_SECRET_KEY || env.KLING_SK;
  if (!accessKey || !secretKey) throw new Error("KLING_ACCESS_KEY / KLING_SECRET_KEY not configured");

  const jwt = await generateKlingJwt(accessKey, secretKey);

  const modelName = settings?.model || "kling-v1-6";
  const duration = settings?.duration || "10";
  const aspectRatio = settings?.aspect_ratio || "9:16";
  const cfgScale = settings?.cfg_scale ?? 0.5;
  const mode = settings?.mode || "std";

  // Submit image-to-video task
  const submitRes = await fetch("https://api.klingai.com/v1/videos/image2video", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model_name: modelName,
      image: imageUrl,
      prompt,
      duration,
      aspect_ratio: aspectRatio,
      cfg_scale: cfgScale,
      mode,
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
 *  Template step types
 * ══════════════════════════════════════════════════════════════ */

interface TemplateStep {
  id: string;
  type: "nano_banana_pro" | "kling" | string;
  prompt?: string;
  user_input_keys?: string[];
  image_source?: "previous_step" | string;
  settings?: Record<string, unknown>;
}

interface TemplateDefinition {
  output_type?: string;
  steps?: TemplateStep[];
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

      const templateName = project.template_name as string | undefined;
      const templateId = project.template_id as string | undefined;

      let template: TemplateDefinition | undefined;

      if (templateId) {
        template = (await getTemplate(env, templateId)) as TemplateDefinition | undefined;
      } else if (templateName) {
        // Load template JSON from R2 by name
        const key = templateName.toLowerCase().replace(/\s+/g, "_") + "_template.json";
        const obj = await env.FUSE_TEMPLATES?.get(key);
        if (obj) {
          try { template = JSON.parse(await obj.text()) as TemplateDefinition; } catch { /* ignore */ }
        }
        if (!template) throw new Error(`Template not found in R2: ${key}`);
      }

      if (!template) throw new Error("Template not found");

      const inputs = ((project.user_inputs || project.inputs) as Record<string, string>) || {};
      const steps: TemplateStep[] = template.steps || [];

      await setProgress(env, projectId, 10, `Template loaded — ${steps.length} step(s) to execute`);

      // ── Execute template steps ──────────────────────────────
      const collectedOutputs: { type: string; url: string; label?: string }[] = [];
      let previousStepImageUrl: string | undefined;

      // Progress budget per step (leave room for 10% start + 10% upload)
      const stepCount = steps.length || 1;
      const progressPerStep = Math.floor(75 / stepCount);
      let progressBase = 15;

      if (steps.length === 0) {
        // ── Legacy fallback: no steps defined — use generic single-image pipeline ──
        const imageUrl = findImageUrl(inputs);
        if (!imageUrl) throw new Error("No image URL found in inputs. Ensure an image was uploaded.");
        const prompt = findPrompt(inputs);
        const outputType = template.output_type || "video";

        await setProgress(env, projectId, 15, "No steps defined — using legacy pipeline");
        const editedImageUrl = await callNanoBananaPro(env, projectId, [imageUrl], prompt, async (msg) => {
          await setProgress(env, projectId, 25, msg);
        });
        collectedOutputs.push({ type: "image", url: editedImageUrl, label: "Generated Image" });
        previousStepImageUrl = editedImageUrl;

        if (outputType === "video") {
          const videoUrl = await callKling(env, editedImageUrl, prompt, {}, async (msg) => {
            await setProgress(env, projectId, 60, msg);
          });
          collectedOutputs.push({ type: "video", url: videoUrl, label: "Generated Video" });
        }

      } else {
        for (let si = 0; si < steps.length; si++) {
          const step = steps[si];
          const stepLabel = `Step ${si + 1}/${steps.length} (${step.type})`;
          await setProgress(env, projectId, progressBase, `${stepLabel} — starting`);

          if (step.type === "nano_banana_pro") {
            // Gather input images from user_input_keys
            const inputKeys = step.user_input_keys || [];
            const imageUrls: string[] = [];
            for (const key of inputKeys) {
              const val = inputs[key]?.trim() || inputs[`${key}_key`]?.trim();
              if (val) imageUrls.push(val);
            }
            // Fallback: try to find any image in inputs
            if (imageUrls.length === 0) {
              const fallback = findImageUrl(inputs);
              if (fallback) imageUrls.push(fallback);
            }
            if (imageUrls.length === 0) {
              throw new Error(`Step "${step.id}": no images found for keys: ${inputKeys.join(", ")}`);
            }

            const prompt = step.prompt || findPrompt(inputs);
            const outputImageUrl = await callNanoBananaPro(env, projectId, imageUrls, prompt, async (msg) => {
              await setProgress(env, projectId, progressBase + Math.floor(progressPerStep * 0.7), msg);
            });

            collectedOutputs.push({ type: "image", url: outputImageUrl, label: step.id === "image_edit" ? "Generated Image" : step.id });
            previousStepImageUrl = outputImageUrl;

            // If this is the last step and output_type is "video", mark as video_pending
            const isLastStep = si === steps.length - 1;
            if (!isLastStep) {
              // Intermediate step — update outputs so far (visible during video_pending)
              await supabaseFetch(env, `/projects?id=eq.${projectId}`, {
                method: "PATCH",
                body: { outputs: { items: collectedOutputs }, status: "video_pending" },
              });
            }

          } else if (step.type === "kling") {
            // Determine source image
            let sourceImageUrl: string | undefined;
            if (step.image_source === "previous_step") {
              sourceImageUrl = previousStepImageUrl;
            } else if (step.user_input_keys?.length) {
              const key = step.user_input_keys[0];
              const val = inputs[key]?.trim();
              if (val) sourceImageUrl = resolveImageUrl(val);
            }
            if (!sourceImageUrl) sourceImageUrl = previousStepImageUrl || findImageUrl(inputs);
            if (!sourceImageUrl) throw new Error(`Step "${step.id}": no source image for Kling`);

            const prompt = step.prompt || findPrompt(inputs);
            const klingSettings = step.settings as KlingSettings | undefined;

            const videoUrl = await callKling(env, sourceImageUrl, prompt, klingSettings, async (msg) => {
              await setProgress(env, projectId, progressBase + Math.floor(progressPerStep * 0.7), msg);
            });

            collectedOutputs.push({ type: "video", url: videoUrl, label: "Generated Video" });
            previousStepImageUrl = undefined; // video can't be used as next image input

          } else {
            await appendLog(env, projectId, `⚠️ Unknown step type "${step.type}" — skipping`);
          }

          progressBase = Math.min(progressBase + progressPerStep, 85);
          await setProgress(env, projectId, progressBase, `${stepLabel} — complete`);
        }
      }

      // ── Upload all outputs to R2 ──
      await setProgress(env, projectId, 90, "Uploading outputs to storage");
      const finalItems = await uploadOutputsToR2(env, projectId, collectedOutputs);

      await updateProjectStatus(env, projectId, "complete", {
        completed_at: new Date().toISOString(),
        outputs: { items: finalItems },
        progress: 100,
      });
      await appendLog(env, projectId, `✅ Job complete — ${finalItems.length} asset(s) saved`);
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
