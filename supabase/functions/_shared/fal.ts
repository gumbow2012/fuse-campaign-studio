import { fal } from "npm:@fal-ai/client";

export const IMAGE_MODEL = "fal-ai/nano-banana-pro/edit";
/** Additive: Nano Banana 2 image-edit endpoint, used for opt-in comparisons. */
export const IMAGE_MODEL_ALT = "fal-ai/nano-banana/edit";
export const VIDEO_MODEL = "fal-ai/kling-video/v2.5-turbo/pro/image-to-video";
export const VERTICAL_VIDEO_ASPECT_RATIO = "9:16";
export const MAX_VIDEO_DURATION_SECONDS = 5;
const FAL_PLATFORM_URL = "https://api.fal.ai/v1/models";

fal.config({
  credentials: Deno.env.get("FAL_API_KEY")!,
});

type PricingRecord = {
  endpoint_id: string;
  unit_price: number;
  unit: string;
  currency: string;
};

type RequestRecord = {
  request_id: string;
  endpoint_id: string;
  sent_at?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
  duration?: number | null;
  status_code?: number | null;
};

function falAuthHeaders() {
  const key = Deno.env.get("FAL_API_KEY");
  if (!key) throw new Error("Missing FAL_API_KEY");
  return { Authorization: `Key ${key}` };
}

function describeFalError(error: unknown, context: string) {
  if (!(error instanceof Error)) return `${context}: ${String(error)}`;

  const falError = error as Error & {
    status?: number;
    body?: unknown;
    responseBody?: unknown;
    data?: unknown;
    cause?: unknown;
  };

  const details = [
    falError.message,
    falError.status ? `status=${falError.status}` : null,
  ].filter(Boolean);

  const payload = falError.body ?? falError.responseBody ?? falError.data ?? null;
  if (payload) {
    try {
      details.push(JSON.stringify(payload));
    } catch {
      details.push(String(payload));
    }
  }

  return `${context}: ${details.join(" | ")}`;
}

export async function getFalPricing(endpointId: string) {
  const url = new URL(`${FAL_PLATFORM_URL}/pricing`);
  url.searchParams.set("endpoint_id", endpointId);

  const response = await fetch(url, {
    headers: falAuthHeaders(),
  });
  if (!response.ok) {
    throw new Error(`fal pricing lookup failed: ${response.status}`);
  }

  const body = await response.json() as { prices?: PricingRecord[] };
  return body.prices?.find((price) => price.endpoint_id === endpointId) ?? null;
}

export async function getFalRequestTelemetry(endpointId: string, requestId: string) {
  const url = new URL(`${FAL_PLATFORM_URL}/requests/by-endpoint`);
  url.searchParams.set("endpoint_id", endpointId);
  url.searchParams.set("request_id", requestId);

  const response = await fetch(url, {
    headers: falAuthHeaders(),
  });
  if (!response.ok) {
    throw new Error(`fal request lookup failed: ${response.status}`);
  }

  const body = await response.json() as { items?: RequestRecord[] };
  return body.items?.find((item) => item.request_id === requestId) ?? null;
}

export async function getFalQueueStatus(endpointId: string, requestId: string) {
  try {
    const result = await fal.queue.status(endpointId, {
      requestId,
      logs: false,
    } as any);

    return (result as any)?.status ?? null;
  } catch (error) {
    throw new Error(describeFalError(error, "fal queue status lookup failed"));
  }
}

export async function getFalQueueResult(endpointId: string, requestId: string) {
  try {
    const result = await fal.queue.result(endpointId, {
      requestId,
    } as any);

    return (result as any)?.data ?? result;
  } catch (error) {
    throw new Error(describeFalError(error, "fal queue result lookup failed"));
  }
}

/**
 * RESOLUTION TRUTHFULNESS — nano-banana-pro (edit + text-to-image) exposes a
 * real `resolution` enum in the live fal OpenAPI schema: 1K | 2K | 4K
 * (default 1K). nano-banana (NB2) has NO resolution field, so its payload must
 * never carry one.
 */
