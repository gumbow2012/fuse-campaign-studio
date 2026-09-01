import { createAdminClient, logAuditEvent } from "./supabase-admin.ts";
import { resolveExecutionUrl, resolveExecutionUrls } from "./asset-access.ts";
import {
  getFalPricing,
  getFalQueueResult,
  getFalQueueStatus,
  getFalRequestTelemetry,
  IMAGE_MODEL,
  VIDEO_MODEL,
  getVideoModel,
  clampSeedanceDuration,
  videoFallbackUsdPerSecond,
  buildVideoModelInput,
  VERTICAL_VIDEO_ASPECT_RATIO,
  normalizeVideoDuration,
  submitImageJob,
  submitVideoJob,
  submitSeedanceReferenceVideoJob,
} from "./fal.ts";
import { refundRegenCreditsIfNeeded } from "./regeneration-run.ts";
import { readStoredRunEconomics } from "./creatorSurcharge.ts";
import {
  consumeFreeVideoEntitlementForJob,
  isFreeFirstVideoPayload,
  restoreFreeVideoEntitlementForJob,
} from "./free-video.ts";
import { sortEdgesByExecutionOrder, targetParamOrder } from "./edge-order.ts";

import { isPromptNode, resolveNodePrompt } from "./prompt-nodes.ts";
import { buildIdentityLockedPrompt } from "./identity-lock.ts";
import {
  CAST_RUNTIME_KEY,
  castAuditMetadata,
  parseCastRuntime,
  resolveTemplateCast,
  type CastRuntime,
} from "./cast.ts";

/* ============ Seedance multi-reference (additive, isolated) ============ */

/** Provider cap: Seedance reference-to-video accepts up to 9 reference images. */
const SEEDANCE_MAX_REFERENCE_IMAGES = 9;

/**
 * True only when the node is EXPLICITLY configured for multi-reference
 * (prompt_config.video_mode === "multi_reference"), its model is a Seedance
 * reference-capable model, AND the step resolved 2+ incoming images.
 * Without the explicit flag we always fall through to the single-image path.
 */
function isSeedanceMultiReferenceRequest(node: NodeRow, resolvedImageInputs: string[]) {
  if (node.prompt_config?.video_mode !== "multi_reference") return false;
  const model = getVideoModel(node.prompt_config?.video_model);
  if (model.family !== "seedance" || !model.supportsMultiReference) return false;
  return (resolvedImageInputs ?? []).filter(Boolean).length >= 2;
}

