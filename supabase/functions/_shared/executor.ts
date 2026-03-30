import { createAdminClient } from "./supabase-admin.ts";
import {
  getFalPricing,
  getFalQueueResult,
  getFalQueueStatus,
  getFalRequestTelemetry,
  IMAGE_MODEL,
  VIDEO_MODEL,
  submitImageJob,
  submitVideoJob,
} from "./fal.ts";

type NodeRow = {
  id: string;
  name: string;
  node_type: "user_input" | "image_gen" | "video_gen";
  prompt_config: Record<string, unknown> | null;
  default_asset_id: string | null;
};

type EdgeRow = {
  source_node_id: string;
  target_node_id: string;
  mapping_logic: { target_param?: string } | null;
};

type StepRow = {
  id: string;
  job_id?: string;
  node_id: string;
  status: string;
  provider_model?: string | null;
  provider_request_id: string | null;
  output_asset_id: string | null;
  output_payload?: Record<string, unknown> | null;
  error_log?: string | null;
  started_at?: string | null;
  nodes?: {
    name?: string | null;
    node_type?: string | null;
    prompt_config?: Record<string, unknown> | null;
  } | null;
  assets?: { supabase_storage_url?: string | null } | null;
};

type AssetRow = {
  id: string;
  supabase_storage_url: string;
  asset_type: string;
  metadata: Record<string, unknown> | null;
};

type ResolvedOutput = {
  assetId?: string;
  url: string;
  type: "image" | "video";
};

type AdminClient = ReturnType<typeof createAdminClient>;

export const PAPARAZZI_VERSION_ID = "34239a27-27ed-4b1f-8fc9-6a0f1e1ac778";

export function parseOutputExposed(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value === "true";
  return null;
}

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
      record.detail ??
        record.error ??
        record.message ??
        record.msg ??
        null,
    );
  }
  return String(value);
}

function normalizeProviderError(error: unknown) {
  if (error instanceof Error) {
    const detailMatch = error.message.match(/"detail":"([^"]+)"/);
    if (detailMatch?.[1]) {
      return {
        message: detailMatch[1],
        rawPayload: { detail: detailMatch[1] },
      };
    }

    return {
      message: error.message,
      rawPayload: { detail: error.message },
    };
  }

  const message = String(error);
  return {
    message,
    rawPayload: { detail: message },
  };
}

export function collectDeliverableOutputs(steps: StepRow[], outputExposureByNodeId: Map<string, boolean | null>) {
  const completed = steps.filter((step: any) => step.output_asset_id && step.assets?.supabase_storage_url);
  const hasExplicitFlags = completed.some((step) => outputExposureByNodeId.get(step.node_id) !== null);

  const deliverables = completed
    .filter((step) => !hasExplicitFlags || outputExposureByNodeId.get(step.node_id) === true)
    .sort((a: any, b: any) => {
      const aPrompt = a.nodes?.prompt_config ?? {};
      const bPrompt = b.nodes?.prompt_config ?? {};
      const aOrder = Number(aPrompt.output_order ?? aPrompt.sort_order ?? Number.MAX_SAFE_INTEGER);
      const bOrder = Number(bPrompt.output_order ?? bPrompt.sort_order ?? Number.MAX_SAFE_INTEGER);

      if (aOrder !== bOrder) return aOrder - bOrder;
      return String(a.node_id).localeCompare(String(b.node_id));
    });

  return deliverables
    .map((step: any, index: number) => ({
      outputNumber: index + 1,
      stepId: step.id,
      nodeId: step.node_id,
      label: step.nodes?.name ?? "Output",
      type: step.nodes?.node_type === "video_gen" ? "video" : "image",
      url: step.assets.supabase_storage_url,
    }));
}

export async function loadOutputExposureByNodeId(
  admin: AdminClient,
  nodeIds: string[],
) {
  const uniqueNodeIds = [...new Set(nodeIds.filter(Boolean))];
  if (!uniqueNodeIds.length) return new Map<string, boolean | null>();

  const { data: outputNodes, error } = await admin
    .from("nodes")
    .select("id, prompt_config")
    .in("id", uniqueNodeIds);

  if (error) throw new Error(error.message);

  return new Map(
    (outputNodes ?? []).map((node: any) => [node.id, parseOutputExposed(node.prompt_config?.output_exposed)]),
  );
}

