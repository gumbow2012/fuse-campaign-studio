import { fal } from "npm:@fal-ai/client";

export const IMAGE_MODEL = "fal-ai/nano-banana-pro/edit";
export const VIDEO_MODEL = "fal-ai/kling-video/v2.5-turbo/pro/image-to-video";
export const VERTICAL_VIDEO_ASPECT_RATIO = "9:16";
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
}) {
  const duration = Number.isFinite(args.duration) ? args.duration : 10;
  const aspectRatio = args.aspectRatio === VERTICAL_VIDEO_ASPECT_RATIO
    ? args.aspectRatio
    : VERTICAL_VIDEO_ASPECT_RATIO;
  let queued: unknown;
  try {
    queued = await fal.queue.submit(VIDEO_MODEL, {
      input: {
        prompt: args.prompt,
        image_url: args.initImageUrl,
        ...(args.endFrameUrl ? { tail_image_url: args.endFrameUrl } : {}),
        duration,
        aspect_ratio: aspectRatio,
        cfg_scale: 0.5,
      },
      webhookUrl: args.webhookUrl,
    });
  } catch (error) {
    throw new Error(describeFalError(error, "fal video queue submit failed"));
  }

  const requestId = (queued as any)?.request_id ?? (queued as any)?.requestId;
  if (!requestId) throw new Error("fal queue submit completed without request_id");

  return requestId as string;
}