export const IMAGE_RESOLUTIONS = ["1K", "2K", "4K"] as const;
export type ImageResolution = typeof IMAGE_RESOLUTIONS[number];

/**
 * Validates a requested nano-banana-pro resolution. Empty/absent → provider
 * default "1K". A non-empty unsupported value is REJECTED (never silently
 * downgraded), so requested === submitted.
 */
export function normalizeImageResolution(value: unknown): ImageResolution {
  const raw = String(value ?? "").trim().toUpperCase();
  if (!raw || raw === "AUTO") return "1K";
  if ((IMAGE_RESOLUTIONS as readonly string[]).includes(raw)) return raw as ImageResolution;
  throw new Error(
    `Unsupported image resolution "${raw}" — supported: ${IMAGE_RESOLUTIONS.join(", ")}`,
  );
}

export async function submitImageJob(args: {
  prompt: string;
  imageUrls: string[];
  aspectRatio?: string;
  /** "1K" | "2K" | "4K" — validated, defaults to the provider default "1K". */
  resolution?: string;
  webhookUrl: string;
}) {
  if (!args.imageUrls.length) throw new Error("Image edit requires at least one image");

  const resolution = normalizeImageResolution(args.resolution);

  let queued: unknown;
  try {
    queued = await fal.queue.submit(IMAGE_MODEL, {
      input: {
        prompt: args.prompt,
        image_urls: args.imageUrls,
        aspect_ratio: args.aspectRatio ?? "9:16",
        output_format: "png",
        resolution,
      },
      webhookUrl: args.webhookUrl,
    });
  } catch (error) {
    throw new Error(describeFalError(error, "fal image queue submit failed"));
  }

  const requestId = (queued as any)?.request_id ?? (queued as any)?.requestId;
  if (!requestId) throw new Error("fal image edit queue submit completed without request_id");

  return requestId as string;
}

