import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import {
  corsHeaders,
  createAdminClient,
  errorMessage,
  json,
  requireBuilderUser,
} from "../_shared/supabase-admin.ts";
import {
  clampSeedanceDuration,
  getFalPricing,
  getFalQueueResult,
  getFalQueueStatus,
  getVideoModel,
  IMAGE_MODEL,
  submitFalJob,
  submitVideoJob,
  TEXT_IMAGE_MODEL,
  textToVideoEndpoint,
  VERTICAL_VIDEO_ASPECT_RATIO,
  videoFallbackUsdPerSecond,
} from "../_shared/fal.ts";

/**
 * Generation Studio: standalone prompt-to-image / prompt-to-video generations.
 * Fully additive — never touches execution_jobs, execution_steps, node_runs,
 * the shared executor or the paid runner. Results live in `studio_generations`.
 */

const USD_PER_CREDIT = 0.098;
const IMAGE_FALLBACK_USD = 0.15;

type AdminClient = ReturnType<typeof createAdminClient>;

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

  const videoUrl = data?.video?.url ?? data?.videos?.[0]?.url ??
    (typeof data?.video === "string" ? data.video : null);
  if (videoUrl) return { url: String(videoUrl), type: "video" };

  const imageUrl = data?.images?.[0]?.url ?? data?.image?.url ?? data?.output?.url;
  if (imageUrl) return { url: String(imageUrl), type: "image" };

  return null;
}

/**
 * Failure paths only: ask fal for the terminal result so validation errors
 * (e.g. a 422 with a `detail` array naming the rejected field) end up in error_log
 * instead of a bare "Unexpected status code: 422".
 */
async function providerFailureDetail(row: any): Promise<string | null> {
  if (!row?.provider_model || !row?.provider_request_id) return null;
  try {
    const result = await getFalQueueResult(row.provider_model, row.provider_request_id);
    if (!result) return null;
    const detail = (result as any)?.detail ?? (result as any)?.error ?? result;
    try {
      return typeof detail === "string" ? detail : JSON.stringify(detail);
    } catch {
      return String(detail);
    }
  } catch (error) {
    // describeFalError already embeds the fal status + response body here.
    return errorMessage(error);
  }
}

/** Bare provider codes carry no diagnostic value on their own; enrich them. */
function combineFailureMessage(base: string, detail: string | null) {
  const trimmed = (detail ?? "").trim();
  if (!trimmed || base.includes(trimmed)) return base.slice(0, 10000);
  return `${base}\n\nProvider detail: ${trimmed}`.slice(0, 10000);
}

function serializeGeneration(row: any) {
  return {
    id: row.id,
    status: row.status as "queued" | "running" | "complete" | "failed",
    kind: row.kind ?? null,
    prompt: row.prompt ?? null,
    outputUrl: row.output_url ?? null,
    outputType: row.output_type ?? null,
    error: row.error_log ?? null,
    estimatedCredits: row.estimated_credits ?? null,
    estimatedCostUsd: row.estimated_cost_usd ? Number(row.estimated_cost_usd) : null,
    providerModel: row.provider_model ?? null,
    requestId: row.provider_request_id ?? null,
    inputPayload: row.input_payload ?? null,
    favorited: row.favorited === true,
    createdAt: row.created_at ?? null,
    completedAt: row.completed_at ?? null,
  };
}

type StartInput = {
  kind?: string;
  model?: string;
  prompt?: string;
  startImageUrl?: string;
  endImageUrl?: string;
  imageUrls?: string[];
  duration?: number | string;
  resolution?: string;
  generateAudio?: boolean;
  aspectRatio?: string;
};

const MAX_REFERENCE_IMAGES = 15;

/** Reference URLs in REF order — REF 1 becomes image 1 for the model. */
function collectImageUrls(input: StartInput) {
  const raw = [
    ...(Array.isArray(input.imageUrls) ? input.imageUrls : []),
    input.startImageUrl,
    input.endImageUrl,
  ];
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const entry of raw) {
    const url = String(entry ?? "").trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
    if (urls.length >= MAX_REFERENCE_IMAGES) break;
  }
  return urls;
}

