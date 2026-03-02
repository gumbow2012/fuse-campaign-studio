import { Env, JobPayload } from "../types";
import { verifyToken } from "../auth";
import { updateProjectStatus, getProject, getTemplate } from "../supabase";

/**
 * POST /jobs/submit
 * Accepts a job from the frontend, validates ownership, and marks
 * the project as "running". In production this would trigger the
 * Weavy recipe; for the MVP the admin fulfillment flow takes over.
 */
export async function handleSubmit(
  request: Request,
  env: Env,
): Promise<Response> {
  const userId = await verifyToken(request, env);
  const payload = (await request.json()) as JobPayload;

  // Validate project belongs to user
  const project = await getProject(env, payload.projectId);
  if (!project || project.user_id !== userId) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  // Fetch template for future Weavy integration
  const template = await getTemplate(env, payload.templateId);
  if (!template) {
    return Response.json({ error: "Template not found" }, { status: 404 });
  }

  // Mark project as running
  await updateProjectStatus(env, payload.projectId, "running", {
    started_at: new Date().toISOString(),
  });

  // TODO: When Weavy API is available, trigger the recipe here
  // For now, the admin fulfillment flow handles processing

  return Response.json({
    jobId: payload.projectId,
    status: "running",
  });
}
