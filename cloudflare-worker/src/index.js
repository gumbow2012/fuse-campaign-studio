// ============================================================
// FUSE V6 — STEPS PIPELINE WORKER
// Supports multi-step templates: nano_banana_pro (FAL) + kling
// Each template has steps[] array with explicit locked_inputs
// ============================================================

const WORKER_URL = "https://shiny-rice-e95bfuse-api.kade-fc1.workers.dev";

// ============== AUTH ==============
function checkAuth(request, env) {
  // API key auth
  const apiKey = request.headers.get("X-Api-Key");
  if (apiKey && apiKey === env.FUSE_API_KEY) {
    return request.headers.get("X-User-Id") || "api-user";
  }
  // Bearer token auth
  const authHeader = request.headers.get("Authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.replace("Bearer ", "");
    if (env.FUSE_API_KEY && token === env.FUSE_API_KEY) return "bearer-user";
    // Try decode Supabase JWT for user ID
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      if (payload.sub) return payload.sub;
    } catch {}
  }
  throw new Error("Unauthorized");
}

// ============== SUPABASE ==============
async function sbFetch(env, path, opts = {}) {
  const key =
    env.SUPABASE_SERVICE_ROLE_KEY &&
    env.SUPABASE_SERVICE_ROLE_KEY.startsWith("eyJ") &&
    env.SUPABASE_SERVICE_ROLE_KEY.length > 200
      ? env.SUPABASE_SERVICE_ROLE_KEY
      : env.SUPABASE_ANON_KEY;
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
  await sbFetch(env, `/projects?id=eq.${projectId}`, {
    method: "PATCH",
    body: updates,
  });
}

async function getProject(env, projectId) {
  const res = await sbFetch(env, `/projects?id=eq.${projectId}&select=*`);
  if (!res.ok) throw new Error("Project not found");
  const rows = await res.json();
  return rows[0];
}

async function createProjectRow(env, userId, templateName, userInputs) {
  // user_id must be a valid UUID or null
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
  await env.FUSE_ASSETS.put(r2Key, data, {
    httpMetadata: { contentType },
  });
}

// ============== FAL API (NANO BANANA PRO) ==============
async function callNanoBananaPro(env, prompt, lockedInputs, userInputs) {
  if (!env.FAL_API_KEY) throw new Error("FAL_API_KEY not configured");

  const imageUrls = [];

  // Add locked reference images
  for (const imgKey of lockedInputs || []) {
    if (imgKey.startsWith("http")) {
      imageUrls.push(imgKey);
    } else {
      imageUrls.push(`${WORKER_URL}/assets/${imgKey}`);
    }
  }

  // Add user images
  for (const imgKey of userInputs || []) {
    if (imgKey.startsWith("http")) {
      imageUrls.push(imgKey);
    } else {
      imageUrls.push(`${WORKER_URL}/assets/${imgKey}`);
    }
  }

  const payload = {
    prompt,
    num_images: 1,
    resolution: "2K",
    output_format: "png",
  };
  if (imageUrls.length > 0) payload.image_urls = imageUrls;

  const response = await fetch("https://queue.fal.run/fal-ai/nano-banana-pro/edit", {
    method: "POST",
    headers: {
      Authorization: `Key ${env.FAL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`FAL submit error (${response.status}): ${error.slice(0, 500)}`);
  }

  const data = await response.json();
  const requestId = data.request_id;
  if (!requestId) throw new Error("FAL: no request_id returned");

  // Poll for completion (max 10 min)
  for (let attempts = 0; attempts < 120; attempts++) {
    await new Promise((resolve) => setTimeout(resolve, 5000));

    const statusRes = await fetch(
      `https://queue.fal.run/fal-ai/nano-banana-pro/edit/requests/${requestId}`,
      { headers: { Authorization: `Key ${env.FAL_API_KEY}` } }
    );

    if (!statusRes.ok) continue;
    const status = await statusRes.json();

    if (status.status === "COMPLETED") {
      const result = status.result || status;
      const imageUrl =
        result.images?.[0]?.url ||
        result.image?.url ||
        result.output?.images?.[0]?.url;
      if (!imageUrl) throw new Error("FAL completed but no image URL");

      const imgRes = await fetch(imageUrl);
      if (!imgRes.ok) throw new Error("Failed to download FAL image");
      return await imgRes.arrayBuffer();
    }

    if (status.status === "FAILED") {
      throw new Error(`FAL generation failed: ${status.error || "Unknown"}`);
    }
  }

  throw new Error("FAL timed out after 10 minutes");
}

// ============== KLING API ==============
async function generateKlingJWT(ak, sk) {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: ak,
    iat: now,
    nbf: now - 5,
    exp: now + 1800,
  };

  const encoder = new TextEncoder();
  const b64url = (data) => {
    let s = "";
    for (const b of data) s += String.fromCharCode(b);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  };
  const b64str = (str) => b64url(encoder.encode(str));

  const headerB64 = b64str(JSON.stringify(header));
  const payloadB64 = b64str(JSON.stringify(payload));
  const message = `${headerB64}.${payloadB64}`;

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(sk),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  const sigB64 = b64url(new Uint8Array(sig));

  return `${message}.${sigB64}`;
}

