import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import {
  corsHeaders,
  createAdminClient,
  errorMessage,
  json,
  requireBuilderUser,
} from "../_shared/supabase-admin.ts";
import { assertVersionAccess, FORBIDDEN_TEMPLATE_MESSAGE } from "../_shared/template-scope.ts";
import { isPromptNode, resolveNodePrompt } from "../_shared/prompt-nodes.ts";
import {
  clampSeedanceDuration,
  getFalPricing,
  getFalQueueResult,
  getFalQueueStatus,
  getVideoModel,
  IMAGE_MODEL,
  normalizeVideoDuration,
  submitImageJob,
  normalizeImageResolution,
  submitVideoJob,
  VERTICAL_VIDEO_ASPECT_RATIO,
  videoFallbackUsdPerSecond,
} from "../_shared/fal.ts";

/**
 * Standalone single-node runs for the admin builder.
 * Fully additive: this function never touches execution_jobs / execution_steps,
 * the shared executor, or the paid runner. Results live in `node_runs` only.
 */

const USD_PER_CREDIT = 0.098;
const IMAGE_FALLBACK_USD = 0.15;

type AdminClient = ReturnType<typeof createAdminClient>;

type NodeRow = {
  id: string;
  name: string;
  node_type: string;
  prompt_config: Record<string, unknown> | null;
  default_asset_id: string | null;
};

type EdgeRow = {
  id: string;
  source_node_id: string;
  target_node_id: string;
  mapping_logic: { target_param?: string; edge_order?: number; sort_order?: number } | null;
};

