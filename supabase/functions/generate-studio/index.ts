import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import {
  corsHeaders,
  createAdminClient,
  errorMessage,
  json,
  getUserRoles,
  requireUser,
} from "../_shared/supabase-admin.ts";
import {
  clampSeedanceDuration,
  getFalPricing,
  getFalQueueResult,
  getFalQueueStatus,
  getVideoModel,
  referenceToVideoEndpoint,
  submitFalJob,
  submitSeedanceReferenceVideoJob,
  submitVideoJob,
  buildImageModelInput,
  getImageModel,
  textToVideoEndpoint,
  VERTICAL_VIDEO_ASPECT_RATIO,
  videoFallbackUsdPerSecond,
} from "../_shared/fal.ts";
import {
  toPublicGenerationFailure,
} from "../_shared/generation-failure.ts";

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

/** Race-safe: only the caller that flips credits_refunded false->true refunds. */
async function refundStudioCreditsIfNeeded(admin: AdminClient, generationId: string) {
  const { data } = await admin
    .from("studio_generations")
    .update({ credits_refunded: true })
    .eq("id", generationId)
    .eq("credits_refunded", false)
    .gt("charged_credits", 0)
    .select("user_id, charged_credits")
    .maybeSingle();
  if (!data) return;
  await admin.rpc("apply_credit_transaction", {
    p_user_id: data.user_id,
    p_amount: data.charged_credits,
    p_type: "refund",
    p_description: `Image Studio refund (${generationId})`,
    p_template_id: null,
    p_project_id: null,
    p_step_id: null,
  });
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

/**
 * P0 failure taxonomy: customers NEVER receive raw provider/moderation text.
 * Failed rows expose `publicFailure` (classified, polished copy) to everyone;
 * the raw provider detail travels separately as `providerFailure` and is only
 * assembled for privileged (admin/dev) callers.
 */
function serializeGeneration(row: any, privileged = false) {
  const failed = row.status === "failed";
  const rawError = failed ? (row.error_log ?? null) : null;
  const publicFailure = failed
    ? toPublicGenerationFailure({ rawError, provider: row.provider_model ?? null })
    : null;

  return {
    id: row.id,
    status: row.status as "queued" | "running" | "complete" | "failed",
    kind: row.kind ?? null,
    prompt: row.prompt ?? null,
    outputUrl: row.output_url ?? null,
    previewUrl: row.preview_url ?? null,
    posterUrl: row.poster_url ?? null,
    outputType: row.output_type ?? null,

    publicFailure,
    estimatedCredits: row.estimated_credits ?? null,
    estimatedCostUsd: row.estimated_cost_usd ? Number(row.estimated_cost_usd) : null,
    providerModel: row.provider_model ?? null,
    requestId: row.provider_request_id ?? null,
    inputPayload: row.input_payload ?? null,
    favorited: row.favorited === true,
    createdAt: row.created_at ?? null,
    completedAt: row.completed_at ?? null,
    ...(privileged
      ? {
          providerFailure: failed
            ? {
                rawError,
                provider: row.provider_model ?? null,
                requestId: row.provider_request_id ?? null,
                endpoint: row.provider_model ?? null,
              }
            : null,
        }
      : {}),
  };
}

/**
 * GS-PERF1: gallery list reads select ONLY these columns — never input_payload,
 * never error_log, never full prompt bodies or reference arrays.
 */
const LIST_SELECT =
  "id, status, kind, prompt, output_url, output_type, preview_url, poster_url, estimated_credits, estimated_cost_usd, provider_model, favorited, created_at, completed_at";


function truncatePrompt(prompt: unknown, max = 160): string | null {
  const text = String(prompt ?? "").trim();
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

/** Lightweight per-row shape for the gallery list. Heavy fields stay in `detail`. */
function serializeGenerationListItem(row: any) {
  return {
    id: row.id,
    status: row.status as "queued" | "running" | "complete" | "failed",
    kind: row.kind ?? null,
    promptPreview: truncatePrompt(row.prompt),
    outputUrl: row.output_url ?? null,
    previewUrl: (row.preview_url ?? null) as string | null,
    posterUrl: (row.poster_url ?? null) as string | null,
    outputType: row.output_type ?? null,
    estimatedCredits: row.estimated_credits ?? null,
    estimatedCostUsd: row.estimated_cost_usd ? Number(row.estimated_cost_usd) : null,
    providerModel: row.provider_model ?? null,
    favorited: row.favorited === true,
    createdAt: row.created_at ?? null,
    completedAt: row.completed_at ?? null,
  };
}

/**
 * GS-PERF6: small gallery preview for completed IMAGE generations.
 * The master `output_url` is never touched or re-encoded — this only writes a
 * separate 480px JPEG into fuse-assets and fills `preview_url`.
 * Fully best-effort: it must never throw, never block, never affect credits.
 */
const PREVIEW_BUCKET = "fuse-assets";
const PREVIEW_MAX_EDGE = 480;

async function generatePreviewThumbnail(admin: AdminClient, row: any): Promise<boolean> {
  try {
    if (!row?.id) return false;
    if (row.status !== "complete") return false;
    if ((row.output_type ?? "image") !== "image") return false;
    const source = String(row.output_url ?? "").trim();
    if (!source) return false;
    if (row.preview_url) return false;

    const { default: Image } = await import(
      "https://deno.land/x/imagescript@1.2.17/mod.ts"
    );

    const res = await fetch(source);
    if (!res.ok) return false;
    const bytes = new Uint8Array(await res.arrayBuffer());

    const decoded = await Image.decode(bytes);
    const scale = Math.min(1, PREVIEW_MAX_EDGE / Math.max(decoded.width, decoded.height));
    const width = Math.max(1, Math.round(decoded.width * scale));
    const height = Math.max(1, Math.round(decoded.height * scale));
    const resized = scale < 1 ? decoded.resize(width, height) : decoded;
    const jpeg = await resized.encodeJPEG(80);

    const path = `studio/previews/${row.id}.jpg`;
    const { error: uploadError } = await admin.storage
      .from(PREVIEW_BUCKET)
      .upload(path, jpeg, { contentType: "image/jpeg", upsert: true });
    if (uploadError) {
      console.error("preview upload failed:", uploadError.message);
      return false;
    }

    const { data: pub } = admin.storage.from(PREVIEW_BUCKET).getPublicUrl(path);
    const previewUrl = pub?.publicUrl;
    if (!previewUrl) return false;

    await admin
      .from("studio_generations")
      .update({ preview_url: previewUrl })
      .eq("id", row.id)
      .is("preview_url", null);

    return true;
  } catch (error) {
    console.error("generatePreviewThumbnail failed:", errorMessage(error));
    return false;
  }
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
  /** gpt-image-2 only. */
  quality?: string;
  /** seedream-v4 only ("1K" | "2K" | "4K"). */
  imageSize?: string;
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

function requestedAspect(value: unknown) {
  const raw = String(value ?? "").trim();
  return raw && raw.toLowerCase() !== "auto" ? raw : null;
}

/**
 * Charges the generation BEFORE the provider submit. Throws INSUFFICIENT_CREDITS
 * so the caller never submits an unpaid generation. Admin/dev are not charged.
 */
async function chargeStudioCredits(
  admin: AdminClient,
  args: {
    generationId: string;
    userId: string;
    privileged: boolean;
    estimatedCostUsd: number | null;
    kind: string;
  },
) {
  const credits = creditsFromUsd(args.estimatedCostUsd) ?? 0;
  if (args.privileged || credits <= 0) return;

  const { error: creditError } = await admin.rpc("apply_credit_transaction", {
    p_user_id: args.userId,
    p_amount: -credits,
    p_type: "run_template",
    p_description: `Image Studio ${args.kind}`,
    p_template_id: null,
    p_project_id: null,
    p_step_id: null,
  });
  if (creditError) {
    await admin
      .from("studio_generations")
      .update({
        status: "failed",
        error_log: "INSUFFICIENT_CREDITS",
        completed_at: new Date().toISOString(),
      })
      .eq("id", args.generationId);
    throw new Error("INSUFFICIENT_CREDITS");
  }

  await admin
    .from("studio_generations")
    .update({ charged_credits: credits })
    .eq("id", args.generationId);
}

async function startGeneration(
  admin: AdminClient,
  args: { input: StartInput; userId: string; privileged?: boolean },
) {
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
      const imageModel = getImageModel(input.model);
      const built = buildImageModelInput(imageModel.key, {
        prompt,
        imageUrls: referenceUrls,
        aspectRatio: aspect,
        resolution: imageModel.paramKind === "resolution" ? input.resolution : undefined,
        quality: imageModel.paramKind === "quality" ? input.quality : undefined,
        imageSize: imageModel.paramKind === "image_size" ? input.imageSize : undefined,
      });
      const endpointId = built.endpointId;

      const estimatedCostUsd = await estimateUsd({
        endpointId,
        fallbackFlatUsd: imageModel.fallbackFlatUsd ?? IMAGE_FALLBACK_USD,
      });

      await chargeStudioCredits(admin, {
        generationId: inserted.id,
        userId: args.userId,
        privileged: args.privileged === true,
        estimatedCostUsd,
        kind,
      });

      const falInput = built.input;

      const requestId = await submitFalJob(endpointId, falInput, webhookUrl);

      const { data: updated } = await admin
        .from("studio_generations")
        .update({
          status: "running",
          provider_model: endpointId,
          provider_request_id: requestId,
          estimated_cost_usd: estimatedCostUsd,
          estimated_credits: creditsFromUsd(estimatedCostUsd),
          input_payload: {
            ...falInput,
            image_model: imageModel.key,
            image_param_kind: imageModel.paramKind,
            [`requested_${imageModel.paramKind}`]: built.requestedOption,
            [`submitted_${imageModel.paramKind}`]: built.submittedOption,
          },
        })
        .eq("id", inserted.id)
        .select("*")
        .single();

      return serializeGeneration(updated ?? inserted, args.privileged === true);
    }


    const videoModel = getVideoModel(input.model);
    const duration = clampSeedanceDuration(input.duration ?? 5, videoModel);
    const generateAudio = videoModel.supportsAudio ? input.generateAudio !== false : null;
    // Only forward params the selected model supports; everything else is dropped.
    // Truthfulness: a resolution is only accepted for models that have the
    // field, and an unsupported value is rejected instead of silently clamped.
    const requestedVideoResolution = String(input.resolution ?? "").trim().toLowerCase();
    if (requestedVideoResolution && !videoModel.resolutions?.length) {
      throw new Error(`${videoModel.label} has no resolution setting — its output is provider-fixed`);
    }
    if (
      requestedVideoResolution && videoModel.resolutions?.length &&
      !videoModel.resolutions.includes(requestedVideoResolution)
    ) {
      throw new Error(
        `${videoModel.label} cannot render ${requestedVideoResolution.toUpperCase()} — supported: ${
          videoModel.resolutions.map((value) => value.toUpperCase()).join(", ")
        }`,
      );
    }
    const resolution = videoModel.resolutions?.length
      ? (requestedVideoResolution || "720p")
      : null;
    const aspect = requestedAspect(input.aspectRatio);
    const aspectRatio = videoModel.fixedAspect
      ? videoModel.fixedAspect
      : videoModel.aspectRatios
      ? (aspect && videoModel.aspectRatios.includes(aspect) ? aspect : VERTICAL_VIDEO_ASPECT_RATIO)
      : null;
    const endFrameUrl = input.endImageUrl ? String(input.endImageUrl).trim() : undefined;

    const textToVideo = !startImageUrl;
    /**
     * Multi-reference Seedance must go to the reference-to-video endpoint —
     * the image-to-video endpoint only accepts a single image_url, so REF 2..N
     * were silently dropped. Reference order is preserved as given.
     */
    const multiReference =
      !textToVideo && videoModel.supportsMultiReference === true && referenceUrls.length >= 2;

    let endpointId = textToVideo
      ? textToVideoEndpoint(videoModel.endpointId)
      : multiReference
      ? referenceToVideoEndpoint(videoModel.key)
      : videoModel.endpointId;

    const estimatedCostUsd = await estimateUsd({
      endpointId,
      seconds: duration,
      fallbackUsdPerSecond: videoFallbackUsdPerSecond(videoModel, generateAudio) ?? null,
    });

    await chargeStudioCredits(admin, {
      generationId: inserted.id,
      userId: args.userId,
      privileged: args.privileged === true,
      estimatedCostUsd,
      kind,
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
    } else if (multiReference) {
      const submitted = await submitSeedanceReferenceVideoJob({
        modelKey: videoModel.key,
        prompt,
        imageUrls: referenceUrls,
        duration,
        ...(resolution ? { resolution } : {}),
        ...(aspectRatio ? { aspectRatio } : {}),
        ...(generateAudio === null ? {} : { generateAudio }),
        webhookUrl,
      });
      requestId = submitted.requestId;
      endpointId = submitted.endpointId;
      payload = submitted.input;
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

    return serializeGeneration(updated ?? inserted, args.privileged === true);
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

/**
 * Stability guards for the reconciliation path (production incident):
 * stuck `running` rows whose webhook never landed used to be re-checked on
 * every poll, fanning out an ever-growing pile of hanging provider calls.
 */
const STUCK_AFTER_MS = 20 * 60 * 1000;
const PROVIDER_CALL_TIMEOUT_MS = 10_000;
const MAX_RECONCILE_PER_CALL = 6;

class ProviderTimeout extends Error {}

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_resolve, reject) =>
      setTimeout(
        () => reject(new ProviderTimeout(`${label} timed out after ${PROVIDER_CALL_TIMEOUT_MS}ms`)),
        PROVIDER_CALL_TIMEOUT_MS,
      )
    ),
  ]);
}

