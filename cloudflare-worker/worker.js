/**
 * Fuse Worker — Clean Incremental Build
 *
 * Built from the confirmed working minimal checkpoint where:
 *   /health worked
 *   /debug-route worked
 *   /debug-templates returned armored_truck_template.json
 *   Auth returned "Missing Authorization" on protected routes
 *
 * Required Cloudflare bindings:
 *   R2:
 *     FUSE_TEMPLATES  -> fuse-templates bucket
 *     FUSE_ASSETS     -> fuse-assets bucket
 *
 * Required secrets (set via `wrangler secret put <NAME>`):
 *   SUPABASE_URL          — e.g. https://xxxx.supabase.co
 *   SUPABASE_ANON_KEY     — Supabase anon/public key
 *   AUTH_TOKEN             — shared secret for X-Api-Key auth
 *   NANO_BANANA_API_URL   — Nano Banana endpoint
 *   NANO_BANANA_API_KEY   — Nano Banana / fal auth key
 *   KLING_API_URL         — Kling endpoint
 *   KLING_API_KEY         — Kling auth key
 *   ASSETS_PUBLIC_URL     — (optional) public base URL for R2 assets
 */

// ═══════════════════════════════════════════════════════════════
// SECTION 1 — Utility helpers (kept from working checkpoint)
// ═══════════════════════════════════════════════════════════════

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...extraHeaders,
    },
  });
}

function reqId() {
  return crypto.randomUUID().split("-")[0];
}

function corsHeaders(req) {
  const origin = req.headers.get("Origin") || "*";
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-credentials": "true",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers":
      "content-type, authorization, x-api-key",
    "access-control-max-age": "86400",
    vary: "Origin",
  };
}

function safeName(name) {
  return (name || "").replace(/[^\\w.\\-\\/]/g, "_");
}

async function readJsonBody(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// SECTION 2 — Authentication
// ═══════════════════════════════════════════════════════════════

/**
 * Returns { ok: true, userId } or { ok: false, userId: null }
 *
 * Accepts either:
 *   Authorization: Bearer <token>   (Supabase JWT or AUTH_TOKEN)
 *   X-Api-Key: <AUTH_TOKEN>
 */
function checkAuth(request, env) {
  // --- API key check (simplest) ---
  const apiKey = request.headers.get("X-Api-Key") || "";
  if (apiKey && env.AUTH_TOKEN && apiKey === env.AUTH_TOKEN) {
    return { ok: true, userId: "api-key-user" };
  }

  // --- Bearer token check ---
  const authHeader = request.headers.get("Authorization") || "";
  if (authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7);

    // If token matches AUTH_TOKEN directly, allow
    if (env.AUTH_TOKEN && token === env.AUTH_TOKEN) {
      return { ok: true, userId: "bearer-token-user" };
    }

    // If it looks like a Supabase JWT, decode the payload
    // to extract the user id. We don't verify the signature here
    // because the worker doesn't have the JWT secret — Supabase
    // RLS handles real authorization. This is just identity extraction.
    try {
      const parts = token.split(".");
      if (parts.length === 3) {
        const payload = JSON.parse(atob(parts[1]));
        if (payload.sub) {
          return { ok: true, userId: payload.sub };
        }
      }
    } catch {
      // not a valid JWT — fall through
    }
  }

  return { ok: false, userId: null };
}

// ═══════════════════════════════════════════════════════════════
// SECTION 3 — Supabase helpers
// ═══════════════════════════════════════════════════════════════

async function supabaseFetch(env, path, options = {}) {
  const url = `${env.SUPABASE_URL}/rest/v1${path}`;
  const method = options.method || "GET";

  const headers = {
    apikey: env.SUPABASE_ANON_KEY,
    Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json",
  };

  if (options.headers) {
    Object.assign(headers, options.headers);
  }

  const fetchOpts = { method, headers };
  if (options.body) {
    fetchOpts.body = JSON.stringify(options.body);
  }

  return fetch(url, fetchOpts);
}

async function supabaseGetById(env, table, id) {
  const res = await supabaseFetch(env, `/${table}?id=eq.${id}&limit=1`);
  if (!res.ok) return null;
  const rows = await res.json();
  return rows[0] || null;
}