function edgeOrder(edge: EdgeRow) {
  const value = edge.mapping_logic?.edge_order ?? edge.mapping_logic?.sort_order;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

function creditsFromUsd(usd: number | null | undefined) {
  if (!usd || !Number.isFinite(usd) || usd <= 0) return null;
  return Math.max(1, Math.ceil(usd / USD_PER_CREDIT));
}

async function estimateUsd(args: {
  endpointId: string;
  seconds?: number | null;
  fallbackUsdPerSecond?: number | null;
  fallbackFlatUsd?: number | null;
}) {
  try {
    const pricing = await getFalPricing(args.endpointId);
    if (pricing) {
      const unit = String(pricing.unit ?? "").toLowerCase();
      const quantity = unit.includes("second") ? Math.max(1, Number(args.seconds ?? 5)) : 1;
      return Number((pricing.unit_price * quantity).toFixed(6));
    }
  } catch (_error) {
    // fall through to static fallbacks below
  }

  if (args.fallbackUsdPerSecond && args.seconds) {
    return Number((args.fallbackUsdPerSecond * args.seconds).toFixed(6));
  }
  return args.fallbackFlatUsd ?? null;
}

function extractOutput(payload: unknown): { url: string; type: "image" | "video" } | null {
  const data = (payload as any)?.data ?? payload;
  if (!data) return null;

  const videoUrl = data?.video?.url ?? data?.videos?.[0]?.url ?? (typeof data?.video === "string" ? data.video : null);
  if (videoUrl) return { url: String(videoUrl), type: "video" };

  const imageUrl = data?.images?.[0]?.url ?? data?.image?.url ?? data?.output?.url;
  if (imageUrl) return { url: String(imageUrl), type: "image" };

  return null;
}

function serializeRun(run: any) {
  return {
    runId: run.id,
    nodeId: run.node_id,
    status: run.status as "queued" | "running" | "complete" | "failed",
    outputUrl: run.output_url ?? null,
    outputType: run.output_type ?? null,
    error: run.error_log ?? null,
    estimatedCredits: run.estimated_credits ?? null,
    estimatedCostUsd: run.estimated_cost_usd ? Number(run.estimated_cost_usd) : null,
    providerModel: run.provider_model ?? null,
    requestId: run.provider_request_id ?? null,
    startedAt: run.created_at ?? null,
    completedAt: run.completed_at ?? null,
  };
}

/** Resolve the image URLs feeding a node: reference/upload assets + upstream single-node outputs. */
async function resolveNodeInputs(admin: AdminClient, args: {
  versionId: string;
  node: NodeRow;
  edges: EdgeRow[];
  nodes: NodeRow[];
}) {
  const nodeMap = new Map(args.nodes.map((node) => [node.id, node]));

  const incoming = args.edges
    .filter((edge) => edge.target_node_id === args.node.id)
    .filter((edge) => !isPromptNode(nodeMap.get(edge.source_node_id)))
    .sort((a, b) => edgeOrder(a) - edgeOrder(b));
  const sourceIds = incoming.map((edge) => edge.source_node_id);

  const assetIds = [
    ...new Set(
      [args.node.default_asset_id, ...sourceIds.map((id) => nodeMap.get(id)?.default_asset_id ?? null)]
        .filter(Boolean) as string[],
    ),
  ];
  const { data: assets } = assetIds.length
    ? await admin.from("assets").select("id, supabase_storage_url").in("id", assetIds)
    : { data: [] as Array<{ id: string; supabase_storage_url: string | null }> };
  const assetMap = new Map((assets ?? []).map((asset: any) => [asset.id, asset.supabase_storage_url as string | null]));

  const latestByNode = new Map<string, { url: string; type: string | null }>();
  if (sourceIds.length) {
    const { data: upstreamRuns } = await admin
      .from("node_runs")
      .select("node_id, output_url, output_type, created_at")
      .in("node_id", sourceIds)
      .eq("status", "complete")
      .order("created_at", { ascending: false });
    for (const run of upstreamRuns ?? []) {
      if (!run.output_url) continue;
      if (!latestByNode.has(run.node_id)) {
        latestByNode.set(run.node_id, { url: run.output_url, type: run.output_type ?? null });
      }
    }
  }

  const params: Array<{ param: string; url: string; type: string; sourceName: string }> = [];
  const missing: string[] = [];

  for (const edge of incoming) {
    const source = nodeMap.get(edge.source_node_id);
    if (!source) continue;
    const param = String(edge.mapping_logic?.target_param ?? "image").toLowerCase();

    const upstream = latestByNode.get(source.id);
    const assetUrl = source.default_asset_id ? assetMap.get(source.default_asset_id) ?? null : null;
    const url = assetUrl ?? upstream?.url ?? null;

    if (!url) {
      missing.push(source.name);
      continue;
    }

    params.push({
      param,
      url,
      type: upstream?.type ?? "image",
      sourceName: source.name,
    });
  }

  const ownReferenceUrl = args.node.default_asset_id
    ? assetMap.get(args.node.default_asset_id) ?? null
    : null;

  return { params, missing, ownReferenceUrl, incomingCount: incoming.length };
}

async function startRun(admin: AdminClient, args: { versionId: string; nodeId: string; userId: string }) {
  const { data: nodes, error: nodesError } = await admin
    .from("nodes")
    .select("id, name, node_type, prompt_config, default_asset_id")
    .eq("version_id", args.versionId);
  if (nodesError) throw new Error(nodesError.message);

  const node = (nodes as NodeRow[] | null)?.find((candidate) => candidate.id === args.nodeId);
  if (!node) throw new Error("Step not found on this template version");
  if (node.node_type !== "image_gen" && node.node_type !== "video_gen") {
    throw new Error("Only image and video steps can be generated on their own");
  }

  const { data: edges, error: edgesError } = await admin
    .from("edges")
    .select("id, source_node_id, target_node_id, mapping_logic")
    .eq("version_id", args.versionId);
  if (edgesError) throw new Error(edgesError.message);

  const nodeById = new Map(((nodes ?? []) as NodeRow[]).map((candidate) => [candidate.id, candidate]));
  const promptEdges = ((edges ?? []) as EdgeRow[]).filter((edge) =>
    edge.target_node_id === node.id && isPromptNode(nodeById.get(edge.source_node_id))
  );
  const prompt = resolveNodePrompt(node, promptEdges, nodeById);
  if (!prompt) throw new Error("Add a prompt to this step before generating it");

  const resolved = await resolveNodeInputs(admin, {
    versionId: args.versionId,
    node,
    edges: (edges ?? []) as EdgeRow[],
    nodes: (nodes ?? []) as NodeRow[],
  });

  const imageInputs = [
    ...(resolved.ownReferenceUrl ? [resolved.ownReferenceUrl] : []),
    ...resolved.params.filter((entry) => !entry.param.includes("prompt")).map((entry) => entry.url),
  ].filter(Boolean);

  if (!imageInputs.length) {
    const hint = resolved.missing.length
      ? `Upstream step${resolved.missing.length > 1 ? "s" : ""} ${resolved.missing.join(", ")} ${resolved.missing.length > 1 ? "have" : "has"} no image yet — run ${resolved.missing.length > 1 ? "them" : "it"} first.`
      : "Connect or upload an image first, or run the upstream step.";
    throw new Error(hint);
  }

  const webhookUrl =
    `${Deno.env.get("SUPABASE_URL")}/functions/v1/run-node?callback=1&nodeRunId=`;

  const { data: inserted, error: insertError } = await admin
    .from("node_runs")
    .insert({
      version_id: args.versionId,
      node_id: node.id,
      user_id: args.userId,
      status: "queued",
      provider: "fal",
    })
    .select("*")
    .single();
  if (insertError || !inserted) throw new Error(insertError?.message ?? "Could not start the step run");

  try {
    if (node.node_type === "image_gen") {
      const estimatedCostUsd = await estimateUsd({
        endpointId: IMAGE_MODEL,
        fallbackFlatUsd: IMAGE_FALLBACK_USD,
      });

      const imageResolution = normalizeImageResolution(node.prompt_config?.resolution);
      // Provider boundary: sign fuse-assets inputs (6h TTL); external unchanged.
      const providerImageUrls = (await resolveExecutionUrls(admin, imageInputs)) as string[];
      const requestId = await submitImageJob({
        prompt,
        imageUrls: providerImageUrls,

        aspectRatio: String(node.prompt_config?.aspect_ratio ?? VERTICAL_VIDEO_ASPECT_RATIO),
        resolution: imageResolution,
        webhookUrl: `${webhookUrl}${encodeURIComponent(inserted.id)}`,
      });

      const { data: updated } = await admin
        .from("node_runs")
        .update({
          status: "running",
          provider_model: IMAGE_MODEL,
          provider_request_id: requestId,
          estimated_cost_usd: estimatedCostUsd,
          estimated_credits: creditsFromUsd(estimatedCostUsd),
          input_payload: {
            prompt,
            image_urls: imageInputs,
            // requested === submitted (validated, never clamped).
            requested_resolution: imageResolution,
            submitted_resolution: imageResolution,
          },
        })
        .eq("id", inserted.id)
        .select("*")
        .single();

      return serializeRun(updated ?? inserted);
    }

    const videoModel = getVideoModel(node.prompt_config?.video_model);
    const isKling = videoModel.family === "kling";
    const isKling3 = videoModel.family === "kling3";
    const duration = isKling
      ? normalizeVideoDuration(node.prompt_config?.duration)
      : clampSeedanceDuration(node.prompt_config?.duration ?? (isKling3 ? 5 : undefined), videoModel);
    const generateAudio = isKling ? null : node.prompt_config?.generate_audio !== false;
    const resolution = isKling || isKling3
      ? null
      : (videoModel.resolutions?.includes(String(node.prompt_config?.resolution ?? ""))
        ? String(node.prompt_config?.resolution)
        : "720p");
    const aspectRatio = isKling || isKling3
      ? VERTICAL_VIDEO_ASPECT_RATIO
      : (videoModel.aspectRatios?.includes(String(node.prompt_config?.aspect_ratio ?? ""))
        ? String(node.prompt_config?.aspect_ratio)
        : VERTICAL_VIDEO_ASPECT_RATIO);

    const byParam = new Map(resolved.params.map((entry) => [entry.param, entry.url]));
    const initImageUrl = byParam.get("init_image") ??
      byParam.get("start_frame_image") ??
      imageInputs[0];
    const endFrameUrl = byParam.get("end_frame_image");

    if (!initImageUrl) {
      throw new Error("Connect or upload a first-frame image first, or run the upstream step.");
    }

    const estimatedCostUsd = await estimateUsd({
      endpointId: videoModel.endpointId,
      seconds: duration,
      fallbackUsdPerSecond: videoFallbackUsdPerSecond(videoModel, generateAudio) ?? null,
    });

    const requestId = await submitVideoJob({
      prompt,
      initImageUrl,
      endFrameUrl,
      modelKey: videoModel.key,
      duration,
      aspectRatio,
      ...(resolution ? { resolution } : {}),
      ...(generateAudio === null ? {} : { generateAudio }),
      webhookUrl: `${webhookUrl}${encodeURIComponent(inserted.id)}`,
    });

    const { data: updated } = await admin
      .from("node_runs")
      .update({
        status: "running",
        provider_model: videoModel.endpointId,
        provider_request_id: requestId,
        estimated_cost_usd: estimatedCostUsd,
        estimated_credits: creditsFromUsd(estimatedCostUsd),
        input_payload: {
          prompt,
          init_image: initImageUrl,
          ...(endFrameUrl ? { end_frame_image: endFrameUrl } : {}),
          video_model: videoModel.key,
          duration,
          ...(resolution ? { resolution } : {}),
          ...(generateAudio === null ? {} : { generate_audio: generateAudio }),
        },
      })
      .eq("id", inserted.id)
      .select("*")
      .single();

    return serializeRun(updated ?? inserted);
  } catch (error) {
    const message = errorMessage(error);
    await admin
      .from("node_runs")
      .update({ status: "failed", error_log: message.slice(0, 10000), completed_at: new Date().toISOString() })
      .eq("id", inserted.id);
    throw error;
  }
}

/** Poll fal for a run that is still in flight and persist any terminal result. */
async function syncRun(admin: AdminClient, run: any) {
  if (run.status !== "running" && run.status !== "queued") return serializeRun(run);
  if (!run.provider_request_id || !run.provider_model) return serializeRun(run);

  try {
    const status = await getFalQueueStatus(run.provider_model, run.provider_request_id);
    const normalized = String(status ?? "").toUpperCase();
    if (normalized !== "COMPLETED" && normalized !== "OK") return serializeRun(run);

    const result = await getFalQueueResult(run.provider_model, run.provider_request_id);
    const output = extractOutput(result);
    if (!output) throw new Error("The provider finished without returning a file");

    const { data: updated } = await admin
      .from("node_runs")
      .update({
        status: "complete",
        output_url: output.url,
        output_type: output.type,
        completed_at: new Date().toISOString(),
      })
      .eq("id", run.id)
      .select("*")
      .single();

    return serializeRun(updated ?? run);
  } catch (error) {
    const message = errorMessage(error);
    const isTransient = /queue status lookup failed|fetch|network/i.test(message);
    if (isTransient) return serializeRun(run);

    const { data: updated } = await admin
      .from("node_runs")
      .update({
        status: "failed",
        error_log: message.slice(0, 10000),
        completed_at: new Date().toISOString(),
      })
      .eq("id", run.id)
      .select("*")
      .single();

    return serializeRun(updated ?? run);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

  const admin = createAdminClient();
  const url = new URL(req.url);

  // fal webhook callback for a standalone node run (no auth; the run id is the shared secret).
  if (url.searchParams.get("callback") === "1") {
    const nodeRunId = url.searchParams.get("nodeRunId");
    if (!nodeRunId) return json({ error: "Missing nodeRunId" }, 400);

    try {
      const body = await req.json().catch(() => ({})) as {
        request_id?: string;
        status?: string;
        payload?: unknown;
        error?: string;
      };

      const { data: run } = await admin.from("node_runs").select("*").eq("id", nodeRunId).maybeSingle();
      if (!run) return json({ error: "Run not found" }, 404);
      if (body.request_id && run.provider_request_id && body.request_id !== run.provider_request_id) {
        return json({ error: "Request mismatch" }, 400);
      }
      if (run.status === "complete" || run.status === "failed") return json({ ok: true });

      const output = extractOutput(body.payload);
      const failed = String(body.status ?? "").toUpperCase() === "ERROR" || (!output && body.error);

      if (failed || !output) {
        // Let the poller reconcile if the payload was simply unusable.
        if (!body.error && !failed) return json({ ok: true });
        await admin
          .from("node_runs")
          .update({
            status: "failed",
            error_log: String(body.error ?? "Generation failed").slice(0, 10000),
            completed_at: new Date().toISOString(),
          })
          .eq("id", run.id);
        return json({ ok: true });
      }

      await admin
        .from("node_runs")
        .update({
          status: "complete",
          output_url: output.url,
          output_type: output.type,
          completed_at: new Date().toISOString(),
        })
        .eq("id", run.id);

      return json({ ok: true });
    } catch (error) {
      console.error("run-node callback failed:", errorMessage(error));
      return json({ error: errorMessage(error) }, 500);
    }
  }

  try {
    const access = await requireBuilderUser(req, admin);
    const user = access.user;
    const body = await req.json().catch(() => ({})) as {
      action?: string;
      versionId?: string;
      nodeId?: string;
      runId?: string;
      nodeIds?: string[];
    };
    const action = body.action ?? (body.runId ? "status" : "start");

    if (action === "status") {
      if (body.runId) {
        const { data: run, error } = await admin
          .from("node_runs")
          .select("*")
          .eq("id", body.runId)
          .eq("user_id", user.id)
          .maybeSingle();
        if (error) throw new Error(error.message);
        if (!run) return json({ error: "Run not found" }, 404);
        return json({ run: await syncRun(admin, run) });
      }

      if (!body.versionId) throw new Error("versionId is required");
      await assertVersionAccess(admin, access, body.versionId);
      const { data: runs, error } = await admin
        .from("node_runs")
        .select("*")
        .eq("version_id", body.versionId)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(60);
      if (error) throw new Error(error.message);

      const latest = new Map<string, any>();
      for (const run of runs ?? []) {
        if (!latest.has(run.node_id)) latest.set(run.node_id, run);
      }
      const synced = await Promise.all([...latest.values()].map((run) => syncRun(admin, run)));
      return json({ runs: synced });
    }

    if (action !== "start") throw new Error(`Unsupported action: ${action}`);
    if (!body.versionId || !body.nodeId) throw new Error("versionId and nodeId are required");
    await assertVersionAccess(admin, access, body.versionId);

    const run = await startRun(admin, {
      versionId: body.versionId,
      nodeId: body.nodeId,
      userId: user.id,
    });

    return json({ run });
  } catch (error) {
    const message = errorMessage(error);
    const status = message === FORBIDDEN_TEMPLATE_MESSAGE
      ? 403
      : /access required|authorization|Authentication|bearer/i.test(message)
      ? 401
      : 400;
    return json({ error: message }, status);
  }
});
