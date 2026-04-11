/**
 * FUSE API Service.
 *
 * Templates/catalog now come from the Supabase FUSE schema.
 * Execution still flows through the Cloudflare Worker until the runner is
 * fully migrated off that service.
 */
import { supabase } from "@/integrations/supabase/client";

const WORKER_BASE =
  (import.meta.env.VITE_CF_WORKER_URL as string) ||
  "https://shiny-rice-e95bfuse-api.kade-fc1.workers.dev";

function headers(token: string, isFormData = false): Record<string, string> {
  const h: Record<string, string> = {};
  if (token) h.Authorization = `Bearer ${token}`;
  if (!isFormData) h["Content-Type"] = "application/json";
  return h;
}

async function api<T = unknown>(
  path: string,
  token: string,
  opts: { method?: string; body?: unknown; formData?: FormData } = {},
): Promise<T> {
  const isForm = !!opts.formData;
  const res = await fetch(`${WORKER_BASE}${path}`, {
    method: opts.method || "GET",
    headers: headers(token, isForm),
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

function normalizeInputType(value: string | null | undefined) {
  const normalized = (value || "image").toLowerCase();
  if (["prompt", "text", "textarea", "string"].includes(normalized))
    return "prompt";
  return "image";
}

function describeTemplateAssets(nodes: any[]) {
  const references = nodes.filter(
    (node) => node.editor?.mode !== "upload" && node.defaultAssetUrl,
  );
  if (!references.length) return null;

  const labels = references
    .map((node) => node.editor?.label || node.name)
    .filter(Boolean)
    .slice(0, 3);

  if (!labels.length)
    return "Built-in references are preconfigured for this template.";
  return `Built-in references are preconfigured: ${labels.join(", ")}${references.length > 3 ? ", and more" : ""}.`;
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
    const { data, error } = await supabase.functions.invoke(
      "lab-template-catalog",
      {
        body: {},
      },
    );
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

  try {
    const data = await api<any>("/api/templates", token);
    const result: ApiTemplate[] = Array.isArray(data)
      ? data
      : data.templates || [];
    if (result.length > 0) return result;
  } catch {
    // Fall through to old-table compatibility fallback.
  }

  const { data: rows, error } = await supabase
    .from("templates")
    .select(
      "id, name, description, category, output_type, estimated_credits_per_run, is_active, input_schema, preview_url, tags",
    )
    .eq("is_active", true)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (rows || []).map((t) => ({
    ...t,
    id: t.name as string,
    asset_requirements: null,
  })) as unknown as ApiTemplate[];
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
  asset_requirements?: string;
}

export async function fetchTemplateDetail(
  token: string,
  templateRef: Pick<ApiTemplate, "name" | "versionId">,
): Promise<TemplateDetail> {
  if (templateRef.versionId) {
    try {
      const { data, error } = await supabase.functions.invoke(
        "lab-template-detail",
        {
          body: { versionId: templateRef.versionId },
        },
      );
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
        asset_requirements: describeTemplateAssets(nodes),
      };
    } catch {
      // Fall back to worker detail below.
    }
  }

  const data = await api<any>(
    `/api/templates/${encodeURIComponent(templateRef.name)}`,
    token,
  );
  const t = data.template || data;
  return {
    user_inputs: (t.input_manifest || t.user_inputs || []).map((f: any) => ({
      key: f.key,
      label: f.label,
      type: normalizeInputType(f.type),
      required: f.required ?? true,
      hint: f.hint,
    })),
    asset_requirements: t.asset_requirements || null,
    prompt: t.steps?.[0]?.prompt || null,
    video_prompt: t.steps?.find((s: any) => s.type === "kling")?.prompt || null,
  };
}

/* ── Upload ── */

export interface UploadResult {
  imageUrl: string;
  key: string;
}

export async function uploadFile(
  token: string,
  file: File,
): Promise<UploadResult> {
  const fd = new FormData();
  fd.append("file", file);
  const data = await api<any>("/api/upload", token, {
    method: "POST",
    formData: fd,
  });
  return {
    imageUrl: data.imageUrl || data.url,
    key: data.key || data.assetKey || "",
  };
}

/* ── Projects ── */

export async function createProject(
  token: string,
  templateId: string,
  inputs: Record<string, string>,
): Promise<{ ok: boolean; projectId: string; credits_used?: number }> {
  const data = await api<any>("/api/projects", token, {
    method: "POST",
    body: { template_name: templateId, user_inputs: inputs, inputs },
  });
  return {
    ok: data.ok,
    projectId: data.projectId || data.project_id,
    credits_used: data.credits_used,
  };
}

export async function enqueueProject(
  token: string,
  projectId: string,
): Promise<{ ok: boolean; projectId: string; message: string }> {
  return api("/api/enqueue", token, { method: "POST", body: { projectId } });
}

export interface OutputItem {
  type: string;
  url: string;
  label?: string;
  key?: string;
}

export interface ProjectStatus {
  ok: boolean;
  id: string;
  status: "queued" | "running" | "video_pending" | "complete" | "failed";
  progress: number;
  outputs: { items?: OutputItem[] } | null;
  kling_status?: string;
  error: string | null;
  logs?: string[];
  attempts?: number;
  maxAttempts?: number;
}

export async function getProjectStatus(
  token: string,
  projectId: string,
): Promise<ProjectStatus> {
  return api(`/api/projects/${projectId}`, token);
}