async function callKling(env, imageUrl, prompt, model, duration, aspectRatio) {
  const ak = env.KLING_AK || env.KLING_ACCESS_KEY;
  const sk = env.KLING_SK || env.KLING_SECRET_KEY;
  if (!ak || !sk) throw new Error("KLING_AK / KLING_SK not configured");

  const klingBase = env.KLING_API_BASE || "https://api.klingai.com";
  const jwt = await generateKlingJWT(ak, sk);

  const submitRes = await fetch(`${klingBase}/v1/videos/image2video`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model_name: model || "kling-v1-6",
      image: imageUrl,
      prompt,
      cfg_scale: 0.5,
      mode: "std",
      duration: duration || "10",
      aspect_ratio: aspectRatio || "9:16",
    }),
  });

  if (!submitRes.ok) {
    const error = await submitRes.text();
    throw new Error(`Kling submit failed (${submitRes.status}): ${error.slice(0, 500)}`);
  }

  const submitData = await submitRes.json();
  const taskId = submitData.data?.task_id;
  if (!taskId) throw new Error(`Kling: no task_id — ${submitData.message || "unknown"}`);

  // Poll for completion (max 30 min)
  for (let attempts = 0; attempts < 180; attempts++) {
    await new Promise((resolve) => setTimeout(resolve, 10000));

    const pollJwt = await generateKlingJWT(ak, sk);
    const statusRes = await fetch(`${klingBase}/v1/videos/image2video/${taskId}`, {
      headers: { Authorization: `Bearer ${pollJwt}` },
    });

    if (!statusRes.ok) continue;
    const statusData = await statusRes.json();
    const taskStatus = statusData.data?.task_status;

    if (taskStatus === "succeed") {
      const videoUrl = statusData.data?.task_result?.videos?.[0]?.url;
      if (!videoUrl) throw new Error("Kling succeeded but no video URL");

      const videoRes = await fetch(videoUrl);
      if (!videoRes.ok) throw new Error("Failed to download Kling video");
      return await videoRes.arrayBuffer();
    }

    if (taskStatus === "failed") {
      throw new Error(`Kling failed: ${statusData.data?.task_status_msg || "Unknown"}`);
    }
  }

  throw new Error("Kling timed out after 30 minutes");
}

