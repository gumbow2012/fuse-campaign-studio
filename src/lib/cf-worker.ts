/**
 * Cloudflare Worker API client.
 *
 * All job orchestration (submission, polling, reruns) goes through the
 * CF Worker. Supabase still owns auth, credits, and project records.
 */

const CF_WORKER_URL = import.meta.env.VITE_CF_WORKER_URL as string | undefined;

/** Whether the CF Worker URL is configured. Use this to show UI warnings. */
export const isCfWorkerConfigured = !!CF_WORKER_URL;

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

/* ──────────────── Papparazi Pipeline API ──────────────── */

/** Upload an image to the CF Worker → R2. */
export async function uploadImageToWorker(
  file: File,
  token: string,
): Promise<{ imageUrl: string; key: string }> {
  if (!CF_WORKER_URL) throw new Error("VITE_CF_WORKER_URL is not configured");

  const url = `${CF_WORKER_URL.replace(/\/+$/, "")}/api/upload`;
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any).error || `Upload failed ${res.status}`);
  return data as { imageUrl: string; key: string };
}

export interface RunTemplatePayload {
  templateId: string;
  inputs: Record<string, string>;
}

export interface RunTemplateResponse {
  jobId: string;
  status: string;
  weavyRunId?: string;
  error?: string;
}

/** Trigger a template run via the CF Worker. */
export async function runTemplate(
  payload: RunTemplatePayload,
  token: string,
): Promise<RunTemplateResponse> {
  return cfFetch<RunTemplateResponse>("/api/run-template", {
    method: "POST",
    body: payload,
    token,
  });
}

export interface TriggerWeavyPayload {
  projectId: string;
  recipeId: string;
  inputs: Record<string, string>;
}

export interface TriggerWeavyResponse {
  weavyRunId: string;
  status: string;
  error?: string;
}

/** Tell the CF Worker to trigger a Weavy recipe for an existing project. */
export async function triggerWeavy(
  payload: TriggerWeavyPayload,
  token: string,
): Promise<TriggerWeavyResponse> {
  return cfFetch<TriggerWeavyResponse>("/weavy/trigger", {
    method: "POST",
    body: payload,
    token,
  });
}

export interface PapparaziJobStatus {
  status: "running" | "succeeded" | "failed" | "queued" | "complete";
  progress?: number;
  outputImageUrl?: string | null;
  outputVideoUrl?: string | null;
  error?: string;
}

/** Poll the CF Worker for Papparazi job status. */
export async function getPapparaziJobStatus(
  jobId: string,
  token: string,
): Promise<PapparaziJobStatus> {
  return cfFetch<PapparaziJobStatus>(`/api/job/${jobId}`, {
    method: "GET",
    token,
  });
}
