// ═══════════════════════════════════════════════════════════════
// FUSE Cloudflare Worker — Single-file bundle for Dashboard editor
// Paste this entire file into: Workers & Pages → fuse-worker → Quick Edit
//
// Required secrets (Settings → Variables & Secrets):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//   WEAVY_API_KEY, WEAVY_API_BASE_URL
//
// Required R2 binding (Settings → R2 Bucket Bindings):
//   Variable name: ASSETS  →  Bucket: fuse-assets
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

// ── R2 helpers ────────────────────────────────────────────────
async function serveAsset(env, key) {
  const object = await env.ASSETS.get(key);
  if (!object) return new Response("Not found", { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Cache-Control", "public, max-age=3600");
  return new Response(object.body, { headers });
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

  await upsertStep(env, projectId, stepId, {
    status: "queued",
    output_url: null,
  });

  return Response.json({ success: true });
}

// ── CORS ──────────────────────────────────────────────────────
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

// ── Main entry ────────────────────────────────────────────────
export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      let response;

      if (path === "/jobs/submit" && request.method === "POST") {
        response = await handleSubmit(request, env);
      } else if (path.match(/^\/jobs\/[^/]+\/status$/) && request.method === "GET") {
        const projectId = path.split("/")[2];
        response = await handleStatus(request, env, projectId);
      } else if (path === "/jobs/rerun-step" && request.method === "POST") {
        response = await handleRerun(request, env);
      } else if (path.startsWith("/assets/") && request.method === "GET") {
        const key = decodeURIComponent(path.slice("/assets/".length));
        response = await serveAsset(env, key);
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