// ============== PIPELINE RUNNER ==============
async function runPipeline(env, projectId) {
  try {
    const project = await getProject(env, projectId);
    if (!project) throw new Error(`Project ${projectId} not found`);

    const template = await loadTemplateFromR2(env, project.template_name);

    await updateProject(env, projectId, {
      status: "running",
      progress: 10,
      logs: [`[${new Date().toISOString()}] Pipeline started — template: ${project.template_name}`],
    });

    const outputs = { items: [] };
    let lastImageBuffer = null;
    let lastImageKey = null;

    for (let stepIdx = 0; stepIdx < template.steps.length; stepIdx++) {
      const step = template.steps[stepIdx];
      const progress = 10 + Math.floor(((stepIdx + 0.5) / template.steps.length) * 80);

      const log = (msg) => console.log(`[${projectId}][${step.id}] ${msg}`);

      await updateProject(env, projectId, {
        progress,
        logs: [`[${new Date().toISOString()}] Step ${stepIdx + 1}/${template.steps.length}: ${step.id} (${step.type})`],
      });

      if (step.type === "nano_banana_pro") {
        log(`Starting FAL nano-banana-pro — prompt: ${step.prompt?.slice(0, 80)}...`);

        // Collect locked reference images
        const lockedInputs = step.locked_inputs || [];

        // Collect user-supplied image URLs/keys
        const userInputs = [];
        for (const key of step.user_input_keys || []) {
          const inputVal = project.user_inputs?.[key];
          if (inputVal) userInputs.push(inputVal);
        }

        lastImageBuffer = await callNanoBananaPro(env, step.prompt, lockedInputs, userInputs);

        lastImageKey = `outputs/${projectId}/${step.id}_${Date.now()}.png`;
        await storeInR2(env, lastImageKey, lastImageBuffer, "image/png");

        outputs.items.push({
          type: "image",
          step_id: step.id,
          url: `${WORKER_URL}/assets/${lastImageKey}`,
        });

        log(`✅ Image saved: ${lastImageKey}`);
        await updateProject(env, projectId, { progress: progress + 5, outputs });

      } else if (step.type === "kling") {
        log(`Starting Kling video — model: ${step.model || "kling-v1-6"}`);

        let sourceImageUrl;
        if (step.image_source === "previous_step") {
          if (!lastImageKey) throw new Error("No previous image available for Kling step");
          sourceImageUrl = `${WORKER_URL}/assets/${lastImageKey}`;
        } else {
          const sourceItem = outputs.items.find((item) => item.step_id === step.image_source);
          if (!sourceItem) throw new Error(`Image source step not found: ${step.image_source}`);
          sourceImageUrl = sourceItem.url.startsWith("http")
            ? sourceItem.url
            : `${WORKER_URL}${sourceItem.url}`;
        }

        const videoBuffer = await callKling(
          env,
          sourceImageUrl,
          step.prompt,
          step.model || "kling-v1-6",
          step.duration || "10",
          step.aspect_ratio || "9:16"
        );

        const videoKey = `outputs/${projectId}/${step.id}_${Date.now()}.mp4`;
        await storeInR2(env, videoKey, videoBuffer, "video/mp4");

        outputs.items.push({
          type: "video",
          step_id: step.id,
          url: `${WORKER_URL}/assets/${videoKey}`,
        });

        log(`✅ Video saved: ${videoKey}`);
        await updateProject(env, projectId, { progress: progress + 5, outputs });

      } else {
        log(`⚠️ Unknown step type: ${step.type} — skipping`);
      }
    }

    await updateProject(env, projectId, {
      status: "complete",
      progress: 100,
      outputs,
      completed_at: new Date().toISOString(),
    });

    console.log(`[${projectId}] ✅ Pipeline complete — ${outputs.items.length} outputs`);

  } catch (error) {
    console.error(`[${projectId}] Pipeline error:`, error);
    await updateProject(env, projectId, {
      status: "failed",
      error: error.message?.slice(0, 5000) || "Unknown error",
      failed_at: new Date().toISOString(),
    });
  }
}

// ============== ROUTES ==============

async function handleHealth(env) {
  return Response.json({
    ok: true,
    service: "fuse-worker-v6-steps",
    timestamp: new Date().toISOString(),
    bindings: {
      fal: !!env.FAL_API_KEY,
      kling: !!(env.KLING_AK || env.KLING_ACCESS_KEY) && !!(env.KLING_SK || env.KLING_SECRET_KEY),
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
        const data = JSON.parse(await (await env.FUSE_TEMPLATES.get(obj.key)).text());
        templates.push({
          // Use name as id so frontend selects by name
          id: data.name,
          name: data.name,
          description: data.description || null,
          category: data.category || null,
          output_type: data.output_type || "video",
          estimated_credits_per_run: data.estimated_credits_per_run || 50,
          is_active: true,
          input_schema: data.user_inputs || null,
          preview_url: data.preview_url || null,
          tags: data.tags || null,
          version: data.version || "1.0",
          steps_count: data.steps?.length || 0,
        });
      } catch (e) {
        console.error(`Failed to parse template ${obj.key}:`, e);
      }
    }
  } catch (e) {
    console.error("Failed to list templates:", e);
  }
  // Sort by name
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

  // Support both template_name (new) and template_id (old frontend compat)
  const templateName = (body.template_name || body.template_id || "").trim();
  const userInputs = body.user_inputs || body.inputs || {};

  if (!templateName) {
    return Response.json({ error: "Missing template_name" }, { status: 400 });
  }

  const project = await createProjectRow(env, userId, templateName, userInputs);

  return Response.json(
    {
      ok: true,
      project_id: project.id,
      projectId: project.id, // camelCase compat for existing frontend
      status: project.status,
      credits_used: 50,
    },
    { status: 201 }
  );
}