function isStepReady(step: StepRow, incomingEdges: EdgeRow[], resolved: Map<string, ResolvedOutput>) {
  return incomingEdges.every((edge) => resolved.has(edge.source_node_id));
}

function paramOrder(param: string) {
  if (param.startsWith("image_")) return Number(param.slice("image_".length));
  if (param === "user_garment") return 20;
  if (param === "user_logo") return 21;
  if (param === "start_frame_image") return 30;
  if (param === "end_frame_image") return 31;
  if (param === "init_image") return 40;
  return 100;
}

function pickPassthroughValue(entries: Array<[string, ResolvedOutput]>) {
  return [...entries]
    .sort(([a], [b]) => paramOrder(a) - paramOrder(b))
    .at(-1)?.[1] ?? null;
}

function toVideoSafeImageUrl(url: string) {
  const match = url.match(/^(https:\/\/[^/]+)\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/);
  if (!match) return url;

  const [, origin, bucket, path] = match;
  const transformed = new URL(`${origin}/storage/v1/render/image/public/${bucket}/${path}`);
  transformed.searchParams.set("width", "1080");
  transformed.searchParams.set("height", "1920");
  transformed.searchParams.set("resize", "contain");
  transformed.searchParams.set("quality", "75");
  return transformed.toString();
}

function isoDiffMs(start?: string | null, end?: string | null) {
  if (!start || !end) return null;
  return Math.max(0, new Date(end).getTime() - new Date(start).getTime());
}

function getNodeReferenceAsset(node: NodeRow, assetMap: Map<string, AssetRow>) {
  if (!node.default_asset_id) return null;
  const asset = assetMap.get(node.default_asset_id);
  if (!asset?.supabase_storage_url) return null;
  return {
    assetId: asset.id,
    url: asset.supabase_storage_url,
    type: "image" as const,
  };
}

function estimateBillingQuantity(args: {
  endpointId: string;
  unit: string;
  promptConfig?: Record<string, unknown> | null;
}) {
  const unit = args.unit.toLowerCase();
  if (unit.includes("image")) {
    return Number(args.promptConfig?.num_images ?? 1);
  }
  if (unit.includes("second")) {
    return Number(args.promptConfig?.duration ?? 10);
  }
  return 1;
}

async function getStepCostEstimate(endpointId: string, promptConfig?: Record<string, unknown> | null) {
  try {
    const pricing = await getFalPricing(endpointId);
    if (!pricing) return null;

    const quantity = estimateBillingQuantity({
      endpointId,
      unit: pricing.unit,
      promptConfig,
    });

    return {
      endpointId,
      unit: pricing.unit,
      unitPriceUsd: pricing.unit_price,
      quantity,
      estimatedCostUsd: Number((pricing.unit_price * quantity).toFixed(6)),
      currency: pricing.currency,
    };
  } catch {
    return null;
  }
}

export async function uploadRemoteAsset(admin: AdminClient, args: {
  jobId: string;
  stepId: string;
  kind: "image" | "video";
  sourceUrl: string;
  metadata?: Record<string, unknown>;
}) {
  const response = await fetch(args.sourceUrl);
  if (!response.ok) throw new Error(`Failed to fetch generated ${args.kind}: ${response.status}`);

  const contentType = response.headers.get("content-type") ??
    (args.kind === "video" ? "video/mp4" : "image/png");
  const extension = contentType.includes("mp4")
    ? "mp4"
    : contentType.includes("webm")
    ? "webm"
    : contentType.includes("jpeg")
    ? "jpg"
    : "png";
  const storagePath = `system/jobs/${args.jobId}/${args.stepId}.${extension}`;
  const bytes = new Uint8Array(await response.arrayBuffer());

  const { error: uploadError } = await admin.storage
    .from("fuse-assets")
    .upload(storagePath, bytes, {
      upsert: true,
      contentType,
    });
  if (uploadError) throw new Error(uploadError.message);

  const publicUrl =
    `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/public/fuse-assets/${storagePath}`;

  const { data: asset, error: assetError } = await admin
    .from("assets")
    .insert({
      supabase_storage_url: publicUrl,
      asset_type: args.kind === "video" ? "generated_video" : "generated_image",
      metadata: args.metadata ?? {},
    })
    .select()
    .single();
  if (assetError || !asset) throw new Error(assetError?.message ?? "Failed to insert asset row");

  return asset as AssetRow;
}

