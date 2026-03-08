// ============================================================
// FUSE V6 — STEPS PIPELINE WORKER
// Template contract system: each template defines a locked
// execution pipeline with a user-facing input_manifest.
// Users never see nodes — only the clean input form.
// ============================================================

const WORKER_URL = "https://shiny-rice-e95bfuse-api.kade-fc1.workers.dev";

// ============== AUTH ==============
function checkAuth(request, env) {
  const apiKey = request.headers.get("X-Api-Key");
  if (apiKey && apiKey === env.FUSE_API_KEY) {
    return request.headers.get("X-User-Id") || "api-user";
  }
  const authHeader = request.headers.get("Authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.replace("Bearer ", "");
    if (env.FUSE_API_KEY && token === env.FUSE_API_KEY) return "bearer-user";
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      if (payload.sub) return payload.sub;
    } catch {}
  }
  throw new Error("Unauthorized");
}

// ============== SUPABASE ==============
async function sbFetch(env, path, opts = {}) {
  // Always use anon key — RLS policy "open_worker_access" allows all worker writes.
  // Service role key is intentionally not used here to avoid invalid-key errors.
  const key = env.SUPABASE_ANON_KEY;
  return fetch(`${env.SUPABASE_URL}/rest/v1${path}`, {
    method: opts.method || "GET",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...opts.headers,
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
}

async function updateProject(env, projectId, updates) {
  await sbFetch(env, `/projects?id=eq.${projectId}`, { method: "PATCH", body: updates });
}

async function getProject(env, projectId) {
  const res = await sbFetch(env, `/projects?id=eq.${projectId}&select=*`);
  if (!res.ok) throw new Error("Project not found");
  const rows = await res.json();
  return rows[0];
}

async function createProjectRow(env, userId, templateName, userInputs) {
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const userIdForDb = UUID_RE.test(userId) ? userId : null;

  const res = await sbFetch(env, "/projects", {
    method: "POST",
    body: {
      user_id: userIdForDb,
      template_name: templateName,
      status: "queued",
      progress: 0,
      user_inputs: userInputs || {},
      outputs: { items: [] },
      logs: [`[${new Date().toISOString()}] Project created`],
      error: null,
    },
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Project creation failed: ${txt}`);
  }
  const rows = await res.json();
  return rows[0];
}

// ============== R2 HELPERS ==============
async function loadTemplateFromR2(env, templateName) {
  const key = `${templateName.toLowerCase().replace(/\s+/g, "_")}_template.json`;
  const obj = await env.FUSE_TEMPLATES.get(key);
  if (!obj) throw new Error(`Template not found in R2: ${key}`);
  return JSON.parse(await obj.text());
}

async function storeInR2(env, r2Key, data, contentType) {
  await env.FUSE_ASSETS.put(r2Key, data, { httpMetadata: { contentType } });
}

// ============== TEMPLATE CONTRACT HELPERS ==============

/**
 * Get the input manifest from a template.
 * Supports both new format (input_manifest) and legacy (user_inputs).
 */
function getInputManifest(template) {
  return template.input_manifest || template.user_inputs || [];
}

/**
 * Resolve a user input value (URL or R2 key) to a full URL.
 */
function resolveInputUrl(value) {
  if (!value) return null;
  if (value.startsWith("http")) return value;
  if (value.startsWith("uploads/") || value.startsWith("outputs/")) {
    return `${WORKER_URL}/assets/${value}`;
  }
  return value;
}

/**
 * Build the final prompt for a step.
 * Composition: prompt_prefix + user_prompt (if user_prompt_key set) + prompt_suffix
 */
function buildStepPrompt(step, userInputs) {
  const prefix = step.prompt || step.prompt_prefix || "";
  const suffix = step.prompt_suffix || "";
  const userKey = step.user_prompt_key;
  const userText = userKey ? (userInputs?.[userKey] || "").trim() : "";

  if (userText) {
    return [prefix, userText, suffix].filter(Boolean).join(" ");
  }
  return [prefix, suffix].filter(Boolean).join(" ");
}

// ============== FAL API (NANO BANANA PRO) ==============
async function callNanoBananaPro(env, prompt, imageUrls, settings) {
  if (!env.FAL_API_KEY) throw new Error("FAL_API_KEY not configured");

  const payload = {
    prompt,
    num_images: settings?.num_images || 1,
    resolution: settings?.resolution || "2K",
    output_format: settings?.output_format || "png",
  };
  if (imageUrls && imageUrls.length > 0) payload.image_urls = imageUrls;

  const res = await fetch("https://queue.fal.run/fal-ai/nano-banana-pro/edit", {
    method: "POST",
    headers: { Authorization: `Key ${env.FAL_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`FAL submit error (${res.status}): ${err.slice(0, 500)}`);
  }

  const { request_id } = await res.json();
  if (!request_id) throw new Error("FAL: no request_id returned");

  // Poll for completion (max 10 min)
  for (let i = 0; i < 120; i++) {
    await sleep(5000);
    const statusRes = await fetch(
      `https://queue.fal.run/fal-ai/nano-banana-pro/edit/requests/${request_id}`,
      { headers: { Authorization: `Key ${env.FAL_API_KEY}` } }
    );
    if (!statusRes.ok) continue;
    const data = await statusRes.json();

    if (data.status === "COMPLETED") {
      const result = data.result || data;
      const url = result.images?.[0]?.url || result.image?.url;
      if (!url) throw new Error("FAL completed but no image URL in response");
      const imgRes = await fetch(url);
      if (!imgRes.ok) throw new Error("Failed to download FAL image");
      return await imgRes.arrayBuffer();
    }
    if (data.status === "FAILED") {
      throw new Error(`FAL failed: ${data.error || "Unknown"}`);
    }
  }
  throw new Error("FAL timed out after 10 minutes");
}

// ============== KLING API ==============
async function generateKlingJWT(ak, sk) {
  const enc = new TextEncoder();
  const b64url = (d) => {
    let s = "";
    for (const b of d) s += String.fromCharCode(b);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  };
  const now = Math.floor(Date.now() / 1000);
  const hdr = b64url(enc.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const pay = b64url(enc.encode(JSON.stringify({ iss: ak, iat: now, nbf: now - 5, exp: now + 1800 })));
  const msg = `${hdr}.${pay}`;
  const key = await crypto.subtle.importKey("raw", enc.encode(sk), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = b64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(msg))));
  return `${msg}.${sig}`;
}

async function callKling(env, imageUrl, prompt, settings) {
  const ak = env.KLING_AK || env.KLING_ACCESS_KEY;
  const sk = env.KLING_SK || env.KLING_SECRET_KEY;
  if (!ak || !sk) throw new Error("KLING_AK / KLING_SK not configured");

  const base = env.KLING_API_BASE || "https://api.klingai.com";
  const jwt = await generateKlingJWT(ak, sk);

  const submitRes = await fetch(`${base}/v1/videos/image2video`, {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model_name: settings?.model || "kling-v1-6",
      image: imageUrl,
      prompt,
      cfg_scale: settings?.cfg_scale ?? 0.5,
      mode: settings?.mode || "std",
      duration: settings?.duration || "10",
      aspect_ratio: settings?.aspect_ratio || "9:16",
    }),
  });

  if (!submitRes.ok) {
    const err = await submitRes.text();
    throw new Error(`Kling submit failed (${submitRes.status}): ${err.slice(0, 500)}`);
  }

  const taskId = (await submitRes.json()).data?.task_id;
  if (!taskId) throw new Error("Kling: no task_id returned");

  // Poll for completion (max 30 min)
  for (let i = 0; i < 180; i++) {
    await sleep(10000);
    const pollJwt = await generateKlingJWT(ak, sk);
    const statusRes = await fetch(`${base}/v1/videos/image2video/${taskId}`, {
      headers: { Authorization: `Bearer ${pollJwt}` },
    });
    if (!statusRes.ok) continue;
    const s = await statusRes.json();
    if (s.data?.task_status === "succeed") {
      const url = s.data?.task_result?.videos?.[0]?.url;
      if (!url) throw new Error("Kling succeeded but no video URL");
      const vid = await fetch(url);
      if (!vid.ok) throw new Error("Failed to download Kling video");
      return await vid.arrayBuffer();
    }
    if (s.data?.task_status === "failed") {
      throw new Error(`Kling failed: ${s.data?.task_status_msg || "Unknown"}`);
    }
  }
  throw new Error("Kling timed out after 30 minutes");
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ============== PIPELINE RUNNER ==============
async function runPipeline(env, projectId) {
  try {
    const project = await getProject(env, projectId);
    if (!project) throw new Error(`Project ${projectId} not found`);

    const template = await loadTemplateFromR2(env, project.template_name);
    const userInputs = (project.user_inputs || {});

    await updateProject(env, projectId, {
      status: "running",
      progress: 10,
      logs: [`[${new Date().toISOString()}] Pipeline started — ${project.template_name}`],
    });

    const outputs = { items: [] };
    let lastImageBuffer = null;
    let lastImageKey = null;

    for (let si = 0; si < template.steps.length; si++) {
      const step = template.steps[si];
      const progress = 10 + Math.floor(((si + 0.5) / template.steps.length) * 80);
      const ts = () => new Date().toISOString();

      await updateProject(env, projectId, {
        progress,
        logs: [`[${ts()}] Step ${si + 1}/${template.steps.length}: ${step.id} (${step.type})`],
      });

      if (step.type === "nano_banana_pro") {
        // Collect image URLs from user inputs mapped via input_manifest
        const manifest = getInputManifest(template);
        const imageUrls = [];

        // Add locked reference images first
        for (const ref of step.locked_inputs || []) {
          const url = resolveInputUrl(ref);
          if (url) imageUrls.push(url);
        }

        // Add user-uploaded images in manifest order
        for (const key of step.user_input_keys || []) {
          // Find the input in manifest to validate type
          const field = manifest.find((f) => f.key === key);
          const val = userInputs[key];
          if (val && (!field || field.type === "image")) {
            const url = resolveInputUrl(val);
            if (url) imageUrls.push(url);
          }
        }

        const prompt = buildStepPrompt(step, userInputs);
        const settings = step.settings || {};

        console.log(`[${projectId}][${step.id}] FAL: ${imageUrls.length} images, prompt: "${prompt.slice(0, 80)}..."`);

        lastImageBuffer = await callNanoBananaPro(env, prompt, imageUrls, settings);
        lastImageKey = `outputs/${projectId}/${step.id}_${Date.now()}.png`;
        await storeInR2(env, lastImageKey, lastImageBuffer, "image/png");

        outputs.items.push({
          type: "image",
          step_id: step.id,
          url: `${WORKER_URL}/assets/${lastImageKey}`,
        });

        await updateProject(env, projectId, { progress: progress + 5, outputs });

      } else if (step.type === "kling") {
        // Determine source image
        let sourceImageUrl;
        if (step.image_source === "previous_step") {
          if (!lastImageKey) throw new Error("No previous image available for Kling step");
          sourceImageUrl = `${WORKER_URL}/assets/${lastImageKey}`;
        } else {
          const item = outputs.items.find((x) => x.step_id === step.image_source);
          if (!item) throw new Error(`Step not found: ${step.image_source}`);
          sourceImageUrl = item.url.startsWith("http") ? item.url : `${WORKER_URL}${item.url}`;
        }

        const prompt = buildStepPrompt(step, userInputs);
        const settings = step.settings || {};

        console.log(`[${projectId}][${step.id}] Kling: model=${settings.model || "kling-v1-6"}, duration=${settings.duration || "10"}`);

        const videoBuffer = await callKling(env, sourceImageUrl, prompt, settings);
        const videoKey = `outputs/${projectId}/${step.id}_${Date.now()}.mp4`;
        await storeInR2(env, videoKey, videoBuffer, "video/mp4");

        outputs.items.push({
          type: "video",
          step_id: step.id,
          url: `${WORKER_URL}/assets/${videoKey}`,
        });

        await updateProject(env, projectId, { progress: progress + 5, outputs });

      } else {
        console.warn(`[${projectId}] Unknown step type: ${step.type} — skipping`);
      }
    }

    await updateProject(env, projectId, {
      status: "complete",
      progress: 100,
      outputs,
      completed_at: new Date().toISOString(),
    });

    console.log(`[${projectId}] Pipeline complete — ${outputs.items.length} outputs`);

  } catch (err) {
    console.error(`[${projectId}] Pipeline error:`, err);
    await updateProject(env, projectId, {
      status: "failed",
      error: (err.message || "Unknown error").slice(0, 5000),
      failed_at: new Date().toISOString(),
    });
  }
}

// ============== ROUTE HANDLERS ==============

async function handleHealth(env) {
  return Response.json({
    ok: true,
    service: "fuse-worker-v6",
    timestamp: new Date().toISOString(),
    bindings: {
      fal: !!env.FAL_API_KEY,
      kling: !!(env.KLING_AK || env.KLING_ACCESS_KEY),
      r2_templates: !!env.FUSE_TEMPLATES,
      r2_assets: !!env.FUSE_ASSETS,
      supabase: !!env.SUPABASE_URL,
    },
  });
}

async function handleListTemplates(env) {
  const templates = [];
  try {
    const list = await env.FUSE_TEMPLATES.list();
    for (const obj of list.objects) {
      if (!obj.key.endsWith("_template.json")) continue;
      try {
        const text = await (await env.FUSE_TEMPLATES.get(obj.key)).text();
        const t = JSON.parse(text);
        const manifest = getInputManifest(t);
        templates.push({
          // id = name so frontend can use it as selector
          id: t.name,
          name: t.name,
          slug: t.slug || t.name.toLowerCase().replace(/\s+/g, "-"),
          description: t.description || null,
          category: t.category || null,
          output_type: t.output_type || "video",
          estimated_credits_per_run: t.estimated_credits_per_run || 50,
          is_active: t.is_active !== false,
          // input_schema is what TemplateRun.tsx reads for fields
          input_schema: manifest,
          preview_url: t.preview_url || null,
          tags: t.tags || null,
          // Extra product-layer metadata
          asset_requirements: t.asset_requirements || null,
          output_count: t.outputs?.items?.length || (t.output_type === "video" ? 2 : 1),
        });
      } catch (e) {
        console.error(`Failed to parse template ${obj.key}:`, e);
      }
    }
  } catch (e) {
    console.error("Failed to list R2 templates:", e);
  }
  templates.sort((a, b) => a.name.localeCompare(b.name));
  return Response.json(templates);
}

async function handleGetTemplate(env, name) {
  const template = await loadTemplateFromR2(env, name);
  return Response.json({ ok: true, template });
}

async function handleCreateProject(request, env) {
  const userId = checkAuth(request, env);
  const body = await request.json();

  const templateName = (body.template_name || body.template_id || "").trim();
  const userInputs = body.user_inputs || body.inputs || {};

  if (!templateName) {
    return Response.json({ error: "Missing template_name" }, { status: 400 });
  }

  const project = await createProjectRow(env, userId, templateName, userInputs);
  return Response.json(
    { ok: true, project_id: project.id, projectId: project.id, status: project.status, credits_used: 50 },
    { status: 201 }
  );
}

async function handleEnqueue(request, env, ctx) {
  checkAuth(request, env);
  const body = await request.json();
  const projectId = body.project_id || body.projectId;
  if (!projectId) return Response.json({ error: "Missing project_id / projectId" }, { status: 400 });
  ctx.waitUntil(runPipeline(env, projectId));
  return Response.json({ ok: true, queued: true, projectId });
}

async function handleGetProject(request, env, projectId) {
  checkAuth(request, env);
  const project = await getProject(env, projectId);
  if (!project) return Response.json({ error: "Project not found" }, { status: 404 });
  const outputs = project.outputs || { items: [] };
  return Response.json({
    ok: true,
    id: project.id,
    status: project.status,
    progress: project.progress || 0,
    outputs,
    logs: project.logs || [],
    attempts: project.attempts || 0,
    maxAttempts: project.max_attempts || 3,
    result_url: outputs.items?.[0]?.url || null,
    error: project.error || null,
  });
}

async function handleUploadFile(request, env) {
  checkAuth(request, env);
  const fd = await request.formData();
  const file = fd.get("file");
  if (!file) return Response.json({ error: "No file provided" }, { status: 400 });

  const ext = (file.name || "").split(".").pop() || "png";
  const key = `uploads/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

  await env.FUSE_ASSETS.put(key, file.stream(), { httpMetadata: { contentType: file.type || "image/png" } });

  return Response.json({ ok: true, key, imageUrl: `${WORKER_URL}/assets/${key}` });
}

async function handleUploadTemplate(request, env) {
  checkAuth(request, env);
  const { name, template } = await request.json();
  if (!name || !template) return Response.json({ error: "Missing name or template" }, { status: 400 });

  const key = `${name.toLowerCase().replace(/\s+/g, "_")}_template.json`;
  await env.FUSE_TEMPLATES.put(key, JSON.stringify(template, null, 2));
  return Response.json({ ok: true, message: `Template "${name}" uploaded as ${key}`, key });
}

async function handleServeAsset(env, assetPath) {
  const obj = await env.FUSE_ASSETS.get(decodeURIComponent(assetPath));
  if (!obj) return new Response("Not found", { status: 404 });
  return new Response(obj.body, {
    headers: {
      "Content-Type": obj.httpMetadata?.contentType || "application/octet-stream",
      "Cache-Control": "public, max-age=31536000",
    },
  });
}

// ============== MAIN ==============
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    const CORS = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Api-Key, X-User-Id, X-Service-Call",
    };

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

    const wrap = (res) => {
      const h = new Headers(res.headers);
      for (const [k, v] of Object.entries(CORS)) h.set(k, v);
      return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
    };

    try {
      let response;

      if (path === "/health")                                           response = await handleHealth(env);
      else if (path.startsWith("/assets/"))                            response = await handleServeAsset(env, path.slice("/assets/".length));
      else if (path === "/api/templates" && request.method === "GET")  { response = await handleListTemplates(env); }
      else if (path.startsWith("/api/templates/") && request.method === "GET") { checkAuth(request, env); response = await handleGetTemplate(env, path.slice("/api/templates/".length)); }
      else if (path === "/api/upload" && request.method === "POST")    response = await handleUploadFile(request, env);
      else if (path === "/api/uploads" && request.method === "POST")   response = await handleUploadFile(request, env);
      else if (path === "/api/projects" && request.method === "POST")  response = await handleCreateProject(request, env);
      else if (path === "/api/enqueue" && request.method === "POST")   response = await handleEnqueue(request, env, ctx);
      else if (path.startsWith("/api/projects/") && request.method === "GET") { const id = path.slice("/api/projects/".length); response = await handleGetProject(request, env, id); }
      else if (path === "/admin/upload-template" && request.method === "POST") response = await handleUploadTemplate(request, env);
      else if (path === "/debug-routes")                               response = Response.json({ ok: true, version: "v6", routes: ["GET /health", "GET /assets/:key", "GET /api/templates", "GET /api/templates/:name", "POST /api/upload", "POST /api/uploads", "POST /api/projects", "POST /api/enqueue", "GET /api/projects/:id", "POST /admin/upload-template"] });
      else                                                             response = Response.json({ error: "Not found" }, { status: 404 });

      return wrap(response);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const status = msg.includes("Unauthorized") ? 401 : 500;
      console.error(`[worker] ${path}: ${msg}`);
      return wrap(Response.json({ error: msg }, { status }));
    }
  },
};
