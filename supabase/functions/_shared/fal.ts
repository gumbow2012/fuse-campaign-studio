import { fal } from "npm:@fal-ai/client";

export const IMAGE_MODEL = "fal-ai/nano-banana-pro/edit";
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

export async function submitImageJob(args: {
  prompt: string;
  imageUrls: string[];
  aspectRatio?: string;
  webhookUrl: string;
}) {
  if (!args.imageUrls.length) throw new Error("Image edit requires at least one image");

  let queued: unknown;
  try {
    queued = await fal.queue.submit(IMAGE_MODEL, {
      input: {
        prompt: args.prompt,
        image_urls: args.imageUrls,
        aspect_ratio: args.aspectRatio ?? "9:16",
        output_format: "png",
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

export async function runImageEdit(prompt: string, imageUrls: string[], aspectRatio = "9:16") {
  if (!imageUrls.length) throw new Error("Image edit requires at least one image");

  let result: unknown;
  try {
    result = await fal.run(IMAGE_MODEL, {
      input: {
        prompt,
        image_urls: imageUrls,
        aspect_ratio: aspectRatio,
        output_format: "png",
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

export function normalizeVideoDuration(value: unknown) {
  const duration = Number(value ?? MAX_VIDEO_DURATION_SECONDS);
  return Number.isFinite(duration) && duration > 0
    ? Math.min(duration, MAX_VIDEO_DURATION_SECONDS)
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
  },
  "seedance-2.0-fast": {
    key: "seedance-2.0-fast",
    endpointId: "bytedance/seedance-2.0/fast/image-to-video",
    label: "Seedance 2.0 Fast",
    family: "seedance",
    supportsAudio: true,
    durationRange: { min: 4, max: 15 },
    resolutions: ["480p", "720p", "1080p", "4k"],
    aspectRatios: ["9:16", "16:9", "1:1", "4:3", "3:4", "21:9"],
    fallbackUsdPerSecond: 0.2419,
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
