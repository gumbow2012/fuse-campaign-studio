import { Env } from "../types";
import { verifyToken } from "../auth";
import { getProject, upsertStep } from "../supabase";

/**
 * POST /jobs/rerun-step
 * Reruns a specific step within a project.
 */
export async function handleRerun(
  request: Request,
  env: Env,
): Promise<Response> {
  const userId = await verifyToken(request, env);
  const { projectId, stepId } = (await request.json()) as {
    projectId: string;
    stepId: string;
  };

  const project = await getProject(env, projectId);
  if (!project || project.user_id !== userId) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  // Reset step to queued for admin fulfillment
  await upsertStep(env, projectId, stepId, {
    status: "queued",
    output_url: null,
  });

  // TODO: Trigger Weavy re-run when API is available

  return Response.json({ success: true });
}
