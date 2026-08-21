// CAMPAIGN PHOTOGRAPHY PROFILE — ANALYSIS ONLY (Jewelry Swap, additive).
//
// WHAT THIS IS
//   Reads a set of PHOTOGRAPHY references the user provides for look/feel and
//   returns a structured CampaignPhotographyProfile: HOW the product should be
//   photographed (lens, camera placement, lighting, exposure, surface, depth of
//   field, negative space).
//
// EVIDENCE FIREWALL (hard)
//   PHOTOGRAPHY references = PHOTOGRAPHY authority ONLY. They contribute ZERO
//   product geometry, stone layout, setting, component topology, material or
//   identity — the MASTER PRODUCT LOCK owns all of that. The model is told to
//   describe only the CAPTURE, never the depicted product.
//
// SCOPE
//   Analysis only. It never generates or returns media, and this profile is NOT
//   wired into any generation prompt in this commit.
//
// CACHING
//   Reuses the existing `jewelry_still_analyses` cache keyed by a fingerprint of
//   the photography reference set, so reopening a project or re-rendering the UI
//   never re-runs Gemini. It re-runs only when those references change.

import { GoogleGenAI, Type } from "https://esm.sh/@google/genai@1.29.0";
import {
  corsHeaders,
  createAdminClient,
  errorMessage,
  json,
  requireUser,
} from "../_shared/supabase-admin.ts";
import {
  CAMPAIGN_PHOTOGRAPHY_VERSION,
  campaignPhotographySummaryLine,
  normalizeCampaignPhotographyProfile,
} from "../_shared/campaign-photography.ts";

const GEMINI_ANALYSIS_MODEL = Deno.env.get("GEMINI_ANALYSIS_MODEL")?.trim() || "gemini-3.6-flash";
const MAX_REFERENCES = 6;
const IMAGE_FETCH_TIMEOUT_MS = 15_000;

/* ------------------------------------------------------------------ *
 * Media plumbing (analysis input only — nothing is ever returned)
 * ------------------------------------------------------------------ */

function base64Of(buffer: Uint8Array) {
  let binary = "";
  for (let i = 0; i < buffer.length; i += 8192) {
    binary += String.fromCharCode(...buffer.subarray(i, i + 8192));
  }
  return btoa(binary);
}

async function inlineImage(url: string) {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), IMAGE_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: abort.signal });
    if (!response.ok) throw new Error(`Could not read a photography reference (${response.status})`);
    const mimeType = (response.headers.get("content-type") ?? "image/jpeg").split(";")[0].trim();
    if (!/^image\//.test(mimeType)) throw new Error("Photography references must be still images");
    return { inlineData: { mimeType, data: base64Of(new Uint8Array(await response.arrayBuffer())) } };
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------ *
 * Structured output
 * ------------------------------------------------------------------ */

const PHOTOGRAPHY_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    lensCharacter: { type: Type.STRING },
    macroMagnification: { type: Type.STRING },
    cameraHeight: { type: Type.STRING },
    cameraDistance: { type: Type.STRING },
    lensCompression: { type: Type.STRING },
    lightingFamily: { type: Type.STRING },
    exposure: { type: Type.STRING },
    contrast: { type: Type.STRING },
    whiteBalance: { type: Type.STRING },
    surfaceEnvironment: { type: Type.STRING },
    depthOfField: { type: Type.STRING },
    focusBehavior: { type: Type.STRING },
    negativeSpace: { type: Type.STRING },
    confidence: { type: Type.NUMBER },
    notes: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ["lightingFamily", "cameraDistance", "depthOfField", "confidence"],
} as const;

const PROMPT = [
  "You are a product-photography analyst. Return JSON only: never an image, never a URL, never bytes.",
  "The images below are PHOTOGRAPHY references: they define the CAPTURE STYLE the user wants, nothing else.",
  "",
  "HARD BOUNDARY — describe only HOW these images were PHOTOGRAPHED. You must NOT describe, name, infer or classify the product shown: no geometry, no proportions, no stone layout or counts, no setting construction, no components, no materials, no branding, no product identity. Those are owned elsewhere and any product claim you make will be discarded.",
  "",
  "Report, only where the references actually support it (leave a field out when the evidence is weak):",
  "- lensCharacter: focal-length feel, rendering character, bokeh signature, optical character.",
  "- macroMagnification: how tightly the subject fills the frame / magnification level.",
  "- cameraHeight: camera height relative to the subject (above, level, below) and tilt.",
  "- cameraDistance: working distance / how close the camera sits.",
  "- lensCompression: perspective compression versus wide-angle exaggeration.",
  "- lightingFamily: the lighting setup family (large soft source, hard specular, window light, mixed practicals, ring/on-axis, etc.), direction and quality.",
  "- exposure: overall exposure level and highlight handling.",
  "- contrast: tonal contrast and how deep the shadows sit.",
  "- whiteBalance: color temperature and any deliberate cast.",
  "- surfaceEnvironment: the surface the subject sits on and the surrounding environment/backdrop.",
  "- depthOfField: how shallow or deep, plus the sense of aperture.",
  "- focusBehavior: what is held sharp and how focus falls off.",
  "- negativeSpace: framing, crop and how much empty space surrounds the subject.",
  "- confidence: 0..1 for how well these references supported the profile.",
  "- notes: at most 3 short capture-only observations.",
  "",
  "Describe the shared, repeatable look across the references — not one-off accidents of a single frame.",
].join("\n");

