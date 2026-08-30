/**
 * FUSE API Service.
 *
 * Template catalog/detail prefers the Supabase graph and falls back to the
 * legacy worker only when older internal screens still need it.
 */
import { supabase } from "@/integrations/supabase/client";
import { parseCastConfig, type CastConfig } from "@/lib/castConfig";
import {
  readTemplateAssetRequirement,
  type TemplateAssetRequirement,
} from "@/lib/templateAssetRequirements";

type ApiErrorPayload = {
  error?: string;
};

type SupabaseTemplateDetailPayload = {
  userInputs?: TemplateDetailField[];
  nodes?: TemplateDetailNodePayload[];
};

type TemplateDetailField = {
  key?: unknown;
  label?: unknown;
  type?: string | null;
  required?: boolean | null;
  hint?: unknown;
  requirement?: Record<string, unknown> | null;
};


type TemplateDetailNodePayload = {
  id?: unknown;
  name?: unknown;
  summary?: unknown;
  editor?: {
    mode?: string | null;
    slotKey?: unknown;
    label?: unknown;
    expected?: string | null;
  } | null;
};

type WorkerTemplateDetailPayload = {
  template?: WorkerTemplateDetailBody;
} & WorkerTemplateDetailBody;

type WorkerTemplateDetailBody = {
  input_manifest?: TemplateDetailField[];
  user_inputs?: TemplateDetailField[];
  asset_requirements?: string | null;
  steps?: Array<{
    prompt?: string | null;
    type?: string | null;
  }>;
};

type UploadApiPayload = {
  imageUrl?: string;
  url?: string;
  key?: string;
  assetKey?: string;
};

type CreateProjectPayload = {
  ok?: boolean;
  projectId?: string;
  project_id?: string;
  credits_used?: number;
};

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
  opts: {
    method?: string;
    body?: unknown;
    formData?: FormData;
    /** Hard ceiling so a hung endpoint can never leave the UI spinning. */
    timeoutMs?: number;
    timeoutMessage?: string;
  } = {},
): Promise<T> {
  const isForm = !!opts.formData;
  const controller = new AbortController();
  const timeoutMs = opts.timeoutMs;
  const timer = timeoutMs
    ? setTimeout(() => controller.abort(), timeoutMs)
    : undefined;

  let res: Response;
  try {
    res = await fetch(`${WORKER_BASE}${path}`, {
      method: opts.method || "GET",
      headers: headers(token, isForm),
      body: isForm
        ? opts.formData
        : opts.body
          ? JSON.stringify(opts.body)
          : undefined,
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(opts.timeoutMessage || "Request timed out — please retry.");
    }
    throw new Error(
      error instanceof Error && error.message
        ? `Network error — please retry. (${error.message})`
        : "Network error — please retry.",
    );
  } finally {
    if (timer) clearTimeout(timer);
  }

  const data = (await res.json().catch(() => ({}))) as ApiErrorPayload;
  if (!res.ok) throw new Error(data.error || `API ${res.status}`);
  return data as T;
}


function normalizeInputType(value: string | null | undefined) {
  const normalized = (value || "image").toLowerCase();
  if (["prompt", "text", "textarea", "string"].includes(normalized))
    return "prompt";
  return "image";
}

type CatalogTemplate = {
  counts?: {
    inputs?: unknown;
    imageOutputs?: unknown;
    videoOutputs?: unknown;
  } | null;
  inputs?: CatalogTemplateInput[] | null;
  templateId?: unknown;
  templateName?: unknown;
  description?: string | null;
  versionId?: unknown;
  estimatedCreditsPerRun?: unknown;
  previewUrl?: string | null;
  previewAssetType?: "image" | "video" | null;
  reviewStatus?: string | null;
  createdAt?: string | null;
  castConfig?: unknown;
  creator?: unknown;
};

type CatalogTemplateInput = {
  id?: unknown;
  name?: unknown;
  expected?: string | null;
};

type LegacyTemplateRow = {
  name: string | null;
  input_schema: unknown;
  output_type: string | null;
  expected_output_count?: number | null;
  [key: string]: unknown;
};

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
  preview_asset_type?: "image" | "video" | null;
  tags: string[] | null;
  asset_requirements: string | null;
  review_status?: string | null;
  counts?: {
    inputs: number;
    imageOutputs: number;
    videoOutputs: number;
  } | null;
  created_at?: string | null;
  /**
   * FT7 — optional cast support flag. Undefined for every template today, so
   * the Cast step stays skipped. FT8 populates it from
   * `template_versions.cast_config` (null/absent = legacy behavior).
   */
  castConfig?: CastConfig | null;
  /**
   * Public creator attribution (`fuse_templates.created_by` ->
   * `creator_profiles`). Null when the author has no public creator profile —
   * never fabricate one. Never carries `verification_reason`.
   */
  creator?: TemplateCreatorAttribution | null;
}


