import type { Env } from "../auth";
import { verifyToken } from "../auth";
import { supabaseFetch } from "../supabase";

/**
 * GET /api/templates — list active templates
 */
export async function handleListTemplates(request: Request, env: Env) {
  // No auth required for listing templates
  const res = await supabaseFetch(env, `/templates?is_active=eq.true&select=id,name,description,category,preview_url,estimated_credits_per_run,input_schema,output_type,tags&order=created_at.desc`);

  if (!res.ok) {
    const txt = await res.text();
    return Response.json({ error: `Failed to fetch templates: ${txt}` }, { status: 500 });
  }

  const templates = await res.json<any[]>();
  return Response.json({ ok: true, templates });
}

/**
 * POST /api/projects — create a project record
 *
 * Body: { template_id: string, inputs: Record<string, string> }
 * Returns: { ok: true, projectId: string }
 */
export async function handleCreateProject(request: Request, env: Env) {
  const userId = await verifyToken(request, env);

  const body = await request.json<{ template_id?: string; inputs?: Record<string, any> }>();

  if (!body.template_id) {
    return Response.json({ error: "template_id is required" }, { status: 400 });
  }

  // Verify template exists
  const tplRes = await supabaseFetch(env, `/templates?id=eq.${body.template_id}&select=id,estimated_credits_per_run`);
  if (!tplRes.ok) {
    return Response.json({ error: "Failed to look up template" }, { status: 500 });
  }
  const templates = await tplRes.json<any[]>();
  if (!templates.length) {
    return Response.json({ error: "Template not found" }, { status: 404 });
  }

  // Create the project
  const projectBody = {
    user_id: userId,
    template_id: body.template_id,
    inputs: body.inputs || {},
    status: "queued",
    progress: 0,
    logs: [],
    attempts: 0,
    max_attempts: 3,
  };

  const createRes = await supabaseFetch(env, "/projects", {
    method: "POST",
    body: projectBody,
    headers: { Prefer: "return=representation" },
  });

  if (!createRes.ok) {
    const txt = await createRes.text();
    return Response.json({ error: `Failed to create project: ${txt}` }, { status: 500 });
  }

  const rows = await createRes.json<any[]>();
  const project = rows[0];

  return Response.json({ ok: true, projectId: project.id });
}
