import { createAdminClient } from "./supabase-admin.ts";
import {
  collectDeliverableOutputs,
  loadOutputExposureByNodeId,
  reconcileRunningSteps,
} from "./executor.ts";
import { sortEdgesByExecutionOrder } from "./edge-order.ts";
import { buildTemplateInputPlan } from "./template-inputs.ts";
import { getNodeEditorConfig } from "./template-editor.ts";
import { toPublicGenerationFailure } from "./generation-failure.ts";

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
  if (step.status !== "failed" && !step.error_log) return null;
  return extractProviderDetail(step.output_payload?.rawPayload?.detail) ??
    extractProviderDetail(step.output_payload?.rawPayload) ??
    step.error_log ??
    null;
}

function classifyHiddenReference(node: any) {
  const editor = getNodeEditorConfig(node);
  return editor.mode === "reference" || !!node.default_asset_id;
}

/** TR2: public node types — deliberately generic, never derived from prompts. */
export type PublicNodeType = "INPUT" | "PREPARE" | "IMAGE" | "VIDEO" | "OUTPUT" | "PROCESS";

const PUBLIC_TYPE_BY_NODE_TYPE: Record<string, PublicNodeType> = {
  user_input: "INPUT",
  prompt: "PREPARE",
  image_gen: "IMAGE",
  video_gen: "VIDEO",
};

const PUBLIC_LABEL_BY_TYPE: Record<PublicNodeType, string> = {
  INPUT: "Input",
  PREPARE: "Prepare",
  IMAGE: "Image",
  VIDEO: "Video",
  OUTPUT: "Output",
  PROCESS: "Process",
};

const PUBLIC_STAGE_MESSAGE: Record<PublicNodeType, string> = {
  INPUT: "Preparing assets",
  PREPARE: "Preparing assets",
  IMAGE: "Creating campaign frames",
  VIDEO: "Building video",
  OUTPUT: "Finalizing outputs",
  PROCESS: "Processing",
};

type PublicGraphNode = {
  id: string;
  type: PublicNodeType;
  label: string;
  stage: number;
  deps: string[];
  status: "waiting" | "active" | "complete" | "failed";
  outputNumber: number | null;
};

/**
 * TR2 — customer-SAFE execution graph. Carries no prompt_config, no gen-node
 * names, no mapping_logic, no provider internals, no input payloads and no
 * private reference URLs. Only opaque node ids, generic types and dependencies.
 */
export function buildPublicExecutionGraph(
  nodes: any[],
  edges: any[],
  steps: any[],
  outputExposureByNodeId: Record<string, unknown> | Map<string, unknown>,
  options: {
    inputLabelByNodeId?: Record<string, string>;
    outputNumberByNodeId?: Record<string, number>;
  } = {},
) {
  const exposureLookup = (nodeId: string) =>
    outputExposureByNodeId instanceof Map
      ? outputExposureByNodeId.get(nodeId)
      : (outputExposureByNodeId ?? {})[nodeId];

  const nodeIds = new Set((nodes ?? []).map((node: any) => String(node.id)));
  const links = (edges ?? [])
    .filter((edge: any) => nodeIds.has(String(edge.source_node_id)) && nodeIds.has(String(edge.target_node_id)))
    .map((edge: any) => ({ source: String(edge.source_node_id), target: String(edge.target_node_id) }));

  const depsByNode = new Map<string, string[]>();
  for (const id of nodeIds) depsByNode.set(id, []);
  for (const link of links) depsByNode.get(link.target)!.push(link.source);

  // Topological depth (0 = inputs / no dependencies). Cycle-safe via visit guard.
  const stageCache = new Map<string, number>();
  const stageOf = (id: string, seen = new Set<string>()): number => {
    if (stageCache.has(id)) return stageCache.get(id)!;
    if (seen.has(id)) return 0;
    seen.add(id);
    const deps = depsByNode.get(id) ?? [];
    const stage = deps.length ? Math.max(...deps.map((dep) => stageOf(dep, seen) + 1)) : 0;
    stageCache.set(id, stage);
    return stage;
  };

  const stepByNodeId = new Map<string, any>();
  for (const step of steps ?? []) {
    // Last step for a node wins (retries supersede earlier attempts).
    stepByNodeId.set(String(step.node_id), step);
  }

  const statusFor = (nodeId: string): PublicGraphNode["status"] => {
    const step = stepByNodeId.get(nodeId);
    if (!step) return "waiting";
    if (step.status === "complete") return "complete";
    if (step.status === "running") return "active";
    if (step.status === "failed") return "failed";
    return "waiting";
  };

  const publicNodes: PublicGraphNode[] = (nodes ?? []).map((node: any) => {
    const id = String(node.id);
    const outputNumber = options.outputNumberByNodeId?.[id] ?? null;
    const isExposedOutput = outputNumber !== null || !!exposureLookup(id);
    const baseType = PUBLIC_TYPE_BY_NODE_TYPE[String(node.node_type)] ?? "PROCESS";
    const type: PublicNodeType = isExposedOutput && baseType !== "INPUT" ? "OUTPUT" : baseType;
    const label = type === "INPUT"
      ? (options.inputLabelByNodeId?.[id] ?? PUBLIC_LABEL_BY_TYPE.INPUT)
      : PUBLIC_LABEL_BY_TYPE[type];

    return {
      id,
      type,
      label,
      stage: stageOf(id),
      deps: depsByNode.get(id) ?? [],
      status: statusFor(id),
      outputNumber,
    };
  });

  return { nodes: publicNodes, links };
}

