// ═══════════════════════════════════════════════════════════════
// FUSE Cloudflare Worker — Single-file bundle for Dashboard editor
// Paste this entire file into: Workers & Pages → fuse-worker → Quick Edit
//
// Required secrets (Settings → Variables & Secrets):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//   WEAVY_API_KEY, WEAVY_API_BASE_URL,
//   WEAVY_FIREBASE_API_KEY, WEAVY_REFRESH_TOKEN
//
// Required R2 binding (Settings → R2 Bucket Bindings):
//   Variable name: ASSETS  →  Bucket: fuse-assets
//
// Routes:
//   POST /weavy/trigger          ← NEW: single-call from frontend
//   POST /jobs/submit
//   GET  /jobs/:projectId/status
//   POST /jobs/rerun-step
//   POST /api/upload
//   POST /api/run-template       (legacy)
//   GET  /api/job/:jobId
//   GET  /assets/:key
//   GET  /health
//
// Generated: 2026-03-03
// ═══════════════════════════════════════════════════════════════

// ── Auth ──────────────────────────────────────────────────────
async function verifyToken(request, env) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new Error("Missing or invalid Authorization header");
  }
  const token = authHeader.slice(7);
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    },
  });
  if (!res.ok) throw new Error("Invalid or expired token");
  const user = await res.json();
  return user.id;
}

// ── Supabase helpers ──────────────────────────────────────────
async function supabaseFetch(env, path, opts) {
  return fetch(`${env.SUPABASE_URL}/rest/v1${path}`, {
    method: opts?.method ?? "GET",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...opts?.headers,
    },
    body: opts?.body ? JSON.stringify(opts.body) : undefined,
  });
}

async function updateProjectStatus(env, projectId, status, extra) {
  const body = { status, ...extra };
  const res = await supabaseFetch(env, `/projects?id=eq.${projectId}`, {
    method: "PATCH",
    body,
  });
  if (!res.ok) console.error("Failed to update project status:", await res.text());
}

async function getProject(env, projectId) {
  const res = await supabaseFetch(env, `/projects?id=eq.${projectId}&select=*`);
  if (!res.ok) throw new Error("Failed to fetch project");
  const rows = await res.json();
  return rows[0];
}

async function getTemplate(env, templateId) {
  const res = await supabaseFetch(env, `/templates?id=eq.${templateId}&select=*`);
  if (!res.ok) throw new Error("Failed to fetch template");
  const rows = await res.json();
  return rows[0];
}

async function upsertStep(env, projectId, stepKey, data) {
  const res = await supabaseFetch(env, "/project_steps", {
    method: "POST",
    body: { project_id: projectId, step_key: stepKey, ...data },
    headers: { Prefer: "return=representation,resolution=merge-duplicates" },
  });
  if (!res.ok) console.error("Failed to upsert step:", await res.text());
}