export async function refreshJobProgress(admin: AdminClient, jobId: string) {
  const { data: steps, error } = await admin
    .from("execution_steps")
    .select("status")
    .eq("job_id", jobId);
  if (error || !steps?.length) return;

  const total = steps.length;
  const completed = steps.filter((step) => step.status === "complete").length;
  const failed = steps.some((step) => step.status === "failed");
  const active = steps.some((step) => step.status === "running");
  const progress = failed ? 0 : Math.min(95, Math.floor((completed / total) * 100));

  await admin
    .from("execution_jobs")
    .update({
      status: failed ? "failed" : active ? "running" : "queued",
      progress,
    })
    .eq("id", jobId);
}

export async function failAsyncStep(admin: AdminClient, step: StepRow, errorMessage: string) {
  const completedAt = new Date().toISOString();

  await admin
    .from("execution_steps")
    .update({
      status: "failed",
      error_log: errorMessage,
      completed_at: completedAt,
      execution_time_ms: step.started_at ? Math.max(0, new Date(completedAt).getTime() - new Date(step.started_at).getTime()) : null,
    })
    .eq("id", step.id);
}

async function failJob(
  admin: AdminClient,
  jobId: string,
  errorMessage: string,
) {
  const completedAt = new Date().toISOString();
  const { data: steps, error } = await admin
    .from("execution_steps")
    .select("id, status, started_at, output_payload, error_log")
    .eq("job_id", jobId);
  if (error) throw new Error(error.message);

  const staleSteps = (steps ?? []).filter((step: any) => step.status !== "complete" && step.status !== "failed");
  for (const step of staleSteps) {
    const executionTimeMs = step.started_at
      ? Math.max(0, new Date(completedAt).getTime() - new Date(step.started_at).getTime())
      : null;

    await admin
      .from("execution_steps")
      .update({
        status: "failed",
        error_log: step.error_log ?? errorMessage,
        completed_at: completedAt,
        execution_time_ms: executionTimeMs,
        output_payload: {
          ...(step.output_payload ?? {}),
          rawPayload: {
            detail: step.error_log ?? errorMessage,
          },
        },
      })
      .eq("id", step.id);
  }

  await admin
    .from("execution_jobs")
    .update({
      status: "failed",
      progress: 0,
      error_log: errorMessage,
      completed_at: completedAt,
    })
    .eq("id", jobId);
}

async function completeBlankPromptStep(
  admin: AdminClient,
  args: {
    jobId: string;
    stepId: string;
    node: NodeRow;
    params: Map<string, ResolvedOutput>;
  },
) {
  const passthrough = pickPassthroughValue([...args.params.entries()]);
  const completedAt = new Date().toISOString();

  if (!passthrough) {
    await admin
      .from("execution_steps")
      .update({
        status: "complete",
        completed_at: completedAt,
        execution_time_ms: 0,
        error_log: null,
        output_payload: {
          status: "skipped",
          rawPayload: {
            detail: "Skipped blank-prompt internal node",
          },
        },
      })
      .eq("id", args.stepId);
    return null;
  }

  let outputAssetId = passthrough.assetId ?? null;
  let outputUrl = passthrough.url;

  if (!outputAssetId) {
    const uploaded = await uploadRemoteAsset(admin, {
      jobId: args.jobId,
      stepId: args.stepId,
      kind: passthrough.type,
      sourceUrl: passthrough.url,
      metadata: {
        nodeId: args.node.id,
        nodeName: args.node.name,
        passthrough: true,
      },
    });
    outputAssetId = uploaded.id;
    outputUrl = uploaded.supabase_storage_url;
  }

  await admin
    .from("execution_steps")
    .update({
      status: "complete",
      output_asset_id: outputAssetId,
      completed_at: completedAt,
      execution_time_ms: 0,
      error_log: null,
      output_payload: {
        status: "passthrough",
        outputUrl,
        rawPayload: {
          detail: "Passed through blank-prompt internal node",
        },
      },
    })
    .eq("id", args.stepId);

  return {
    assetId: outputAssetId,
    url: outputUrl,
    type: passthrough.type,
  } satisfies ResolvedOutput;
}