async function handleEnqueue(request, env, ctx) {
  checkAuth(request, env);
  const body = await request.json();
  const projectId = body.project_id || body.projectId;

  if (!projectId) {
    return Response.json({ error: "Missing project_id / projectId" }, { status: 400 });
  }

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
  const formData = await request.formData();
  const file = formData.get("file");
  if (!file) return Response.json({ error: "No file provided" }, { status: 400 });

  const ext = file.name?.split(".").pop() || "png";
  const key = `uploads/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

  await env.FUSE_ASSETS.put(key, file.stream(), {
    httpMetadata: { contentType: file.type || "image/png" },
  });

  return Response.json({
    ok: true,
    key,
    imageUrl: `${WORKER_URL}/assets/${key}`,
  });
}

async function handleUploadTemplate(request, env) {
  checkAuth(request, env);
  const body = await request.json();
  const { name, template } = body;

  if (!name || !template) {
    return Response.json({ error: "Missing name or template" }, { status: 400 });
  }

  const key = `${name.toLowerCase().replace(/\s+/g, "_")}_template.json`;
  await env.FUSE_TEMPLATES.put(key, JSON.stringify(template, null, 2));

  return Response.json({
    ok: true,
    message: `Template "${name}" uploaded as ${key}`,
    key,
  });
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
      "Access-Control-Allow-Headers":
        "Content-Type, Authorization, X-Api-Key, X-User-Id, X-Service-Call",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    const wrap = (res) => {
      const h = new Headers(res.headers);
      for (const [k, v] of Object.entries(CORS)) h.set(k, v);
      return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
    };

    try {
      let response;

      if (path === "/health") {
        response = await handleHealth(env);

      } else if (path.startsWith("/assets/")) {
        response = await handleServeAsset(env, path.slice("/assets/".length));

      } else if (path === "/api/templates" && request.method === "GET") {
        checkAuth(request, env);
        response = await handleListTemplates(env);

      } else if (path.startsWith("/api/templates/") && request.method === "GET") {
        checkAuth(request, env);
        response = await handleGetTemplate(env, path.slice("/api/templates/".length));

      } else if (path === "/api/upload" && request.method === "POST") {
        response = await handleUploadFile(request, env);

      } else if (path === "/api/uploads" && request.method === "POST") {
        response = await handleUploadFile(request, env);

      } else if (path === "/api/projects" && request.method === "POST") {
        response = await handleCreateProject(request, env);

      } else if (path === "/api/enqueue" && request.method === "POST") {
        response = await handleEnqueue(request, env, ctx);

      } else if (path.startsWith("/api/projects/") && request.method === "GET") {
        const projectId = path.slice("/api/projects/".length);
        response = await handleGetProject(request, env, projectId);

      } else if (path === "/admin/upload-template" && request.method === "POST") {
        response = await handleUploadTemplate(request, env);

      } else if (path === "/debug-routes") {
        response = Response.json({
          ok: true,
          version: "v6-steps",
          routes: [
            "GET  /health",
            "GET  /assets/:key",
            "GET  /api/templates",
            "GET  /api/templates/:name",
            "POST /api/upload",
            "POST /api/uploads",
            "POST /api/projects",
            "POST /api/enqueue",
            "GET  /api/projects/:id",
            "POST /admin/upload-template",
          ],
        });

      } else {
        response = Response.json({ error: "Not found" }, { status: 404 });
      }

      return wrap(response);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const status = msg.includes("Unauthorized") ? 401 : 500;
      console.error(`[worker] Error on ${path}:`, msg);
      return wrap(Response.json({ error: msg }, { status }));
    }
  },
};