/** Submits the known-good Seedance reference-to-video job for one video step. */
async function runSeedanceMultiReference(admin: AdminClient, args: {
  jobId: string;
  step: StepRow;
  node: NodeRow;
  prompt: string;
  imageUrls: string[];
}) {
  const { node, step } = args;
  const model = getVideoModel(node.prompt_config?.video_model);
  const duration = clampSeedanceDuration(node.prompt_config?.duration, model);
  const resolution = model.resolutions?.includes(String(node.prompt_config?.resolution ?? "").toLowerCase())
    ? String(node.prompt_config?.resolution).toLowerCase()
    : "1080p";
  const aspectRatio = model.aspectRatios?.includes(String(node.prompt_config?.aspect_ratio ?? ""))
    ? String(node.prompt_config?.aspect_ratio)
    : VERTICAL_VIDEO_ASPECT_RATIO;
  const generateAudio = node.prompt_config?.generate_audio !== false;

  // Never silently drop references: cap at the provider limit and surface it.
  const requestedImages = (args.imageUrls ?? []).filter(Boolean);
  const sentImages = requestedImages.slice(0, SEEDANCE_MAX_REFERENCE_IMAGES);
  const droppedImages = requestedImages.slice(SEEDANCE_MAX_REFERENCE_IMAGES);
  const capNote = droppedImages.length
    ? `${node.name}: ${requestedImages.length} reference images supplied, but ${model.label} reference-to-video accepts ${SEEDANCE_MAX_REFERENCE_IMAGES}. The last ${droppedImages.length} were not sent.`
    : null;
  if (capNote) console.warn(capNote);

  const { requestId, endpointId, input } = await submitSeedanceReferenceVideoJob({
    modelKey: model.key,
    prompt: args.prompt,
    imageUrls: sentImages,
    duration,
    resolution,
    aspectRatio,
    generateAudio,
    webhookUrl: `${Deno.env.get("SUPABASE_URL")}/functions/v1/fal-webhook?jobId=${encodeURIComponent(args.jobId)}&stepId=${encodeURIComponent(step.id)}`,
  });


  const costEstimate = await getStepCostEstimate(
    endpointId,
    { ...(node.prompt_config ?? {}), duration },
    {
      fallbackUsdPerSecond: videoFallbackUsdPerSecond(model, generateAudio),
      seconds: duration,
    },
  );

  await admin
    .from("execution_steps")
    .update({
      provider_model: endpointId,
      provider_request_id: requestId,
      input_payload: {
        ...(step.input_payload ?? {}),
        ...input,
        video_model: model.key,
        multi_reference: true,
        reference_image_count: sentImages.length,
        ...(capNote
          ? { reference_images_dropped: droppedImages.length, reference_cap_note: capNote }
          : {}),
      },
      output_payload: {
        requestId,
        status: "queued",
        ...(capNote ? { note: capNote } : {}),
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

  return requestId;
}

type NodeRow = {
  id: string;
  name: string;
  node_type: "user_input" | "image_gen" | "video_gen";
  prompt_config: Record<string, unknown> | null;
  default_asset_id: string | null;
};

type EdgeRow = {
  id?: string;
  source_node_id: string;
  target_node_id: string;
  mapping_logic: { target_param?: string; edge_order?: number; sort_order?: number } | null;
};

type StepRow = {
  id: string;
  job_id?: string;
  node_id: string;
  status: string;
  provider_model?: string | null;
  provider_request_id: string | null;
  output_asset_id: string | null;
  input_payload?: Record<string, unknown> | null;
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

function refundDescription(jobId: string) {
  return `Refund template run credits (${jobId})`;
}

export async function refundJobCreditsIfNeeded(
  admin: AdminClient,
  args: {
    jobId: string;
    reason: string;
    requestId?: string | null;
  },
) {
  const { data: job, error: jobError } = await admin
    .from("execution_jobs")
    .select("id, user_id, template_id")
    .eq("id", args.jobId)
    .maybeSingle();
  if (jobError) throw new Error(jobError.message);
  if (!job?.user_id) {
    return { refunded: false, reason: "no_user" as const };
  }

  const refundDesc = refundDescription(args.jobId);
  const { data: existingRefund, error: existingRefundError } = await admin
    .from("credit_ledger")
    .select("id")
    .eq("user_id", job.user_id)
    .eq("type", "refund")
    .eq("description", refundDesc)
    .maybeSingle();
  if (existingRefundError) throw new Error(existingRefundError.message);
  if (existingRefund?.id) {
    return { refunded: false, reason: "already_refunded" as const };
  }

  const { data: debitRows, error: debitError } = await admin
    .from("credit_ledger")
    .select("id, amount, description")
    .eq("user_id", job.user_id)
    .eq("type", "run_template")
    .lt("amount", 0)
    .ilike("description", `%(${args.jobId})`)
    .order("created_at", { ascending: true })
    .limit(1);
  if (debitError) throw new Error(debitError.message);

  const debit = debitRows?.[0];
  if (!debit) {
    return { refunded: false, reason: "no_debit_found" as const };
  }

  const refundAmount = Math.abs(Number(debit.amount ?? 0));
  if (!refundAmount) {
    return { refunded: false, reason: "invalid_debit_amount" as const };
  }

  const { data: refundRows, error: refundError } = await admin.rpc("apply_credit_transaction", {
    p_user_id: job.user_id,
    p_amount: refundAmount,
    p_type: "refund",
    p_description: refundDesc,
    p_template_id: job.template_id,
    p_project_id: null,
    p_step_id: null,
  });
  if (refundError) throw new Error(refundError.message);

  const refundRow = Array.isArray(refundRows) ? refundRows[0] : null;
  await logAuditEvent({
    eventType: "template.run.refunded",
    message: `Refunded ${refundAmount} credits for failed template run.`,
    source: "template-runner",
    requestId: args.requestId ?? null,
    jobId: job.id,
    templateId: job.template_id,
    metadata: {
      refund_amount: refundAmount,
      refund_ledger_id: refundRow?.ledger_id ?? null,
      refund_reason: args.reason,
      original_ledger_id: debit.id,
      original_description: debit.description ?? null,
    },
  }, admin);

  await reverseCreatorEarningForJob(admin, {
    jobId: args.jobId,
    reason: args.reason,
    requestId: args.requestId ?? null,
  });

  return { refunded: true, amount: refundAmount, ledgerId: refundRow?.ledger_id ?? null };
}

/**
 * P5C — create the ONE immutable creator earning for a successful customer run.
 * Idempotent via the UNIQUE constraint on `creator_earnings.campaign_run_id`.
 * Never throws: earnings must never break a completed run.
 */
export async function createCreatorEarningForJob(
  admin: AdminClient,
  args: { jobId: string; requestId?: string | null },
) {
  try {
    const { data: job } = await admin
      .from("execution_jobs")
      .select("id, user_id, template_id, status, input_payload")
      .eq("id", args.jobId)
      .maybeSingle();
    if (!job || job.status !== "complete" || !job.user_id) return { created: false };

    // F2G — promotional free first video runs never generate a creator royalty.
    if (isFreeFirstVideoPayload((job as any).input_payload)) return { created: false };

    const economics = readStoredRunEconomics((job as any).input_payload);
    if (!economics) return { created: false };
    if (economics.creator_id === job.user_id) return { created: false };
    if (economics.creator_earning_cents <= 0) return { created: false };

    const availableAt = new Date(Date.now() + economics.payout_hold_days * 86_400_000).toISOString();

    const { error } = await admin.from("creator_earnings").insert({
      campaign_run_id: job.id,
      creator_id: economics.creator_id,
      customer_id: job.user_id,
      template_id: job.template_id,
      base_run_credits: economics.base_run_credits,
      marketplace_surcharge_credits: economics.surcharge_credits,
      total_customer_credits: economics.total_customer_credits,
      creator_share_bps: economics.creator_share_bps,
      fuse_share_bps: economics.fuse_share_bps,
      creator_royalty_target_cents: economics.royalty_cents,
      creator_earning_cents: economics.creator_earning_cents,
      fuse_marketplace_revenue_cents: economics.fuse_marketplace_revenue_cents,
      economics_version: economics.economics_version,
      status: "pending",
      available_at: availableAt,
    });
    if (error) {
      // Duplicate = already recorded for this run; anything else is logged only.
      if (!/duplicate key|unique/i.test(error.message)) {
        console.error(`[creator-earnings] insert failed for job ${args.jobId}: ${error.message}`);
      }
      return { created: false };
    }

    await logAuditEvent({
      eventType: "creator.earning.created",
      message: `Recorded creator earning of ${economics.creator_earning_cents} cents.`,
      source: "template-runner",
      requestId: args.requestId ?? null,
      jobId: job.id,
      templateId: job.template_id,
      metadata: { ...economics },
    }, admin);

    return { created: true };
  } catch (error) {
    console.error(`[creator-earnings] unexpected failure: ${error instanceof Error ? error.message : error}`);
    return { created: false };
  }
}

/**
 * P5C — reverse a pending/available earning when the customer is refunded.
 * PAID earnings are never mutated; they are logged for manual reconciliation.
 */
export async function reverseCreatorEarningForJob(
  admin: AdminClient,
  args: { jobId: string; reason: string; requestId?: string | null },
) {
  try {
    const { data: earning } = await admin
      .from("creator_earnings")
      .select("id, status, creator_id, creator_earning_cents")
      .eq("campaign_run_id", args.jobId)
      .maybeSingle();
    if (!earning) return { reversed: false };

    const status = String((earning as any).status ?? "");
    if (status === "reversed") return { reversed: false };

    if (status === "paid") {
      await logAuditEvent({
        eventType: "creator.earning.reversal_blocked",
        message: "Customer run refunded after the creator earning was already paid out.",
        source: "template-runner",
        requestId: args.requestId ?? null,
        jobId: args.jobId,
        metadata: {
          earning_id: (earning as any).id,
          creator_id: (earning as any).creator_id,
          creator_earning_cents: (earning as any).creator_earning_cents,
          refund_reason: args.reason,
        },
      }, admin);
      return { reversed: false, blocked: true };
    }

    const { error } = await admin
      .from("creator_earnings")
      .update({
        status: "reversed",
        reversed_at: new Date().toISOString(),
        reversal_reason: args.reason.slice(0, 500),
      })
      .eq("id", (earning as any).id)
      .neq("status", "paid");
    if (error) {
      console.error(`[creator-earnings] reversal failed for job ${args.jobId}: ${error.message}`);
      return { reversed: false };
    }

    await logAuditEvent({
      eventType: "creator.earning.reversed",
      message: "Reversed creator earning after customer refund.",
      source: "template-runner",
      requestId: args.requestId ?? null,
      jobId: args.jobId,
      metadata: {
        earning_id: (earning as any).id,
        creator_id: (earning as any).creator_id,
        creator_earning_cents: (earning as any).creator_earning_cents,
        refund_reason: args.reason,
      },
    }, admin);

    return { reversed: true };
  } catch (error) {
    console.error(`[creator-earnings] unexpected reversal failure: ${error instanceof Error ? error.message : error}`);
    return { reversed: false };
  }
}

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
  return incomingEdges.length > 0 && incomingEdges.every((edge) => resolved.has(edge.source_node_id));
}

function pickPassthroughValue(entries: Array<[string, ResolvedOutput]>) {
  return [...entries]
    .sort(([a], [b]) => targetParamOrder(a) - targetParamOrder(b))
    .at(-1)?.[1] ?? null;
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
    if (args.endpointId.includes("seedance")) {
      const seconds = Number(args.promptConfig?.duration ?? 5);
      return Number.isFinite(seconds) && seconds > 0 ? seconds : 5;
    }
    return normalizeVideoDuration(args.promptConfig?.duration);
  }
  return 1;
}

function videoDuration(value: unknown) {
  return normalizeVideoDuration(value);
}

async function getStepCostEstimate(
  endpointId: string,
  promptConfig?: Record<string, unknown> | null,
  fallback?: { fallbackUsdPerSecond?: number; seconds?: number },
) {
  try {
    const pricing = await getFalPricing(endpointId);
    if (!pricing) {
      if (fallback?.fallbackUsdPerSecond && fallback.seconds) {
        return {
          endpointId,
          unit: "second",
          unitPriceUsd: fallback.fallbackUsdPerSecond,
          quantity: fallback.seconds,
          estimatedCostUsd: Number((fallback.fallbackUsdPerSecond * fallback.seconds).toFixed(6)),
          currency: "USD",
        };
      }
      return null;
    }

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
    if (fallback?.fallbackUsdPerSecond && fallback.seconds) {
      return {
        endpointId,
        unit: "second",
        unitPriceUsd: fallback.fallbackUsdPerSecond,
        quantity: fallback.seconds,
        estimatedCostUsd: Number((fallback.fallbackUsdPerSecond * fallback.seconds).toFixed(6)),
        currency: "USD",
      };
    }
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

async function resetInterruptedSubmissionStep(admin: AdminClient, step: StepRow, detail: string) {
  await admin
    .from("execution_steps")
    .update({
      status: "pending",
      provider: null,
      provider_model: null,
      provider_request_id: null,
      started_at: null,
      completed_at: null,
      execution_time_ms: null,
      error_log: null,
      output_payload: {
        ...(step.output_payload ?? {}),
        rawPayload: { detail },
      },
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

  await refundJobCreditsIfNeeded(admin, {
    jobId,
    reason: errorMessage,
  });

  // TR7 — a failed regeneration must not keep the user's credits. Scoped to
  // regen debits only (type rerun_step + regen marker), never the run debit.
  try {
    await refundRegenCreditsIfNeeded(admin, { jobId, reason: errorMessage });
  } catch (error) {
    console.error("regen refund failed:", error instanceof Error ? error.message : String(error));
  }

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

async function completeOrphanExecutionStep(
  admin: AdminClient,
  step: StepRow,
  node: NodeRow,
) {
  const completedAt = new Date().toISOString();

  await admin
    .from("execution_steps")
    .update({
      status: "complete",
      completed_at: completedAt,
      execution_time_ms: 0,
      error_log: null,
      output_payload: {
        ...(step.output_payload ?? {}),
        status: "skipped",
        rawPayload: {
          detail: "Skipped orphan execution node with no incoming edges",
        },
      },
    })
    .eq("id", step.id);

  await logAuditEvent({
    eventType: "template.run.skipped_orphan_node",
    message: `Skipped orphan execution node ${node.name}.`,
    source: "template-runner",
    jobId: step.job_id ?? null,
    metadata: {
      node_id: node.id,
      node_name: node.name,
      node_type: node.node_type,
    },
  }, admin);
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

  let shouldResume = false;

  for (const rawStep of runningSteps as StepRow[]) {
    if (!rawStep.provider_request_id) {
      const startedAt = rawStep.started_at ? new Date(rawStep.started_at).getTime() : null;
      const stalledMs = startedAt ? Date.now() - startedAt : 0;
      if (startedAt && stalledMs >= 20_000) {
        await resetInterruptedSubmissionStep(
          admin,
          rawStep,
          "Recovered interrupted submission before provider request creation",
        );
        shouldResume = true;
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
      shouldResume = true;
      continue;
    }

    if (normalizedStatus.includes("FAIL")) {
      await failAsyncStep(admin, rawStep, `fal job failed (${normalizedStatus})`);
    }
  }

  if (shouldResume) {
    await runGraphJob(admin, jobId);
    return;
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
    const hasRunning = steps.some((step: any) => step.status === "running");
    const hasPending = steps.some((step: any) => step.status === "pending");
    if (!hasRunning && hasPending) {
      await runGraphJob(admin, jobId);
      return;
    }
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

  // P5C — one immutable creator earning per successful monetized customer run.
  await createCreatorEarningForJob(admin, { jobId });
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
    .select("id, source_node_id, target_node_id, mapping_logic")
    .eq("version_id", job.version_id);
  if (edgeError || !edges) throw new Error(edgeError?.message ?? "Failed to load edges");

  const { data: steps, error: stepError } = await admin
    .from("execution_steps")
    .select("id, job_id, node_id, status, provider_request_id, output_asset_id, assets!execution_steps_output_asset_id_fkey(supabase_storage_url)")
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
  const promptEdgesByTarget = new Map<string, EdgeRow[]>();
  const nodeIdsWithOutgoingEdges = new Set<string>();

  for (const edge of edges as EdgeRow[]) {
    // Prompt-node edges carry text, not assets — keep them out of dependency resolution.
    if (isPromptNode(nodeMap.get(edge.source_node_id))) {
      const promptList = promptEdgesByTarget.get(edge.target_node_id) ?? [];
      promptList.push(edge);
      promptEdgesByTarget.set(edge.target_node_id, promptList);
      continue;
    }
    nodeIdsWithOutgoingEdges.add(edge.source_node_id);
    const list = incomingByTarget.get(edge.target_node_id) ?? [];
    list.push(edge);
    incomingByTarget.set(edge.target_node_id, list);
  }

  const resolved = new Map<string, ResolvedOutput>();
  const jobInputs = (job.input_payload ?? {}) as Record<string, string>;

  /**
   * FT10 — cast is OFF unless the run persisted a cast runtime. Legacy jobs skip
   * this entirely (no extra query, no behavior change).
   */
  const castRuntime: CastRuntime | null = parseCastRuntime((job.input_payload as any)?.[CAST_RUNTIME_KEY]);
  let castConfigValue: unknown = null;
  if (castRuntime) {
    const { data: castVersion, error: castVersionError } = await admin
      .from("template_versions")
      .select("cast_config")
      .eq("id", job.version_id)
      .single();
    if (castVersionError) throw new Error(castVersionError.message);
    castConfigValue = (castVersion as any)?.cast_config ?? null;
  }


  for (const node of nodes as NodeRow[]) {
    if (node.node_type !== "user_input") continue;
    const editorMode = typeof node.prompt_config?.editor_mode === "string"
      ? node.prompt_config.editor_mode
      : null;
    const explicitUrl = jobInputs[node.id] ?? jobInputs[node.name];
    const isHiddenWorkflowPlaceholder =
      node.prompt_config?.weavy_exposed === false &&
      editorMode === "reference" &&
      !node.default_asset_id &&
      !explicitUrl;
    if (isHiddenWorkflowPlaceholder) continue;
    if (!nodeIdsWithOutgoingEdges.has(node.id)) continue;

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

    const orphanSteps = pendingSteps.filter((step) => {
      const node = nodeMap.get(step.node_id);
      return node?.node_type !== "user_input" && !(incomingByTarget.get(step.node_id)?.length);
    });
    if (orphanSteps.length) {
      for (const step of orphanSteps) {
        const node = nodeMap.get(step.node_id);
        if (!node) continue;
        await completeOrphanExecutionStep(admin, step, node);
        step.status = "complete";
      }
      await refreshJobProgress(admin, job.id);
      continue;
    }

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

      const incoming = sortEdgesByExecutionOrder(incomingByTarget.get(step.node_id) ?? []);

      const params = new Map<string, ResolvedOutput>();
      let orderedParamEntries: Array<[string, ResolvedOutput]> = [];
      for (const edge of incoming) {
        const param = edge.mapping_logic?.target_param ?? "image";
        const value = resolved.get(edge.source_node_id);
        if (value) {
          params.set(param, value);
          orderedParamEntries.push([param, value]);
        }
      }

      // FT10 — SINGLE cast integration point. Identity no-op without cast runtime.
      // MODE A adds 0 provider calls and 0 credits: it only swaps one existing
      // reference-conditioning input on the admin-designated target node.
      const castResult = resolveTemplateCast<ResolvedOutput>({
        nodeId: node.id,
        inputs: orderedParamEntries,
        castConfigValue,
        runtime: castRuntime,
        makeValue: (url, previous) => ({ ...previous, assetId: undefined, url }),
      });
      orderedParamEntries = castResult.inputs;
      for (const [key, value] of orderedParamEntries) params.set(key, value);
      const castAudit = castAuditMetadata(castResult.applied);

      /**
       * IDENTITY-LOCK — additive prompt strengthening, gated strictly on
       * (cast active && THIS node is the cast target && this node generates).
       * castResult.applied is non-null only on the cast target node.
       */
      const identityLocked = Boolean(castResult.applied) &&
        (node.node_type === "image_gen" || node.node_type === "video_gen");
      const lockPrompt = <T,>(value: T): T =>
        identityLocked && typeof value === "string" && value.trim()
          ? (buildIdentityLockedPrompt(value) as unknown as T)
          : value;


      const startedAt = step.status === "running" ? step.started_at : new Date().toISOString();

      await admin
        .from("execution_steps")
        .update({
          status: "running",
          started_at: startedAt ?? undefined,
          provider: "fal",
          provider_model: node.node_type === "video_gen"
            ? getVideoModel(node.prompt_config?.video_model).endpointId
            : IMAGE_MODEL,
          input_payload: Object.fromEntries(
            orderedParamEntries.map(([key, value]) => [key, value.url]),
          ),
        })
        .eq("id", step.id);

      step.status = "running";
      step.started_at = startedAt ?? step.started_at ?? null;

      if (node.node_type === "image_gen") {
        try {
          const prompt = lockPrompt(resolveNodePrompt(node, promptEdgesByTarget.get(node.id) ?? [], nodeMap));
          const referenceAsset = getNodeReferenceAsset(node, assetMap);
          const orderedInputs = orderedParamEntries
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

          if (!effectiveInputs.length) {
            throw new Error(
              `${node.name} needs at least one incoming image. Connect a user upload, hidden guide, or prior image output before running this step.`,
            );
          }

          await admin
            .from("execution_steps")
            .update({
              input_payload: {
                ...(referenceAsset ? { reference_image: referenceAsset.url } : {}),
                ...Object.fromEntries(orderedParamEntries.map(([key, value]) => [key, value.url])),
                image_urls: effectiveInputs,
              },
            })
            .eq("id", step.id);

          // Provider boundary: sign fuse-assets inputs (6h TTL). External
          // (fal) URLs pass through unchanged. Stored values are untouched.
          const providerImageUrls = (await resolveExecutionUrls(admin, effectiveInputs)) as string[];

          const requestId = await submitImageJob({
            prompt,
            imageUrls: providerImageUrls,

            aspectRatio: String(node.prompt_config?.aspect_ratio ?? "9:16"),
            // nano-banana-pro really accepts 1K/2K/4K — pass the chosen value
            // through instead of silently rendering at the 1K default.
            resolution: node.prompt_config?.resolution as string | undefined,
            webhookUrl: `${Deno.env.get("SUPABASE_URL")}/functions/v1/fal-webhook?jobId=${encodeURIComponent(job.id)}&stepId=${encodeURIComponent(step.id)}`,
          });

          await admin
            .from("execution_steps")
            .update({
              provider_request_id: requestId,
              output_payload: {
                requestId,
                status: "queued",
                ...castAudit,
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
          const prompt = lockPrompt(resolveNodePrompt(node, promptEdgesByTarget.get(node.id) ?? [], nodeMap));
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

          // Guarded additive branch: Seedance reference-to-video for 2+ images.
          const resolvedImageInputs = orderedParamEntries
            .filter(([, value]) => value.type === "image")
            .map(([, value]) => value.url)
            .filter(Boolean);
          if (isSeedanceMultiReferenceRequest(node, resolvedImageInputs)) {
            const multiRefRequestId = await runSeedanceMultiReference(admin, {
              jobId: job.id,
              step,
              node,
              prompt,
              // Provider boundary signing (6h TTL); external URLs unchanged.
              imageUrls: (await resolveExecutionUrls(admin, resolvedImageInputs)) as string[],
            });

            step.provider_request_id = multiRefRequestId;
            await refreshJobProgress(admin, job.id);
            continue;
          }

          if (!initImageUrl) throw new Error(`Missing init image for ${node.name}`);

          const videoModel = getVideoModel(node.prompt_config?.video_model);
          const isKlingModel = videoModel.family === "kling";
          const isKling3Model = videoModel.family === "kling3";
          const effectiveDuration = isKlingModel
            ? videoDuration(node.prompt_config?.duration)
            : clampSeedanceDuration(
              node.prompt_config?.duration ?? (isKling3Model ? 5 : undefined),
              videoModel,
            );
          const effectiveAspect = isKlingModel || isKling3Model
            ? VERTICAL_VIDEO_ASPECT_RATIO
            : (videoModel.aspectRatios?.includes(String(node.prompt_config?.aspect_ratio ?? ""))
              ? String(node.prompt_config?.aspect_ratio)
              : VERTICAL_VIDEO_ASPECT_RATIO);
          const effectiveResolution = isKlingModel || isKling3Model
            ? null
            : (videoModel.resolutions?.includes(String(node.prompt_config?.resolution ?? ""))
              ? String(node.prompt_config?.resolution)
              : "720p");
          const effectiveGenerateAudio = isKlingModel
            ? null
            : node.prompt_config?.generate_audio !== false;

          const costEstimate = await getStepCostEstimate(
            videoModel.endpointId,
            isKlingModel ? node.prompt_config : { ...(node.prompt_config ?? {}), duration: effectiveDuration },
            isKlingModel
              ? undefined
              : {
                fallbackUsdPerSecond: videoFallbackUsdPerSecond(videoModel, effectiveGenerateAudio),
                seconds: effectiveDuration,
              },
          );

          // Provider boundary: sign fuse-assets inputs (6h TTL). External
          // (fal) URLs pass through unchanged. Stored values are untouched.
          const providerInitImageUrl = (await resolveExecutionUrl(admin, initImageUrl)) as string;
          const providerEndFrameUrl = endFrameUrl
            ? ((await resolveExecutionUrl(admin, endFrameUrl)) as string)
            : endFrameUrl;

          const requestId = await submitVideoJob({
            prompt,
            initImageUrl: providerInitImageUrl,
            endFrameUrl: providerEndFrameUrl,

            modelKey: videoModel.key,
            duration: effectiveDuration,
            aspectRatio: effectiveAspect,
            ...(effectiveResolution ? { resolution: effectiveResolution } : {}),
            ...(effectiveGenerateAudio === null ? {} : { generateAudio: effectiveGenerateAudio }),
            webhookUrl: `${Deno.env.get("SUPABASE_URL")}/functions/v1/fal-webhook?jobId=${encodeURIComponent(job.id)}&stepId=${encodeURIComponent(step.id)}`,
          });

          await admin
            .from("execution_steps")
            .update({
              provider_request_id: requestId,
              input_payload: {
                ...(step.input_payload ?? {}),
                init_image: initImageUrl,
                ...(endFrameUrl ? { end_frame_image: endFrameUrl } : {}),
                aspect_ratio: effectiveAspect,
                duration: effectiveDuration,
                ...(isKlingModel
                  ? {}
                  : {
                    video_model: videoModel.key,
                    resolution: effectiveResolution,
                    generate_audio: effectiveGenerateAudio,
                  }),
              },

              output_payload: {
                requestId,
                status: "queued",
                ...castAudit,
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
