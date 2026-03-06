/**
 * Fuse Worker API client — Flow B only.
 *
 * All orchestration goes through the Cloudflare Worker.
 * The frontend never calls fal, Kling, or Weavy directly.
 */

import { supabase } from "@/integrations/supabase/client";

const API_BASE =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ||
  (import.meta.env.VITE_CF_WORKER_URL as string | undefined) ||
  "https://shiny-rice-e95bfuse-api.kade-fc1.workers.dev";

async function getToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error("Not authenticated");
  return token;
}

async function apiFetch<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown; token?: string } = {}
): Promise<T> {
  const token = opts.token || (await getToken());
  const url = `${API_BASE.replace(/\/+$/, "")}${path}`;

  const res = await fetch(url, {
    method: opts.method ?? "GET",
    headers: {
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
      Authorization: `Bearer ${token}`,
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any).error || `API ${res.status}`);
  return data as T;
}

/* ──────────────── Templates ──────────────── */

export interface Template {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  preview_url: string | null;
  estimated_credits_per_run: number;
  input_schema: InputField[] | null;
  output_type: string | null;
  tags: string[] | null;
}

export interface InputField {
  key: string;
  label: string;
  type: "image" | "text";
  required?: boolean;
}

export async function listTemplates(): Promise<Template[]> {
  const res = await apiFetch<{ ok: boolean; templates: Template[] }>("/api/templates");
  return res.templates;
}

/* ──────────────── Upload ──────────────── */

export interface UploadResult {
  ok: boolean;
  assetKey: string;
  assetUrl: string;
}

export async function uploadFile(file: File): Promise<UploadResult> {
  const token = await getToken();
  const url = `${API_BASE.replace(/\/+$/, "")}/api/uploads`;

  const fd = new FormData();
  fd.append("file", file);

  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });

  const data = await res.json().catch(() => ({})) as any;
  if (!res.ok || !data.ok) throw new Error(data.error || `Upload failed (${res.status})`);
  return data as UploadResult;
}

/* ──────────────── Projects ──────────────── */

export interface CreateProjectPayload {
  template_id: string;
  inputs: Record<string, string>;
}

export async function createProject(payload: CreateProjectPayload): Promise<string> {
  const res = await apiFetch<{ ok: boolean; projectId: string }>("/api/projects", {
    method: "POST",
    body: payload,
  });
  return res.projectId;
}

export async function enqueueProject(projectId: string): Promise<void> {
  await apiFetch("/api/enqueue", {
    method: "POST",
    body: { projectId },
  });
}

/* ──────────────── Status polling ──────────────── */

export interface ProjectStatus {
  status: "queued" | "running" | "complete" | "failed";
  progress: number;
  logs: string[];
  outputs: { items?: { type: string; url: string; label?: string }[] } | null;
  error: string | null;
  attempts: number;
  maxAttempts: number;
}

export async function getProjectStatus(projectId: string): Promise<ProjectStatus> {
  return apiFetch<ProjectStatus>(`/api/projects/${projectId}`);
}
