import { Env, JobStatusResponse } from "../types";
import { verifyToken } from "../auth";
import { getProject } from "../supabase";

/**
 * GET /jobs/:projectId/status
 * Returns the current status of a job by reading from Supabase.
 */
export async function handleStatus(
  request: Request,
  env: Env,
  projectId: string,
): Promise<Response> {
  const userId = await verifyToken(request, env);

  const project = await getProject(env, projectId);
  if (!project || project.user_id !== userId) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  const outputs = project.outputs as JobStatusResponse["outputs"] | null;

  const response: JobStatusResponse = {
    status: project.status as JobStatusResponse["status"],
    outputs: outputs ?? undefined,
  };

  return Response.json(response);
}
