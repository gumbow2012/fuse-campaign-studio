// TEMPLATE FACTORY — TF1: reference analyzer.
//
// HARD BOUNDARIES:
//   * Owned by the Template Factory. Does not import or modify Cinema Studio,
//     Jewelry Swap, Outfit Swap, Madden Media, billing, or the template runner.
//   * The only provider call is a Gemini VISION ANALYSIS returning strict JSON.
//     No image generation, no video generation, no credit spend.
//   * Admin/dev only. Creators and other roles get 403.

import { GoogleGenAI, Type } from "https://esm.sh/@google/genai@1.29.0";
import {
  corsHeaders,
  createAdminClient,
  errorMessage,
  json,
  requireBuilderUser,
} from "../_shared/supabase-admin.ts";

const BLUEPRINT_VERSION = "factory-reference-blueprint-v1";
const GEMINI_ANALYSIS_MODEL =
  Deno.env.get("GEMINI_ANALYSIS_MODEL")?.trim() || "gemini-3.6-flash";
const IMAGE_FETCH_TIMEOUT_MS = 15_000;

async function inlineImage(url: string) {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), IMAGE_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: abort.signal });
    if (!response.ok) throw new Error(`Could not read the reference image (${response.status})`);
    const mimeType = (response.headers.get("content-type") ?? "image/jpeg")
      .split(";")[0]
      .trim();
    if (!/^image\//.test(mimeType)) throw new Error("Only still images can be analysed");
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

const BLUEPRINT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    shot_list: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          framing: { type: Type.STRING },
          subject: { type: Type.STRING },
          action: { type: Type.STRING },
        },
        required: ["name", "framing", "subject", "action"],
      },
    },
    subject_treatment: { type: Type.STRING },
    garment_focus: { type: Type.STRING },
    composition: { type: Type.STRING },
    camera: { type: Type.STRING },
    lighting: { type: Type.STRING },
    color_grade: { type: Type.STRING },
    mood: { type: Type.STRING },
    setting: { type: Type.STRING },
    motion: { type: Type.STRING },
    suggested_output_count: { type: Type.INTEGER },
    uncertain: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: [
    "shot_list",
    "subject_treatment",
    "garment_focus",
    "composition",
    "camera",
    "lighting",
    "color_grade",
    "mood",
    "setting",
    "motion",
    "suggested_output_count",
    "uncertain",
  ],
};

function buildPrompt(title: string, category: string | null, tags: string[]) {
  return [
    "You are a CREATIVE DIRECTION analyst for a streetwear campaign template factory.",
    "You are given ONE reference image used as a creative brief.",
    title ? `Curator title: ${title}` : "",
    category ? `Category: ${category}` : "",
    tags.length ? `Tags: ${tags.join(", ")}` : "",
    "",
    "GOAL: return a reusable CREATIVE BLUEPRINT that a campaign template could be built from.",
    "",
    "ABSOLUTE RULES:",
    "- NEVER identify, name, or guess real people, celebrities, or brands. No logos by name.",
    "- NEVER infer or output protected or sensitive attributes: race, ethnicity, nationality,",
    "  religion, health, age bracket, gender identity, sexuality.",
    "- Describe only reusable-for-generation visual descriptors.",
    "- Do not speculate. If something is not clearly visible, say 'not visible' and list the",
    "  field name in `uncertain`.",
    "",
    "Give a 3-6 shot shot_list (each with a short name, framing, subject description, action),",
    "then subject treatment, garment focus, composition, camera (lens/angle/distance), lighting,",
    "color grade, mood, setting, and motion (camera/subject movement if the reference reads as",
    "video-like, otherwise 'still'). suggested_output_count is a realistic asset count (1-8).",
    "Keep every field short and concrete. Return strict JSON matching the schema. No prose outside JSON.",
  ]
    .filter(Boolean)
    .join("\n");
}

async function analyzeReference(body: Record<string, unknown>, admin: ReturnType<typeof createAdminClient>) {
  const referenceId = String(body.referenceId ?? "").trim();
  if (!referenceId) {
    return { ok: false as const, reason: "referenceId is required." };
  }

  const { data: reference, error } = await admin
    .from("streetwear_references")
    .select("id, title, category, tags, image_url")
    .eq("id", referenceId)
    .maybeSingle();
  if (error) return { ok: false as const, reason: error.message };
  if (!reference) return { ok: false as const, reason: "Reference not found." };

  const imageUrl = String((reference as any).image_url ?? "").trim();
  if (!/^https?:\/\//.test(imageUrl)) {
    return { ok: false as const, reason: "This reference has no image URL to analyse." };
  }

  const apiKey = Deno.env.get("GEMINI_API_KEY")?.trim();
  if (!apiKey) {
    return { ok: false as const, reason: "Reference analysis is not configured yet." };
  }

  let imagePart: unknown;
  try {
    imagePart = await inlineImage(imageUrl);
  } catch (err) {
    return { ok: false as const, reason: errorMessage(err) };
  }

  let blueprint: Record<string, unknown>;
  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: GEMINI_ANALYSIS_MODEL,
      contents: [
        {
          role: "user",
          parts: [
            {
              text: buildPrompt(
                String((reference as any).title ?? ""),
                (reference as any).category ?? null,
                Array.isArray((reference as any).tags) ? (reference as any).tags.map(String) : [],
              ),
            },
            imagePart,
          ],
        },
      ] as any,
      config: {
        responseMimeType: "application/json",
        responseSchema: BLUEPRINT_SCHEMA as any,
        maxOutputTokens: 4096,
        temperature: 0.2,
      },
    });

    const text = (response.text ?? "").trim();
    if (!text) return { ok: false as const, reason: "The analysis returned nothing — try again." };
    try {
      blueprint = JSON.parse(text) as Record<string, unknown>;
    } catch {
      return { ok: false as const, reason: "The analysis returned an unreadable result." };
    }
  } catch (err) {
    console.error("template-factory analyze_reference failed:", errorMessage(err));
    return { ok: false as const, reason: errorMessage(err) };
  }

  const stored = {
    ...blueprint,
    version: BLUEPRINT_VERSION,
    model: GEMINI_ANALYSIS_MODEL,
    analyzed_image_url: imageUrl,
  };
  const generatedAt = new Date().toISOString();

  const { error: updateError } = await admin
    .from("streetwear_references")
    .update({ blueprint: stored, blueprint_generated_at: generatedAt })
    .eq("id", referenceId);
  if (updateError) return { ok: false as const, reason: updateError.message };

  return {
    ok: true as const,
    referenceId,
    blueprint: stored,
    blueprintGeneratedAt: generatedAt,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createAdminClient();

  let access;
  try {
    access = await requireBuilderUser(req, admin);
  } catch (error) {
    return json({ ok: false, reason: errorMessage(error) }, 401);
  }

  if (!access.isAdmin && !access.isDev) {
    return json({ ok: false, reason: "Admin access required" }, 403);
  }

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(body.action ?? "").trim();

    if (action === "analyze_reference") {
      return json(await analyzeReference(body, admin));
    }

    return json({ ok: false, reason: `Unknown action: ${action || "(none)"}` }, 400);
  } catch (error) {
    return json({ ok: false, reason: errorMessage(error) }, 500);
  }
});