export async function completeAsyncStep(
  admin: AdminClient,
  step: StepRow,
  requestId: string,
  args: { outputUrl: string; kind: "image" | "video" },
) {
  if (!step.job_id) throw new Error("Step job_id is required");

  const falTelemetry = step.provider_model
    ? await getFalRequestTelemetry(step.provider_model, requestId).catch(() => null)
    : null;
  const completedAt = new Date().toISOString();
  const executionTimeMs = step.started_at
    ? Math.max(0, new Date(completedAt).getTime() - new Date(step.started_at).getTime())
    : null;

  const asset = await uploadRemoteAsset(admin, {
    jobId: step.job_id,
    stepId: step.id,
    kind: args.kind,
    sourceUrl: args.outputUrl,
    metadata: {
      nodeId: step.node_id,
      nodeName: step.nodes?.name ?? "Output",
      falRequestId: requestId,
    },
  });

  await admin
    .from("execution_steps")
    .update({
      status: "complete",
      output_asset_id: asset.id,
      completed_at: completedAt,
      execution_time_ms: executionTimeMs,
      error_log: null,
      output_payload: {
        ...(step.output_payload ?? {}),
        requestId,
        sourceUrl: args.outputUrl,
        outputUrl: asset.supabase_storage_url,
        telemetry: {
          ...((step.output_payload as any)?.telemetry ?? {}),
          executionTimeMs,
          falDurationSeconds: falTelemetry?.duration ?? null,
          falStartedAt: falTelemetry?.started_at ?? null,
          falEndedAt: falTelemetry?.ended_at ?? null,
          falSentAt: falTelemetry?.sent_at ?? null,
        },
      },
    })
    .eq("id", step.id);
}

export async function reconcileRunningSteps(admin: AdminClient, jobId: string) {
  const { data: runningSteps, error } = await admin
    .from("execution_steps")
    .select("id, job_id, node_id, status, provider_model, provider_request_id, started_at, output_payload, nodes!execution_steps_node_id_fkey(name, node_type)")
    .eq("job_id", jobId)
    .eq("status", "running");
  if (error) return;
  if (!runningSteps?.length) {
    await finalizeJobIfTerminal(admin, jobId);
    return;
  }

  for (const rawStep of runningSteps as StepRow[]) {
    if (!rawStep.provider_request_id) {
      const startedAt = rawStep.started_at ? new Date(rawStep.started_at).getTime() : null;
      const stalledMs = startedAt ? Date.now() - startedAt : 0;
      if (startedAt && stalledMs >= 60_000) {
        await failAsyncStep(
          admin,
          rawStep,
          "Step stalled before provider request creation",
        );
      }
      continue;
    }

    if (!rawStep.provider_model) continue;

    let queueStatus: string | null = null;
    try {
      queueStatus = await getFalQueueStatus(rawStep.provider_model, rawStep.provider_request_id);
    } catch (error) {
      const normalized = normalizeProviderError(error);
      await admin
        .from("execution_steps")
        .update({
          status: "failed",
          error_log: normalized.message,
          completed_at: new Date().toISOString(),
          execution_time_ms: rawStep.started_at
            ? Math.max(0, Date.now() - new Date(rawStep.started_at).getTime())
            : null,
          output_payload: {
            ...(rawStep.output_payload ?? {}),
            rawPayload: normalized.rawPayload,
          },
        })
        .eq("id", rawStep.id);
      continue;
    }

    const normalizedStatus = String(queueStatus ?? "").toUpperCase();
    if (!normalizedStatus) continue;
    if (
      normalizedStatus.includes("IN_QUEUE") ||
      normalizedStatus.includes("IN_PROGRESS") ||
      normalizedStatus.includes("RUNNING")
    ) {
      continue;
    }

    if (normalizedStatus.includes("COMPLETED")) {
      let payload: any;
      try {
        payload = await getFalQueueResult(rawStep.provider_model, rawStep.provider_request_id);
      } catch (error) {
        const normalized = normalizeProviderError(error);
        await admin
          .from("execution_steps")
          .update({
            status: "failed",
            error_log: normalized.message,
            completed_at: new Date().toISOString(),
            execution_time_ms: rawStep.started_at
              ? Math.max(0, Date.now() - new Date(rawStep.started_at).getTime())
              : null,
            output_payload: {
              ...(rawStep.output_payload ?? {}),
              rawPayload: normalized.rawPayload,
            },
          })
          .eq("id", rawStep.id);
        continue;
      }
      const videoUrl = (payload as any)?.video?.url;
      const imageUrl = (payload as any)?.images?.[0]?.url ?? (payload as any)?.image?.url;
      const outputUrl = videoUrl ?? imageUrl;
      if (!outputUrl) {
        await failAsyncStep(admin, rawStep, "fal completed without an output URL");
        continue;
      }

      await completeAsyncStep(admin, rawStep, rawStep.provider_request_id, {
        outputUrl,
        kind: videoUrl ? "video" : "image",
      });
      await runGraphJob(admin, jobId);
      continue;
    }

    if (normalizedStatus.includes("FAIL")) {
      await failAsyncStep(admin, rawStep, `fal job failed (${normalizedStatus})`);
    }
  }

  await finalizeJobIfTerminal(admin, jobId);
}