// ── R2 ────────────────────────────────────────────────────────
async function serveAsset(env, key) {
  const object = await env.ASSETS.get(key);
  if (!object) return new Response("Not found", { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Cache-Control", "public, max-age=3600");
  return new Response(object.body, { headers });
}

// ── Weavy (server-side only) ──────────────────────────────────
async function getWeavyIdToken(env) {
  const res = await fetch(
    `https://securetoken.googleapis.com/v1/token?key=${env.WEAVY_FIREBASE_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "refresh_token",
        refresh_token: env.WEAVY_REFRESH_TOKEN,
      }),
    },
  );
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Firebase token refresh failed (${res.status}): ${txt}`);
  }
  const data = await res.json();
  return data.id_token;
}

async function triggerWeavyRecipe(env, recipeId, inputs) {
  const idToken = await getWeavyIdToken(env);
  const url = `${env.WEAVY_API_BASE_URL}/api/v1/recipe-runs/recipes/${recipeId}/run`;
  console.log(`[weavy] triggering recipe=${recipeId}`);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ inputs }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Weavy trigger failed (${res.status}): ${body.slice(0, 1000)}`);
  }
  const data = await res.json();
  const runId = data.id || data.runId;
  console.log(`[weavy] run started runId=${runId}`);
  return { runId };
}

async function getWeavyRunStatus(env, recipeId, runId) {
  const idToken = await getWeavyIdToken(env);
  const url = `${env.WEAVY_API_BASE_URL}/api/v1/recipe-runs/recipes/${recipeId}/runs/status?runIds=${runId}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Weavy status poll failed (${res.status}): ${body.slice(0, 500)}`);
  }
  return res.json();
}

// ── Route: POST /jobs/submit ──────────────────────────────────
async function handleSubmit(request, env) {
  const userId = await verifyToken(request, env);
  const payload = await request.json();
  const project = await getProject(env, payload.projectId);
  if (!project || project.user_id !== userId) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }
  const template = await getTemplate(env, payload.templateId);
  if (!template) {
    return Response.json({ error: "Template not found" }, { status: 404 });
  }
  await updateProjectStatus(env, payload.projectId, "running", {
    started_at: new Date().toISOString(),
  });
  return Response.json({ jobId: payload.projectId, status: "running" });
}

// ── Route: GET /jobs/:projectId/status ────────────────────────
async function handleStatus(request, env, projectId) {
  const userId = await verifyToken(request, env);
  const project = await getProject(env, projectId);
  if (!project || project.user_id !== userId) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }
  return Response.json({
    status: project.status,
    outputs: project.outputs ?? undefined,
  });
}

// ── Route: POST /jobs/rerun-step ──────────────────────────────
async function handleRerun(request, env) {
  const userId = await verifyToken(request, env);
  const { projectId, stepId } = await request.json();
  const project = await getProject(env, projectId);
  if (!project || project.user_id !== userId) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }
  await upsertStep(env, projectId, stepId, { status: "queued", output_url: null });
  return Response.json({ success: true });
}

// ── Route: POST /api/upload ───────────────────────────────────
async function handleUpload(request, env) {
  const userId = await verifyToken(request, env);
  const formData = await request.formData();
  const file = formData.get("file");
  if (!file) return Response.json({ error: "No file provided" }, { status: 400 });
  const ext = file.name.split(".").pop() || "png";
  const key = `uploads/${userId}/${Date.now()}.${ext}`;
  await env.ASSETS.put(key, file.stream(), {
    httpMetadata: { contentType: file.type || "image/png" },
  });
  const workerUrl = new URL(request.url).origin;
  const imageUrl = `${workerUrl}/assets/${encodeURIComponent(key)}`;
  console.log(`[upload] stored key=${key} for user=${userId}`);
  return Response.json({ imageUrl, key });
}

// ── Route: POST /api/run-template (legacy) ────────────────────
async function handleRunTemplate(request, env) {
  const userId = await verifyToken(request, env);
  const body = await request.json();
  if (!body.templateId) return Response.json({ error: "templateId is required" }, { status: 400 });

  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.templateId);
  let recipeId, creditCost = 0, templateName = body.templateId, supabaseTemplateId = null;

  if (isUUID) {
    const template = await getTemplate(env, body.templateId);
    if (!template) return Response.json({ error: "Template not found" }, { status: 404 });
    recipeId = template.weavy_recipe_id;
    if (!recipeId) return Response.json({ error: "Template has no weavy_recipe_id" }, { status: 400 });
    creditCost = template.estimated_credits_per_run || 0;
    templateName = template.name || body.templateId;
    supabaseTemplateId = body.templateId;
  } else {
    recipeId = body.templateId;
    const tplRes = await supabaseFetch(env, `/templates?weavy_recipe_id=eq.${recipeId}&select=*&limit=1`);
    if (tplRes.ok) {
      const rows = await tplRes.json();
      if (rows[0]) {
        creditCost = rows[0].estimated_credits_per_run || 0;
        templateName = rows[0].name || recipeId;
        supabaseTemplateId = rows[0].id;
      }
    }
  }

  const profRes = await supabaseFetch(env, `/profiles?user_id=eq.${userId}&select=credits_balance`);
  if (!profRes.ok) throw new Error("Failed to fetch profile");
  const profiles = await profRes.json();
  const profile = profiles[0];
  if (!profile) return Response.json({ error: "Profile not found" }, { status: 404 });
  if (creditCost > 0 && profile.credits_balance < creditCost) {
    return Response.json({ error: `Insufficient credits: have ${profile.credits_balance}, need ${creditCost}` }, { status: 402 });
  }

  const projectTemplateId = supabaseTemplateId;
  if (!projectTemplateId) {
    return Response.json({ error: `No matching template found in DB for recipe ${recipeId}` }, { status: 400 });
  }

  const projRes = await supabaseFetch(env, "/projects", {
    method: "POST",
    body: { user_id: userId, template_id: projectTemplateId, status: "queued", inputs: body.inputs },
    headers: { Prefer: "return=representation" },
  });
  if (!projRes.ok) {
    const txt = await projRes.text();
    return Response.json({ error: `Project creation failed: ${txt}` }, { status: 500 });
  }
  const [project] = await projRes.json();

  if (creditCost > 0) {
    await supabaseFetch(env, `/profiles?user_id=eq.${userId}`, {
      method: "PATCH",
      body: { credits_balance: profile.credits_balance - creditCost },
    });
    await supabaseFetch(env, "/credit_ledger", {
      method: "POST",
      body: {
        user_id: userId, type: "run_template", amount: -creditCost,
        template_id: projectTemplateId, project_id: project.id,
        description: `Run template: ${templateName}`,
      },
    });
  }

  try {
    const { runId } = await triggerWeavyRecipe(env, recipeId, body.inputs);
    await updateProjectStatus(env, project.id, "running", {
      weavy_run_id: runId, started_at: new Date().toISOString(),
      debug_trace: { weavy_recipe_id: recipeId, weavy_run_id: runId, inputs: body.inputs },
    });
    return Response.json({ jobId: project.id, status: "running", weavyRunId: runId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[run-template] Weavy trigger error: ${msg}`);
    await updateProjectStatus(env, project.id, "failed", {
      error: msg.slice(0, 5000), failed_at: new Date().toISOString(), failed_source: "weavy_trigger",
    });
    return Response.json({ jobId: project.id, status: "failed", error: msg }, { status: 500 });
  }
}