/** Normalize an image-model resolution request; unsupported values are dropped. */
function imageResolution(value: unknown) {
  const raw = String(value ?? "").trim().toUpperCase();
  return raw === "1K" || raw === "2K" || raw === "4K" ? raw : null;
}

function requestedAspect(value: unknown) {
  const raw = String(value ?? "").trim();
  return raw && raw.toLowerCase() !== "auto" ? raw : null;
}

async function startGeneration(admin: AdminClient, args: { input: StartInput; userId: string }) {
  const input = args.input;
  const kind = input.kind === "video" ? "video" : "image";
  const prompt = String(input.prompt ?? "").trim();
  const referenceUrls = collectImageUrls(input);
  const startImageUrl = String(input.startImageUrl ?? referenceUrls[0] ?? "").trim();

  // References are optional: a prompt alone drives text-to-image / text-to-video.
  if (!prompt) throw new Error("Add a prompt before generating");

  const webhookBase =
    `${Deno.env.get("SUPABASE_URL")}/functions/v1/generate-studio?callback=1&generationId=`;

  const { data: inserted, error: insertError } = await admin
    .from("studio_generations")
    .insert({
      user_id: args.userId,
      status: "queued",
      kind,
      provider: "fal",
      prompt,
    })
    .select("*")
    .single();
  if (insertError || !inserted) {
    throw new Error(insertError?.message ?? "Could not start the generation");
  }

  const webhookUrl = `${webhookBase}${encodeURIComponent(inserted.id)}`;

  try {
    if (kind === "image") {
      const aspect = requestedAspect(input.aspectRatio);
      const resolution = imageResolution(input.resolution);
      const endpointId = referenceUrls.length ? IMAGE_MODEL : TEXT_IMAGE_MODEL;

      const estimatedCostUsd = await estimateUsd({
        endpointId,
        fallbackFlatUsd: IMAGE_FALLBACK_USD,
      });

      const falInput: Record<string, unknown> = {
        prompt,
        output_format: "png",
        ...(referenceUrls.length ? { image_urls: referenceUrls } : {}),
        ...(aspect ? { aspect_ratio: aspect } : {}),
        ...(resolution ? { resolution } : {}),
      };

      const requestId = await submitFalJob(endpointId, falInput, webhookUrl);

      const { data: updated } = await admin
        .from("studio_generations")
        .update({
          status: "running",
          provider_model: endpointId,
          provider_request_id: requestId,
          estimated_cost_usd: estimatedCostUsd,
          estimated_credits: creditsFromUsd(estimatedCostUsd),
          input_payload: falInput,
        })
        .eq("id", inserted.id)
        .select("*")
        .single();

      return serializeGeneration(updated ?? inserted);
    }

    const videoModel = getVideoModel(input.model);
    const duration = clampSeedanceDuration(input.duration ?? 5, videoModel);
    const generateAudio = videoModel.supportsAudio ? input.generateAudio !== false : null;
    // Only forward params the selected model supports; everything else is dropped.
    const resolution = videoModel.resolutions?.includes(String(input.resolution ?? "").toLowerCase())
      ? String(input.resolution).toLowerCase()
      : (videoModel.resolutions?.length ? "720p" : null);
    const aspect = requestedAspect(input.aspectRatio);
    const aspectRatio = videoModel.fixedAspect
      ? videoModel.fixedAspect
      : videoModel.aspectRatios
      ? (aspect && videoModel.aspectRatios.includes(aspect) ? aspect : VERTICAL_VIDEO_ASPECT_RATIO)
      : null;
    const endFrameUrl = input.endImageUrl ? String(input.endImageUrl).trim() : undefined;

    const textToVideo = !startImageUrl;
    const endpointId = textToVideo
      ? textToVideoEndpoint(videoModel.endpointId)
      : videoModel.endpointId;

    const estimatedCostUsd = await estimateUsd({
      endpointId: videoModel.endpointId,
      seconds: duration,
      fallbackUsdPerSecond: videoFallbackUsdPerSecond(videoModel, generateAudio) ?? null,
    });

    let requestId: string;
    let payload: Record<string, unknown>;

    if (textToVideo) {
      payload = {
        prompt,
        duration: String(duration),
        ...(aspectRatio ? { aspect_ratio: aspectRatio } : {}),
        ...(resolution ? { resolution } : {}),
        ...(generateAudio === null ? {} : { generate_audio: generateAudio }),
        ...(videoModel.family === "kling3" ? { cfg_scale: 0.5 } : {}),
      };
      requestId = await submitFalJob(endpointId, payload, webhookUrl);
    } else {
      payload = {
        prompt,
        init_image: startImageUrl,
        ...(endFrameUrl ? { end_frame_image: endFrameUrl } : {}),
        duration,
        ...(resolution ? { resolution } : {}),
        ...(aspectRatio ? { aspect_ratio: aspectRatio } : {}),
        ...(generateAudio === null ? {} : { generate_audio: generateAudio }),
      };
      requestId = await submitVideoJob({
        prompt,
        initImageUrl: startImageUrl,
        ...(endFrameUrl ? { endFrameUrl } : {}),
        modelKey: videoModel.key,
        duration,
        ...(aspectRatio ? { aspectRatio } : {}),
        ...(resolution ? { resolution } : {}),
        ...(generateAudio === null ? {} : { generateAudio }),
        webhookUrl,
      });
    }

    const { data: updated } = await admin
      .from("studio_generations")
      .update({
        status: "running",
        provider_model: endpointId,
        provider_request_id: requestId,
        estimated_cost_usd: estimatedCostUsd,
        estimated_credits: creditsFromUsd(estimatedCostUsd),
        input_payload: { ...payload, video_model: videoModel.key },
      })
      .eq("id", inserted.id)
      .select("*")
      .single();

    return serializeGeneration(updated ?? inserted);
  } catch (error) {
    const message = errorMessage(error);
    await admin
      .from("studio_generations")
      .update({
        status: "failed",
        error_log: message.slice(0, 10000),
        completed_at: new Date().toISOString(),
      })
      .eq("id", inserted.id);
    throw error;
  }
}