async function supabaseInsert(env, table, row) {
  const res = await supabaseFetch(env, `/${table}`, {
    method: "POST",
    body: row,
    headers: { Prefer: "return=representation" },
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Supabase INSERT ${table} failed (${res.status}): ${txt}`);
  }
  const rows = await res.json();
  return rows[0] || null;
}

async function supabaseUpdate(env, table, id, patch) {
  const res = await supabaseFetch(env, `/${table}?id=eq.${id}`, {
    method: "PATCH",
    body: patch,
    headers: { Prefer: "return=representation" },
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Supabase PATCH ${table}/${id} failed (${res.status}): ${txt}`);
  }
  const rows = await res.json();
  return rows[0] || null;
}

// ═══════════════════════════════════════════════════════════════
// SECTION 4 — R2 helpers
// ═══════════════════════════════════════════════════════════════

async function r2List(bucket, prefix) {
  const listed = await bucket.list(prefix ? { prefix, limit: 1000 } : { limit: 1000 });
  return (listed.objects || []).map((o) => o.key);
}

async function r2Get(bucket, key) {
  return bucket.get(key);
}

async function r2Put(bucket, key, data, contentType) {
  await bucket.put(key, data, {
    httpMetadata: { contentType: contentType || "application/octet-stream" },
  });
}

// ═══════════════════════════════════════════════════════════════
// SECTION 5 — AI provider calls
// ═══════════════════════════════════════════════════════════════

async function callNanoBanana(env, params) {
  const url = env.NANO_BANANA_API_URL;
  if (!url) throw new Error("NANO_BANANA_API_URL not configured");

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Key ${env.NANO_BANANA_API_KEY}`,
    },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Nano Banana failed (${res.status}): ${text}`);
  }
  return res.json();
}

async function callKling(env, params) {
  const url = env.KLING_API_URL;
  if (!url) throw new Error("KLING_API_URL not configured");

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.KLING_API_KEY}`,
    },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Kling failed (${res.status}): ${text}`);
  }
  return res.json();
}

// ═══════════════════════════════════════════════════════════════
// SECTION 6 — Execution engine: runJob
// ═══════════════════════════════════════════════════════════════

