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

/* ------------------------------------------------------------------ *
 * M3 — outfit + jewelry visual-consistency analysis
 * ------------------------------------------------------------------ *
 * Same Gemini VISION pattern as analyze_subject. This factory owns its own
 * provider call and prompt: it imports nothing from Jewelry Swap, Outfit
 * Swap, Cinema or Generation Studio. No image/video generation.
 */

const OUTFIT_ANALYSIS_VERSION = "madden-outfit-analysis-v1";
const JEWELRY_ANALYSIS_VERSION = "madden-jewelry-analysis-v1";

const GARMENT_SHAPE = {
  type: Type.OBJECT,
  properties: {
    present: { type: Type.BOOLEAN },
    material: { type: Type.STRING },
    color: { type: Type.STRING },
    graphics: { type: Type.STRING },
    logos: { type: Type.STRING },
    typography: { type: Type.STRING },
    fit: { type: Type.STRING },
    silhouette: { type: Type.STRING },
    construction: { type: Type.STRING },
  },
  required: [
    "present",
    "material",
    "color",
    "graphics",
    "logos",
    "typography",
    "fit",
    "silhouette",
    "construction",
  ],
};

const OUTFIT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    top: GARMENT_SHAPE,
    bottom: GARMENT_SHAPE,
    footwear: GARMENT_SHAPE,
    outerwear: GARMENT_SHAPE,
    accessories: GARMENT_SHAPE,
    notes: { type: Type.STRING },
    uncertain: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ["top", "bottom", "footwear", "outerwear", "accessories", "notes", "uncertain"],
};

const JEWELRY_PIECE_SHAPE = {
  type: Type.OBJECT,
  properties: {
    present: { type: Type.BOOLEAN },
    metal: { type: Type.STRING },
    finish: { type: Type.STRING },
    stones: { type: Type.STRING },
    form: { type: Type.STRING },
    engraving: { type: Type.STRING },
    scale: { type: Type.STRING },
  },
  required: ["present", "metal", "finish", "stones", "form", "engraving", "scale"],
};

const JEWELRY_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    chain: JEWELRY_PIECE_SHAPE,
    pendant: JEWELRY_PIECE_SHAPE,
    grill: JEWELRY_PIECE_SHAPE,
    earrings: JEWELRY_PIECE_SHAPE,
    rings: JEWELRY_PIECE_SHAPE,
    bracelet: JEWELRY_PIECE_SHAPE,
    watch: JEWELRY_PIECE_SHAPE,
    notes: { type: Type.STRING },
    uncertain: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: [
    "chain",
    "pendant",
    "grill",
    "earrings",
    "rings",
    "bracelet",
    "watch",
    "notes",
    "uncertain",
  ],
};

function buildOutfitPrompt(imageCount: number) {
  return [
    "You are a WARDROBE CONTINUITY analyst for a short-form video studio.",
    `You are given ${imageCount} reference photograph(s) of ONE outfit.`,
    "",
    "GOAL: describe ONLY the garment attributes needed to regenerate this exact",
    "outfit faithfully in separately generated shots.",
    "",
    "Cover these slots: top, bottom, footwear, outerwear, accessories. For each,",
    "set present=false when that slot is not visible, otherwise describe:",
    "material, color, graphics/print, logos/marks (describe them visually — shape,",
    "placement, colour — do NOT name a brand or company), typography (letterforms,",
    "weight, case, placement — not the words' owner), fit, silhouette, and",
    "construction/detailing (seams, stitching, hardware, wash, panels).",
    "",
    "ABSOLUTE RULES:",
    "- NEVER identify or name the wearer, and NEVER name a brand, label or designer.",
    "- NEVER infer or output protected or sensitive attributes (race, ethnicity,",
    "  nationality, religion, health, age bracket, gender identity, sexuality).",
    "- Describe the garments only — ignore the background, scene, pose and body.",
    "- Do not speculate. If something is not clearly visible, say 'not visible' and",
    "  list the field in `uncertain`.",
    "Keep every field short and concrete. Return strict JSON matching the schema.",
  ].join("\n");
}

function buildJewelryPromptForMadden(imageCount: number) {
  return [
    "You are a JEWELRY CONTINUITY analyst for a short-form video studio.",
    `You are given ${imageCount} reference photograph(s) of jewelry pieces.`,
    "",
    "THE REFERENCES ARE PRODUCT AUTHORITY FOR THE JEWELRY ONLY.",
    "Describe ONLY the jewelry. Completely IGNORE and NEVER carry over anything",
    "else in the frame: the background, surface, lighting setup, packaging or box,",
    "display bust, cloth, hands, fingers, gloves, wrists, models, or any scene",
    "element. None of those belong in the output.",
    "",
    "Cover these categories: chain, pendant, grill, earrings, rings, bracelet,",
    "watch. Set present=false for any category not visible; otherwise describe:",
    "metal (colour/tone as a rendering value), finish (polish, texture, plating),",
    "stones (cut, setting style, size, clarity impression, colour), form/shape,",
    "engraving/detail, and scale/proportion relative to the piece itself.",
    "",
    "ABSOLUTE RULES:",
    "- NEVER name a brand, jeweller, maker or owner, and never identify a person.",
    "- NEVER state monetary value, carat certification or authenticity claims.",
    "- NEVER infer or output protected or sensitive attributes.",
    "- Do not speculate. If something is not clearly visible, say 'not visible' and",
    "  list the field in `uncertain`.",
    "Keep every field short and concrete. Return strict JSON matching the schema.",
  ].join("\n");
}