/** Friendly, non-revealing message for whatever stage is currently active. */
function publicStageMessage(
  graph: { nodes: PublicGraphNode[] },
  jobStatus: string,
  hasError: boolean,
) {
  if (hasError || jobStatus === "failed") return "Something went wrong";
  if (jobStatus === "complete") return "Finalizing outputs";
  const active = graph.nodes
    .filter((node) => node.status === "active")
    .sort((a, b) => a.stage - b.stage)[0];
  if (active) return PUBLIC_STAGE_MESSAGE[active.type];
  const nextWaiting = graph.nodes
    .filter((node) => node.status === "waiting")
    .sort((a, b) => a.stage - b.stage)[0];
  if (nextWaiting) return PUBLIC_STAGE_MESSAGE[nextWaiting.type];
  return "Preparing assets";
}

export async function buildJobStatusResponse(
  admin: AdminClient,
  jobId: string,
  runnerAccess: boolean,
  userId: string | null,
  options: { includeSensitive?: boolean } = {},
) {
  const includeSensitive = options.includeSensitive === true;
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
    .select("id, source_node_id, target_node_id, mapping_logic")
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

  /**
   * P0 failure taxonomy: customers get classified, polished copy only —
   * never the raw provider/moderation string. Raw detail is assembled
   * exclusively into the privileged (admin/dev/runner) branch below.
   */
  const jobFailed = job.status === "failed" || !!failedStep;
  const publicFailure = jobFailed
    ? toPublicGenerationFailure({
        rawError: resolvedJobError,
        provider: failedStep?.provider ?? failedStep?.provider_model ?? null,
      })
    : null;
  const providerFailure = jobFailed
    ? {
        rawError: resolvedJobError,
        provider: failedStep?.provider ?? null,
        providerModel: failedStep?.provider_model ?? null,
        requestId: failedStep?.provider_request_id ?? null,
        stepId: failedStep?.id ?? null,
      }
    : null;

  const templateInputs = inputPlan.slots.map((slot) => ({
    id: slot.id,
    name: slot.name,
    expected: slot.expected,
    nodeIds: slot.nodeIds,
  }));

  const profile = job.user_id
    ? await admin
      .from("profiles")
      .select("user_id, name, email, plan, subscription_status")
      .eq("user_id", job.user_id)
      .maybeSingle()
    : { data: null, error: null };
  if (profile.error) throw new Error(profile.error.message);

  const userInputs = inputPlan.slots.map((slot) => {
    const value = slot.nodeIds
      .map((nodeId) => jobInputs[nodeId])
      .find((candidate) => typeof candidate === "string" && candidate.length > 0)
      ?? null;

    return {
      id: slot.id,
      name: slot.name,
      expected: slot.expected,
      value,
      nodeIds: slot.nodeIds,
    };
  });

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

  const outputMetricsByStepId = new Map(
    (steps ?? []).map((step: any) => [
      step.id,
      {
        estimatedCostUsd: typeof step.output_payload?.telemetry?.estimatedCostUsd === "number"
          ? step.output_payload.telemetry.estimatedCostUsd
          : null,
        executionTimeMs: step.execution_time_ms ?? step.output_payload?.telemetry?.executionTimeMs ?? null,
      },
    ]),
  );

  const numberedOutputs = outputs.map((output: any, index: number) => {
    const metrics = output.stepId ? outputMetricsByStepId.get(output.stepId) : null;
    return {
      ...output,
      outputNumber: index + 1,
      estimatedCostUsd: metrics?.estimatedCostUsd ?? null,
      executionTimeMs: metrics?.executionTimeMs ?? null,
    };
  });

  const totals = {
    estimatedCostUsd: Number(
      numberedOutputs
        .reduce((sum: number, output: any) => sum + Number(output.estimatedCostUsd ?? 0), 0)
        .toFixed(6),
    ),
    executionTimeMs: numberedOutputs.reduce((sum: number, output: any) => sum + Number(output.executionTimeMs ?? 0), 0),
  };

  const outputNumberByNodeId = Object.fromEntries(
    numberedOutputs.map((output: any) => [String(output.nodeId), output.outputNumber]),
  ) as Record<string, number>;

  const inputLabelByNodeId = Object.fromEntries(
    inputPlan.slots.flatMap((slot) => slot.nodeIds.map((nodeId) => [nodeId, slot.name])),
  ) as Record<string, string>;

  const publicGraph = buildPublicExecutionGraph(
    nodes ?? [],
    edges ?? [],
    steps ?? [],
    outputExposureByNodeId,
    { inputLabelByNodeId, outputNumberByNodeId },
  );
  const statusMessage = publicStageMessage(publicGraph, String(job.status), !!resolvedJobError);

  // Public outputs carry only their number/type/url — never the gen node's name.
  const publicOutputs = numberedOutputs.map((output: any) => ({
    outputNumber: output.outputNumber,
    stepId: output.stepId,
    nodeId: output.nodeId,
    label: `Output ${output.outputNumber}`,
    type: output.type,
    url: output.url,
    estimatedCostUsd: output.estimatedCostUsd ?? null,
    executionTimeMs: output.executionTimeMs ?? null,
  }));

  const sensitiveSteps = () =>
    (steps ?? []).map((step: any) => {
      const node = step.nodes ?? {};
      const incoming = sortEdgesByExecutionOrder(incomingByTarget.get(step.node_id) ?? []).map((edge: any) => {
        const source = nodeMap.get(edge.source_node_id);
        const sourceEditor = source ? getNodeEditorConfig(source) : null;
        const resolvedSource = resolved.get(edge.source_node_id);
        const isHiddenReference = !!source && source.node_type === "user_input" && (
          sourceEditor?.mode === "reference" ||
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
    });

  // Stage A asset isolation: private fuse-assets media is delivered as
  // short-lived signed URLs. Stored DB values stay canonical; signing failures
  // fall back to the original URL.
  const signedPublicOutputs = await Promise.all(
    publicOutputs.map(async (output: any) => ({
      ...output,
      url: await signFuseAssetUrl(admin, output.url ?? null),
    })),
  );
  const signedUserInputs = await Promise.all(
    userInputs.map(async (input: any) => ({
      ...input,
      value: await signFuseAssetUrl(admin, input.value ?? null),
    })),
  );

  const base = {

    jobId: job.id,
    startedAt: job.started_at ?? null,
    completedAt: job.completed_at ?? null,
    status: job.status,
    statusMessage,
    progress: job.progress ?? 0,
    // Customer-facing failure contract — never raw provider text.
    publicFailure,
    telemetry: job.result_payload?.telemetry ?? {},
    user: {
      id: job.user_id ?? null,
      name: profile.data?.name ?? null,
      email: profile.data?.email ?? null,
      plan: profile.data?.plan ?? null,
      subscriptionStatus: profile.data?.subscription_status ?? null,
    },
    template: {
      templateId: job.template_id,
      templateName: job.fuse_templates?.name ?? "Template",
      versionId: job.version_id,
      versionNumber: job.template_versions?.version_number ?? null,
      reviewStatus: job.template_versions?.review_status ?? "Unreviewed",
      inputs: templateInputs,
    },
    userInputs,
    outputTotals: totals,
    publicGraph,
  };

  // Sensitive fields are never assembled into the non-privileged payload.
  if (!includeSensitive) {
    return { ...base, outputs: publicOutputs };
  }

  return {
    ...base,
    // Raw provider diagnostics — admin/dev/runner only, kept separate from
    // the customer-facing publicFailure contract.
    error: resolvedJobError,
    providerFailure,
    template: { ...base.template, hiddenRefs: templateRefs },
    inputPayload: jobInputs,
    outputs: numberedOutputs,
    steps: sensitiveSteps(),
  };
}