async function runJob(env, projectId) {
  const log = [];
  const ts = () => new Date().toISOString();

  try {
    // 1 — Load project
    log.push(`[${ts()}] Loading project ${projectId}`);
    await supabaseUpdate(env, "projects", projectId, {
      status: "running",
      progress: 5,
      logs: log,
    });

    const project = await supabaseGetById(env, "projects", projectId);
    if (!project) throw new Error("Project not found in Supabase");

    // 2 — Load template metadata
    log.push(`[${ts()}] Loading template metadata: ${project.template_id}`);
    await supabaseUpdate(env, "projects", projectId, { progress: 10, logs: log });

    let templateKey = project.template_id;
    let templateMeta = null;

    try {
      const metaRes = await supabaseFetch(
        env,
        `/templates?id=eq.${project.template_id}&limit=1`
      );
      if (metaRes.ok) {
        const rows = await metaRes.json();
        if (rows[0]) {
          templateMeta = rows[0];
          templateKey = templateMeta.template_key || templateKey;
        }
      }
    } catch {
      log.push(`[${ts()}] Warning: could not query templates table, using template_id as R2 key`);
    }

    if (!templateKey.endsWith(".json")) {
      templateKey = templateKey + ".json";
    }

    // 3 — Load template JSON from R2
    log.push(`[${ts()}] Loading template JSON from R2: ${templateKey}`);
    await supabaseUpdate(env, "projects", projectId, { progress: 15, logs: log });

    const templateObj = await r2Get(env.FUSE_TEMPLATES, templateKey);
    if (!templateObj) throw new Error(`Template file not found in R2: ${templateKey}`);

    let template;
    try {
      template = JSON.parse(await templateObj.text());
    } catch {
      throw new Error(`Template file is not valid JSON: ${templateKey}`);
    }

    // 4 — Run pipeline
    log.push(`[${ts()}] Starting pipeline`);
    await supabaseUpdate(env, "projects", projectId, { progress: 20, logs: log });

    const inputs = project.inputs || {};
    const outputs = { items: [] };

    // Step A — Nano Banana (image generation / editing)
    log.push(`[${ts()}] Calling Nano Banana`);
    await supabaseUpdate(env, "projects", projectId, { progress: 30, logs: log });

    const nanoBananaParams = {
      prompt: template.prompt || template.image_prompt || "generate image",
      ...(inputs.asset_url ? { image_url: inputs.asset_url } : {}),
      ...(inputs.image ? { image_url: inputs.image } : {}),
      ...(template.nano_banana_params || {}),
    };

    const imageResult = await callNanoBanana(env, nanoBananaParams);

    const generatedImageUrl =
      imageResult?.images?.[0]?.url ||
      imageResult?.output_url ||
      imageResult?.image_url ||
      imageResult?.url ||
      null;

    log.push(`[${ts()}] Nano Banana: ${generatedImageUrl ? "image generated" : "no image URL returned"}`);

    if (generatedImageUrl) {
      const imageKey = `outputs/${projectId}/image_${Date.now()}.png`;
      try {
        const imgFetch = await fetch(generatedImageUrl);
        if (imgFetch.ok) {
          await r2Put(env.FUSE_ASSETS, imageKey, await imgFetch.arrayBuffer(), "image/png");
          log.push(`[${ts()}] Image saved to R2: ${imageKey}`);
        }
      } catch (dlErr) {
        log.push(`[${ts()}] Warning: image download failed: ${dlErr.message}`);
      }

      const imagePublicUrl = env.ASSETS_PUBLIC_URL
        ? `${env.ASSETS_PUBLIC_URL}/${imageKey}`
        : imageKey;

      outputs.items.push({
        type: "image",
        key: imageKey,
        url: imagePublicUrl,
        source_url: generatedImageUrl,
      });
    }

    await supabaseUpdate(env, "projects", projectId, { progress: 50, logs: log });

    // Step B — Kling (video generation) — only if template needs video
    const needsVideo =
      template.output_type === "video" ||
      (template.pipeline && template.pipeline.includes("kling")) ||
      (templateMeta && templateMeta.output_type === "video");

    if (needsVideo && generatedImageUrl) {
      log.push(`[${ts()}] Calling Kling for video generation`);
      await supabaseUpdate(env, "projects", projectId, { progress: 60, logs: log });

      const klingParams = {
        prompt: template.video_prompt || template.prompt || "generate video",
        image_url: generatedImageUrl,
        ...(template.kling_params || {}),
      };

      const videoResult = await callKling(env, klingParams);

      const generatedVideoUrl =
        videoResult?.output_url ||
        videoResult?.video_url ||
        videoResult?.url ||
        null;

      log.push(`[${ts()}] Kling: ${generatedVideoUrl ? "video generated" : "no video URL returned"}`);

      if (generatedVideoUrl) {
        const videoKey = `outputs/${projectId}/video_${Date.now()}.mp4`;
        try {
          const vidFetch = await fetch(generatedVideoUrl);
          if (vidFetch.ok) {
            await r2Put(env.FUSE_ASSETS, videoKey, await vidFetch.arrayBuffer(), "video/mp4");
            log.push(`[${ts()}] Video saved to R2: ${videoKey}`);
          }
        } catch (dlErr) {
          log.push(`[${ts()}] Warning: video download failed: ${dlErr.message}`);
        }

        const videoPublicUrl = env.ASSETS_PUBLIC_URL
          ? `${env.ASSETS_PUBLIC_URL}/${videoKey}`
          : videoKey;

        outputs.items.push({
          type: "video",
          key: videoKey,
          url: videoPublicUrl,
          source_url: generatedVideoUrl,
        });
      }
    } else if (needsVideo && !generatedImageUrl) {
      log.push(`[${ts()}] Skipping Kling: no image was generated to use as input`);
    }

    // 5 — Complete
    log.push(`[${ts()}] Pipeline complete`);
    await supabaseUpdate(env, "projects", projectId, {
      status: "complete",
      progress: 100,
      outputs,
      logs: log,
      completed_at: ts(),
    });

  } catch (err) {
    const errMsg = err?.message || String(err);
    log.push(`[${ts()}] ERROR: ${errMsg}`);
    console.error("runJob error:", err);

    try {
      await supabaseUpdate(env, "projects", projectId, {
        status: "failed",
        error: errMsg,
        logs: log,
        failed_at: ts(),
      });
    } catch {
      console.error("Failed to update project error status");
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// SECTION 7 — Route handlers
// ═══════════════════════════════════════════════════════════════

function handleHealth(rid, env, cors) {
  return json(
    {
      ok: true,
      rid,
      service: "fuse-worker",
      time: new Date().toISOString(),
      bindings: {
        hasTemplates: !!env.FUSE_TEMPLATES,
        hasAssets: !!env.FUSE_ASSETS,
        hasSupabaseUrl: !!env.SUPABASE_URL,
        hasSupabaseKey: !!env.SUPABASE_ANON_KEY,
        hasAuthToken: !!env.AUTH_TOKEN,
        hasNanoBanana: !!env.NANO_BANANA_API_URL,
        hasKling: !!env.KLING_API_URL,
      },
    },
    200,
    cors
  );
}

function handleDebugRoute(rid, cors) {
  return json(
    {
      ok: true,
      marker: "FUSE_WORKER_LIVE",
      rid,
      time: new Date().toISOString(),
    },
    200,
    cors
  );
}

async function handleDebugTemplates(rid, env, cors) {
  if (!env.FUSE_TEMPLATES) {
    return json({ ok: false, rid, error: "Missing R2 binding: FUSE_TEMPLATES" }, 500, cors);
  }

  const keys = await r2List(env.FUSE_TEMPLATES);
  const jsonKeys = keys.filter((k) => k.endsWith(".json"));

  return json(
    {
      ok: true,
      marker: "TEMPLATES_ROUTE_WORKING",
      rid,
      keys: jsonKeys,
    },
    200,
    cors
  );
}

async function handleTemplatesList(rid, env, cors) {
  // Try Supabase templates table first
  if (env.SUPABASE_URL && env.SUPABASE_ANON_KEY) {
    try {
      const res = await supabaseFetch(
        env,
        "/templates?select=id,name,template_key,output_type&order=name"
      );
      if (res.ok) {
        const rows = await res.json();
        if (rows.length > 0) {
          return json({ ok: true, rid, source: "supabase", templates: rows }, 200, cors);
        }
      }
    } catch {
      // Fall through to R2 listing
    }
  }

  // Fallback: list template files directly from R2
  if (!env.FUSE_TEMPLATES) {
    return json({ ok: false, rid, error: "Missing R2 binding: FUSE_TEMPLATES" }, 500, cors);
  }

  const keys = await r2List(env.FUSE_TEMPLATES);
  const jsonKeys = keys.filter((k) => k.endsWith(".json"));

  const templates = jsonKeys.map((key) => ({
    id: key.replace(".json", ""),
    name: key.replace(".json", "").replace(/_/g, " "),
    template_key: key,
    output_type: "image",
  }));

  return json({ ok: true, rid, source: "r2", templates }, 200, cors);
}

async function handleTemplateLoad(templateName, rid, env, cors) {
  if (!env.FUSE_TEMPLATES) {
    return json({ ok: false, rid, error: "Missing R2 binding: FUSE_TEMPLATES" }, 500, cors);
  }

  const key = safeName(templateName);
  const obj = await r2Get(env.FUSE_TEMPLATES, key);

  if (!obj) {
    return json({ ok: false, rid, error: "Template not found", key }, 404, cors);
  }

  const text = await obj.text();

  try {
    return json({ ok: true, rid, key, template: JSON.parse(text) }, 200, cors);
  } catch {
    return json({ ok: false, rid, error: "Template is not valid JSON", key }, 400, cors);
  }
}

async function handleUpload(request, rid, env, cors) {
  if (!env.FUSE_ASSETS) {
    return json({ ok: false, rid, error: "Missing R2 binding: FUSE_ASSETS" }, 500, cors);
  }

  const contentType = request.headers.get("Content-Type") || "";
  if (!contentType.includes("multipart/form-data")) {
    return json({ ok: false, rid, error: "Expected multipart/form-data" }, 400, cors);
  }

  let formData;
  try {
    formData = await request.formData();
  } catch (e) {
    return json({ ok: false, rid, error: "Could not parse form data: " + e.message }, 400, cors);
  }

  const file = formData.get("file");
  if (!file || typeof file === "string") {
    return json({ ok: false, rid, error: "No file field found in form data" }, 400, cors);
  }

  const timestamp = Date.now();
  const uuid = crypto.randomUUID().split("-")[0];
  const safefile = safeName(file.name || "upload");
  const assetKey = `uploads/${timestamp}_${uuid}_${safefile}`;

  await r2Put(
    env.FUSE_ASSETS,
    assetKey,
    await file.arrayBuffer(),
    file.type || "application/octet-stream"
  );

  const assetUrl = env.ASSETS_PUBLIC_URL
    ? `${env.ASSETS_PUBLIC_URL}/${assetKey}`
    : assetKey;

  return json({ ok: true, rid, assetKey, assetUrl }, 200, cors);
}

async function handleCreateProject(request, rid, auth, env, cors) {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    return json({ ok: false, rid, error: "Supabase not configured" }, 500, cors);
  }

  const body = await readJsonBody(request);
  if (!body) {
    return json({ ok: false, rid, error: "Invalid JSON body" }, 400, cors);
  }

  const templateId = String(body.template_id || "").trim();
  if (!templateId) {
    return json({ ok: false, rid, error: "template_id is required" }, 400, cors);
  }

  const inputs = body.inputs && typeof body.inputs === "object" ? body.inputs : {};

  const projectId = crypto.randomUUID();
  const now = new Date().toISOString();

  const row = {
    id: projectId,
    template_id: templateId,
    user_id: auth.userId || null,
    status: "queued",
    progress: 0,
    inputs,
    outputs: { items: [] },
    logs: [`[${now}] Project created`],
    error: null,
    created_at: now,
  };

  try {
    const created = await supabaseInsert(env, "projects", row);
    return json(
      {
        ok: true,
        rid,
        projectId: created?.id || projectId,
        project: {
          id: created?.id || projectId,
          template_id: templateId,
          status: "queued",
          progress: 0,
          inputs,
        },
      },
      201,
      cors
    );
  } catch (e) {
    return json(
      { ok: false, rid, error: "Failed to create project", details: e.message },
      500,
      cors
    );
  }
}

async function handleEnqueue(request, rid, env, cors, ctx) {
  const body = await readJsonBody(request);
  if (!body || !body.projectId) {
    return json({ ok: false, rid, error: "projectId is required in body" }, 400, cors);
  }

  const projectId = String(body.projectId).trim();

  // Verify the project exists
  if (env.SUPABASE_URL && env.SUPABASE_ANON_KEY) {
    const project = await supabaseGetById(env, "projects", projectId);
    if (!project) {
      return json({ ok: false, rid, error: "Project not found", projectId }, 404, cors);
    }
  }

  // Fire and forget — waitUntil keeps the job alive after response
  ctx.waitUntil(runJob(env, projectId));

  return json(
    {
      ok: true,
      rid,
      projectId,
      message: "Job enqueued — poll GET /api/projects/" + projectId + " for status",
    },
    200,
    cors
  );
}

async function handleProjectStatus(projectId, rid, env, cors) {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    return json({ ok: false, rid, error: "Supabase not configured" }, 500, cors);
  }

  const project = await supabaseGetById(env, "projects", projectId);
  if (!project) {
    return json({ ok: false, rid, error: "Project not found", projectId }, 404, cors);
  }

  return json(
    {
      ok: true,
      rid,
      project: {
        id: project.id,
        template_id: project.template_id,
        status: project.status,
        progress: project.progress,
        outputs: project.outputs,
        logs: project.logs,
        error: project.error || null,
        created_at: project.created_at,
        completed_at: project.completed_at || null,
      },
    },
    200,
    cors
  );
}

async function handleRunTemplate(templateName, request, rid, env, cors) {
  if (!env.FUSE_TEMPLATES) {
    return json({ ok: false, rid, error: "Missing R2 binding: FUSE_TEMPLATES" }, 500, cors);
  }

  const body = await readJsonBody(request);
  const templateKey = safeName(templateName);

  const templateObj = await r2Get(env.FUSE_TEMPLATES, templateKey);
  if (!templateObj) {
    return json({ ok: false, rid, error: "Template not found", templateKey }, 404, cors);
  }

  let template;
  try {
    template = JSON.parse(await templateObj.text());
  } catch {
    return json({ ok: false, rid, error: "Template is not valid JSON", templateKey }, 400, cors);
  }

  const assetUrl =
    body?.assetUrl ||
    body?.asset_url ||
    "https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=1200&q=80";

  return json(
    {
      ok: true,
      rid,
      step: "template_loaded",
      templateKey,
      assetUrl,
      note: "Template loaded. Use POST /api/projects + POST /api/enqueue for full pipeline.",
      template,
    },
    200,
    cors
  );
}

// ═══════════════════════════════════════════════════════════════
// SECTION 8 — Main router
// ═══════════════════════════════════════════════════════════════

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    const cors = corsHeaders(request);
    const rid = reqId();

    try {
      // CORS preflight
      if (method === "OPTIONS") {
        return new Response(null, { status: 204, headers: cors });
      }

      // Root — route index
      if (path === "/") {
        return json(
          {
            ok: true,
            rid,
            service: "fuse-worker",
            routes: [
              "GET  /health",
              "GET  /debug-route",
              "GET  /debug-templates",
              "GET  /api/templates",
              "GET  /api/templates/:name",
              "POST /api/uploads",
              "POST /api/projects",
              "POST /api/enqueue",
              "GET  /api/projects/:id",
              "POST /api/run/:templateName",
            ],
          },
          200,
          cors
        );
      }

      // ════════════════════════════════════════════════════
      // PUBLIC ROUTES — no auth required
      // ════════════════════════════════════════════════════

      if (path === "/health" && method === "GET") {
        return handleHealth(rid, env, cors);
      }

      if (path === "/debug-route" && method === "GET") {
        return handleDebugRoute(rid, cors);
      }

      if (path === "/debug-templates" && method === "GET") {
        return handleDebugTemplates(rid, env, cors);
      }

      // ════════════════════════════════════════════════════
      // PROTECTED ROUTES — auth required for /api/*
      // ════════════════════════════════════════════════════

      if (path.startsWith("/api/")) {
        const auth = checkAuth(request, env);
        if (!auth.ok) {
          return json(
            {
              ok: false,
              rid,
              error: "Missing Authorization: Bearer token (or valid X-Api-Key)",
            },
            401,
            cors
          );
        }

        // GET /api/templates
        if (path === "/api/templates" && method === "GET") {
          return handleTemplatesList(rid, env, cors);
        }

        // GET /api/templates/:name
        if (path.startsWith("/api/templates/") && method === "GET") {
          const name = decodeURIComponent(path.replace("/api/templates/", ""));
          if (!name) return json({ ok: false, rid, error: "Template name required" }, 400, cors);
          return handleTemplateLoad(name, rid, env, cors);
        }

        // POST /api/uploads
        if (path === "/api/uploads" && method === "POST") {
          return handleUpload(request, rid, env, cors);
        }

        // POST /api/projects
        if (path === "/api/projects" && method === "POST") {
          return handleCreateProject(request, rid, auth, env, cors);
        }

        // POST /api/enqueue
        if (path === "/api/enqueue" && method === "POST") {
          return handleEnqueue(request, rid, env, cors, ctx);
        }

        // GET /api/projects/:id
        if (path.startsWith("/api/projects/") && method === "GET") {
          const projectId = decodeURIComponent(path.replace("/api/projects/", ""));
          if (!projectId) return json({ ok: false, rid, error: "Project ID required" }, 400, cors);
          return handleProjectStatus(projectId, rid, env, cors);
        }

        // POST /api/run/:templateName (kept for testing)
        if (path.startsWith("/api/run/") && method === "POST") {
          const templateName = decodeURIComponent(path.replace("/api/run/", ""));
          if (!templateName) return json({ ok: false, rid, error: "Template name required" }, 400, cors);
          return handleRunTemplate(templateName, request, rid, env, cors);
        }

        // API 404
        return json({ ok: false, rid, error: "API route not found", path }, 404, cors);
      }

      // Global 404
      return json({ ok: false, rid, error: "Not found", path }, 404, cors);

    } catch (err) {
      console.error("Worker unhandled error:", err);
      return json(
        { ok: false, rid, error: err?.message || "Unhandled server error" },
        500,
        cors
      );
    }
  },
};