export async function runImageEdit(
  prompt: string,
  imageUrls: string[],
  aspectRatio = "9:16",
  resolutionRequest?: string,
) {
  if (!imageUrls.length) throw new Error("Image edit requires at least one image");

  const resolution = normalizeImageResolution(resolutionRequest);

  let result: unknown;
  try {
    result = await fal.run(IMAGE_MODEL, {
      input: {
        prompt,
        image_urls: imageUrls,
        aspect_ratio: aspectRatio,
        output_format: "png",
        resolution,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`fal image edit failed: ${message}`);
  }

  const output = (result as any)?.data ?? result;
  const imageUrl = output?.images?.[0]?.url ?? output?.image?.url;
  if (!imageUrl) throw new Error("fal image edit completed without an image URL");

  return imageUrl as string;
}


export async function submitVideoJob(args: {
  prompt: string;
  initImageUrl: string;
  endFrameUrl?: string;
  aspectRatio?: string;
  duration?: number;
  webhookUrl: string;
  modelKey?: string;
  resolution?: string;
  generateAudio?: boolean;
}) {
  const modelKey = resolveVideoModelKey(args.modelKey);
  const endpointId = VIDEO_MODELS[modelKey].endpointId;
  const input = buildVideoModelInput(modelKey, {
    imageUrl: args.initImageUrl,
    endFrameUrl: args.endFrameUrl,
    prompt: args.prompt,
    duration: args.duration,
    resolution: args.resolution,
    aspectRatio: args.aspectRatio,
    generateAudio: args.generateAudio,
  });

  let queued: unknown;
  try {
    queued = await fal.queue.submit(endpointId, {
      input,
      webhookUrl: args.webhookUrl,
    });
  } catch (error) {
    throw new Error(describeFalError(error, "fal video queue submit failed"));
  }

  const requestId = (queued as any)?.request_id ?? (queued as any)?.requestId;
  if (!requestId) throw new Error("fal queue submit completed without request_id");

  return requestId as string;
}

/** LIVE schema: kling v2.5-turbo image-to-video duration enum is ONLY 5 or 10. */
export const KLING25_DURATIONS = [5, 10] as const;

export function normalizeVideoDuration(value: unknown) {
  const duration = Number(value ?? MAX_VIDEO_DURATION_SECONDS);
  if (!Number.isFinite(duration) || duration <= 0) return MAX_VIDEO_DURATION_SECONDS;
  // Guard only — the enum is not expanded; anything else falls back to 5s.
  return (KLING25_DURATIONS as readonly number[]).includes(duration)
    ? duration
    : MAX_VIDEO_DURATION_SECONDS;
}

/* ============================ Video model registry ============================ */

export type VideoModelKey =
  | "kling-3.0-pro"
  | "kling-3.0-standard"
  | "kling-2.5"
  | "seedance-2.0"
  | "seedance-2.0-fast";

export type VideoModelDefinition = {
  key: VideoModelKey;
  endpointId: string;
  label: string;
  family: "kling" | "kling3" | "seedance";
  /** Fallback price per second in USD when audio is enabled (kling3). */
  fallbackUsdPerSecondAudio?: number;
  supportsAudio: boolean;
  fixedAspect?: string;
  maxDurationSec?: number;
  durationRange?: { min: number; max: number };
  resolutions?: string[];
  aspectRatios?: string[];
  /** Fallback price per second in USD when fal pricing lookup is unavailable. */
  fallbackUsdPerSecond?: number;
  /** True when the model has a reference-to-video endpoint accepting many images. */
  supportsMultiReference?: boolean;
};

export const DEFAULT_VIDEO_MODEL: VideoModelKey = "kling-3.0-pro";

export const KLING3_USD_PER_SECOND = 0.112;
export const KLING3_USD_PER_SECOND_AUDIO = 0.168;

export const VIDEO_MODELS: Record<VideoModelKey, VideoModelDefinition> = {
  "kling-3.0-pro": {
    key: "kling-3.0-pro",
    endpointId: "fal-ai/kling-video/v3/pro/image-to-video",
    label: "Kling 3.0 Pro",
    family: "kling3",
    supportsAudio: true,
    durationRange: { min: 3, max: 15 },
    fallbackUsdPerSecond: KLING3_USD_PER_SECOND,
    fallbackUsdPerSecondAudio: KLING3_USD_PER_SECOND_AUDIO,
  },
  "kling-3.0-standard": {
    key: "kling-3.0-standard",
    endpointId: "fal-ai/kling-video/v3/standard/image-to-video",
    label: "Kling 3.0 Standard",
    family: "kling3",
    supportsAudio: true,
    durationRange: { min: 3, max: 15 },
    fallbackUsdPerSecond: KLING3_USD_PER_SECOND,
    fallbackUsdPerSecondAudio: KLING3_USD_PER_SECOND_AUDIO,
  },
  "kling-2.5": {
    key: "kling-2.5",
    endpointId: "fal-ai/kling-video/v2.5-turbo/pro/image-to-video",
    label: "Kling 2.5",
    family: "kling",
    supportsAudio: false,
    fixedAspect: VERTICAL_VIDEO_ASPECT_RATIO,
    maxDurationSec: MAX_VIDEO_DURATION_SECONDS,
  },
  "seedance-2.0": {
    key: "seedance-2.0",
    endpointId: "bytedance/seedance-2.0/image-to-video",
    label: "Seedance 2.0",
    family: "seedance",
    supportsAudio: true,
    durationRange: { min: 4, max: 15 },
    resolutions: ["480p", "720p", "1080p", "4k"],
    aspectRatios: ["9:16", "16:9", "1:1", "4:3", "3:4", "21:9"],
    fallbackUsdPerSecond: 0.3024,
    supportsMultiReference: true,
  },
  "seedance-2.0-fast": {
    key: "seedance-2.0-fast",
    endpointId: "bytedance/seedance-2.0/fast/image-to-video",
    label: "Seedance 2.0 Fast",
    family: "seedance",
    supportsAudio: true,
    durationRange: { min: 4, max: 15 },
    // LIVE schema: the FAST image-to-video endpoint only accepts 480p / 720p.
    resolutions: ["480p", "720p"],
    aspectRatios: ["9:16", "16:9", "1:1", "4:3", "3:4", "21:9"],
    fallbackUsdPerSecond: 0.2419,
    supportsMultiReference: true,
  },
};

export function resolveVideoModelKey(value: unknown): VideoModelKey {
  const key = typeof value === "string" ? value.trim() : "";
  return (key && key in VIDEO_MODELS ? key : DEFAULT_VIDEO_MODEL) as VideoModelKey;
}

export function getVideoModel(value: unknown) {
  return VIDEO_MODELS[resolveVideoModelKey(value)];
}

export function clampSeedanceDuration(value: unknown, model: VideoModelDefinition) {
  const range = model.durationRange ?? { min: 4, max: 15 };
  const next = Number(value ?? range.min);
  if (!Number.isFinite(next)) return range.min;
  return Math.min(range.max, Math.max(range.min, Math.round(next)));
}

export function buildVideoModelInput(
  modelKey: unknown,
  args: {
    imageUrl: string;
    endFrameUrl?: string;
    prompt: string;
    duration?: unknown;
    resolution?: string | null;
    aspectRatio?: string | null;
    generateAudio?: boolean | null;
  },
): Record<string, unknown> {
  const model = getVideoModel(modelKey);

  if (model.family === "kling") {
    // Preserved byte-for-byte from the original Kling payload.
    return {
      prompt: args.prompt,
      image_url: args.imageUrl,
      ...(args.endFrameUrl ? { tail_image_url: args.endFrameUrl } : {}),
      duration: normalizeVideoDuration(args.duration),
      aspect_ratio: VERTICAL_VIDEO_ASPECT_RATIO,
      cfg_scale: 0.5,
    };
  }

  if (model.family === "kling3") {
    return {
      start_image_url: args.imageUrl,
      prompt: args.prompt,
      duration: String(clampSeedanceDuration(args.duration ?? 5, model)),
      generate_audio: args.generateAudio !== false,
      cfg_scale: 0.5,
      ...(args.endFrameUrl ? { end_image_url: args.endFrameUrl } : {}),
    };
  }

  const aspectRatio = model.aspectRatios?.includes(String(args.aspectRatio ?? ""))
    ? String(args.aspectRatio)
    : VERTICAL_VIDEO_ASPECT_RATIO;
  const resolution = model.resolutions?.includes(String(args.resolution ?? ""))
    ? String(args.resolution)
    : "720p";
  const duration = args.duration === "auto"
    ? "auto"
    : String(clampSeedanceDuration(args.duration, model));

  return {
    prompt: args.prompt,
    image_url: args.imageUrl,
    duration,
    resolution,
    aspect_ratio: aspectRatio,
    generate_audio: args.generateAudio !== false,
  };
}


export function videoFallbackUsdPerSecond(
  model: VideoModelDefinition,
  generateAudio?: boolean | null,
) {
  if (model.family === "kling3") {
    return generateAudio === false ? KLING3_USD_PER_SECOND : KLING3_USD_PER_SECOND_AUDIO;
  }
  return model.fallbackUsdPerSecond;
}

/* ==================== Generation Studio helpers (additive) ==================== */

/** Text-to-image endpoint for nano-banana-pro (no reference images). */
export const TEXT_IMAGE_MODEL = "fal-ai/nano-banana-pro";

/** Map an image-to-video endpoint id to its text-to-video sibling. */
export function textToVideoEndpoint(endpointId: string) {
  return endpointId.replace(/\/image-to-video$/, "/text-to-video");
}

/** Generic queue submit used by the Generation Studio only. */
export async function submitFalJob(
  endpointId: string,
  input: Record<string, unknown>,
  webhookUrl: string,
) {
  let queued: unknown;
  try {
    queued = await fal.queue.submit(endpointId, { input, webhookUrl });
  } catch (error) {
    throw new Error(describeFalError(error, `fal submit failed (${endpointId})`));
  }
  const requestId = (queued as any)?.request_id ?? (queued as any)?.requestId;
  if (!requestId) throw new Error(`fal submit to ${endpointId} completed without request_id`);
  return requestId as string;
}

/* ==================== Outfit Swap helpers (additive) ==================== */

/** Seedance reference-to-video endpoints (multi-reference reconstruction). */
export const SEEDANCE_REFERENCE_TO_VIDEO = "bytedance/seedance-2.0/reference-to-video";
export const SEEDANCE_FAST_REFERENCE_TO_VIDEO = "bytedance/seedance-2.0/fast/reference-to-video";

/**
 * Reference-to-video resolutions per VARIANT (live fal OpenAPI schema):
 *   bytedance/seedance-2.0/reference-to-video      → 480p, 720p, 1080p, 4k
 *   bytedance/seedance-2.0/fast/reference-to-video → 480p, 720p
 */
export const REFERENCE_VIDEO_RESOLUTIONS_BY_ENDPOINT: Record<string, string[]> = {
  [SEEDANCE_REFERENCE_TO_VIDEO]: ["480p", "720p", "1080p", "4k"],
  [SEEDANCE_FAST_REFERENCE_TO_VIDEO]: ["480p", "720p"],
};

/** Conservative set valid for BOTH variants (kept for existing callers). */
export const REFERENCE_VIDEO_RESOLUTIONS = ["480p", "720p"];

/** Resolutions the given reference-to-video endpoint truly accepts. */
export function referenceVideoResolutions(endpointId: string) {
  return REFERENCE_VIDEO_RESOLUTIONS_BY_ENDPOINT[endpointId] ?? REFERENCE_VIDEO_RESOLUTIONS;
}

/** Map a Seedance model key to its reference-to-video endpoint. */
export function referenceToVideoEndpoint(modelKey: unknown) {
  const key = typeof modelKey === "string" ? modelKey.trim() : "";
  return key === "seedance-2.0-fast"
    ? SEEDANCE_FAST_REFERENCE_TO_VIDEO
    : SEEDANCE_REFERENCE_TO_VIDEO;
}

/**
 * Builds the Seedance reference-to-video payload. Endpoint + fields mirror the
 * known-good Outfit Swap reconstruction call; Outfit Swap itself is unchanged.
 */
export function buildSeedanceReferenceInput(args: {
  modelKey: unknown;
  prompt: string;
  imageUrls: string[];
  duration?: unknown;
  resolution?: string | null;
  aspectRatio?: string | null;
  generateAudio?: boolean | null;
}) {
  const model = getVideoModel(args.modelKey);
  if (model.family !== "seedance" || !model.supportsMultiReference) {
    throw new Error(`${model.label} does not support multi-reference video`);
  }

  const urls: string[] = [];
  for (const entry of args.imageUrls ?? []) {
    const url = String(entry ?? "").trim();
    if (url && !urls.includes(url)) urls.push(url);
  }
  if (urls.length < 2) throw new Error("Multi-reference video requires at least two images");

  const endpointId = referenceToVideoEndpoint(model.key);
  const duration = String(clampSeedanceDuration(args.duration ?? 5, model));
  // VARIANT-AWARE: the fast reference endpoint is 480p/720p only, the standard
  // one also accepts 1080p/4k. Nothing requested → 720p default (unchanged).
  const supportedResolutions = referenceVideoResolutions(endpointId);
  const requestedResolution = String(args.resolution ?? "").trim().toLowerCase();
  if (requestedResolution && !supportedResolutions.includes(requestedResolution)) {
    throw new Error(
      `${model.label} reference video cannot render ${requestedResolution.toUpperCase()} — supported: ${
        supportedResolutions.map((value) => value.toUpperCase()).join(", ")
      }`,
    );
  }
  const resolution = requestedResolution || "720p";
  const aspectRatio = model.aspectRatios?.includes(String(args.aspectRatio ?? ""))
    ? String(args.aspectRatio)
    : VERTICAL_VIDEO_ASPECT_RATIO;

  const input: Record<string, unknown> = {
    prompt: args.prompt,
    reference_image_urls: urls,
    image_urls: urls,
    duration,
    resolution,
    aspect_ratio: aspectRatio,
    generate_audio: args.generateAudio !== false,
  };

  return { endpointId, input };
}

/** Seedance reference-to-video submit (queue + webhook), multi-reference only. */
export async function submitSeedanceReferenceVideoJob(args: {
  modelKey: unknown;
  prompt: string;
  imageUrls: string[];
  duration?: unknown;
  resolution?: string | null;
  aspectRatio?: string | null;
  generateAudio?: boolean | null;
  webhookUrl: string;
}) {
  const { endpointId, input } = buildSeedanceReferenceInput(args);
  const requestId = await submitFalJob(endpointId, input, args.webhookUrl);
  return { requestId, endpointId, input };
}


/* ==================== Image model registry (additive) ==================== */

/**
 * Generation Studio image models. Mirrors the VIDEO_MODELS pattern.
 * Each entry knows its edit + text endpoints and WHICH secondary param it
 * truly accepts, so per-model builders never cross-contaminate payloads
 * (nano's `resolution` must never reach gpt-image-2 / seedream, etc.).
 *
 * LIVE fal OpenAPI schema:
 *   fal-ai/nano-banana-pro/edit | fal-ai/nano-banana-pro
 *     → prompt, image_urls[], aspect_ratio, output_format, resolution 1K|2K|4K
 *   fal-ai/gpt-image-2/edit | fal-ai/gpt-image-2
 *     → prompt, image_urls[], quality auto|low|medium|high, output_format,
 *       optional mask_url, num_images. NO resolution, NO aspect_ratio.
 *   fal-ai/bytedance/seedream/v4/edit | .../v4/text-to-image
 *     → prompt, image_urls[], image_size { width, height } (default 2048x2048)
 */
export type ImageModelKey = "nano-banana-pro" | "gpt-image-2" | "seedream-v4";

export type ImageModelParamKind = "resolution" | "quality" | "image_size";

export type ImageModelDefinition = {
  key: ImageModelKey;
  label: string;
  editEndpointId: string;
  textEndpointId: string;
  paramKind: ImageModelParamKind;
  /** Selectable values for the model's single secondary control. */
  options: string[];
  defaultOption: string;
  supportsAspectRatio: boolean;
  supportsOutputFormat: boolean;
  /** Only used when the live fal pricing lookup returns nothing. */
  fallbackFlatUsd: number;
};

export const DEFAULT_IMAGE_MODEL: ImageModelKey = "nano-banana-pro";

/** Seedream "Size" tiers → the real dimensions submitted as image_size. */
export const SEEDREAM_IMAGE_SIZES: Record<string, { width: number; height: number }> = {
  "1K": { width: 1024, height: 1024 },
  "2K": { width: 2048, height: 2048 },
  "4K": { width: 4096, height: 4096 },
};

export const GPT_IMAGE_2_QUALITIES = ["auto", "low", "medium", "high"] as const;

export const IMAGE_MODELS: Record<ImageModelKey, ImageModelDefinition> = {
  "nano-banana-pro": {
    key: "nano-banana-pro",
    label: "Nano Banana Pro",
    editEndpointId: IMAGE_MODEL,
    textEndpointId: TEXT_IMAGE_MODEL,
    paramKind: "resolution",
    options: [...IMAGE_RESOLUTIONS],
    defaultOption: "1K",
    supportsAspectRatio: true,
    supportsOutputFormat: true,
    fallbackFlatUsd: 0.15,
  },
  "gpt-image-2": {
    key: "gpt-image-2",
    label: "GPT Image 2",
    editEndpointId: "fal-ai/gpt-image-2/edit",
    textEndpointId: "fal-ai/gpt-image-2",
    paramKind: "quality",
    options: [...GPT_IMAGE_2_QUALITIES],
    defaultOption: "auto",
    supportsAspectRatio: false,
    supportsOutputFormat: true,
    fallbackFlatUsd: 0.12,
  },
  "seedream-v4": {
    key: "seedream-v4",
    label: "Seedream v4",
    editEndpointId: "fal-ai/bytedance/seedream/v4/edit",
    textEndpointId: "fal-ai/bytedance/seedream/v4/text-to-image",
    paramKind: "image_size",
    options: Object.keys(SEEDREAM_IMAGE_SIZES),
    defaultOption: "2K",
    supportsAspectRatio: false,
    supportsOutputFormat: false,
    fallbackFlatUsd: 0.06,
  },
};

export function resolveImageModelKey(value: unknown): ImageModelKey {
  const key = typeof value === "string" ? value.trim() : "";
  return (key && key in IMAGE_MODELS ? key : DEFAULT_IMAGE_MODEL) as ImageModelKey;
}

export function getImageModel(value: unknown) {
  return IMAGE_MODELS[resolveImageModelKey(value)];
}

/** Validated gpt-image-2 quality; unsupported values are rejected, not clamped. */
export function normalizeImageQuality(value: unknown) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return "auto";
  if ((GPT_IMAGE_2_QUALITIES as readonly string[]).includes(raw)) return raw;
  throw new Error(
    `Unsupported image quality "${raw}" — supported: ${GPT_IMAGE_2_QUALITIES.join(", ")}`,
  );
}

/** Validated Seedream size tier → real {width,height}. */
export function normalizeSeedreamImageSize(value: unknown) {
  const raw = String(value ?? "").trim().toUpperCase();
  const tier = raw || "2K";
  const size = SEEDREAM_IMAGE_SIZES[tier];
  if (!size) {
    throw new Error(
      `Unsupported image size "${tier}" — supported: ${Object.keys(SEEDREAM_IMAGE_SIZES).join(", ")}`,
    );
  }
  return { tier, size };
}

export type ImageModelRequest = {
  prompt: string;
  imageUrls?: string[];
  aspectRatio?: string | null;
  /** nano-banana-pro only. */
  resolution?: unknown;
  /** gpt-image-2 only. */
  quality?: unknown;
  /** seedream-v4 only. */
  imageSize?: unknown;
  maskUrl?: string | null;
};

/**
 * Per-model input builder. Returns the endpoint (edit when references exist,
 * else text-to-image), the exact fal input, and the requested/submitted option
 * so callers can persist requested === submitted.
 */
export function buildImageModelInput(modelKey: unknown, request: ImageModelRequest) {
  const model = getImageModel(modelKey);
  const imageUrls = (request.imageUrls ?? [])
    .map((entry) => String(entry ?? "").trim())
    .filter((entry, index, all) => entry && all.indexOf(entry) === index);
  const isEdit = imageUrls.length > 0;
  const endpointId = isEdit ? model.editEndpointId : model.textEndpointId;

  // Reject params the selected model does not support — never silently drop.
  const has = (value: unknown) => value !== undefined && value !== null && String(value).trim() !== "";
  if (model.paramKind !== "resolution" && has(request.resolution)) {
    throw new Error(`${model.label} has no resolution setting`);
  }
  if (model.paramKind !== "quality" && has(request.quality)) {
    throw new Error(`${model.label} has no quality setting`);
  }
  if (model.paramKind !== "image_size" && has(request.imageSize)) {
    throw new Error(`${model.label} has no image size setting`);
  }
  const aspect = has(request.aspectRatio) ? String(request.aspectRatio).trim() : null;
  if (aspect && !model.supportsAspectRatio) {
    throw new Error(`${model.label} has no aspect ratio setting`);
  }
  if (has(request.maskUrl) && model.key !== "gpt-image-2") {
    throw new Error(`${model.label} does not accept a mask`);
  }

  const input: Record<string, unknown> = {
    prompt: request.prompt,
    ...(isEdit ? { image_urls: imageUrls } : {}),
    ...(model.supportsOutputFormat ? { output_format: "png" } : {}),
  };

  let requestedOption: string;
  if (model.paramKind === "resolution") {
    const resolution = normalizeImageResolution(request.resolution);
    input.resolution = resolution;
    if (aspect) input.aspect_ratio = aspect;
    requestedOption = resolution;
  } else if (model.paramKind === "quality") {
    const quality = normalizeImageQuality(request.quality);
    input.quality = quality;
    if (isEdit && has(request.maskUrl)) input.mask_url = String(request.maskUrl).trim();
    requestedOption = quality;
  } else {
    const { tier, size } = normalizeSeedreamImageSize(request.imageSize);
    input.image_size = { width: size.width, height: size.height };
    requestedOption = tier;
  }

  return {
    model,
    endpointId,
    isEdit,
    input,
    requestedOption,
    submittedOption: requestedOption,
  };
}
