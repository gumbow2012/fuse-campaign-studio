import type { Env } from "./auth";

export async function supabaseFetch(
  env: Env,
  path: string,
  opts?: {
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
  }
) {
  return fetch(`${env.SUPABASE_URL}/rest/v1${path}`, {
    method: opts?.method ?? "GET",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(opts?.headers ?? {}),
    },
    body: opts?.body ? JSON.stringify(opts.body) : undefined,
  });
}

export async function updateProjectStatus(
  env: Env,
  projectId: string,
  status: string,
  extra?: Record<string, unknown>
) {
  const body = { status, ...(extra ?? {}) };
  const res = await supabaseFetch(env, `/projects?id=eq.${projectId}`, {
    method: "PATCH",
    body,
  });

  if (!res.ok) {
    console.error("Failed to update project status:", await res.text());
  }
}

export async function getProject(env: Env, projectId: string) {
  const res = await supabaseFetch(env, `/projects?id=eq.${projectId}&select=*`);
  if (!res.ok) throw new Error("Failed to fetch project");
  const rows = await res.json<any[]>();
  return rows[0];
}

export async function getTemplate(env: Env, templateId: string) {
  const res = await supabaseFetch(env, `/templates?id=eq.${templateId}&select=*`);
  if (!res.ok) throw new Error("Failed to fetch template");
  const rows = await res.json<any[]>();
  return rows[0];
}

export async function upsertStep(
  env: Env,
  projectId: string,
  stepKey: string,
  data: Record<string, unknown>
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