export async function finalizeJobIfTerminal(admin: AdminClient, jobId: string) {
  const { data: steps, error } = await admin
    .from("execution_steps")
    .select("id, status, node_id, output_asset_id, output_payload, error_log, nodes!execution_steps_node_id_fkey(name, node_type), assets!execution_steps_output_asset_id_fkey(supabase_storage_url)")
    .eq("job_id", jobId);
  if (error || !steps) throw new Error(error?.message ?? "Failed to load step state");

  const failedStep = steps.find((step: any) => step.status === "failed");
  if (failedStep) {
    const providerDetail = extractProviderDetail(failedStep.output_payload?.rawPayload?.detail) ??
      extractProviderDetail(failedStep.output_payload?.rawPayload) ??
      failedStep.error_log ??
      `Step failed: ${failedStep.nodes?.name ?? failedStep.id}`;
    await failJob(admin, jobId, providerDetail);
    return;
  }

  const incomplete = steps.some((step: any) => step.status !== "complete");
  if (incomplete) {
    await refreshJobProgress(admin, jobId);
    return;
  }

  const outputExposureByNodeId = await loadOutputExposureByNodeId(
    admin,
    (steps as StepRow[]).map((step) => step.node_id),
  );
  const outputs = collectDeliverableOutputs(steps as StepRow[], outputExposureByNodeId);

  const telemetry = (steps ?? []).reduce((acc: Record<string, unknown>, step: any) => {
    const stepTelemetry = step.output_payload?.telemetry;
    if (!stepTelemetry || !step.nodes?.name) return acc;
    acc[step.nodes.name] = stepTelemetry;
    return acc;
  }, {});

  await admin
    .from("execution_jobs")
    .update({
      status: "complete",
      progress: 100,
      completed_at: new Date().toISOString(),
      result_payload: { outputs, telemetry },
      error_log: null,
    })
    .eq("id", jobId);
}

