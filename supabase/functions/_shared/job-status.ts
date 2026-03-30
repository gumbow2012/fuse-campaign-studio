import { createAdminClient } from "./supabase-admin.ts";
import {
  collectDeliverableOutputs,
  loadOutputExposureByNodeId,
  reconcileRunningSteps,
} from "./executor.ts";
import { buildTemplateInputPlan } from "./template-inputs.ts";
import { getNodeEditorConfig } from "./template-editor.ts";

type AdminClient = ReturnType<typeof createAdminClient>;

function extractProviderDetail(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = extractProviderDetail(item);
      if (nested) return nested;
    }
    return null;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return extractProviderDetail(
      record.detail ?? record.error ?? record.message ?? record.msg ?? null,
    );
  }
  return String(value);
}

function resolveStepError(step: any) {
  if (!step) return null;
  return extractProviderDetail(step.output_payload?.rawPayload?.detail) ??
    extractProviderDetail(step.output_payload?.rawPayload) ??
    step.error_log ??
    null;
}

function classifyHiddenReference(node: any) {
  const editor = getNodeEditorConfig(node);
  return editor.mode === "reference" || editor.mode === "workflow" || !!node.default_asset_id;
}

function sortByParam(a: string | null | undefined, b: string | null | undefined) {
  const normalize = (value?: string | null) => {
    const next = String(value ?? "");
    if (next.startsWith("image_")) return Number(next.slice("image_".length));
    if (next === "user_garment") return 20;
    if (next === "user_logo") return 21;
    if (next === "start_frame_image") return 30;
    if (next === "end_frame_image") return 31;
    if (next === "init_image") return 40;
    return 100;
  };
  return normalize(a) - normalize(b);
}