// ── Route: GET /api/job/:jobId ────────────────────────────────
async function handleJobStatus(request, env, jobId) {
  const userId = await verifyToken(request, env);
  const project = await getProject(env, jobId);
  if (!project || project.user_id !== userId) {
    return Response.json({ error: "Job not found" }, { status: 404 });
  }

  if (project.status === "complete" || project.status === "failed") {
    const outputs = project.outputs;
    return Response.json({
      status: project.status,
      outputImageUrl: outputs?.items?.find((i) => i.type === "image")?.url ?? null,
      outputVideoUrl: outputs?.items?.find((i) => i.type === "video")?.url ?? null,
      error: project.error ?? undefined,
    });
  }

  if (project.status === "running" && project.weavy_run_id) {
    try {
      const template = await getTemplate(env, project.template_id);
      const recipeId = template?.weavy_recipe_id;
      if (recipeId) {
        const weavyStatus = await getWeavyRunStatus(env, recipeId, project.weavy_run_id);
        console.log(`[job-status] Weavy status for ${jobId}:`, JSON.stringify(weavyStatus));
        const statusData = Array.isArray(weavyStatus) ? weavyStatus[0] : weavyStatus;
        const wStatus = (statusData?.status || "running").toLowerCase();

        if (wStatus === "completed" || wStatus === "complete" || wStatus === "succeeded") {
          const rawOutputs = statusData?.results || statusData?.outputs || [];
          const items = [];
          for (const out of (Array.isArray(rawOutputs) ? rawOutputs : [rawOutputs])) {
            const url = out?.url || out?.output_url || out?.value;
            if (url) {
              const isVideo = /\.(mp4|mov|webm)/i.test(url) || out?.type === "video";
              items.push({ type: isVideo ? "video" : "image", url });
            }
          }
          await updateProjectStatus(env, jobId, "complete", {
            completed_at: new Date().toISOString(), outputs: { items },
          });
          return Response.json({
            status: "succeeded",
            outputImageUrl: items.find((i) => i.type === "image")?.url ?? null,
            outputVideoUrl: items.find((i) => i.type === "video")?.url ?? null,
          });
        }

        if (wStatus === "failed" || wStatus === "error") {
          const errMsg = statusData?.error || "Weavy job failed";
          await updateProjectStatus(env, jobId, "failed", {
            error: errMsg, failed_at: new Date().toISOString(), failed_source: "weavy_run",
          });
          return Response.json({ status: "failed", error: errMsg });
        }

        return Response.json({ status: "running", progress: statusData?.progress ?? undefined });
      }
    } catch (err) {
      console.error(`[job-status] poll error: ${err}`);
    }
  }

  return Response.json({ status: project.status });
}