export type TemplateCreatorAttribution = {
  userId: string;
  handle: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  verificationStatus: string;
  verifiedAt: string | null;
};

function parseTemplateCreator(value: unknown): TemplateCreatorAttribution | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const userId = row.userId ? String(row.userId) : "";
  const handle = row.handle ? String(row.handle) : null;
  if (!userId || !handle) return null;
  return {
    userId,
    handle,
    displayName: row.displayName ? String(row.displayName) : null,
    avatarUrl: row.avatarUrl ? String(row.avatarUrl) : null,
    verificationStatus: String(row.verificationStatus ?? "creator"),
    verifiedAt: row.verifiedAt ? String(row.verifiedAt) : null,
  };
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

    const catalogPayload = data as { templates?: unknown } | null;
    const templates: CatalogTemplate[] = Array.isArray(catalogPayload?.templates)
      ? catalogPayload.templates as CatalogTemplate[]
      : [];
    if (templates.length) {
      return templates.map((template) => ({
        castConfig: parseCastConfig(template.castConfig),
        counts: {
          inputs: Number(template?.counts?.inputs ?? 0),
          imageOutputs: Number(template?.counts?.imageOutputs ?? 0),
          videoOutputs: Number(template?.counts?.videoOutputs ?? 0),
        },
        id: String(template.templateName),
        templateId: template.templateId ? String(template.templateId) : null,
        versionId: template.versionId ? String(template.versionId) : null,
        name: String(template.templateName),
        description: template.description ?? null,
        category: "General",
        output_type:
          Number(template?.counts?.videoOutputs ?? 0) > 0 ? "video" : "image",
        estimated_credits_per_run: Number(
          template?.estimatedCreditsPerRun ?? 0,
        ),
        is_active: true,
        input_schema: Array.isArray(template.inputs)
          ? template.inputs.map((input) => ({
              key: String(input.id),
              label: String(input.name),
              type: normalizeInputType(input.expected),
              required: true,
            }))
          : [],
        created_at: template.createdAt ?? null,
        preview_url: template.previewUrl ?? null,
        preview_asset_type: template.previewAssetType ?? null,
        tags: null,
        asset_requirements: null,
        review_status: template.reviewStatus ?? null,
        creator: parseTemplateCreator(template.creator),
      }));
    }
  } catch {
    // Fall back to the worker API below.
  }

  try {
    const data = await api<{ templates?: ApiTemplate[] } | ApiTemplate[]>("/api/templates", token);
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
      "id, name, description, category, output_type, estimated_credits_per_run, expected_output_count, is_active, input_schema, preview_url, tags",
    )
    .eq("is_active", true)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return ((rows || []) as LegacyTemplateRow[]).map((t) => ({
    ...t,
    id: t.name as string,
    asset_requirements: null,
    counts: {
      inputs: Array.isArray(t.input_schema) ? t.input_schema.length : 0,
      imageOutputs: t.output_type === "video" ? 0 : Number(t.expected_output_count ?? 1),
      videoOutputs: t.output_type === "video" ? Number(t.expected_output_count ?? 1) : 0,
    },
  })) as unknown as ApiTemplate[];
}

export interface TemplateDetail {
  user_inputs: {
    key: string;
    label: string;
    type: string;
    required: boolean;
    hint?: string;
    /** FT2: additive metadata, present only when authored on the input. */
    requirement?: TemplateAssetRequirement;
  }[];

  locked_images?: Record<string, string>;
  prompt?: string;
  video_prompt?: string;
  asset_requirements?: string;
  /** Server-authoritative: may this template be forked/customized? */
  canCustomize?: boolean;
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

