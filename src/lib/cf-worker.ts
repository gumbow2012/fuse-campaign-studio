/**
 * Cloudflare Worker API client.
 *
 * All job orchestration (submission, polling, reruns) goes through the
 * CF Worker. Supabase still owns auth, credits, and project records.
 */

const CF_WORKER_URL = import.meta.env.VITE_CF_WORKER_URL as string | undefined;

if (!CF_WORKER_URL) {
  console.warn("[cf-worker] VITE_CF_WORKER_URL is not set — CF Worker calls will fail.");
}

/** Thin wrapper around fetch that attaches the Supabase JWT. */
async function cfFetch<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown; token: string },
): Promise<T> {
  if (!CF_WORKER_URL) throw new Error("VITE_CF_WORKER_URL is not configured");

  const url = `${CF_WORKER_URL.replace(/\/+$/, "")}${path}`;

  const res = await fetch(url, {
    method: opts.method ?? "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${opts.token}`,
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error((data as any).error || `CF Worker ${res.status}`);
  }

  return data as T;
}

/* ──────────────────────── Public API ──────────────────────── */

export interface SubmitJobPayload {
  projectId: string;
  templateId: string;
  inputs: Record<string, string>;
}

export interface SubmitJobResponse {
  jobId: string;
  status: string;
}

/** Submit a job to the CF Worker for orchestration. */
export async function submitJob(
  payload: SubmitJobPayload,
  token: string,
): Promise<SubmitJobResponse> {
  return cfFetch<SubmitJobResponse>("/jobs/submit", {
    method: "POST",
    body: payload,
    token,
  });
}

export interface JobStatusResponse {
  status: "queued" | "running" | "complete" | "failed";
  progress?: number;
  outputs?: { items?: { type: string; url: string; label?: string }[] };
  error?: string;
}

/** Poll the CF Worker for job status. */
export async function getJobStatus(
  projectId: string,
  token: string,
): Promise<JobStatusResponse> {
  return cfFetch<JobStatusResponse>(`/jobs/${projectId}/status`, {
    method: "GET",
    token,
  });
}

export interface RerunStepPayload {
  projectId: string;
  stepId: string;
}

/** Ask the CF Worker to rerun a single step. */
export async function rerunStep(
  payload: RerunStepPayload,
  token: string,
): Promise<{ success: boolean }> {
  return cfFetch<{ success: boolean }>("/jobs/rerun-step", {
    method: "POST",
    body: payload,
    token,
  });
}
