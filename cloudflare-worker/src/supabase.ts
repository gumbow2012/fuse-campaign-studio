import { Env } from "./types";

/** Helper to make authenticated Supabase REST API calls. */
async function supabaseFetch(
  env: Env,
  path: string,
  opts?: { method?: string; body?: unknown; headers?: Record<string, string> },
): Promise<Response> {
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

/** Update a project's status in Supabase. */
export async function updateProjectStatus(
  env: Env,
  projectId: string,
  status: "queued" | "running" | "complete" | "failed",
  extra?: { outputs?: unknown; started_at?: string; completed_at?: string; failed_at?: string },
) {
  const body: Record<string, unknown> = { status, ...extra };
  const res = await supabaseFetch(env, `/projects?id=eq.${projectId}`, {
    method: "PATCH",
    body,
  });
  if (!res.ok) {
    console.error("Failed to update project status:", await res.text());
  }
}

/** Fetch a project by ID. */
export async function getProject(env: Env, projectId: string) {
  const res = await supabaseFetch(env, `/projects?id=eq.${projectId}&select=*`);
  if (!res.ok) throw new Error("Failed to fetch project");
  const rows = (await res.json()) as unknown[];
  return rows[0] as Record<string, unknown> | undefined;
}

/** Fetch a template by ID. */
export async function getTemplate(env: Env, templateId: string) {
  const res = await supabaseFetch(env, `/templates?id=eq.${templateId}&select=*`);
  if (!res.ok) throw new Error("Failed to fetch template");
  const rows = (await res.json()) as unknown[];
  return rows[0] as Record<string, unknown> | undefined;
}

/** Upsert project steps. */
export async function upsertStep(
  env: Env,
  projectId: string,
  stepKey: string,
  data: Record<string, unknown>,
) {
  const res = await supabaseFetch(env, "/project_steps", {
    method: "POST",
    body: { project_id: projectId, step_key: stepKey, ...data },
    headers: { Prefer: "return=representation,resolution=merge-duplicates" },
  });
  if (!res.ok) {
    console.error("Failed to upsert step:", await res.text());
  }
}