      const detailData = data as SupabaseTemplateDetailPayload | null;
      const projectedInputs = Array.isArray(detailData?.userInputs)
        ? detailData.userInputs
        : [];
      if (projectedInputs.length) {
        return {
          canCustomize: (detailData as any)?.canCustomize === true,
          user_inputs: projectedInputs.map((field) => {
            const requirement = field.requirement
              ? readTemplateAssetRequirement(field.requirement, { required: field.required ?? true })
              : undefined;
            return {
              key: String(field.key),
              label: String(field.label),
              type: normalizeInputType(field.type),
              required: requirement?.required ?? field.required ?? true,
              hint: typeof field.hint === "string" ? field.hint : undefined,
              requirement,
            };
          }),
        };
      }


      const nodes = Array.isArray(detailData?.nodes)
        ? detailData.nodes
        : [];
      const uploadNodes = nodes.filter(
        (node) => node.editor?.mode === "upload",
      );

      return {
        canCustomize: (detailData as any)?.canCustomize === true,
        user_inputs: uploadNodes.map((node) => ({
          key: String(node.editor?.slotKey || node.id),
          label: String(node.editor?.label || node.name),
          type: normalizeInputType(node.editor?.expected),
          required: true,
          hint: typeof node.summary === "string" ? node.summary : undefined,
        })),
      };
    } catch (error) {
      throw new Error(
        error instanceof Error
          ? error.message
          : "Could not load live template detail.",
      );
    }
  }

  const data = await api<WorkerTemplateDetailPayload>(
    `/api/templates/${encodeURIComponent(templateRef.name)}`,
    token,
  );
  const t = data.template || data;
  return {
    canCustomize: false,
    user_inputs: (t.input_manifest || t.user_inputs || []).map((field) => ({
      key: String(field.key),
      label: String(field.label),
      type: normalizeInputType(field.type),
      required: field.required ?? true,
      hint: typeof field.hint === "string" ? field.hint : undefined,
    })),
    asset_requirements: t.asset_requirements || null,
    prompt: t.steps?.[0]?.prompt || null,
    video_prompt: t.steps?.find((step) => step.type === "kling")?.prompt || null,
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
  const data = await api<UploadApiPayload>("/api/upload", token, {
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
  const data = await api<CreateProjectPayload>("/api/projects", token, {
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

export interface RunFeedbackRecord {
  jobId: string;
  vote: "up" | "down" | null;
  feedback: string | null;
  updatedAt: string | null;
}

export interface AdminAuditOptions {
  verdicts: string[];
  failureTags: string[];
  automationFlags: string[];
  outputReportTags: string[];
  outputReportSeverities: string[];
  outputReportStatuses: string[];
  outputReportVerdicts: string[];
}

export interface AdminAuditRecord {
  id: string;
  jobId: string;
  adminUserId: string;
  adminName: string | null;
  adminEmail: string | null;
  templateId: string | null;
  versionId: string | null;
  verdict: string;
  overallScore: number;
  outputQualityScore: number;
  brandAlignmentScore: number;
  promptAdherenceScore: number;
  inputFidelityScore: number;
  failureTags: string[];
  automationFlags: string[];
  summary: string;
  keepers: string | null;
  changeRequest: string | null;
  promptToOutputNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminQuickFeedbackRecord {
  userId: string;
  userName: string | null;
  userEmail: string | null;
  vote: "up" | "down" | null;
  feedback: string | null;
  updatedAt: string | null;
}

export interface AdminOutputReportRecord {
  id: string;
  jobId: string;
  adminUserId: string;
  adminName: string | null;
  adminEmail: string | null;
  templateId: string | null;
  versionId: string | null;
  outputNumber: number;
  outputUrl: string | null;
  verdict: "good" | "iffy" | "bad";
  issueTags: string[];
  severity: "low" | "medium" | "high" | "blocking";
  note: string;
  recommendedFix: string | null;
  status: "open" | "fixed" | "wont_fix";
  createdAt: string;
  updatedAt: string;
}

export interface AdminSuggestedAudit {
  verdict: string;
  failureTags: string[];
  automationFlags: string[];
  summary: string;
}

export interface AdminAuditQueueItem {
  id: string;
  status: string;
  progress: number;
  runAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
  userId: string | null;
  userName: string | null;
  userEmail: string | null;
  userPlan: string | null;
  userSubscriptionStatus: string | null;
  templateId: string | null;
  templateName: string;
  versionId: string | null;
  versionNumber: number | null;
  reviewStatus: string;
  outputCount: number;
  outputPreviewUrl: string | null;
  outputPreviewType: "image" | "video" | null;
  queueState: "pending" | "needs_attention" | "approved";
  quickFeedback: {
    upvotes: number;
    downvotes: number;
    latestComment: string | null;
  };
  outputReports?: {
    count: number;
    openCount: number;
    latestNote: string | null;
  };
  audits: {
    count: number;
    avgScore: number | null;
    latestVerdict: string | null;
    latestUpdatedAt: string | null;
    latestSummary: string | null;
  };
  suggestedAudit: AdminSuggestedAudit;
}

export interface AdminAuditQueueResponse {
  options: AdminAuditOptions;
  summary: {
    totalRuns: number;
    pendingAudit: number;
    needsAttention: number;
    approved: number;
    failedRuns: number;
    averageAuditScore: number | null;
  };
  jobs: AdminAuditQueueItem[];
}

export interface AdminAuditJobDetail {
  jobId: string;
  runAt?: string | null;
  startedAt: string | null;
  completedAt: string | null;
  status: string;
  progress: number;
  /** Customer-facing polished failure (never raw provider text). */
  publicFailure?: import("@/lib/generationFailure").PublicGenerationFailure | null;
  /** Privileged callers only (admin/dev/runner) — raw provider diagnostics. */
  error?: string | null;
  providerFailure?: import("@/lib/generationFailure").ProviderFailureDetail | null;
  telemetry: Record<string, unknown>;
  user: {
    id: string | null;
    name: string | null;
    email: string | null;
    plan: string | null;
    subscriptionStatus: string | null;
  };
  template: {
    templateId: string | null;
    templateName: string;
    versionId: string | null;
    versionNumber: number | null;
    reviewStatus: string;
    inputs: Array<{
      id: string;
      name: string;
      expected: string;
      nodeIds: string[];
    }>;
    /** Privileged callers only (admin/dev/runner). */
    hiddenRefs?: Array<{
      nodeId: string;
      name: string;
      mode: string | null;
      assetUrl: string | null;
    }>;
  };
  /** Privileged callers only (admin/dev/runner). */
  inputPayload?: Record<string, string>;
  userInputs: Array<{
    id: string;
    name: string;
    expected: string;
    value: string | null;
    nodeIds: string[];
  }>;
  outputTotals: {
    estimatedCostUsd: number;
    executionTimeMs: number;
  };
  outputs: Array<{
    outputNumber: number;
    stepId?: string;
    nodeId?: string;
    label: string;
    type: "image" | "video";
    url: string;
    estimatedCostUsd: number | null;
    executionTimeMs: number | null;
  }>;
  /** TR2: customer-safe execution graph — no prompts, mapping or provider data. */
  publicGraph?: {
    nodes: Array<{
      id: string;
      type: "INPUT" | "PREPARE" | "IMAGE" | "VIDEO" | "OUTPUT" | "PROCESS";
      label: string;
      stage: number;
      deps: string[];
      status: "waiting" | "active" | "complete" | "failed";
      outputNumber: number | null;
    }>;
    links: Array<{ source: string; target: string }>;
  };
  statusMessage?: string;
  /** Privileged callers only (admin/dev/runner). */
  steps?: Array<{
    id: string;
    nodeId: string;
    label: string;
    type: string;
    status: string;
    provider: string | null;
    providerModel: string | null;
    providerRequestId: string | null;
    prompt: string | null;
    inputPayload: Record<string, string>;
    sourceInputs: Array<{
      sourceNodeId: string;
      sourceName: string;
      sourceType: string;
      targetParam: string | null;
      sourceUrl: string | null;
      isHiddenReference: boolean;
    }>;
    outputUrl: string | null;
    error: string | null;
    startedAt: string | null;
    completedAt: string | null;
    executionTimeMs: number | null;
    telemetry: Record<string, unknown> | null;
  }>;
}

export interface AdminAuditDetailResponse {
  options: AdminAuditOptions;
  job: AdminAuditJobDetail;
  quickFeedback: AdminQuickFeedbackRecord[];
  outputReports: AdminOutputReportRecord[];
  audits: AdminAuditRecord[];
  currentUserAudit: AdminAuditRecord | null;
  suggestedAudit: AdminSuggestedAudit;
}

export async function submitTemplateFeedback(args: {
  jobId: string;
  vote: "up" | "down" | null;
  feedback: string;
}): Promise<RunFeedbackRecord> {
  const { data, error } = await supabase.functions.invoke(
    "submit-template-feedback",
    {
      body: {
        jobId: args.jobId,
        vote: args.vote,
        feedback: args.feedback,
      },
    },
  );

  if (error) throw error;

  const payload = data as { feedback?: RunFeedbackRecord } | null;
  const feedback = payload?.feedback;
  if (!feedback?.jobId) {
    throw new Error("Feedback response was invalid.");
  }

  return feedback as RunFeedbackRecord;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)}s.`)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function throwFunctionError(error: unknown, fallback: string): Promise<never> {
  const context = typeof error === "object" && error !== null && "context" in error
    ? (error as { context?: unknown }).context
    : null;

  if (context && typeof (context as Response).json === "function") {
    try {
      const payload = await (context as Response).json() as { error?: string; message?: string };
      const message = payload?.error ?? payload?.message;
      if (message) throw new Error(message);
    } catch (parseError) {
      if (parseError instanceof Error && parseError.message) throw parseError;
    }
  }

  if (error instanceof Error && error.message) throw error;
  throw new Error(fallback);
}

export async function fetchAdminAuditQueue(limit = 40): Promise<AdminAuditQueueResponse> {
  const { data, error } = await withTimeout(
    supabase.functions.invoke("admin-template-audits", {
      body: {
        action: "list",
        limit,
      },
    }),
    12_000,
    "Admin audit queue",
  );

  if (error) await throwFunctionError(error, "Admin audit queue failed.");
  const payload = data as Partial<AdminAuditQueueResponse> | null;
  if (!payload?.jobs || !payload.summary) {
    throw new Error("Admin audit queue response was invalid.");
  }

  return payload as AdminAuditQueueResponse;
}

export async function fetchAdminAuditDetail(jobId: string): Promise<AdminAuditDetailResponse> {
  const { data, error } = await withTimeout(
    supabase.functions.invoke("admin-template-audits", {
      body: {
        action: "detail",
        jobId,
      },
    }),
    20_000,
    "Admin audit detail",
  );

  if (error) await throwFunctionError(error, "Admin audit detail failed.");
  const payload = data as Partial<AdminAuditDetailResponse> | null;
  if (!payload?.job?.jobId) {
    throw new Error("Admin audit detail response was invalid.");
  }

  return payload as AdminAuditDetailResponse;
}

export async function submitAdminTemplateAudit(args: {
  jobId: string;
  verdict: string;
  outputQualityScore: number;
  brandAlignmentScore: number;
  promptAdherenceScore: number;
  inputFidelityScore: number;
  failureTags: string[];
  automationFlags: string[];
  summary: string;
  keepers?: string;
  changeRequest?: string;
  promptToOutputNotes?: string;
}): Promise<{ options: AdminAuditOptions; audit: AdminAuditRecord }> {
  const { data, error } = await supabase.functions.invoke("admin-template-audits", {
    body: {
      action: "save",
      ...args,
    },
  });

  if (error) throw error;
  const payload = data as Partial<{ options: AdminAuditOptions; audit: AdminAuditRecord }> | null;
  if (!payload?.audit?.jobId) {
    throw new Error("Admin audit save response was invalid.");
  }

  return payload as { options: AdminAuditOptions; audit: AdminAuditRecord };
}

export async function submitAdminOutputReport(args: {
  jobId: string;
  outputNumber: number;
  outputUrl?: string | null;
  verdict: "good" | "iffy" | "bad";
  issueTags: string[];
  severity: "low" | "medium" | "high" | "blocking";
  note: string;
  recommendedFix?: string;
  status: "open" | "fixed" | "wont_fix";
}): Promise<{ options: AdminAuditOptions; outputReport: AdminOutputReportRecord }> {
  const { data, error } = await supabase.functions.invoke("admin-template-audits", {
    body: {
      action: "save_output_report",
      ...args,
    },
  });

  if (error) throw error;
  const payload = data as Partial<{ options: AdminAuditOptions; outputReport: AdminOutputReportRecord }> | null;
  if (!payload?.outputReport?.jobId) {
    throw new Error("Output report save response was invalid.");
  }

  return payload as { options: AdminAuditOptions; outputReport: AdminOutputReportRecord };
}