/* ------------------------------------------------------------------ *
 * Guard: analysis only
 * ------------------------------------------------------------------ */

const MEDIA_SHAPED = /(^data:|;base64,|https?:\/\/)/i;

function assertAnalysisOnly(value: unknown, path = "photography", stripped: string[] = []): string[] {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertAnalysisOnly(entry, `${path}[${index}]`, stripped));
    return stripped;
  }
  if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (/(image|video|url|uri|bytes|base64|blob|media)/i.test(key)) {
        delete (value as Record<string, unknown>)[key];
        stripped.push(`${path}.${key}`);
        continue;
      }
      if (typeof entry === "string" && MEDIA_SHAPED.test(entry)) {
        delete (value as Record<string, unknown>)[key];
        stripped.push(`${path}.${key}`);
        continue;
      }
      assertAnalysisOnly(entry, `${path}.${key}`, stripped);
    }
  }
  return stripped;
}

async function sha256Hex(text: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/* ------------------------------------------------------------------ *
 * Handler
 * ------------------------------------------------------------------ */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let user;
  try {
    user = await requireUser(req);
  } catch (error) {
    return json({ error: errorMessage(error) }, 401);
  }

  const apiKey = Deno.env.get("GEMINI_API_KEY")?.trim();

  try {
    const startedAt = Date.now();
    const body = await req.json().catch(() => ({})) as Record<string, any>;

    // HARD BOUNDARY: this function analyses still photography references only.
    for (const key of ["video", "videoUrl", "sourceVideoUrl", "clip", "clipUrl"]) {
      if (body?.[key]) {
        return json({ error: "Photography analysis accepts still references only" }, 400);
      }
    }

    const referenceUrls: string[] = (Array.isArray(body?.referenceUrls) ? body.referenceUrls : [])
      .map((url: unknown) => String(url ?? "").trim())
      .filter((url: string) => /^https?:\/\//.test(url))
      .slice(0, MAX_REFERENCES);

    if (!referenceUrls.length) {
      return json({ error: "Add at least one photography reference" }, 400);
    }

    const admin = createAdminClient();
    const fingerprint = await sha256Hex(JSON.stringify({
      kind: "campaign-photography",
      version: CAMPAIGN_PHOTOGRAPHY_VERSION,
      model: GEMINI_ANALYSIS_MODEL,
      referenceUrls,
    }));

    // CACHE: only a change to the photography reference set re-runs Gemini.
    const { data: cached } = await admin
      .from("jewelry_still_analyses")
      .select("analysis, version, analyzed_at")
      .eq("user_id", user.id)
      .eq("fingerprint", fingerprint)
      .maybeSingle();

    if (cached?.analysis && body?.force !== true) {
      return json({
        cached: true,
        fingerprint,
        version: cached.version ?? CAMPAIGN_PHOTOGRAPHY_VERSION,
        analyzedAt: cached.analyzed_at,
        profile: (cached.analysis as any)?.campaignPhotographyProfile ?? null,
        timings: { cacheHit: true, totalMs: Date.now() - startedAt },
      });
    }

    if (!apiKey) {
      return json({ error: "Photography analysis is unavailable (analysis key not configured)" }, 503);
    }

    const ai = new GoogleGenAI({ apiKey });
    const parts = await Promise.all(referenceUrls.map((url) => inlineImage(url)));

    const geminiStarted = Date.now();
    const response = await ai.models.generateContent({
      model: GEMINI_ANALYSIS_MODEL,
      contents: [{ role: "user", parts: [{ text: PROMPT }, ...parts] }] as any,
      config: {
        responseMimeType: "application/json",
        responseSchema: PHOTOGRAPHY_SCHEMA as any,
        maxOutputTokens: 2048,
        temperature: 0,
      },
    });
    const geminiMs = Date.now() - geminiStarted;

    const profile = normalizeCampaignPhotographyProfile(JSON.parse((response.text ?? "").trim()));
    if (!profile) throw new Error("The photography analysis returned no usable profile");

    const stripped = assertAnalysisOnly(profile);
    if (stripped.length) console.warn("photography guard stripped:", stripped.join(", "));

    await admin.from("jewelry_still_analyses").upsert(
      {
        user_id: user.id,
        fingerprint,
        version: CAMPAIGN_PHOTOGRAPHY_VERSION,
        analysis: { version: CAMPAIGN_PHOTOGRAPHY_VERSION, campaignPhotographyProfile: profile },
        analyzed_at: new Date().toISOString(),
      },
      { onConflict: "user_id,fingerprint" },
    );

    const timings = { cacheHit: false, references: referenceUrls.length, geminiMs, totalMs: Date.now() - startedAt };
    console.log("[campaign-photography]", JSON.stringify(timings), campaignPhotographySummaryLine(profile));

    return json({
      cached: false,
      fingerprint,
      version: CAMPAIGN_PHOTOGRAPHY_VERSION,
      analyzedAt: new Date().toISOString(),
      profile,
      guardStripped: stripped,
      timings,
    });
  } catch (error) {
    const raw = errorMessage(error);
    const safe = apiKey ? raw.split(apiKey).join("[redacted]") : raw;
    return json({ error: safe.slice(0, 4000) }, 500);
  }
});