function isInFlight(row: any) {
  return row?.status === "queued" || row?.status === "running";
}

function ageMs(row: any) {
  const created = Date.parse(String(row?.created_at ?? ""));
  return Number.isFinite(created) ? Date.now() - created : 0;
}

function isStuck(row: any) {
  return isInFlight(row) && ageMs(row) > STUCK_AFTER_MS;
}

/** Terminal-fail an in-flight row that never produced a provider result. */
async function expireGeneration(admin: AdminClient, row: any, privileged = false) {
  const { data: updated } = await admin
    .from("studio_generations")
    .update({
      status: "failed",
      error_log: "Generation timed out (no provider result within 20m)",
      completed_at: new Date().toISOString(),
    })
    .eq("id", row.id)
    .select("*")
    .maybeSingle();
  return serializeGeneration(updated ?? { ...row, status: "failed" }, privileged);
}

/** Poll fal for a generation still in flight and persist any terminal result. */
async function syncGeneration(admin: AdminClient, row: any, privileged = false) {
  if (!isInFlight(row)) return serializeGeneration(row, privileged);
  if (isStuck(row)) return await expireGeneration(admin, row, privileged);
  if (!row.provider_request_id || !row.provider_model) {
    return serializeGeneration(row, privileged);
  }

  try {
    const status = await withTimeout(
      getFalQueueStatus(row.provider_model, row.provider_request_id),
      "queue status lookup",
    );
    const normalized = String(status ?? "").toUpperCase();
    if (normalized !== "COMPLETED" && normalized !== "OK") return serializeGeneration(row, privileged);

    const result = await withTimeout(
      getFalQueueResult(row.provider_model, row.provider_request_id),
      "queue result lookup",
    );
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

    // GS-PERF6: best-effort gallery thumbnail (never blocks or fails the row).
    const completed = updated ?? { ...row, status: "complete", output_url: output.url, output_type: output.type };
    if (!completed.preview_url) {
      await generatePreviewThumbnail(admin, completed);
    }

    return serializeGeneration(updated ?? row, privileged);

  } catch (error) {
    // A hung/rate-limited provider call must never fail the row or the invocation.
    if (error instanceof ProviderTimeout) return serializeGeneration(row, privileged);

    const message = errorMessage(error);
    const isTransient = /queue status lookup failed|fetch|network|timed out/i.test(message);
    if (isTransient) return serializeGeneration(row, privileged);

    const detail = await providerFailureDetail(row).catch(() => null);

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

    return serializeGeneration(updated ?? row, privileged);
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

      // GS-PERF6: best-effort gallery thumbnail; failures are swallowed.
      if (!row.preview_url) {
        await generatePreviewThumbnail(admin, {
          ...row,
          status: "complete",
          output_url: output.url,
          output_type: output.type,
          preview_url: null,
        });
      }

      return json({ ok: true });

    } catch (error) {
      console.error("generate-studio callback failed:", errorMessage(error));
      return json({ error: errorMessage(error) }, 500);
    }
  }

  try {
    const access = await requireBuilderUser(req, admin);
    const user = access.user;
    // Raw provider failure detail is assembled ONLY for admin/dev callers.
    const privileged = access.isAdmin === true || access.isDev === true;
    const body = await req.json().catch(() => ({})) as StartInput & {
      action?: string;
      generationId?: string;
      generationIds?: string[];
      limit?: number;
      cursor?: { createdAt?: unknown; id?: unknown };
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
      return json({ generation: await syncGeneration(admin, row, privileged) });
    }

    if (action === "list" || action === "queue") {
      /**
       * GS-PERF1 (P0/P1/P13): the gallery read is a FAST DB READ ONLY.
       * No syncGeneration/FAL calls, no stuck-row expiry, no SELECT * —
       * webhooks are the completion path; `reconcile` is the explicit fallback.
       */
      const limit = Math.min(200, Math.max(1, Number(body.limit ?? 20)));
      /**
       * GS-PERF2: stable keyset cursor. Ordering is (created_at DESC, id DESC);
       * a cursor page keeps only rows strictly after it:
       *   created_at < cursor.createdAt
       *   OR (created_at = cursor.createdAt AND id < cursor.id)
       * PostgREST: or(created_at.lt.<ts>,and(created_at.eq.<ts>,id.lt.<id>))
       * (values URL-encoded — timestamps contain spaces/'+'). Fetch limit+1
       * to detect the next page without a count query.
       */
      const cursorCreatedAt = typeof body.cursor?.createdAt === "string"
        ? body.cursor.createdAt.trim()
        : "";
      const cursorId = typeof body.cursor?.id === "string" ? body.cursor.id.trim() : "";

      let query = admin
        .from("studio_generations")
        .select(LIST_SELECT)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(limit + 1);

      if (cursorCreatedAt && cursorId) {
        query = query.or(
          `created_at.lt.${cursorCreatedAt},and(created_at.eq.${cursorCreatedAt},id.lt.${cursorId})`,
        );
      }

      const { data: rows, error } = await query;
      if (error) throw new Error(error.message);

      const all = rows ?? [];
      const page = all.slice(0, limit);
      const last = page[page.length - 1] as { created_at?: string; id?: string } | undefined;
      const nextCursor = all.length > limit && last?.created_at && last?.id
        ? { createdAt: String(last.created_at), id: String(last.id) }
        : null;

      return json({
        generations: page.map(serializeGenerationListItem),
        nextCursor,
      });
    }

    if (action === "detail") {
      // Heavy single-row read for the lightbox: full prompt, payload, debug, error.
      if (!body.generationId) throw new Error("generationId is required");
      const { data: row, error } = await admin
        .from("studio_generations")
        .select("*")
        .eq("id", body.generationId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!row) return json({ error: "Generation not found" }, 404);
      return json({ generation: serializeGeneration(row, privileged) });
    }

    if (action === "reconcile") {
      /**
       * Missed-webhook safety net ONLY — never invoked by ordinary gallery
       * rendering. Reconciles an explicit id list with bounded concurrency;
       * read-only against providers, never creates jobs (no duplicates).
       */
      const ids = (Array.isArray(body.generationIds) ? body.generationIds : [])
        .map((id) => String(id ?? "").trim())
        .filter(Boolean)
        .slice(0, MAX_RECONCILE_PER_CALL);
      if (!ids.length) throw new Error("generationIds is required");

      const { data: rows, error } = await admin
        .from("studio_generations")
        .select("*")
        .eq("user_id", user.id)
        .in("id", ids);
      if (error) throw new Error(error.message);

      const inFlightRows = (rows ?? []).filter(isInFlight);
      const reconciled = new Map<string, ReturnType<typeof serializeGeneration>>();
      const CONCURRENCY = 3;
      for (let i = 0; i < inFlightRows.length; i += CONCURRENCY) {
        const chunk = inFlightRows.slice(i, i + CONCURRENCY);
        const settled = await Promise.all(chunk.map((row) => syncGeneration(admin, row, privileged)));
        for (const entry of settled) reconciled.set(String(entry.id), entry);
      }

      const generations = (rows ?? []).map(
        (row) => reconciled.get(row.id) ?? serializeGeneration(row, privileged),
      );
      return json({ generations });
    }

    if (action === "backfill_previews") {
      /** GS-PERF6: admin/dev-only, idempotent thumbnail backfill. */
      if (!access.isAdmin && !access.isDev) throw new Error("Admin access required");

      const { data: rows, error } = await admin
        .from("studio_generations")
        .select("id, status, output_url, output_type, preview_url")
        .eq("status", "complete")
        .eq("output_type", "image")
        .is("preview_url", null)
        .not("output_url", "is", null)
        .order("created_at", { ascending: false })
        .limit(25);
      if (error) throw new Error(error.message);

      const targets = rows ?? [];
      let processed = 0;
      const CONCURRENCY = 3;
      for (let i = 0; i < targets.length; i += CONCURRENCY) {
        const chunk = targets.slice(i, i + CONCURRENCY);
        const results = await Promise.all(
          chunk.map((row) => generatePreviewThumbnail(admin, row)),
        );
        processed += results.filter(Boolean).length;
      }

      const { count } = await admin
        .from("studio_generations")
        .select("id", { count: "exact", head: true })
        .eq("status", "complete")
        .eq("output_type", "image")
        .is("preview_url", null)
        .not("output_url", "is", null);

      return json({ processed, remaining: count ?? 0 });
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
      return json({ generation: serializeGeneration(row, privileged) });
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

    const generation = await startGeneration(admin, { input: body, userId: user.id, privileged });
    return json({ generation });
  } catch (error) {
    const message = errorMessage(error);
    const status = /access required|authorization|Authentication|bearer/i.test(message) ? 401 : 400;
    return json({ error: message }, status);
  }
});