/** Poll fal for a generation still in flight and persist any terminal result. */
async function syncGeneration(admin: AdminClient, row: any) {
  if (row.status !== "running" && row.status !== "queued") return serializeGeneration(row);
  if (!row.provider_request_id || !row.provider_model) return serializeGeneration(row);

  try {
    const status = await getFalQueueStatus(row.provider_model, row.provider_request_id);
    const normalized = String(status ?? "").toUpperCase();
    if (normalized !== "COMPLETED" && normalized !== "OK") return serializeGeneration(row);

    const result = await getFalQueueResult(row.provider_model, row.provider_request_id);
    const output = extractOutput(result);
    if (!output) throw new Error("The provider finished without returning a file");

    const { data: updated } = await admin
      .from("studio_generations")
      .update({
        status: "complete",
        output_url: output.url,
        output_type: output.type,
        completed_at: new Date().toISOString(),
      })
      .eq("id", row.id)
      .select("*")
      .single();

    return serializeGeneration(updated ?? row);
  } catch (error) {
    const message = errorMessage(error);
    const isTransient = /queue status lookup failed|fetch|network/i.test(message);
    if (isTransient) return serializeGeneration(row);

    const detail = await providerFailureDetail(row);

    const { data: updated } = await admin
      .from("studio_generations")
      .update({
        status: "failed",
        error_log: combineFailureMessage(message, detail),
        completed_at: new Date().toISOString(),
      })
      .eq("id", row.id)
      .select("*")
      .single();

    return serializeGeneration(updated ?? row);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

  const admin = createAdminClient();
  const url = new URL(req.url);

  // fal webhook callback (no auth; the generation id is the shared secret).
  if (url.searchParams.get("callback") === "1") {
    const generationId = url.searchParams.get("generationId");
    if (!generationId) return json({ error: "Missing generationId" }, 400);

    try {
      const body = await req.json().catch(() => ({})) as {
        request_id?: string;
        status?: string;
        payload?: unknown;
        error?: string;
      };

      const { data: row } = await admin
        .from("studio_generations")
        .select("*")
        .eq("id", generationId)
        .maybeSingle();
      if (!row) return json({ error: "Generation not found" }, 404);
      if (body.request_id && row.provider_request_id && body.request_id !== row.provider_request_id) {
        return json({ error: "Request mismatch" }, 400);
      }
      if (row.status === "complete" || row.status === "failed") return json({ ok: true });

      const output = extractOutput(body.payload);
      const failed = String(body.status ?? "").toUpperCase() === "ERROR" || (!output && !!body.error);

      if (failed || !output) {
        // Let the poller reconcile if the payload was simply unusable.
        if (!body.error && !failed) return json({ ok: true });
        const detail = await providerFailureDetail(row);
        await admin
          .from("studio_generations")
          .update({
            status: "failed",
            error_log: combineFailureMessage(
              String(body.error ?? "Generation failed"),
              detail,
            ),
            completed_at: new Date().toISOString(),
          })
          .eq("id", row.id);
        return json({ ok: true });
      }

      await admin
        .from("studio_generations")
        .update({
          status: "complete",
          output_url: output.url,
          output_type: output.type,
          completed_at: new Date().toISOString(),
        })
        .eq("id", row.id);

      return json({ ok: true });
    } catch (error) {
      console.error("generate-studio callback failed:", errorMessage(error));
      return json({ error: errorMessage(error) }, 500);
    }
  }

  try {
    const access = await requireBuilderUser(req, admin);
    const user = access.user;
    const body = await req.json().catch(() => ({})) as StartInput & {
      action?: string;
      generationId?: string;
      generationIds?: string[];
      limit?: number;
    };
    const action = body.action ?? (body.generationId ? "status" : "start");

    if (action === "status") {
      if (!body.generationId) throw new Error("generationId is required");
      const { data: row, error } = await admin
        .from("studio_generations")
        .select("*")
        .eq("id", body.generationId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!row) return json({ error: "Generation not found" }, 404);
      return json({ generation: await syncGeneration(admin, row) });
    }

    if (action === "list" || action === "queue") {
      const limit = Math.min(200, Math.max(1, Number(body.limit ?? 20)));
      const { data: rows, error } = await admin
        .from("studio_generations")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw new Error(error.message);

      // Reconcile every in-flight row so the queue reflects terminal results.
      const generations = await Promise.all(
        (rows ?? []).map((row) =>
          row.status === "queued" || row.status === "running"
            ? syncGeneration(admin, row)
            : Promise.resolve(serializeGeneration(row))
        ),
      );
      return json({ generations });
    }

    if (action === "set_favorite") {
      const generationId = String(body.generationId ?? "").trim();
      if (!generationId) throw new Error("generationId is required");
      const favorited = (body as { favorited?: unknown }).favorited === true;

      const { data: row, error } = await admin
        .from("studio_generations")
        .update({ favorited })
        .eq("id", generationId)
        .eq("user_id", user.id)
        .select("*")
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!row) return json({ error: "Generation not found" }, 404);
      return json({ generation: serializeGeneration(row) });
    }

    if (action === "delete") {
      const ids = (Array.isArray(body.generationIds) ? body.generationIds : [body.generationId])
        .map((id) => String(id ?? "").trim())
        .filter(Boolean);
      if (!ids.length) throw new Error("Select at least one asset to delete");

      const { data: rows, error: readError } = await admin
        .from("studio_generations")
        .select("id, output_url")
        .eq("user_id", user.id)
        .in("id", ids);
      if (readError) throw new Error(readError.message);

      // Best-effort: drop any stored file we own; provider-hosted files simply expire.
      const prefix = `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/public/fuse-assets/`;
      const paths = (rows ?? [])
        .map((row) => String(row.output_url ?? ""))
        .filter((url) => url.startsWith(prefix))
        .map((url) => decodeURIComponent(url.slice(prefix.length)));
      if (paths.length) {
        await admin.storage.from("fuse-assets").remove(paths).catch(() => null);
      }

      const { error: deleteError } = await admin
        .from("studio_generations")
        .delete()
        .eq("user_id", user.id)
        .in("id", (rows ?? []).map((row) => row.id));
      if (deleteError) throw new Error(deleteError.message);

      return json({ deleted: (rows ?? []).length });
    }

    if (action !== "start") throw new Error(`Unsupported action: ${action}`);

    const generation = await startGeneration(admin, { input: body, userId: user.id });
    return json({ generation });
  } catch (error) {
    const message = errorMessage(error);
    const status = /access required|authorization|Authentication|bearer/i.test(message) ? 401 : 400;
    return json({ error: message }, status);
  }
});