export async function runGraphJob(admin: AdminClient, jobId: string) {
  const { data: job, error: jobError } = await admin
    .from("execution_jobs")
    .select("id, version_id, input_payload")
    .eq("id", jobId)
    .single();
  if (jobError || !job) throw new Error(jobError?.message ?? "Job not found");

  const { data: nodes, error: nodeError } = await admin
    .from("nodes")
    .select("id, name, node_type, prompt_config, default_asset_id")
    .eq("version_id", job.version_id);
  if (nodeError || !nodes) throw new Error(nodeError?.message ?? "Failed to load nodes");

  const { data: edges, error: edgeError } = await admin
    .from("edges")
    .select("source_node_id, target_node_id, mapping_logic")
    .eq("version_id", job.version_id);
  if (edgeError || !edges) throw new Error(edgeError?.message ?? "Failed to load edges");

  const { data: steps, error: stepError } = await admin
    .from("execution_steps")
    .select("id, node_id, status, provider_request_id, output_asset_id, assets!execution_steps_output_asset_id_fkey(supabase_storage_url)")
    .eq("job_id", job.id);
  if (stepError || !steps) throw new Error(stepError?.message ?? "Failed to load steps");

  const assetIds = [
    ...new Set([
      ...nodes.map((node: any) => node.default_asset_id).filter(Boolean),
      ...(steps as StepRow[]).map((step) => step.output_asset_id).filter(Boolean),
    ]),
  ] as string[];
  const { data: assets } = assetIds.length
    ? await admin.from("assets").select("id, supabase_storage_url, asset_type, metadata").in("id", assetIds)
    : { data: [] as AssetRow[] };

  const nodeMap = new Map((nodes as NodeRow[]).map((node) => [node.id, node]));
  const assetMap = new Map((assets ?? []).map((asset) => [asset.id, asset as AssetRow]));
  const incomingByTarget = new Map<string, EdgeRow[]>();

  for (const edge of edges as EdgeRow[]) {
    const list = incomingByTarget.get(edge.target_node_id) ?? [];
    list.push(edge);
    incomingByTarget.set(edge.target_node_id, list);
  }

  const resolved = new Map<string, ResolvedOutput>();
  const jobInputs = (job.input_payload ?? {}) as Record<string, string>;

  for (const node of nodes as NodeRow[]) {
    if (node.node_type !== "user_input") continue;

    const explicitUrl = jobInputs[node.id] ?? jobInputs[node.name];
    if (explicitUrl) {
      resolved.set(node.id, { url: explicitUrl, type: "image" });
      continue;
    }

    if (node.default_asset_id) {
      const asset = assetMap.get(node.default_asset_id);
      if (asset?.supabase_storage_url) {
        resolved.set(node.id, { assetId: asset.id, url: asset.supabase_storage_url, type: "image" });
        continue;
      }
    }

    throw new Error(`Missing input for node ${node.name}`);
  }

  for (const step of steps as StepRow[]) {
    if (step.status !== "complete" || !step.output_asset_id) continue;
    const asset = assetMap.get(step.output_asset_id);
    if (!asset?.supabase_storage_url) continue;
    const node = nodeMap.get(step.node_id);
    if (!node) continue;

    resolved.set(step.node_id, {
      assetId: asset.id,
      url: asset.supabase_storage_url,
      type: node.node_type === "video_gen" ? "video" : "image",
    });
  }

  await admin.from("execution_jobs").update({ status: "running", progress: 10 }).eq("id", job.id);

  const mutableSteps = [...(steps as StepRow[])];

  while (true) {
    const pendingSteps = mutableSteps.filter((step) => step.status === "pending");
    if (!pendingSteps.length) break;

    const readySteps = pendingSteps.filter((step) =>
      isStepReady(step, incomingByTarget.get(step.node_id) ?? [], resolved)
    );

    if (!readySteps.length) {
      const hasAsyncRunning = mutableSteps.some((step) => step.status === "running" && step.provider_request_id);
      if (hasAsyncRunning) {
        await refreshJobProgress(admin, job.id);
        return;
      }
      throw new Error("No executable steps remain");
    }

    for (const step of readySteps) {
      const node = nodeMap.get(step.node_id);
      if (!node) throw new Error(`Node missing for step ${step.id}`);

      const incoming = [...(incomingByTarget.get(step.node_id) ?? [])].sort((a, b) => {
        const aParam = a.mapping_logic?.target_param ?? "";
        const bParam = b.mapping_logic?.target_param ?? "";
        return paramOrder(aParam) - paramOrder(bParam);
      });

      const params = new Map<string, ResolvedOutput>();
      for (const edge of incoming) {
        const param = edge.mapping_logic?.target_param ?? "image";
        const value = resolved.get(edge.source_node_id);
        if (value) params.set(param, value);
      }

      await admin
        .from("execution_steps")
        .update({
          status: "running",
          started_at: step.status === "running" ? undefined : new Date().toISOString(),
          provider: "fal",
          provider_model: node.node_type === "video_gen" ? VIDEO_MODEL : IMAGE_MODEL,
          input_payload: Object.fromEntries(
            [...params.entries()].map(([key, value]) => [key, value.url]),
          ),
        })
        .eq("id", step.id);

      step.status = "running";

      if (node.node_type === "image_gen") {
        try {
          const prompt = String(node.prompt_config?.prompt ?? "").trim();
          const referenceAsset = getNodeReferenceAsset(node, assetMap);
          const orderedInputs = [...params.entries()]
            .sort(([a], [b]) => paramOrder(a) - paramOrder(b))
            .map(([, value]) => value.url)
            .filter(Boolean);
          const effectiveInputs = referenceAsset
            ? [referenceAsset.url, ...orderedInputs]
            : orderedInputs;

          if (!prompt) {
            const passthrough = await completeBlankPromptStep(admin, {
              jobId: job.id,
              stepId: step.id,
              node,
              params,
            });

            if (passthrough) {
              resolved.set(step.node_id, passthrough);
            }

            step.status = "complete";
            await refreshJobProgress(admin, job.id);
            continue;
          }

          const costEstimate = await getStepCostEstimate(IMAGE_MODEL, node.prompt_config);

          await admin
            .from("execution_steps")
            .update({
              input_payload: {
                ...(referenceAsset ? { reference_image: referenceAsset.url } : {}),
                ...Object.fromEntries(
                  [...params.entries()].map(([key, value]) => [key, value.url]),
                ),
              },
            })
            .eq("id", step.id);

          const requestId = await submitImageJob({
            prompt,
            imageUrls: effectiveInputs,
            aspectRatio: String(node.prompt_config?.aspect_ratio ?? "9:16"),
            webhookUrl: `${Deno.env.get("SUPABASE_URL")}/functions/v1/fal-webhook`,
          });

          await admin
            .from("execution_steps")
            .update({
              provider_request_id: requestId,
              output_payload: {
                requestId,
                status: "queued",
                telemetry: {
                  estimatedCostUsd: costEstimate?.estimatedCostUsd ?? null,
                  billingUnit: costEstimate?.unit ?? null,
                  billingQuantity: costEstimate?.quantity ?? null,
                  unitPriceUsd: costEstimate?.unitPriceUsd ?? null,
                  currency: costEstimate?.currency ?? null,
                },
              },
            })
            .eq("id", step.id);

          step.provider_request_id = requestId;
        } catch (error) {
          const normalized = normalizeProviderError(error);
          await admin
            .from("execution_steps")
            .update({
              status: "failed",
              error_log: normalized.message,
              completed_at: new Date().toISOString(),
              execution_time_ms: step.started_at
                ? Math.max(0, Date.now() - new Date(step.started_at).getTime())
                : null,
              output_payload: {
                ...(step.output_payload ?? {}),
                rawPayload: normalized.rawPayload,
              },
            })
            .eq("id", step.id);
          await finalizeJobIfTerminal(admin, job.id);
          return;
        }
      } else if (node.node_type === "video_gen") {
        try {
          const prompt = String(node.prompt_config?.prompt ?? "").trim();
          const initImageUrl = params.get("init_image")?.url ??
            params.get("start_frame_image")?.url ??
            [...params.values()][0]?.url;
          const endFrameUrl = params.get("end_frame_image")?.url;

          if (!prompt) {
            const passthrough = await completeBlankPromptStep(admin, {
              jobId: job.id,
              stepId: step.id,
              node,
              params,
            });

            if (passthrough) {
              resolved.set(step.node_id, passthrough);
            }

            step.status = "complete";
            await refreshJobProgress(admin, job.id);
            continue;
          }

          if (!initImageUrl) throw new Error(`Missing init image for ${node.name}`);

          const costEstimate = await getStepCostEstimate(VIDEO_MODEL, node.prompt_config);

          const requestId = await submitVideoJob({
            prompt,
            initImageUrl: toVideoSafeImageUrl(initImageUrl),
            endFrameUrl: endFrameUrl ? toVideoSafeImageUrl(endFrameUrl) : undefined,
            duration: Number(node.prompt_config?.duration ?? 10),
            aspectRatio: String(node.prompt_config?.aspect_ratio ?? "9:16"),
            webhookUrl: `${Deno.env.get("SUPABASE_URL")}/functions/v1/fal-webhook`,
          });

          await admin
            .from("execution_steps")
            .update({
              provider_request_id: requestId,
              output_payload: {
                requestId,
                status: "queued",
                telemetry: {
                  estimatedCostUsd: costEstimate?.estimatedCostUsd ?? null,
                  billingUnit: costEstimate?.unit ?? null,
                  billingQuantity: costEstimate?.quantity ?? null,
                  unitPriceUsd: costEstimate?.unitPriceUsd ?? null,
                  currency: costEstimate?.currency ?? null,
                },
              },
            })
            .eq("id", step.id);

          step.provider_request_id = requestId;
        } catch (error) {
          const normalized = normalizeProviderError(error);
          await admin
            .from("execution_steps")
            .update({
              status: "failed",
              error_log: normalized.message,
              completed_at: new Date().toISOString(),
              execution_time_ms: step.started_at
                ? Math.max(0, Date.now() - new Date(step.started_at).getTime())
                : null,
              output_payload: {
                ...(step.output_payload ?? {}),
                rawPayload: normalized.rawPayload,
              },
            })
            .eq("id", step.id);
          await finalizeJobIfTerminal(admin, job.id);
          return;
        }
      } else {
        throw new Error(`Unsupported node type ${node.node_type}`);
      }

      await refreshJobProgress(admin, job.id);
    }
  }

  await finalizeJobIfTerminal(admin, job.id);
}