export async function buildJobStatusResponse(admin: AdminClient, jobId: string, runnerAccess: boolean, userId: string | null) {
  let { data: job, error: jobError } = await admin
    .from("execution_jobs")
    .select("id, user_id, template_id, version_id, status, progress, started_at, completed_at, input_payload, result_payload, error_log, fuse_templates!execution_jobs_template_id_fkey(id, name), template_versions!execution_jobs_version_id_fkey(id, version_number, review_status)")
    .eq("id", jobId)
    .single();
  if (jobError || !job) throw new Error(jobError?.message ?? "Job not found");
  if (!runnerAccess && job.user_id !== userId) throw new Error("Forbidden");

  if (job.status === "running" || job.status === "queued") {
    await reconcileRunningSteps(admin, job.id);
    const refreshed = await admin
      .from("execution_jobs")
      .select("id, user_id, template_id, version_id, status, progress, started_at, completed_at, input_payload, result_payload, error_log, fuse_templates!execution_jobs_template_id_fkey(id, name), template_versions!execution_jobs_version_id_fkey(id, version_number, review_status)")
      .eq("id", jobId)
      .single();
    if (refreshed.error || !refreshed.data) throw new Error(refreshed.error?.message ?? "Job not found after reconcile");
    job = refreshed.data;
  }

  const { data: steps, error: stepsError } = await admin
    .from("execution_steps")
    .select("id, node_id, status, provider, provider_model, provider_request_id, output_asset_id, input_payload, output_payload, error_log, execution_time_ms, started_at, completed_at, nodes!execution_steps_node_id_fkey(id, name, node_type, prompt_config, default_asset_id), assets!execution_steps_output_asset_id_fkey(supabase_storage_url)")
    .eq("job_id", job.id)
    .order("created_at", { ascending: true });
  if (stepsError) throw new Error(stepsError.message);

  const { data: nodes, error: nodeError } = await admin
    .from("nodes")
    .select("id, name, node_type, prompt_config, default_asset_id")
    .eq("version_id", job.version_id);
  if (nodeError) throw new Error(nodeError.message);

  const { data: edges, error: edgeError } = await admin
    .from("edges")
    .select("source_node_id, target_node_id, mapping_logic")
    .eq("version_id", job.version_id);
  if (edgeError) throw new Error(edgeError.message);

  const assetIds = [
    ...new Set([
      ...(nodes ?? []).map((node: any) => node.default_asset_id).filter(Boolean),
      ...(steps ?? []).map((step: any) => step.output_asset_id).filter(Boolean),
    ]),
  ] as string[];

  const { data: assets, error: assetError } = assetIds.length
    ? await admin.from("assets").select("id, supabase_storage_url, asset_type, metadata").in("id", assetIds)
    : { data: [], error: null };
  if (assetError) throw new Error(assetError.message);

  const nodeMap = new Map((nodes ?? []).map((node: any) => [node.id, node]));
  const assetMap = new Map((assets ?? []).map((asset: any) => [asset.id, asset]));
  const incomingByTarget = new Map<string, any[]>();
  for (const edge of edges ?? []) {
    const list = incomingByTarget.get(edge.target_node_id) ?? [];
    list.push(edge);
    incomingByTarget.set(edge.target_node_id, list);
  }

  const inputPlan = buildTemplateInputPlan(
    job.fuse_templates?.name ?? "Template",
    (nodes ?? []).filter((node: any) => node.node_type === "user_input"),
  );

  const resolved = new Map<string, { url: string; type: "image" | "video" }>();
  const jobInputs = (job.input_payload ?? {}) as Record<string, string>;
  for (const node of nodes ?? []) {
    if (node.node_type !== "user_input") continue;

    const explicitUrl = jobInputs[node.id] ?? jobInputs[node.name];
    if (explicitUrl) {
      resolved.set(node.id, { url: explicitUrl, type: "image" });
      continue;
    }

    if (!node.default_asset_id) continue;
    const asset = assetMap.get(node.default_asset_id);
    if (asset?.supabase_storage_url) {
      resolved.set(node.id, { url: asset.supabase_storage_url, type: "image" });
    }
  }

  for (const step of steps ?? []) {
    if (step.status !== "complete" || !step.output_asset_id) continue;
    const asset = assetMap.get(step.output_asset_id);
    if (!asset?.supabase_storage_url) continue;
    const node = nodeMap.get(step.node_id);
    if (!node) continue;
    resolved.set(step.node_id, {
      url: asset.supabase_storage_url,
      type: node.node_type === "video_gen" ? "video" : "image",
    });
  }

  const outputExposureByNodeId = await loadOutputExposureByNodeId(
    admin,
    (steps ?? []).map((step: any) => step.node_id),
  );
  const outputs = collectDeliverableOutputs(steps ?? [], outputExposureByNodeId);
  const failedStep = (steps ?? []).find((step: any) => step.status === "failed");
  const resolvedJobError = resolveStepError(failedStep) ?? job.error_log ?? null;

  const templateInputs = inputPlan.slots.map((slot) => ({
    id: slot.id,
    name: slot.name,
    expected: slot.expected,
    nodeIds: slot.nodeIds,
  }));

  const templateRefs = (nodes ?? [])
    .filter((node: any) => node.node_type === "user_input" && classifyHiddenReference(node))
    .map((node: any) => {
      const editor = getNodeEditorConfig(node);
      const asset = node.default_asset_id ? assetMap.get(node.default_asset_id) : null;
      return {
        nodeId: node.id,
        name: editor.label ?? node.name,
        mode: editor.mode ?? (node.default_asset_id ? "reference" : "upload"),
        assetUrl: asset?.supabase_storage_url ?? editor.sampleUrl ?? null,
      };
    });

  return {
    jobId: job.id,
    status: job.status,
    progress: job.progress ?? 0,
    error: resolvedJobError,
    telemetry: job.result_payload?.telemetry ?? {},
    template: {
      templateId: job.template_id,
      templateName: job.fuse_templates?.name ?? "Template",
      versionId: job.version_id,
      versionNumber: job.template_versions?.version_number ?? null,
      reviewStatus: job.template_versions?.review_status ?? "Unreviewed",
      inputs: templateInputs,
      hiddenRefs: templateRefs,
    },
    outputs,
    steps: (steps ?? []).map((step: any) => {
      const node = step.nodes ?? {};
      const incoming = [...(incomingByTarget.get(step.node_id) ?? [])].sort((a, b) =>
        sortByParam(a.mapping_logic?.target_param, b.mapping_logic?.target_param)
      ).map((edge: any) => {
        const source = nodeMap.get(edge.source_node_id);
        const sourceEditor = source ? getNodeEditorConfig(source) : null;
        const resolvedSource = resolved.get(edge.source_node_id);
        const isHiddenReference = !!source && source.node_type === "user_input" && (
          sourceEditor?.mode === "reference" ||
          sourceEditor?.mode === "workflow" ||
          !inputPlan.slotByNodeId[source.id]
        );

        return {
          sourceNodeId: edge.source_node_id,
          sourceName: source?.name ?? "Unknown",
          sourceType: source?.node_type ?? "unknown",
          targetParam: edge.mapping_logic?.target_param ?? null,
          sourceUrl: resolvedSource?.url ?? null,
          isHiddenReference,
        };
      });

      const prompt = typeof node.prompt_config?.prompt === "string" ? node.prompt_config.prompt : null;

      return {
        id: step.id,
        nodeId: step.node_id,
        label: node.name ?? "Step",
        type: node.node_type ?? "unknown",
        status: step.status,
        provider: step.provider,
        providerModel: step.provider_model,
        providerRequestId: step.provider_request_id,
        prompt,
        inputPayload: step.input_payload ?? {},
        sourceInputs: incoming,
        outputUrl: step.assets?.supabase_storage_url ?? null,
        error: resolveStepError(step),
        startedAt: step.started_at ?? null,
        completedAt: step.completed_at ?? null,
        executionTimeMs: step.execution_time_ms ?? step.output_payload?.telemetry?.executionTimeMs ?? null,
        telemetry: step.output_payload?.telemetry ?? null,
      };
    }),
  };
}
