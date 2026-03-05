/**
 * POST /api/nano/run — Gemini image generation (Nano Banana)
 *
 * Accepts image URLs (R2 keys or full URLs), converts to base64,
 * calls Gemini image model, saves output to R2, returns URL.
 */

import { Env } from "../types";
import { verifyToken } from "../auth";
import { supabaseFetch } from "../supabase";

const R2_PUBLIC_DOMAIN = "https://pub-18eb2ae6df714575853d0d459e18b74b.r2.dev";

interface NanoRunBody {
  projectId?: string;
  model?: string;
  prompt: string;
  imageUrls?: string[];
  aspectRatio?: string;
  imageSize?: string;
}

/** Resolve an R2 key to a full URL */
function resolveUrl(value: string): string {
  if (value.startsWith("uploads/") || value.startsWith("outputs/") || value.startsWith("projects/")) {
    return `${R2_PUBLIC_DOMAIN}/${value}`;
  }
  return value;
}

/** Fetch an image and return as base64 + mime type */
async function imageToBase64(url: string): Promise<{ base64: string; mimeType: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch image: ${url} (${res.status})`);

  const contentType = res.headers.get("content-type") || "image/png";
  const buf = await res.arrayBuffer();
  const bytes = new Uint8Array(buf);

  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  const base64 = btoa(binary);

  return { base64, mimeType: contentType };
}

/** Call Gemini image generation API */
async function callGeminiImage(
  env: Env,
  prompt: string,
  images: { base64: string; mimeType: string }[],
  model: string,
): Promise<string> {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured in Worker secrets");

  // Build parts: images first, then text prompt
  const parts: any[] = [];

  for (const img of images) {
    parts.push({
      inline_data: {
        mime_type: img.mimeType,
        data: img.base64,
      },
    });
  }

  parts.push({ text: prompt });

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
      },
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Gemini API error (${res.status}): ${txt.slice(0, 1000)}`);
  }

  const data = await res.json() as any;

  // Extract image from response
  const candidates = data.candidates;
  if (!candidates?.length) throw new Error("Gemini returned no candidates");

  for (const part of candidates[0].content?.parts || []) {
    if (part.inline_data) {
      // Got an image back — return as data URI for now, we'll upload to R2
      return `data:${part.inline_data.mime_type};base64,${part.inline_data.data}`;
    }
  }

  // Check for text-only response
  const textParts = candidates[0].content?.parts?.filter((p: any) => p.text) || [];
  if (textParts.length) {
    throw new Error(`Gemini returned text only: ${textParts[0].text.slice(0, 200)}`);
  }

  throw new Error("Gemini returned no image in response");
}

/** Upload a base64 data URI to R2 */
async function uploadBase64ToR2(
  env: Env,
  dataUri: string,
  key: string,
): Promise<string> {
  const match = dataUri.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error("Invalid data URI");

  const mimeType = match[1];
  const base64 = match[2];

  // Decode base64
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  await env.FUSE_ASSETS.put(key, bytes, {
    httpMetadata: { contentType: mimeType },
  });

  return `${R2_PUBLIC_DOMAIN}/${key}`;
}

/* ── POST /api/nano/run ── */

export async function handleNanoRun(request: Request, env: Env): Promise<Response> {
  const userId = await verifyToken(request, env);

  const body = (await request.json()) as NanoRunBody;
  if (!body.prompt) {
    return Response.json({ error: "prompt is required" }, { status: 400 });
  }

  const model = body.model || "gemini-2.0-flash-exp-image-generation";
  const imageUrls = (body.imageUrls || []).map(resolveUrl);

  // Convert images to base64
  const images: { base64: string; mimeType: string }[] = [];
  for (const url of imageUrls) {
    const img = await imageToBase64(url);
    images.push(img);
  }

  // Call Gemini
  const resultDataUri = await callGeminiImage(env, body.prompt, images, model);

  // Upload output to R2
  const outputKey = `outputs/nano/${userId}/${Date.now()}.png`;
  const publicUrl = await uploadBase64ToR2(env, resultDataUri, outputKey);

  // If projectId provided, update project outputs
  if (body.projectId) {
    await supabaseFetch(env, `/projects?id=eq.${body.projectId}`, {
      method: "PATCH",
      body: {
        status: "complete",
        outputs: { items: [{ type: "image", url: publicUrl }] },
        progress: 100,
        completed_at: new Date().toISOString(),
      },
    });
  }

  return Response.json({
    success: true,
    outputUrl: publicUrl,
    model,
  });
}