async function analyzeWithSchema(
  body: Record<string, unknown>,
  options: { schema: unknown; prompt: (count: number) => string; version: string },
) {
  const urls = readUrls(body.imageUrls ?? body.referenceUrls ?? body.references);
  if (urls.length === 0) {
    return { ok: false as const, reason: "Add at least one reference image first." };
  }

  const apiKey = Deno.env.get("GEMINI_API_KEY")?.trim();
  if (!apiKey) {
    return { ok: false as const, reason: "Reference analysis is not configured yet." };
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
        { role: "user", parts: [{ text: options.prompt(urls.length) }, ...parts] },
      ] as any,
      config: {
        responseMimeType: "application/json",
        responseSchema: options.schema as any,
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
      version: options.version,
      model: GEMINI_ANALYSIS_MODEL,
      analyzedUrls: urls,
      attributes,
    };
  } catch (error) {
    console.error("madden analysis failed:", errorMessage(error));
    return { ok: false as const, reason: errorMessage(error) };
  }
}

/* ------------------------------------------------------------------ *
 * M8 — Madden Director (TEXT analysis only, proposals only)
 * ------------------------------------------------------------------ *
 * Gemini TEXT call. It NEVER mutates a project: it returns structured
 * creative-direction PROPOSALS the user applies explicitly in the UI.
 * No image or video generation, no credit spend.
 */

const DIRECTOR_VERSION = "madden-director-v1";

const DIRECTOR_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    proposals: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          mood: { type: Type.STRING },
          rationale: { type: Type.STRING },
          changes: {
            type: Type.OBJECT,
            properties: {
              cinematographyId: { type: Type.STRING },
              lightingId: { type: Type.STRING },
              environmentId: { type: Type.STRING },
              lookName: { type: Type.STRING },
              globalNotes: { type: Type.STRING },
              lockSlots: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: [
              "cinematographyId",
              "lightingId",
              "environmentId",
              "lookName",
              "globalNotes",
              "lockSlots",
            ],
          },
        },
        required: ["title", "mood", "rationale", "changes"],
      },
    },
    notes: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ["proposals", "notes"],
};

function buildDirectorPrompt(context: Record<string, unknown>, brief: string) {
  return [
    "You are the DIRECTOR for a vertical 9:16 short-form music/streetwear video studio.",
    "",
    "TASK: propose 3 distinct creative-direction adjustments for the project below.",
    `MOOD BRIEF: ${brief}`,
    "",
    "You may ONLY choose preset ids that appear in context.allowed.* — never invent an",
    "id, and leave a field as an empty string when you do not want to change it.",
    "`lockSlots` may only contain: subject, outfit, jewelry, environment.",
    "",
    "ABSOLUTE RULES:",
    "- You are PROPOSING ONLY. Never assume anything is applied.",
    "- NEVER name or imply a real person, artist, celebrity, brand, label or designer.",
    "- NEVER infer or output protected or sensitive attributes.",
    "- Never suggest bypassing any provider policy or safety rule.",
    "- Do not restate the subject's identity; the reference images are the authority.",
    "- Keep `rationale` to two short sentences of craft reasoning.",
    "",
    "PROJECT CONTEXT (JSON):",
    JSON.stringify(context).slice(0, 12_000),
    "",
    "Return strict JSON matching the provided schema. No prose outside JSON.",
  ].join("\n");
}

async function runDirector(body: Record<string, unknown>) {
  const context = (body.context ?? null) as Record<string, unknown> | null;
  if (!context || typeof context !== "object") {
    return { ok: false as const, reason: "Open a project first." };
  }
  const brief = String(body.brief ?? "").trim() ||
    "Propose the strongest creative direction for this project as it stands.";

  const apiKey = Deno.env.get("GEMINI_API_KEY")?.trim();
  if (!apiKey) {
    return { ok: false as const, reason: "The Director is not configured yet." };
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: GEMINI_ANALYSIS_MODEL,
      contents: [
        { role: "user", parts: [{ text: buildDirectorPrompt(context, brief) }] },
      ] as any,
      config: {
        responseMimeType: "application/json",
        responseSchema: DIRECTOR_SCHEMA as any,
        maxOutputTokens: 4096,
        temperature: 0.7,
      },
    });

    const text = (response.text ?? "").trim();
    if (!text) {
      return { ok: false as const, reason: "The Director returned nothing — try again." };
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch {
      return { ok: false as const, reason: "The Director returned an unreadable result." };
    }

    return {
      ok: true as const,
      version: DIRECTOR_VERSION,
      model: GEMINI_ANALYSIS_MODEL,
      proposals: Array.isArray(parsed.proposals) ? parsed.proposals : [],
      notes: Array.isArray(parsed.notes) ? parsed.notes : [],
    };
  } catch (error) {
    console.error("madden director failed:", errorMessage(error));
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

    if (action === "analyze_outfit") {
      return json(
        await analyzeWithSchema(body, {
          schema: OUTFIT_SCHEMA,
          prompt: buildOutfitPrompt,
          version: OUTFIT_ANALYSIS_VERSION,
        }),
      );
    }

    if (action === "analyze_jewelry") {
      return json(
        await analyzeWithSchema(body, {
          schema: JEWELRY_SCHEMA,
          prompt: buildJewelryPromptForMadden,
          version: JEWELRY_ANALYSIS_VERSION,
        }),
      );
    }

    if (action === "director") {
      return json(await runDirector(body));
    }


    return json({ ok: false, reason: `Unknown action: ${action || "(none)"}` }, 400);
  } catch (error) {
    return json({ ok: false, reason: errorMessage(error) }, 401);
  }
});
