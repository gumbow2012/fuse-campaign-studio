/**
 * FUSE API Service — Single source of truth for all Cloudflare Worker calls.
 * Every request uses the Supabase JWT as Bearer token.
 */

const WORKER_BASE = import.meta.env.VITE_CF_WORKER_URL as string
  || 'https://shiny-rice-e95bfuse-api.kade-fc1.workers.dev';

function headers(token: string, isFormData = false): Record<string, string> {
  const h: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (!isFormData) h['Content-Type'] = 'application/json';
  return h;
}

async function api<T = unknown>(
  path: string,
  token: string,
  opts: { method?: string; body?: unknown; formData?: FormData } = {},
): Promise<T> {
  const isForm = !!opts.formData;
  const res = await fetch(`${WORKER_BASE}${path}`, {
    method: opts.method || 'GET',
    headers: headers(token, isForm),
    body: isForm ? opts.formData : opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error((data as any)?.error || `API ${res.status}`);
  return data as T;
}

/* ── Templates ── */

export interface ApiTemplate {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  output_type: string | null;
  estimated_credits_per_run: number;
  is_active: boolean;
  input_schema: any[] | null;
  preview_url: string | null;
  tags: string[] | null;
}

export async function fetchTemplates(token: string): Promise<ApiTemplate[]> {
  const data = await api<any>('/api/templates', token);
  return Array.isArray(data) ? data : (data.templates || []);
}

export interface TemplateDetail {
  user_inputs: { key: string; label: string; type: string; required: boolean }[];
  locked_images?: Record<string, string>;
  prompt?: string;
  video_prompt?: string;
}

export async function fetchTemplateDetail(token: string, templateName: string): Promise<TemplateDetail> {
  const key = templateName.toLowerCase().replace(/\s+/g, '_') + '_template.json';
  return api<TemplateDetail>(`/api/templates/${key}`, token);
}

/* ── Upload ── */

export interface UploadResult { imageUrl: string; key: string }

export async function uploadFile(token: string, file: File): Promise<UploadResult> {
  const fd = new FormData();
  fd.append('file', file);
  const data = await api<any>('/api/upload', token, { method: 'POST', formData: fd });
  return { imageUrl: data.imageUrl || data.url, key: data.key || data.assetKey };
}

/* ── Projects ── */

export async function createProject(
  token: string,
  templateId: string,
  inputs: Record<string, string>,
): Promise<{ ok: boolean; projectId: string }> {
  return api('/api/projects', token, { method: 'POST', body: { template_id: templateId, inputs } });
}

export async function enqueueProject(
  token: string,
  projectId: string,
): Promise<{ ok: boolean; projectId: string; message: string }> {
  return api('/api/enqueue', token, { method: 'POST', body: { projectId } });
}

export interface OutputItem { type: string; url: string; label?: string; key?: string }

export interface ProjectStatus {
  ok: boolean;
  id: string;
  status: 'queued' | 'running' | 'video_pending' | 'complete' | 'failed';
  progress: number;
  outputs: { items?: OutputItem[] } | null;
  kling_status?: string;
  error: string | null;
  logs?: string[];
  attempts?: number;
  maxAttempts?: number;
}

export async function getProjectStatus(token: string, projectId: string): Promise<ProjectStatus> {
  return api(`/api/projects/${projectId}`, token);
}
