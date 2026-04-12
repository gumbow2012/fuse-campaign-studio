/**
 * FUSE API Service.
 *
 * Template catalog/detail come from the Supabase FUSE schema.
 * Template execution now runs directly through Supabase edge functions.
 */
import { supabase } from "@/integrations/supabase/client";

const WORKER_BASE =
  (import.meta.env.VITE_CF_WORKER_URL as string) ||
  "https://shiny-rice-e95bfuse-api.kade-fc1.workers.dev";

const SUPABASE_FUNCTIONS_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

function workerHeaders(token: string, isFormData = false): Record<string, string> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (!isFormData) headers["Content-Type"] = "application/json";
  return headers;
}

function runnerHeaders(token: string): Record<string, string> {
  const headers: Record<string, string> = {
    apikey: SUPABASE_PUBLISHABLE_KEY,
    "Content-Type": "application/json",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function workerApi<T = unknown>(
  path: string,
  token: string,
  opts: { method?: string; body?: unknown; formData?: FormData } = {},
): Promise<T> {
  const isForm = !!opts.formData;
  const res = await fetch(`${WORKER_BASE}${path}`, {
    method: opts.method || "GET",
    headers: workerHeaders(token, isForm),
    body: isForm
      ? opts.formData
      : opts.body
        ? JSON.stringify(opts.body)
        : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any)?.error || `API ${res.status}`);
  return data as T;
}

async function runnerApi<T = unknown>(
  path: string,
  token: string,
  opts: { method?: string; body?: unknown } = {},
): Promise<T> {
  const res = await fetch(`${SUPABASE_FUNCTIONS_BASE}${path}`, {
    method: opts.method || "GET",
    headers: runnerHeaders(token),
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any)?.error || `API ${res.status}`);
  return data as T;
}

function normalizeInputType(value: string | null | undefined) {
  const normalized = (value || "image").toLowerCase();
  if (["prompt", "text", "textarea", "string"].includes(normalized)) {
    return "prompt";
  }
  return "image";
}

export function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

/* ── Templates ── */

export interface ApiTemplate {
  id: string;
  templateId?: string | null;
  versionId?: string | null;
  name: string;
  description: string | null;
  category: string | null;
  output_type: string | null;
  estimated_credits_per_run: number;
  is_active: boolean;
  input_schema: Array<{
    key: string;
    label: string;
    type: string;
    required: boolean;
    hint?: string;
    accepts?: string[];
    max_size_mb?: number;
  }> | null;
  preview_url: string | null;
  tags: string[] | null;
  asset_requirements: string | null;
  review_status?: string | null;
}

export async function fetchTemplates(token: string): Promise<ApiTemplate[]> {
  try {
    const { data, error } = await supabase.functions.invoke("lab-template-catalog", {
      body: {},
    });
    if (error) throw error;

    const templates = Array.isArray((data as any)?.templates)
      ? (data as any).templates
      : [];
    if (templates.length) {
      return templates.map((template: any) => ({
        id: String(template.templateName),
        templateId: template.templateId ?? null,
        versionId: template.versionId ?? null,
        name: String(template.templateName),
        description: null,
        category: "General",
        output_type:
          (template?.counts?.videoOutputs ?? 0) > 0 ? "video" : "image",
        estimated_credits_per_run: Number(
          template?.estimatedCreditsPerRun ?? 0,
        ),
        is_active: true,
        input_schema: Array.isArray(template.inputs)
          ? template.inputs.map((input: any) => ({
              key: String(input.id),
              label: String(input.name),
              type: normalizeInputType(input.expected),
              required: true,
            }))
          : [],
        preview_url: null,
        tags: null,
        asset_requirements: null,
        review_status: template.reviewStatus ?? null,
      }));
    }
  } catch {
    // Fall back to the worker API below.
  }

  const data = await workerApi<any>("/api/templates", token);
  const result: ApiTemplate[] = Array.isArray(data)
    ? data
    : data.templates || [];
  return result;
}

export interface TemplateDetail {
  user_inputs: {
    key: string;
    label: string;
    type: string;
    required: boolean;
    hint?: string;
  }[];
  locked_images?: Record<string, string>;
  prompt?: string;
  video_prompt?: string;
}

export async function fetchTemplateDetail(
  token: string,
  templateRef: Pick<ApiTemplate, "name" | "versionId">,
): Promise<TemplateDetail> {
  if (templateRef.versionId) {
    try {
      const { data, error } = await supabase.functions.invoke("lab-template-detail", {
        body: { versionId: templateRef.versionId },
      });
      if (error) throw error;

      const nodes = Array.isArray((data as any)?.nodes)
        ? (data as any).nodes
        : [];
      const uploadNodes = nodes.filter(
        (node: any) => node.editor?.mode === "upload",
      );
      const promptNode = nodes.find(
        (node: any) => node.nodeType === "image_gen" && node.prompt,
      );
      const videoNode = nodes.find(
        (node: any) => node.nodeType === "video_gen" && node.prompt,
      );
      const lockedImages = Object.fromEntries(
        nodes
          .filter(
            (node: any) =>
              node.editor?.mode !== "upload" && node.defaultAssetUrl,
          )
          .map((node: any) => [
            String(node.editor?.slotKey || node.id),
            String(node.defaultAssetUrl),
          ]),
      );

      return {
        user_inputs: uploadNodes.map((node: any) => ({
          key: String(node.editor?.slotKey || node.id),
          label: String(node.editor?.label || node.name),
          type: normalizeInputType(node.editor?.expected),
          required: true,
          hint: typeof node.summary === "string" ? node.summary : undefined,
        })),
        locked_images: Object.keys(lockedImages).length
          ? lockedImages
          : undefined,
        prompt: promptNode?.prompt || null,
        video_prompt: videoNode?.prompt || null,
      };
    } catch {
      // Fall back to worker detail below.
    }
  }

  const data = await workerApi<any>(
    `/api/templates/${encodeURIComponent(templateRef.name)}`,
    token,
  );
  const template = data.template || data;
  return {
    user_inputs: (template.input_manifest || template.user_inputs || []).map((field: any) => ({
      key: field.key,
      label: field.label,
      type: normalizeInputType(field.type),
      required: field.required ?? true,
      hint: field.hint,
    })),
    prompt: template.steps?.[0]?.prompt || null,
    video_prompt: template.steps?.find((step: any) => step.type === "kling")?.prompt || null,
  };
}

/* ── Runner ── */

export type TemplateRunInputFile = {
  dataUrl: string;
  filename?: string;
};

export async function startTemplateRun(
  token: string,
  args: {
    versionId: string;
    inputs?: Record<string, string>;
    inputFiles?: Record<string, TemplateRunInputFile>;
  },
): Promise<{ jobId: string; status: string }> {
  return runnerApi("/start-template-run", token, {
    method: "POST",
    body: args,
  });
}

export interface OutputItem {
  type: string;
  url: string;
  label?: string;
  key?: string;
}

export interface TemplateJobStatus {
  jobId: string;
  status: "queued" | "running" | "video_pending" | "complete" | "failed";
  progress: number;
  outputs: OutputItem[];
  error: string | null;
  logs: string[];
  template?: {
    templateId?: string | null;
    templateName?: string | null;
    versionId?: string | null;
    versionNumber?: number | null;
  };
}

export async function getTemplateRunStatus(
  token: string,
  jobId: string,
): Promise<TemplateJobStatus> {
  const data = await runnerApi<any>(`/get-job-status?jobId=${encodeURIComponent(jobId)}`, token);
  const logs = Array.isArray(data?.steps)
    ? data.steps
        .map((step: any) => {
          const parts = [step.label, step.status].filter(Boolean);
          if (step.error) parts.push(step.error);
          return parts.join(" — ");
        })
        .filter(Boolean)
    : [];

  return {
    jobId: String(data?.jobId ?? jobId),
    status: String(data?.status ?? "failed") as TemplateJobStatus["status"],
    progress: Number(data?.progress ?? 0),
    outputs: Array.isArray(data?.outputs) ? data.outputs : [],
    error: typeof data?.error === "string" ? data.error : null,
    logs,
    template: data?.template ?? undefined,
  };
}
