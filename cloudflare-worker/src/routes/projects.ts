import type { Env } from "../auth";
import { verifyToken } from "../auth";
import { supabaseFetch, getTemplate } from "../supabase";

/**
 * GET /api/templates — list active templates
 */
export async function handleListTemplates(request: Request, env: Env) {
  const res = await supabaseFetch(env, `/templates?is_active=eq.true&select=id,name,description,category,preview_url,estimated_credits_per_run,input_schema,output_type,tags&order=created_at.desc`);

  if (!res.ok) {
    const txt = await res.text();
    return Response.json({ error: `Failed to fetch templates: ${txt}` }, { status: 500 });
  }

  const templates = await res.json<any[]>();
  return Response.json({ ok: true, templates });
}

/**
 * POST /api/projects — create a project record (Flow B)
 *
 * Body: { template_id: string, inputs: Record<string, string> }
 * Returns: { ok: true, projectId: string, project: {...} }
 */
export async function handleCreateProject(request: Request, env: Env) {
  const userId = await verifyToken(request, env);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const templateId = String(body.template_id || "").trim();
  const inputs = body.inputs && typeof body.inputs === "object" ? body.inputs : null;

  if (!templateId) {
    return Response.json({ ok: false, error: "template_id required" }, { status: 400 });
  }

  if (!inputs) {
    return Response.json({ ok: false, error: "inputs object required" }, { status: 400 });
  }

  // Verify template exists
  const template = await getTemplate(env, templateId);
  if (!template) {
    return Response.json({ ok: false, error: "Template not found", template_id: templateId }, { status: 404 });
  }

  const projectId = crypto.randomUUID();
  const now = new Date().toISOString();

  const projectRow = {
    id: projectId,
    template_id: templateId,
    user_id: userId,
    status: "queued",
    progress: 0,
    inputs,
    outputs: { items: [] },
    logs: [`[${now}] Project created`],
    attempts: 0,
    max_attempts: 3,
    error: null,
    created_at: now,
    started_at: null,
    completed_at: null,
    failed_at: null,
  };

  const res = await supabaseFetch(env, "/projects", {
    method: "POST",
    body: projectRow,
    headers: { Prefer: "return=representation" },
  });

  if (!res.ok) {
    const txt = await res.text();
    return Response.json(
      { ok: false, error: "Failed to create project", details: txt.slice(0, 1000) },
      { status: 500 }
    );
  }

  const rows = await res.json<any[]>();
  const created = rows?.[0] || projectRow;

  return Response.json({
    ok: true,
    projectId: created.id,
    project: {
      id: created.id,
      template_id: created.template_id,
      status: created.status,
      progress: created.progress,
      inputs: created.inputs,
    },
  });
}
