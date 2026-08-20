// STAGE A — JEWELRY STILL-IMAGE ANALYSIS (Jewelry Swap only).
//
// HARD ARCHITECTURAL BOUNDARY:
//   * This function analyses STILL IMAGES ONLY. It does NOT accept the source
//     video in any form (no sourceVideo / videoUrl / clip / mp4 input), so
//     temporal information can never influence the Nano Banana prompt.
//   * ANALYSIS ONLY. It returns strict JSON and never an image, video, URL or
//     bytes. No Imagen, no Veo, no image/video generation methods exist here.
//   * Gemini ADVISES. FUSE decides — the deterministic selector, the structured
//     product spec and every manual override outrank this output.

import { GoogleGenAI, Type } from "https://esm.sh/@google/genai@1.29.0";
import {
  corsHeaders,
  createAdminClient,
  errorMessage,
  json,
  requireUser,
} from "../_shared/supabase-admin.ts";

const ANALYSIS_VERSION = "jewelry-still-analysis-v1";
const GEMINI_ANALYSIS_MODEL = Deno.env.get("GEMINI_ANALYSIS_MODEL")?.trim() || "gemini-3.6-flash";

/** Gemini call ceiling per request (references + frames). */
const MAX_IMAGES_PER_CALL = 15;
/** Product references included in every batch so classification stays anchored. */
const MAX_REFERENCE_IMAGES = 5;

type SourceFrame = { frameId: string; timestamp: number; imageUrl: string };
type JewelryReferenceInput = { url: string; role?: string | null; cad?: boolean };

/* ------------------------------------------------------------------ *
 * responseSchema — strict structured output (JewelryProjectAnalysis)
 * ------------------------------------------------------------------ */

const STRING_ARRAY = { type: Type.ARRAY, items: { type: Type.STRING } };

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    productAnalysis: {
      type: Type.OBJECT,
      properties: {
        jewelryType: { type: Type.STRING },
        visibleComponents: STRING_ARRAY,
        disposableReferenceContext: {
          type: Type.ARRAY,
          items: {
            type: Type.STRING,
            enum: [
              "glove",
              "hand",
              "finger",
              "wrist",
              "neck",
              "mannequin",
              "box",
              "velvet",
              "table",
              "studio-bg",
              "other-jewelry",
              "stand",
              "other",
            ],
          },
        },
        geometryObservations: STRING_ARRAY,
        materialObservations: STRING_ARRAY,
        settingObservations: STRING_ARRAY,
        settingVisualSignature: {
          type: Type.OBJECT,
          properties: {
            declaredSetting: { type: Type.STRING },
            stoneSizeDistribution: {
              type: Type.STRING,
              enum: ["uniform", "mixed", "graduated", "unclear"],
            },
            largeAnchorStonesVisible: { type: Type.BOOLEAN },
            smallFillerStonesVisible: { type: Type.BOOLEAN },
            layoutRegularity: {
              type: Type.STRING,
              enum: ["engineered-irregular", "regular-grid", "rows", "unclear"],
            },
            uniformRows: { type: Type.BOOLEAN },
            metalSeparatorsVisible: { type: Type.BOOLEAN },
            dominantStoneColor: { type: Type.STRING },
          },
          required: [
            "declaredSetting",
            "stoneSizeDistribution",
            "largeAnchorStonesVisible",
            "smallFillerStonesVisible",
            "layoutRegularity",
            "uniformRows",
            "metalSeparatorsVisible",
            "dominantStoneColor",
          ],
        },
        conflictWarnings: STRING_ARRAY,
      },
      required: [
        "jewelryType",
        "visibleComponents",
        "disposableReferenceContext",
        "geometryObservations",
        "materialObservations",
        "settingObservations",
        "settingVisualSignature",
        "conflictWarnings",
      ],
    },
    frames: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          frameId: { type: Type.STRING },
          view: { type: Type.STRING },
          coverage: {
            type: Type.STRING,
            enum: ["full_object", "partial_object", "macro_detail"],
          },
          detailType: { type: Type.STRING },
          magnification: {
            type: Type.STRING,
            enum: ["wide", "medium", "close", "macro", "extreme_macro"],
          },
          composition: {
            type: Type.OBJECT,
            properties: {
              fullProductShouldBeVisible: { type: Type.BOOLEAN },
              preserveIntentionalCrop: { type: Type.BOOLEAN },
              negativeSpace: { type: Type.STRING },
            },
            required: [
              "fullProductShouldBeVisible",
              "preserveIntentionalCrop",
              "negativeSpace",
            ],
          },
          orientation: { type: Type.STRING },
          camera: {
            type: Type.OBJECT,
            properties: {
              angleDescription: { type: Type.STRING },
              depthOfField: { type: Type.STRING },
            },
            required: ["angleDescription", "depthOfField"],
          },
          recommendedReferenceRoles: STRING_ARRAY,
          avoidReferenceRoles: STRING_ARRAY,
          replacementBehavior: { type: Type.STRING },
          riskFlags: STRING_ARRAY,
        },
        required: [
          "frameId",
          "view",
          "coverage",
          "detailType",
          "magnification",
          "composition",
          "orientation",
          "camera",
          "recommendedReferenceRoles",
          "avoidReferenceRoles",
          "replacementBehavior",
          "riskFlags",
        ],
      },
    },
  },
  required: ["productAnalysis", "frames"],
} as const;

