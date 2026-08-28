// MADDEN MEDIA STUDIO — M2/M3 backend (consistency analysis only).
//
// HARD BOUNDARIES:
//   * This function is OWNED BY Madden Media Studio. It does not import, call
//     or modify Cinema Studio, Jewelry Swap, Outfit Swap, Generation Studio or
//     any template/billing code.
//   * The only provider call here is a Gemini VISION ANALYSIS that returns
//     strict JSON. No image generation, no video generation, no credit spend.
//   * The analysis returns VISUAL-CONSISTENCY attributes only. It never
//     identifies or names a person, never guesses who someone is, and never
//     infers protected or sensitive attributes.

import { GoogleGenAI, Type } from "https://esm.sh/@google/genai@1.29.0";
import {
  corsHeaders,
  createAdminClient,
  errorMessage,
  json,
  requireBuilderUser,
} from "../_shared/supabase-admin.ts";

const ANALYSIS_VERSION = "madden-subject-analysis-v1";
const GEMINI_ANALYSIS_MODEL =
  Deno.env.get("GEMINI_ANALYSIS_MODEL")?.trim() || "gemini-3.6-flash";

const MAX_REFERENCE_IMAGES = 4;
const IMAGE_FETCH_TIMEOUT_MS = 15_000;

/* ------------------------------------------------------------------ *
 * Image inlining (still images only)
 * ------------------------------------------------------------------ */
async function inlineImage(url: string) {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), IMAGE_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: abort.signal });
    if (!response.ok) throw new Error(`Could not read a reference image (${response.status})`);
    const mimeType = (response.headers.get("content-type") ?? "image/jpeg")
      .split(";")[0]
      .trim();
    if (!/^image\//.test(mimeType)) {
      throw new Error("Only still images can be analysed");
    }
    const buffer = new Uint8Array(await response.arrayBuffer());
    let binary = "";
    for (let i = 0; i < buffer.length; i += 8192) {
      binary += String.fromCharCode(...buffer.subarray(i, i + 8192));
    }
    return { inlineData: { mimeType, data: btoa(binary) } };
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------ *
 * Structured output contract — visual consistency attributes only
 * ------------------------------------------------------------------ */
const SUBJECT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    face: {
      type: Type.OBJECT,
      properties: {
        shape: { type: Type.STRING },
        proportions: { type: Type.STRING },
        distinguishingFeatures: { type: Type.STRING },
      },
      required: ["shape", "proportions", "distinguishingFeatures"],
    },
    skin: {
      type: Type.OBJECT,
      properties: {
        tone: { type: Type.STRING },
        texture: { type: Type.STRING },
      },
      required: ["tone", "texture"],
    },
    hair: {
      type: Type.OBJECT,
      properties: {
        style: { type: Type.STRING },
        color: { type: Type.STRING },
        length: { type: Type.STRING },
      },
      required: ["style", "color", "length"],
    },
    facialHair: {
      type: Type.OBJECT,
      properties: {
        present: { type: Type.BOOLEAN },
        description: { type: Type.STRING },
      },
      required: ["present", "description"],
    },
    tattoos: {
      type: Type.OBJECT,
      properties: {
        present: { type: Type.BOOLEAN },
        description: { type: Type.STRING },
        placements: { type: Type.ARRAY, items: { type: Type.STRING } },
      },
      required: ["present", "description", "placements"],
    },
    grills: {
      type: Type.OBJECT,
      properties: {
        present: { type: Type.BOOLEAN },
        description: { type: Type.STRING },
      },
      required: ["present", "description"],
    },
    notes: { type: Type.STRING },
    uncertain: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ["face", "skin", "hair", "facialHair", "tattoos", "grills", "notes", "uncertain"],
};

function buildPrompt(imageCount: number) {
  return [
    "You are a VISUAL CONTINUITY analyst for a short-form video studio.",
    `You are given ${imageCount} reference photograph(s) of ONE subject.`,
    "",
    "GOAL: describe ONLY the visual attributes needed to keep this subject's",
    "appearance identical across separately generated shots.",
    "",
    "ABSOLUTE RULES:",
    "- NEVER identify, name, or guess who the subject is. No celebrity or artist",
    "  names, no 'looks like', no fame, no career, no social identity.",
    "- NEVER infer or output protected or sensitive attributes: race, ethnicity,",
    "  nationality, religion, health, age bracket, gender identity, sexuality.",
    "- Describe skin TONE as a neutral rendering value (e.g. 'deep warm brown',",
    "  'light neutral with cool undertone') for colour continuity only.",
    "- Do not speculate. If something is not clearly visible, say 'not visible'",
    "  and list the field name in `uncertain`.",
    "",
    "Report: face shape and proportions, skin tone and texture, hair style/colour/",
    "length, facial hair, visible tattoos (described for visual consistency, with",
    "placements), and grills/teeth. Keep every field short and concrete.",
    "Return strict JSON matching the provided schema. No prose outside JSON.",
  ].join("\n");
}

function readUrls(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : [];
  const urls: string[] = [];
  for (const item of list) {
    const url = String((item as { url?: string })?.url ?? item ?? "").trim();
    if (/^https?:\/\//.test(url) && !urls.includes(url)) urls.push(url);
    if (urls.length >= MAX_REFERENCE_IMAGES) break;
  }
  return urls;
}

async function analyzeSubject(body: Record<string, unknown>) {
  const urls = readUrls(body.referenceUrls ?? body.references);
  if (urls.length === 0) {
    return { ok: false as const, reason: "Add at least one reference image first." };
  }

  const apiKey = Deno.env.get("GEMINI_API_KEY")?.trim();
  if (!apiKey) {
    return { ok: false as const, reason: "Subject analysis is not configured yet." };
  }

  let parts: unknown[];
  try {
    parts = await Promise.all(urls.map((url) => inlineImage(url)));
  } catch (error) {
    return { ok: false as const, reason: errorMessage(error) };
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: GEMINI_ANALYSIS_MODEL,
      contents: [
        { role: "user", parts: [{ text: buildPrompt(urls.length) }, ...parts] },
      ] as any,
      config: {
        responseMimeType: "application/json",
        responseSchema: SUBJECT_SCHEMA as any,
        maxOutputTokens: 4096,
        temperature: 0.1,
      },
    });

    const text = (response.text ?? "").trim();
    if (!text) {
      return { ok: false as const, reason: "The analysis returned nothing — try again." };
    }

    let attributes: unknown;
    try {
      attributes = JSON.parse(text);
    } catch {
      return { ok: false as const, reason: "The analysis returned an unreadable result." };
    }

    return {
      ok: true as const,
      version: ANALYSIS_VERSION,
      model: GEMINI_ANALYSIS_MODEL,
      analyzedUrls: urls,
      attributes,
    };
  } catch (error) {
    console.error("madden analyze_subject failed:", errorMessage(error));
    return { ok: false as const, reason: errorMessage(error) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const admin = createAdminClient();
    await requireBuilderUser(req, admin);

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(body.action ?? "").trim();

    if (action === "analyze_subject") {
      return json(await analyzeSubject(body));
    }

    return json({ ok: false, reason: `Unknown action: ${action || "(none)"}` }, 400);
  } catch (error) {
    return json({ ok: false, reason: errorMessage(error) }, 401);
  }
});