// ── Route: POST /weavy/trigger ────────────────────────────────
// Single-call endpoint: credits + project + Weavy trigger
async function handleWeavyTrigger(request, env) {
  const userId = await verifyToken(request, env);
  const body = await request.json();

  if (!body.recipeId || !body.imageUrl) {
    return Response.json({ error: "recipeId and imageUrl are required" }, { status: 400 });
  }

  console.log(`[weavy/trigger] user=${userId} recipe=${body.recipeId}`);

  // Look up template by weavy_recipe_id
  const tplRes = await supabaseFetch(env, `/templates?weavy_recipe_id=eq.${body.recipeId}&is_active=eq.true&select=*&limit=1`);
  if (!tplRes.ok) return Response.json({ error: "Failed to look up template" }, { status: 500 });
  const templates = await tplRes.json();
  const template = templates[0];
  if (!template) return Response.json({ error: `No active template found for recipe ${body.recipeId}` }, { status: 404 });

  const creditCost = template.estimated_credits_per_run || 0;
  const templateName = template.name || body.recipeId;
  const templateId = template.id;

  // Check credits
  const profRes = await supabaseFetch(env, `/profiles?user_id=eq.${userId}&select=credits_balance`);
  if (!profRes.ok) throw new Error("Failed to fetch profile");
  const profiles = await profRes.json();
  const profile = profiles[0];
  if (!profile) return Response.json({ error: "Profile not found" }, { status: 404 });
  if (creditCost > 0 && profile.credits_balance < creditCost) {
    return Response.json({ error: `Insufficient credits: have ${profile.credits_balance}, need ${creditCost}` }, { status: 402 });
  }

  // Create project
  const projRes = await supabaseFetch(env, "/projects", {
    method: "POST",
    body: {
      user_id: userId, template_id: templateId, status: "queued",
      inputs: { product_image: body.imageUrl },
    },
    headers: { Prefer: "return=representation" },
  });
  if (!projRes.ok) {
    const txt = await projRes.text();
    return Response.json({ error: `Project creation failed: ${txt}` }, { status: 500 });
  }
  const [project] = await projRes.json();

  // Deduct credits
  if (creditCost > 0) {
    await supabaseFetch(env, `/profiles?user_id=eq.${userId}`, {
      method: "PATCH",
      body: { credits_balance: profile.credits_balance - creditCost },
    });
    await supabaseFetch(env, "/credit_ledger", {
      method: "POST",
      body: {
        user_id: userId, type: "run_template", amount: -creditCost,
        template_id: templateId, project_id: project.id,
        description: `Run template: ${templateName}`,
      },
    });
  }

  // Trigger Weavy (Firebase token exchange happens here, server-side)
  try {
    const { runId } = await triggerWeavyRecipe(env, body.recipeId, { product_image: body.imageUrl });
    await updateProjectStatus(env, project.id, "running", {
      weavy_run_id: runId, started_at: new Date().toISOString(),
      debug_trace: {
        weavy_recipe_id: body.recipeId, weavy_run_id: runId,
        inputs: { product_image: body.imageUrl }, triggered_via: "cf_worker",
      },
    });
    return Response.json({ projectId: project.id, weavyRunId: runId, status: "running" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[weavy/trigger] error: ${msg}`);
    await updateProjectStatus(env, project.id, "failed", {
      error: msg.slice(0, 5000), failed_at: new Date().toISOString(), failed_source: "weavy_trigger",
    });
    return Response.json({ projectId: project.id, error: msg, status: "failed" }, { status: 500 });
  }
}

// ── CORS + Entrypoint ─────────────────────────────────────────
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function corsResponse(response) {
  const newHeaders = new Headers(response.headers);
  for (const [k, v] of Object.entries(CORS_HEADERS)) newHeaders.set(k, v);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      let response;

      // ── Job routes ──
      if (path === "/jobs/submit" && request.method === "POST") {
        response = await handleSubmit(request, env);
      } else if (path.match(/^\/jobs\/[^/]+\/status$/) && request.method === "GET") {
        const projectId = path.split("/")[2];
        response = await handleStatus(request, env, projectId);
      } else if (path === "/jobs/rerun-step" && request.method === "POST") {
        response = await handleRerun(request, env);

      // ── Weavy trigger (single-call from frontend) ──
      } else if (path === "/weavy/trigger" && request.method === "POST") {
        response = await handleWeavyTrigger(request, env);

      // ── Papparazi pipeline (legacy) ──
      } else if (path === "/api/upload" && request.method === "POST") {
        response = await handleUpload(request, env);
      } else if (path === "/api/run-template" && request.method === "POST") {
        response = await handleRunTemplate(request, env);
      } else if (path.match(/^\/api\/job\/[^/]+$/) && request.method === "GET") {
        const jobId = path.split("/")[3];
        response = await handleJobStatus(request, env, jobId);

      // ── R2 asset proxy ──
      } else if (path.startsWith("/assets/") && request.method === "GET") {
        const key = decodeURIComponent(path.slice("/assets/".length));
        response = await serveAsset(env, key);

      // ── Health check ──
      } else if (path === "/health") {
        response = Response.json({ ok: true, timestamp: Date.now() });

      } else {
        response = Response.json({ error: "Not found" }, { status: 404 });
      }

      return corsResponse(response);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Internal error";
      const status = message.includes("Missing") || message.includes("Invalid") ? 401 : 500;
      return corsResponse(Response.json({ error: message }, { status }));
    }
  },
};