/* ------------------------------------------------------------------ *
 * Analysis-only guard
 * ------------------------------------------------------------------ */

const FORBIDDEN_KEY = /(image|video|url|uri|bytes|base64|blob|media|data_?url)/i;

/**
 * Dev assertion: the analysis payload must never carry media of any kind.
 * Offending keys are stripped (defence in depth) and reported.
 */
function assertAnalysisOnly(value: unknown, path = "analysis", stripped: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const [index, entry] of value.entries()) {
      assertAnalysisOnly(entry, `${path}[${index}]`, stripped);
    }
    return stripped;
  }
  if (value && typeof value === "object") {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      if (FORBIDDEN_KEY.test(key)) {
        delete (value as Record<string, unknown>)[key];
        stripped.push(`${path}.${key}`);
        continue;
      }
      assertAnalysisOnly((value as Record<string, unknown>)[key], `${path}.${key}`, stripped);
    }
  }
  return stripped;
}

/* ------------------------------------------------------------------ *
 * Fingerprint — hashes the analysis INPUTS only
 * ------------------------------------------------------------------ */

async function sha256Hex(text: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function stableSpec(spec: any) {
  return {
    type: spec?.type ?? null,
    metal: spec?.metal ?? null,
    stone: spec?.stone ?? null,
    stoneColor: spec?.stoneColor ?? null,
    quality: spec?.quality ?? null,
    settings: (Array.isArray(spec?.settings) ? spec.settings : []).map((setting: any) => ({
      type: setting?.type ?? null,
      region: setting?.region ?? null,
      stone: setting?.stone ?? null,
      color: setting?.color ?? null,
      quality: setting?.quality ?? null,
    })),
    dimensions: spec?.dimensions ?? null,
    notes: spec?.notes ?? null,
  };
}

async function inputFingerprint(args: {
  sourceFrames: SourceFrame[];
  jewelryReferences: JewelryReferenceInput[];
  jewelrySpecs: any[];
}) {
  const payload = {
    version: ANALYSIS_VERSION,
    model: GEMINI_ANALYSIS_MODEL,
    references: args.jewelryReferences.map((ref) => ({
      url: ref.url,
      role: ref.role ?? null,
      cad: ref.cad === true,
    })),
    specs: args.jewelrySpecs.map(stableSpec),
    frames: args.sourceFrames.map((frame) => frame.imageUrl).sort(),
  };
  return await sha256Hex(JSON.stringify(payload));
}

/* ------------------------------------------------------------------ *
 * Image fetching (still images only)
 * ------------------------------------------------------------------ */

async function inlineImage(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not read an image (${response.status})`);
  const mimeType = (response.headers.get("content-type") ?? "image/jpeg").split(";")[0].trim();
  if (!/^image\//.test(mimeType)) {
    // Hard boundary: video/other media is never sent to the analysis model.
    throw new Error("Only still images can be analysed");
  }
  const buffer = new Uint8Array(await response.arrayBuffer());
  let binary = "";
  for (let i = 0; i < buffer.length; i += 8192) {
    binary += String.fromCharCode(...buffer.subarray(i, i + 8192));
  }
  return { inlineData: { mimeType, data: btoa(binary) } };
}

/* ------------------------------------------------------------------ *
 * Prompt
 * ------------------------------------------------------------------ */

function specSummary(specs: any[]) {
  return specs
    .map((spec, index) => {
      const settings = (Array.isArray(spec?.settings) ? spec.settings : [])
        .map((setting: any) =>
          `${setting?.region || "Entire Piece"}: ${setting?.type ?? "unspecified"}${
            setting?.stone ? ` (stone ${setting.stone})` : ""
          }`
        )
        .join("; ");
      return [
        `PIECE ${index + 1}`,
        spec?.type ? `type: ${spec.type}` : null,
        spec?.metal ? `metal: ${spec.metal}` : null,
        spec?.stone ? `stone: ${spec.stone}` : null,
        spec?.stoneColor ? `stone color: ${spec.stoneColor}` : null,
        spec?.quality ? `quality: ${spec.quality}` : null,
        settings ? `settings: ${settings}` : null,
        spec?.notes ? `notes: ${String(spec.notes).slice(0, 400)}` : null,
      ].filter(Boolean).join(" | ");
    })
    .join("\n");
}

function buildAnalysisPrompt(args: {
  references: JewelryReferenceInput[];
  frames: SourceFrame[];
  specs: any[];
}) {
  const refLines = args.references.map((ref, index) =>
    `REFERENCE ${index + 1}: role "${ref.role || "Unlabeled view"}"${
      ref.cad === true ? " [CAD / DESIGN AUTHORITY]" : ""
    }`
  );
  const frameLines = args.frames.map((frame, index) =>
    `FRAME ${index + 1}: frameId "${frame.frameId}" (timestamp ${frame.timestamp}s)`
  );

  return [
    "You are a luxury-jewelry shot analyst for a still-image product replacement pipeline.",
    "You analyse STILL IMAGES ONLY. You never generate images or video. Return JSON only.",
    "You are ADVISORY: your output may never override the user's structured specification (metal, stone, stone color, quality, setting), the CAD/design authority, or any manual mode/framing/preferred-reference choice. Describe what you see; do not prescribe replacements for those locked fields.",
    "",
    "PRODUCT REFERENCES (images provided first, in this order):",
    ...refLines,
    "",
    "SOURCE FRAMES the user selected to swap (images provided after the references, in this order):",
    ...frameLines,
    "",
    "USER STRUCTURED SPECIFICATION (authoritative, do not contradict):",
    specSummary(args.specs) || "(none provided)",
    "",
    "TASKS:",
    "1. productAnalysis — from the PRODUCT REFERENCES only: jewelry type, visible components, incidental/disposable context present in the references that must be excluded from any output (gloves, hands, fingers, wrists, necks, mannequins, boxes, velvet, tables, studio backgrounds, other jewelry, stands), geometry observations, material observations, setting observations, and a settingVisualSignature describing the observed stone-size distribution, whether large anchor stones and small filler stones coexist, layout regularity, whether uniform rows exist, whether metal separators are visible, and the dominant stone color.",
    "2. settingVisualSignature.declaredSetting must repeat the user's declared setting verbatim when one is specified. If what you observe disagrees with the declared setting, do NOT change the declared value — record the disagreement in conflictWarnings.",
    "3. frames — EXACTLY one entry per SOURCE FRAME, in the same order, echoing the given frameId. Classify each frame ONLY on its own visual content (never by neighbouring frames or any temporal assumption): view, coverage (full_object | partial_object | macro_detail), detailType, magnification, composition (whether the full product should be visible, whether an intentional crop must be preserved, negative space), orientation, camera angle + depth of field, recommendedReferenceRoles (choose from the reference roles listed above), avoidReferenceRoles, replacementBehavior, and riskFlags.",
    "Be concise: short phrases, no prose paragraphs. Never output URLs, file names, base64 or media of any kind.",
  ].join("\n");
}

/* ------------------------------------------------------------------ *
 * Gemini batches
 * ------------------------------------------------------------------ */

async function analyseBatch(args: {
  ai: GoogleGenAI;
  referenceParts: unknown[];
  references: JewelryReferenceInput[];
  frames: SourceFrame[];
  specs: any[];
}) {
  const frameParts = [];
  for (const frame of args.frames) frameParts.push(await inlineImage(frame.imageUrl));

  const response = await args.ai.models.generateContent({
    model: GEMINI_ANALYSIS_MODEL,
    contents: [
      {
        role: "user",
        parts: [
          { text: buildAnalysisPrompt({ references: args.references, frames: args.frames, specs: args.specs }) },
          ...args.referenceParts,
          ...frameParts,
        ],
      },
    ] as any,
    config: {
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA as any,
      maxOutputTokens: 16384,
      temperature: 0.1,
    },
  });

  const text = (response.text ?? "").trim();
  const parsed = JSON.parse(text);
  return parsed;
}

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
    const body = await req.json().catch(() => ({}));

    // HARD BOUNDARY: reject any attempt to hand this function a video.
    for (const key of ["sourceVideo", "videoUrl", "sourceVideoUrl", "clip", "clipUrl", "video"]) {
      if (body?.[key]) {
        return json(
          { error: "analyze-jewelry-frames analyses still images only and never accepts video input" },
          400,
        );
      }
    }

    const sourceFrames: SourceFrame[] = (Array.isArray(body?.sourceFrames) ? body.sourceFrames : [])
      .map((frame: any) => ({
        frameId: String(frame?.frameId ?? "").trim(),
        timestamp: Number(frame?.timestamp ?? 0) || 0,
        imageUrl: String(frame?.imageUrl ?? "").trim(),
      }))
      .filter((frame: SourceFrame) => frame.frameId && /^https?:\/\//.test(frame.imageUrl));

    const jewelryReferences: JewelryReferenceInput[] =
      (Array.isArray(body?.jewelryReferences) ? body.jewelryReferences : [])
        .map((ref: any) => ({
          url: String(ref?.url ?? "").trim(),
          role: ref?.role ? String(ref.role).trim() : null,
          cad: ref?.cad === true,
        }))
        .filter((ref: JewelryReferenceInput) => /^https?:\/\//.test(ref.url));

    const jewelrySpecs: any[] = Array.isArray(body?.jewelrySpecs) ? body.jewelrySpecs : [];

    if (!sourceFrames.length) return json({ error: "Select at least one source frame" }, 400);
    if (!jewelryReferences.length) return json({ error: "Add at least one jewelry reference" }, 400);

    const fingerprint = await inputFingerprint({ sourceFrames, jewelryReferences, jewelrySpecs });
    const admin = createAdminClient();

    // Cache hit: the fingerprint only changes when the analysis INPUTS change,
    // so reloads, modal opens and approvals never re-run Gemini.
    const { data: cached } = await admin
      .from("jewelry_still_analyses")
      .select("analysis, fingerprint, version, analyzed_at")
      .eq("user_id", user.id)
      .eq("fingerprint", fingerprint)
      .maybeSingle();

    if (cached?.analysis && body?.force !== true) {
      return json({
        cached: true,
        fingerprint,
        version: cached.version ?? ANALYSIS_VERSION,
        analyzedAt: cached.analyzed_at,
        analysis: cached.analysis,
      });
    }

    if (!apiKey) {
      return json({ error: "Shot analysis is unavailable (analysis key not configured)" }, 503);
    }

    const ai = new GoogleGenAI({ apiKey });
    const references = jewelryReferences.slice(0, MAX_REFERENCE_IMAGES);
    const referenceParts: unknown[] = [];
    for (const ref of references) referenceParts.push(await inlineImage(ref.url));

    const framesPerCall = Math.max(1, MAX_IMAGES_PER_CALL - references.length);
    const batches: SourceFrame[][] = [];
    for (let i = 0; i < sourceFrames.length; i += framesPerCall) {
      batches.push(sourceFrames.slice(i, i + framesPerCall));
    }

    let productAnalysis: any = null;
    const frames: any[] = [];

    for (const batch of batches) {
      const parsed = await analyseBatch({ ai, referenceParts, references, frames: batch, specs: jewelrySpecs });
      if (!productAnalysis && parsed?.productAnalysis) productAnalysis = parsed.productAnalysis;
      const batchFrames = Array.isArray(parsed?.frames) ? parsed.frames : [];
      batch.forEach((frame, index) => {
        const entry = batchFrames.find((item: any) => item?.frameId === frame.frameId) ??
          batchFrames[index];
        if (entry) frames.push({ ...entry, frameId: frame.frameId, timestamp: frame.timestamp });
      });
    }

    if (!productAnalysis || !frames.length) throw new Error("The analysis returned no usable result");

    const analysis = { version: ANALYSIS_VERSION, productAnalysis, frames };
    const stripped = assertAnalysisOnly(analysis);
    if (stripped.length) {
      console.warn("analysis-only guard stripped non-analysis fields:", stripped.join(", "));
    }

    await admin
      .from("jewelry_still_analyses")
      .upsert(
        {
          user_id: user.id,
          fingerprint,
          version: ANALYSIS_VERSION,
          analysis,
          analyzed_at: new Date().toISOString(),
        },
        { onConflict: "user_id,fingerprint" },
      );

    return json({
      cached: false,
      fingerprint,
      version: ANALYSIS_VERSION,
      analyzedAt: new Date().toISOString(),
      analysis,
      guardStripped: stripped,
    });
  } catch (error) {
    const raw = errorMessage(error);
    const safe = apiKey ? raw.split(apiKey).join("[redacted]") : raw;
    return json({ error: safe.slice(0, 4000) }, 500);
  }
});
