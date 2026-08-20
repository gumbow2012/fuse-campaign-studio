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

const ANALYSIS_VERSION = "jewelry-still-analysis-v2";
const GEMINI_ANALYSIS_MODEL = Deno.env.get("GEMINI_ANALYSIS_MODEL")?.trim() || "gemini-3.6-flash";

/** Gemini call ceiling per request (references + frames) — ONE batch call. */
const MAX_IMAGES_PER_CALL = 20;
/** Product references included in the batch so classification stays anchored. */
const MAX_REFERENCE_IMAGES = 10;

type SourceFrame = { frameId: string; timestamp: number; imageUrl: string };

/* ------------------------------------------------------------------ *
 * ASSET FIREWALL — explicit backend typing (the two can never be swapped)
 * ------------------------------------------------------------------ *
 * SOURCE_CINEMATOGRAPHY         → the source clip / its frames. Camera,
 *   framing, crop, focus, lighting, placement, perspective and motion
 *   authority ONLY. ZERO jewelry-design authority. (Source frames arrive as
 *   `sourceFrames` and are never reference assets.)
 * REPLACEMENT_PRODUCT_REFERENCE → CAD, product photos and product VIDEO
 *   keyframes of the ACTUAL replacement piece. Geometry, material, stone,
 *   setting and component authority.
 */
type AssetPurpose = "SOURCE_CINEMATOGRAPHY" | "REPLACEMENT_PRODUCT_REFERENCE";

/** How FUSE auto-classified an uploaded replacement asset (user never labels). */
type ReferenceKind = "cad" | "photographic_still" | "product_reference_video";

type JewelryReferenceInput = {
  url: string;
  role?: string | null;
  cad?: boolean;
  /** Always REPLACEMENT_PRODUCT_REFERENCE on this path. */
  assetPurpose?: AssetPurpose;
  kind?: ReferenceKind;
  /** Set when this image is a keyframe extracted from a replacement video. */
  videoReferenceId?: string | null;
  timestamp?: number | null;
};

/** Metadata for one replacement VIDEO whose keyframes are in the set. */
type VideoReferenceInput = {
  videoReferenceId: string;
  duration: number;
  aspectRatio?: string | null;
  keyframeCount: number;
  keyframeTimestamps: number[];
};

/**
 * Every reference on this path is REPLACEMENT_PRODUCT_REFERENCE, typed
 * explicitly so nothing downstream can mistake it for source cinematography.
 */
function readReferences(raw: unknown): JewelryReferenceInput[] {
  return (Array.isArray(raw) ? raw : [])
    .map((ref: any) => {
      const videoReferenceId = ref?.videoReferenceId ? String(ref.videoReferenceId).trim() : null;
      const cad = ref?.cad === true;
      const kind: ReferenceKind = videoReferenceId
        ? "product_reference_video"
        : cad
          ? "cad"
          : "photographic_still";
      const timestamp = Number(ref?.timestamp);
      return {
        url: String(ref?.url ?? "").trim(),
        role: ref?.role ? String(ref.role).trim() : null,
        cad,
        assetPurpose: "REPLACEMENT_PRODUCT_REFERENCE" as AssetPurpose,
        kind,
        videoReferenceId,
        timestamp: Number.isFinite(timestamp) ? timestamp : null,
      };
    })
    .filter((ref: JewelryReferenceInput) => /^https?:\/\//.test(ref.url));
}

function readVideoReferences(raw: unknown): VideoReferenceInput[] {
  return (Array.isArray(raw) ? raw : [])
    .map((entry: any) => ({
      videoReferenceId: String(entry?.videoReferenceId ?? "").trim(),
      duration: Number(entry?.duration ?? 0) || 0,
      aspectRatio: entry?.aspectRatio ? String(entry.aspectRatio).trim() : null,
      keyframeCount: Number(entry?.keyframeCount ?? 0) || 0,
      keyframeTimestamps: (Array.isArray(entry?.keyframeTimestamps) ? entry.keyframeTimestamps : [])
        .map((value: any) => Number(value))
        .filter((value: number) => Number.isFinite(value)),
    }))
    .filter((entry: VideoReferenceInput) => entry.videoReferenceId);
}

/** Stable, order-independent handle for a reference inside one analysis batch. */
function referenceIdAt(index: number) {
  return `REF_${index + 1}`;
}

/**
 * USER_CONFIRMED override layer — universal across every jewelry type. Once the
 * user confirms a fact (setting, stone sizes, metal, dimensions, component
 * count, clasp identity …) the analysis may never override it.
 */
type UserConfirmedFact = {
  attribute: string;
  value: string;
  appliesTo?: string | null;
};

function readUserConfirmedFacts(raw: unknown): UserConfirmedFact[] {
  return (Array.isArray(raw) ? raw : [])
    .map((entry: any) => ({
      attribute: String(entry?.attribute ?? "").trim(),
      value: String(entry?.value ?? "").trim(),
      appliesTo: entry?.appliesTo ? String(entry.appliesTo).trim() : null,
    }))
    .filter((fact: UserConfirmedFact) => fact.attribute && fact.value)
    .slice(0, 40);
}




/* ------------------------------------------------------------------ *
 * responseSchema — strict structured output (JewelryProjectAnalysis)
 * ------------------------------------------------------------------ */

const STRING_ARRAY = { type: Type.ARRAY, items: { type: Type.STRING } };

/**
 * UNIVERSAL setting signature — one entry per detected/declared setting REGION.
 * Deliberately generic: every setting family (bead, prong, shared prong,
 * channel, baguette channel, invisible, bezel, flush, cluster, tennis, pavé,
 * micro pavé, mosaic, reverse mosaic, mixed, custom, or anything future)
 * populates the fields that physically apply to it and leaves the rest empty.
 * NOTHING here is specific to a named setting.
 */
const SETTING_SIGNATURE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    declaredSetting: { type: Type.STRING },
    region: { type: Type.STRING },
    stoneTypes: STRING_ARRAY,
    stoneColors: STRING_ARRAY,
    stoneShapes: STRING_ARRAY,
    stoneSizeDistribution: {
      type: Type.STRING,
      enum: ["uniform", "mixed", "graduated", "unclear"],
    },
    stoneOrientationPattern: { type: Type.STRING },
    settingDensity: { type: Type.STRING },
    layoutRegularity: {
      type: Type.STRING,
      enum: ["engineered-irregular", "regular-grid", "rows", "freeform", "unclear"],
    },
    prongOrMetalVisibility: { type: Type.STRING },
    spacingPattern: { type: Type.STRING },
    channelDirection: { type: Type.STRING },
    bezelGeometry: { type: Type.STRING },
    largeAnchorStonesVisible: { type: Type.BOOLEAN },
    smallFillerStonesVisible: { type: Type.BOOLEAN },
    referenceDefinedCharacteristics: STRING_ARRAY,
    conflictWarnings: STRING_ARRAY,
  },
  required: [
    "declaredSetting",
    "region",
    "stoneSizeDistribution",
    "layoutRegularity",
    "largeAnchorStonesVisible",
    "smallFillerStonesVisible",
    "referenceDefinedCharacteristics",
    "conflictWarnings",
  ],
} as const;

/**

 * Per-REFERENCE metadata. Gemini inspects EVERY valid uploaded reference — even
 * ones that will not be routed to the image model — so the whole library informs
 * ranking and the setting signatures.
 */
const REFERENCE_META_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    referenceId: { type: Type.STRING },
    detectedRole: { type: Type.STRING },
    view: { type: Type.STRING },
    coverage: {
      type: Type.STRING,
      enum: ["full_object", "partial_object", "macro_detail", "unclear"],
    },
    physicalRegionsVisible: STRING_ARRAY,
    geometryValue: { type: Type.STRING, enum: ["high", "medium", "low"] },
    materialValue: { type: Type.STRING, enum: ["high", "medium", "low"] },
    settingValue: { type: Type.STRING, enum: ["high", "medium", "low"] },
    usableFor: STRING_ARRAY,
    disposableContext: STRING_ARRAY,
    qualityNotes: { type: Type.STRING },
    designAuthoritySuggested: { type: Type.BOOLEAN },
    confidence: { type: Type.NUMBER },
  },
  required: [
    "referenceId",
    "detectedRole",
    "view",
    "coverage",
    "physicalRegionsVisible",
    "geometryValue",
    "materialValue",
    "settingValue",
    "usableFor",
    "disposableContext",
    "qualityNotes",
    "designAuthoritySuggested",
    "confidence",
  ],
} as const;

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    productAnalysis: {
      type: Type.OBJECT,
      properties: {
        jewelryType: { type: Type.STRING },
        // Metadata for EVERY analysed reference (order carries no authority).
        references: { type: Type.ARRAY, items: REFERENCE_META_SCHEMA as any },

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
        // One generic signature per setting REGION — no named setting is
        // privileged; each entry describes what the USER-SELECTED setting
        // physically looks like on THESE references.
        settingSignatures: { type: Type.ARRAY, items: SETTING_SIGNATURE_SCHEMA as any },
        conflictWarnings: STRING_ARRAY,
      },
      required: [
        "jewelryType",
        "references",
        "visibleComponents",
        "disposableReferenceContext",
        "geometryObservations",
        "materialObservations",
        "settingObservations",
        "settingSignatures",
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
          // PER-FRAME RANKED reference recommendations (referenceIds, best-first).
          recommendedReferences: STRING_ARRAY,
          avoidReferences: STRING_ARRAY,
          rankingReasons: STRING_ARRAY,
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
          "recommendedReferences",
          "avoidReferences",
          "rankingReasons",
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
 * Analysis-only field names that legitimately contain a forbidden word but can
 * only ever hold plain analysis text (a keyframe's parent id, the per-clip
 * evidence blocks). Their values are still checked for anything media-shaped.
 */
const ANALYSIS_ONLY_KEYS = new Set([
  "videoReferenceId",
  "videoAnalyses",
  "videoEvidence",
]);

const MEDIA_SHAPED = /(^data:|;base64,|https?:\/\/)/i;

function looksLikeMedia(value: unknown): boolean {
  if (typeof value === "string") return MEDIA_SHAPED.test(value);
  if (Array.isArray(value)) return value.some(looksLikeMedia);
  if (value && typeof value === "object") return Object.values(value).some(looksLikeMedia);
  return false;
}

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
      const entry = (value as Record<string, unknown>)[key];
      const allowed = ANALYSIS_ONLY_KEYS.has(key) && !looksLikeMedia(entry);
      if (!allowed && FORBIDDEN_KEY.test(key)) {
        delete (value as Record<string, unknown>)[key];
        stripped.push(`${path}.${key}`);
        continue;
      }
      assertAnalysisOnly(entry, `${path}.${key}`, stripped);
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
      kind: ref.kind ?? null,
      videoReferenceId: ref.videoReferenceId ?? null,
      timestamp: ref.timestamp ?? null,
    })),

    specs: args.jewelrySpecs.map(stableSpec),
    frames: args.sourceFrames.map((frame) => frame.imageUrl).sort(),
  };
  return await sha256Hex(JSON.stringify(payload));
}

/* ------------------------------------------------------------------ *
 * Image fetching (still images only)
 * ------------------------------------------------------------------ */

/** Independent image downloads run in parallel, bounded so we never flood. */
const FETCH_CONCURRENCY = 5;
/** No single auxiliary image may stall the whole analysis. */
const IMAGE_FETCH_TIMEOUT_MS = 15_000;

async function inlineImage(url: string) {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), IMAGE_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: abort.signal });
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
  } finally {
    clearTimeout(timer);
  }
}

type Settled<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * Bounded-concurrency map that never rejects: every task settles, so one bad
 * auxiliary image is reported and skipped instead of failing (or hanging) the
 * whole operation. Results keep the INPUT ORDER — reference ordering and REF
 * ids are order-sensitive downstream.
 */
async function mapPool<T, R>(
  items: T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>,
): Promise<Settled<R>[]> {
  const results: Settled<R>[] = new Array(items.length);
  let cursor = 0;
  const workerCount = Math.max(1, Math.min(limit, items.length));
  const worker = async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      try {
        results[index] = { ok: true, value: await task(items[index], index) };
      } catch (error) {
        results[index] = { ok: false, error: errorMessage(error) };
      }
    }
  };
  await Promise.all(Array.from({ length: workerCount }, worker));
  return results;
}

/** Parallel image inlining. Failures are labelled, never thrown. */
async function inlineImages(urls: string[]) {
  return await mapPool(urls, FETCH_CONCURRENCY, (url) => inlineImage(url));
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
  unavailable?: Set<number>;
}) {
  const refLines = args.references.map((ref, index) =>
    `${referenceIdAt(index)}: user label "${ref.role || "Unlabeled view"}"${
      ref.cad === true ? " [CAD / DESIGN AUTHORITY]" : ""
    }${args.unavailable?.has(index) ? " [IMAGE UNAVAILABLE — no image was provided for this id; do not classify it and never recommend it]" : ""}`
  );

  const frameLines = args.frames.map((frame, index) =>
    `FRAME ${index + 1}: frameId "${frame.frameId}" (timestamp ${frame.timestamp}s)`
  );

  return [
    "You are a luxury-jewelry shot analyst for a still-image product replacement pipeline.",
    "You analyse STILL IMAGES ONLY. You never generate images or video. Return JSON only.",
    "You are ADVISORY: your output may never override the user's structured specification (metal, stone, stone color, quality, setting), the CAD/design authority, or any manual mode/framing/preferred-reference choice. Describe what you see; do not prescribe replacements for those locked fields.",
    "",
    "PRODUCT REFERENCES (images provided first, in this order). The order they were uploaded carries NO authority — judge every reference purely on its visual content:",
    ...refLines,
    "",
    "SOURCE FRAMES the user selected to swap (images provided after the references, in this order):",
    ...frameLines,
    "",
    "USER STRUCTURED SPECIFICATION (authoritative, do not contradict):",
    specSummary(args.specs) || "(none provided)",
    "",
    "TASKS:",
    "1. productAnalysis — from the PRODUCT REFERENCES only: jewelry type, visible components, incidental/disposable context present in the references that must be excluded from any output (gloves, hands, fingers, wrists, necks, mannequins, boxes, velvet, tables, studio backgrounds, other jewelry, stands), geometry observations, material observations, setting observations, and settingSignatures — ONE entry per setting REGION.",
    "1b. productAnalysis.references — EXACTLY one entry per PRODUCT REFERENCE listed above, echoing its referenceId. Inspect EVERY reference, including ones you would not recommend for any frame, and use the ENTIRE reference library when writing the settingSignatures. Per reference report: detectedRole (what view it actually is, regardless of its user label), view, coverage, physicalRegionsVisible (the physical regions/components of the piece that are legible in it), geometryValue / materialValue / settingValue (high | medium | low — how much trustworthy information it carries for each), usableFor (short phrases: e.g. 'overall silhouette', 'clasp mechanics', 'stone layout', 'metal finish'), disposableContext (gloves, hands, fingers, wrists, necks, mannequins, boxes, velvet, tables, studio backgrounds, other jewelry, stands present in THAT reference), qualityNotes (blur, glare, low resolution, heavy retouching, occlusion), designAuthoritySuggested (true when it reads as CAD / render / technical drawing), and confidence 0-1.",
    "2. settingSignatures is UNIVERSAL and setting-agnostic. For each region, echo the user's declared setting verbatim in declaredSetting (never change which setting the user chose) and then describe what that setting PHYSICALLY looks like on these references: stone types, colors and shapes, stone-size distribution, stone orientation pattern, setting density, layout regularity, prong/metal visibility, spacing pattern, channel direction, bezel geometry, whether large anchor stones and small filler stones coexist, and referenceDefinedCharacteristics (short concrete phrases). Populate only the fields that physically apply to that setting and leave the rest empty — a channel setting fills channelDirection, a bezel fills bezelGeometry, a mixed multi-size composition fills stoneSizeDistribution, and so on. If what you observe disagrees with the declared setting, do NOT change the declared value — record the disagreement in conflictWarnings.",
    "3. frames — EXACTLY one entry per SOURCE FRAME, in the same order, echoing the given frameId. Classify each frame ONLY on its own visual content (never by neighbouring frames or any temporal assumption): view, coverage (full_object | partial_object | macro_detail), detailType, magnification, composition (whether the full product should be visible, whether an intentional crop must be preserved, negative space), orientation, camera angle + depth of field, replacementBehavior, and riskFlags.",
    "4. PER-FRAME RANKED REFERENCE RECOMMENDATIONS (the important part). For each frame also return: recommendedReferences — referenceIds RANKED BEST-FIRST for reconstructing THAT frame; avoidReferences — referenceIds that would mislead this frame; rankingReasons — one short reason per ranked reference, in the same order, naming why it won or lost.",
    "Rank on: the source frame's view and orientation, its coverage (full / partial / macro), its magnification, which physical region of the piece is actually visible in it, whether a CAD view relevant to THAT view exists, setting/detail relevance, material relevance, context-contamination risk, and the user's preferred reference when one is declared.",
    "Frame-type rules: an extreme-macro / macro_detail frame must prioritise macro, detail and setting references and SUPPRESS full hero product photos; a full-object hero frame must prioritise full / front / three-quarter references; a component close-up (clasp, link, hinge, bail, crown, shank, gallery) must prioritise references showing that component or its mechanics.",
    "Cleanliness tie-break: when two references carry equivalent product information, rank the CLEANER one higher and push the one with glove / hand / mannequin / busy background contamination lower. A contaminated reference may still be recommended when it holds unique physical information — its context is disposable and will be excluded downstream. Do not recommend every reference: 2 to 4 strong ones per frame is right.",
    "Be concise: short phrases, no prose paragraphs. Never output URLs, file names, base64 or media of any kind.",
  ].join("\n");
}


/* ------------------------------------------------------------------ *
 * Gemini batches
 * ------------------------------------------------------------------ */

async function analyseBatch(args: {
  ai: GoogleGenAI;
  referenceParts: unknown[];
  frameParts: unknown[];
  references: JewelryReferenceInput[];
  frames: SourceFrame[];
  specs: any[];
}) {
  const response = await args.ai.models.generateContent({
    model: GEMINI_ANALYSIS_MODEL,
    contents: [
      {
        role: "user",
        parts: [
          { text: buildAnalysisPrompt({ references: args.references, frames: args.frames, specs: args.specs }) },
          ...args.referenceParts,
          ...args.frameParts,
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

/* ------------------------------------------------------------------ *
 * PRODUCT KNOWLEDGE MAP reuse (shot analysis fast path)
 * ------------------------------------------------------------------ *
 * Intake already VISUALLY analysed the whole replacement-reference library and
 * persisted the result. When the reference set has not changed, shot analysis
 * must not pay for that work again: Gemini receives the SOURCE FRAMES as images
 * plus the persisted knowledge map as TEXT, and answers only "what shot is this
 * frame?" and "which already-understood references (by REF id) best recreate
 * it?". The product itself is never re-derived.
 */

/** frames-only structured output — identical per-frame shape, no productAnalysis. */
const FRAMES_ONLY_SCHEMA = {
  type: Type.OBJECT,
  properties: { frames: (RESPONSE_SCHEMA as any).properties.frames },
  required: ["frames"],
} as const;

function normalizeRefKey(ref: JewelryReferenceInput) {
  return `${ref.url}|${ref.role ?? ""}|${ref.cad ? 1 : 0}|${ref.kind ?? ""}|${
    ref.videoReferenceId ?? ""
  }`;
}


/** True when the two reference sets are the same images with the same labels. */
function sameReferenceSet(a: JewelryReferenceInput[], b: JewelryReferenceInput[]) {
  if (a.length !== b.length || !a.length) return false;
  const left = a.map(normalizeRefKey).sort();
  const right = b.map(normalizeRefKey).sort();
  return left.every((entry, index) => entry === right[index]);
}

const listOf = (value: unknown) =>
  (Array.isArray(value) ? value : []).map((entry) => String(entry ?? "").trim()).filter(Boolean);

const detectedValue = (field: any) =>
  String(field?.resolvedValue ?? field?.value ?? "").trim();

/**
 * Turns the persisted intake into (a) a productAnalysis object in EXACTLY the
 * shape the downstream prompt builder already consumes and (b) the text map +
 * reference catalog handed to the ranking call.
 */
function buildKnowledgeMap(args: {
  intake: any;
  intakeReferences: JewelryReferenceInput[];
  references: JewelryReferenceInput[];
}) {
  const products = Array.isArray(args.intake?.products) ? args.intake.products : [];
  if (!products.length) return null;

  const idByUrl = new Map<string, string>();
  args.references.forEach((ref, index) => idByUrl.set(ref.url, referenceIdAt(index)));

  const visibleComponents = new Set<string>();
  const geometryObservations: string[] = [];
  const materialObservations: string[] = [];
  const settingObservations: string[] = [];
  const settingSignatures: any[] = [];
  const referenceMeta: any[] = [];
  const mapLines: string[] = [];
  const catalogLines: string[] = [];

  products.forEach((product: any, productIndex: number) => {
    const label = String(product?.label ?? `PIECE ${productIndex + 1}`);
    const type = detectedValue(product?.jewelryType);
    const metal = detectedValue(product?.metal);
    const stone = detectedValue(product?.stoneType);
    const stoneColor = detectedValue(product?.stoneColor);
    const quality = detectedValue(product?.stoneQuality);
    const dimensions = detectedValue(product?.dimensions);
    const weight = detectedValue(product?.weight);

    for (const component of listOf(product?.visibleComponents)) visibleComponents.add(component);
    if (dimensions) geometryObservations.push(`${label} dimensions: ${dimensions}`);
    if (weight) geometryObservations.push(`${label} weight: ${weight}`);
    for (const component of listOf(product?.connectedComponents)) {
      geometryObservations.push(`${label} connected component: ${component}`);
    }
    if (metal) materialObservations.push(`${label} metal: ${metal}`);
    if (stone) materialObservations.push(`${label} stone: ${stone}`);
    if (stoneColor) materialObservations.push(`${label} stone color: ${stoneColor}`);
    if (quality) materialObservations.push(`${label} stone quality: ${quality}`);

    mapLines.push(
      `${label}${type ? ` — type: ${type}` : ""}${metal ? `; metal: ${metal}` : ""}${
        stone ? `; stone: ${stone}` : ""
      }${stoneColor ? `; stone color: ${stoneColor}` : ""}${quality ? `; quality: ${quality}` : ""}`,
    );
    const components = listOf(product?.visibleComponents);
    if (components.length) mapLines.push(`  components/regions: ${components.join(", ")}`);

    for (const setting of Array.isArray(product?.settings) ? product.settings : []) {
      const region = String(setting?.resolvedRegion ?? setting?.region ?? "Entire Piece").trim();
      const name = String(setting?.resolvedSetting ?? "").trim();
      const state = name || "needs confirmation";
      const signature = String(setting?.settingVisualSignature ?? "").trim();
      settingObservations.push(`${region}: ${state}${signature ? ` — ${signature}` : ""}`);
      mapLines.push(
        `  setting @ ${region}: ${state}${
          Number.isFinite(Number(setting?.confidence)) ? ` (confidence ${Number(setting.confidence).toFixed(2)})` : ""
        }${signature ? ` — visual construction: ${signature}` : ""}`,
      );
    }

    for (const signature of Array.isArray(product?.settingSignatures) ? product.settingSignatures : []) {
      if (signature && typeof signature === "object") settingSignatures.push(signature);
    }

    for (const ref of Array.isArray(product?.references) ? product.references : []) {
      const index = Number(ref?.referenceIndex);
      const url = args.intakeReferences[index]?.url ?? "";
      const referenceId = idByUrl.get(url);
      if (!referenceId) continue;
      const role = String(ref?.role ?? "").trim() || "Uncertain";
      const cad = ref?.designAuthorityLikely === true ||
        args.references.find((entry) => entry.url === url)?.cad === true;
      const confidence = Number(ref?.roleConfidence ?? 0) || 0;
      referenceMeta.push({
        referenceId,
        detectedRole: role,
        view: role,
        coverage: "unclear",
        physicalRegionsVisible: listOf(product?.visibleComponents),
        geometryValue: cad ? "high" : "medium",
        materialValue: cad ? "medium" : "high",
        settingValue: "medium",
        usableFor: [],
        disposableContext: [],
        qualityNotes: "",
        designAuthoritySuggested: cad,
        confidence,
      });
      catalogLines.push(
        `${referenceId}: ${label} — understood as "${role}"${cad ? " [CAD / DESIGN AUTHORITY]" : ""}${
          confidence ? ` (confidence ${confidence.toFixed(2)})` : ""
        }`,
      );
    }

    const notes = String(product?.notes ?? "").trim();
    if (notes) mapLines.push(`  notes: ${notes.slice(0, 400)}`);
  });

  // Any reference the intake did not itemise is still catalogued so it can rank.
  for (const [url, referenceId] of idByUrl) {
    if (catalogLines.some((line) => line.startsWith(`${referenceId}:`))) continue;
    const ref = args.references.find((entry) => entry.url === url);
    catalogLines.push(
      `${referenceId}: user label "${ref?.role || "Unlabeled view"}"${ref?.cad ? " [CAD / DESIGN AUTHORITY]" : ""}`,
    );
  }

  // Keyframe provenance is part of the catalog so ranking knows a reference came
  // from a replacement-product VIDEO (still an image reference, still eligible).
  const annotatedCatalog = catalogLines.map((line) => {
    const referenceId = line.split(":")[0];
    const index = args.references.findIndex((_, i) => referenceIdAt(i) === referenceId);
    const ref = index >= 0 ? args.references[index] : null;
    if (!ref || ref.kind !== "product_reference_video") return line;
    const at = Number.isFinite(Number(ref.timestamp)) ? ` @ ${Number(ref.timestamp).toFixed(2)}s` : "";
    return `${line} [PRODUCT VIDEO KEYFRAME${at}]`;
  });

  /* ---- The fused engineering understanding, when one was persisted ------- */
  const pkm = args.intake?.knowledgeMap && typeof args.intake.knowledgeMap === "object"
    ? args.intake.knowledgeMap
    : null;
  const lock = pkm ? engineeringLockLines(pkm) : [];
  if (lock.length) {
    mapLines.push("  ENGINEERING LOCK (fused from CAD + photos + product-video keyframes):");
    for (const line of lock) mapLines.push(`    ${line}`);
    // The image model already renders `referenceDefinedCharacteristics` verbatim,
    // so the lock reaches Nano through the EXISTING prompt path unchanged.
    for (const signature of settingSignatures) {
      const existing = listOf((signature as any).referenceDefinedCharacteristics);
      (signature as any).referenceDefinedCharacteristics = [...existing, ...lock].slice(0, 24);
    }
  }

  const productAnalysis = {
    jewelryType: detectedValue(products[0]?.jewelryType) ||
      String(pkm?.productType ?? "").trim(),
    references: referenceMeta,
    visibleComponents: [...visibleComponents],
    disposableReferenceContext: [],
    geometryObservations,
    materialObservations,
    settingObservations,
    settingSignatures,
    conflictWarnings: listOf(args.intake?.conflictWarnings),
    referenceIds: args.references.map((_, index) => referenceIdAt(index)),
    /** Provenance: this map was reused, not re-derived. */
    knowledgeMapReused: true,
  };

  return {
    productAnalysis,
    catalogLines: annotatedCatalog.sort(),
    mapLines,
    pkm,
  };
}

/**
 * Turns the Product Knowledge Map into a SHORT engineering lock — stone-field
 * ratios, placement pattern, master-module geometry, exposed-metal separators,
 * edge boundaries. Concise physical constraints only: never a raw analysis dump,
 * never a generic setting label, and never a low-confidence guess.
 */
function engineeringLockLines(pkm: any): string[] {
  const lines: string[] = [];
  const confident = (value: unknown, floor = 0.6) => Number(value ?? 0) >= floor;
  // A claim only becomes a physical CONSTRAINT when its provenance is strong
  // enough; low-confidence inference stays out of the image model entirely.
  const hard = (entry: any, floor = 0.6) =>
    confident(entry?.confidence, floor) && lockable(entry?.provenance);

  const dimensions = pkm?.dimensions;
  if (dimensions?.summary && hard(dimensions, 0.5)) {
    const basis = dimensions.measurementBasis === "measured_from_authority"
      ? "measured"
      : "relative estimate";
    lines.push(`Proportions (${basis}): ${String(dimensions.summary).slice(0, 200)}`);
  }
  for (const ratio of listOf(dimensions?.relativeRatios).slice(0, 3)) {
    lines.push(`Size ratio: ${ratio}`);
  }
  // Only claims the analysis could actually back become millimetre locks.
  for (const claim of (Array.isArray(dimensions?.scaleClaims) ? dimensions.scaleClaims : []).slice(0, 3)) {
    if (!lockable(claim?.provenance) || claim?.basis === "visually_estimated") continue;
    if (!claim?.claim) continue;
    lines.push(`Scale: ${String(claim.claim).slice(0, 120)}`);
  }

  for (const module of (Array.isArray(pkm?.repeatedModules) ? pkm.repeatedModules : []).slice(0, 2)) {
    if (!hard(module, 0.5)) continue;
    const count = Number(module?.repeatCount ?? 0);
    lines.push(
      `Master module${count ? ` (repeats x${count}, every instance identical)` : ""}: ${
        String(module?.masterGeometry ?? "").slice(0, 180)
      }`,
    );
    if (module?.masterStoneMap) {
      lines.push(`Master stone map: ${String(module.masterStoneMap).slice(0, 180)}`);
    }
    for (const exception of listOf(module?.exceptions).slice(0, 2)) {
      lines.push(`Module exception: ${exception}`);
    }
  }

  for (const group of (Array.isArray(pkm?.stoneGroups) ? pkm.stoneGroups : []).slice(0, 4)) {
    if (!hard(group, 0.5)) continue;
    const region = String(group?.regionId ?? "region").trim();
    // PHYSICAL size behaviour only — apparent (perspective) size never leaks in.
    const uniformity = group?.sizeUniformity === "uniform"
      ? "physically uniform stone size"
      : group?.sizeUniformity === "mixed"
      ? `physically mixed stone sizes${
        group?.physicalSizeDifference ? ` (${String(group.physicalSizeDifference).slice(0, 90)})` : ""
      }`
      : "";
    const parts = [
      group?.count ? `${group.count} stones` : "",
      uniformity,
      group?.repeatPattern ? `pattern: ${group.repeatPattern}` : "",
      group?.anchorToFillerRatio ? `anchor:filler ≈ ${group.anchorToFillerRatio}` : "",
      group?.gradient ? `gradient: ${group.gradient}` : "",
    ].filter(Boolean);
    if (parts.length) lines.push(`${region} stone field — ${parts.join("; ")}`);
  }

  for (const setting of (Array.isArray(pkm?.settings) ? pkm.settings : []).slice(0, 4)) {
    if (setting?.needsConfirmation === true || !hard(setting)) continue;
    const signature = String(setting?.settingVisualSignature ?? "").trim();
    if (!signature) continue;
    lines.push(`${String(setting?.regionId ?? "region")} construction: ${signature.slice(0, 200)}`);
  }

  for (const material of (Array.isArray(pkm?.materialRegions) ? pkm.materialRegions : []).slice(0, 3)) {
    if (!hard(material, 0.5)) continue;
    const facts = [
      material?.metalColor ? `metal ${material.metalColor}` : "",
      material?.finish ? `finish ${material.finish}` : "",
    ].filter(Boolean);
    if (facts.length) {
      lines.push(`${String(material?.regionId ?? "region")}: ${facts.join(", ")}`);
    }
  }

  return lines.filter(Boolean).slice(0, 18);
}



function buildCachedShotPrompt(args: {
  frames: SourceFrame[];
  catalogLines: string[];
  mapLines: string[];
  specs: any[];
}) {
  const frameLines = args.frames.map((frame, index) =>
    `FRAME ${index + 1}: frameId "${frame.frameId}" (timestamp ${frame.timestamp}s)`
  );
  return [
    "You are a luxury-jewelry SHOT analyst. Return JSON only. You never generate images or video.",
    "The replacement product has ALREADY been analysed and is described below as text. Do NOT re-derive, re-guess or re-describe the product. Your only two jobs are: (1) classify each SOURCE FRAME as a shot, and (2) rank which already-understood replacement references (by REF id) are the best evidence for recreating THAT frame.",
    "",
    "SOURCE DESIGN FIREWALL (absolute): the jewelry visible in the SOURCE FRAMES has ZERO design authority. From a source frame you may read ONLY photographic facts: camera angle, perspective, coverage (full / partial / macro), crop, magnification, orientation, placement, visible percentage, occlusion, focus and depth of field, and lighting. You may NEVER read product type, silhouette, setting, stones, metal, geometry, lettering, bail, clasp, link design or proportions from a source frame. All replacement design comes exclusively from the references, the CAD/design authority and the structured specification below.",
    "",
    "PRODUCT KNOWLEDGE MAP (already established from the replacement references — authoritative, do not contradict, do not restate):",
    ...args.mapLines,
    "",
    "REFERENCE CATALOG (images NOT re-sent — rank by these REF ids only):",
    ...args.catalogLines,
    "",
    "USER STRUCTURED SPECIFICATION (authoritative):",
    specSummary(args.specs) || "(none provided)",
    "",
    "SOURCE FRAMES the user selected to swap (images provided after this text, in this order):",
    ...frameLines,
    "",
    "TASKS — return EXACTLY one frames entry per SOURCE FRAME, in the same order, echoing the given frameId:",
    "1. Classify each frame ONLY on its own photographic content (never by neighbouring frames or any temporal assumption): view, coverage (full_object | partial_object | macro_detail), detailType, magnification, composition (whether the full product should be visible, whether an intentional crop must be preserved, negative space), orientation, camera angle + depth of field, replacementBehavior, riskFlags.",
    "2. PER-FRAME RANKED REFERENCE RECOMMENDATIONS: recommendedReferences — REF ids RANKED BEST-FIRST for reconstructing THAT frame; avoidReferences — REF ids that would mislead this frame; rankingReasons — one short reason per ranked reference, in the same order. Also give recommendedReferenceRoles / avoidReferenceRoles as role names.",
    "Rank on: the source frame's view and orientation, its coverage, its magnification, which physical region of the piece is actually visible in it, whether a CAD view relevant to THAT view exists, setting/detail relevance, material relevance, context-contamination risk, and the user's preferred reference when one is declared.",
    "Frame-type rules: an extreme-macro / macro_detail frame must prioritise macro, detail and setting references and SUPPRESS full hero product photos; a full-object hero frame must prioritise full / front / three-quarter references; a component close-up (clasp, link, hinge, bail, crown, shank, gallery) must prioritise references showing that component or its mechanics.",
    "Cleanliness tie-break: when two references carry equivalent product information, prefer the cleaner one; a contaminated reference may still be recommended when it holds unique physical information. Do not recommend every reference: 2 to 4 strong ones per frame is right.",
    "Be concise: short phrases, no prose paragraphs. Never output URLs, file names, base64 or media of any kind.",
  ].join("\n");
}

/** Frame classification + ranking only — ONE batch call for ALL frames. */
async function rankFramesWithKnowledgeMap(args: {
  ai: GoogleGenAI;
  frameParts: unknown[];
  frames: SourceFrame[];
  catalogLines: string[];
  mapLines: string[];
  specs: any[];
}) {
  const response = await args.ai.models.generateContent({
    model: GEMINI_ANALYSIS_MODEL,
    contents: [
      {
        role: "user",
        parts: [
          {
            text: buildCachedShotPrompt({
              frames: args.frames,
              catalogLines: args.catalogLines,
              mapLines: args.mapLines,
              specs: args.specs,
            }),
          },
          ...args.frameParts,
        ],
      },
    ] as any,
    config: {
      responseMimeType: "application/json",
      responseSchema: FRAMES_ONLY_SCHEMA as any,
      // Classification + ranking only — sized to the schema, not to prose.
      maxOutputTokens: Math.min(8192, 900 * args.frames.length + 1200),
      temperature: 0.1,
      // No product reasoning left to do, so keep thinking minimal.
      thinkingConfig: { thinkingLevel: "low" },
    },
  });

  return JSON.parse((response.text ?? "").trim());
}



/* ------------------------------------------------------------------ *
 * INTAKE MODE — fast reference recognition / grouping / extraction
 * ------------------------------------------------------------------ *
 * Recognition + classification + extraction only (no deep reasoning, no
 * source frames, no video, no generation). Returns strict JSON describing
 * how many physical pieces the uploaded references contain, which file
 * belongs to which piece, each file's proposed role + CAD likelihood, and
 * the detected structured spec for every piece — each detected field
 * carrying its own confidence so the app can mark uncertain values.
 */

const INTAKE_VERSION = "jewelry-intake-analysis-v2";

/**
 * The app's canonical dropdown vocabularies, handed in by the client so the
 * intake answer maps 1:1 onto the existing controls. Nothing here is invented
 * or hardcoded in this function: an empty list simply means "free text".
 */
type IntakeOptions = {
  jewelryTypes: string[];
  metals: string[];
  stones: string[];
  stoneColors: string[];
  qualities: string[];
  settingTypes: string[];
  /** jewelry-type keyword -> allowed region labels (type-aware). */
  settingRegions: Record<string, string[]>;
};

const EMPTY_OPTIONS: IntakeOptions = {
  jewelryTypes: [],
  metals: [],
  stones: [],
  stoneColors: [],
  qualities: [],
  settingTypes: [],
  settingRegions: {},
};

function readOptions(raw: any): IntakeOptions {
  const list = (value: any) =>
    (Array.isArray(value) ? value : [])
      .map((entry: any) => String(entry ?? "").trim())
      .filter(Boolean)
      .slice(0, 80);
  const regions: Record<string, string[]> = {};
  const rawRegions = raw?.settingRegions;
  if (rawRegions && typeof rawRegions === "object" && !Array.isArray(rawRegions)) {
    for (const [key, value] of Object.entries(rawRegions)) {
      const normalized = list(value);
      if (normalized.length) regions[String(key).trim().toLowerCase()] = normalized;
    }
  }
  return {
    jewelryTypes: list(raw?.jewelryTypes),
    metals: list(raw?.metals),
    stones: list(raw?.stones),
    stoneColors: list(raw?.stoneColors),
    qualities: list(raw?.qualities),
    settingTypes: list(raw?.settingTypes),
    settingRegions: regions,
  };
}

/** Every canonical region label the app knows about, across all types. */
function allRegions(options: IntakeOptions) {
  return [...new Set(Object.values(options.settingRegions).flat())];
}

/**
 * Maps a detected free-text value onto the app's canonical enum. Exact match
 * first, then containment, then token overlap. No match → "" (the app keeps
 * "Auto from reference" and the field is surfaced for confirmation) — a value
 * is never bent into an unrelated option just to fill the slot.
 */
function toCanonical(value: unknown, options: string[]): string {
  const raw = String(value ?? "").trim();
  if (!raw || !options.length) return raw;
  const lower = raw.toLowerCase();
  const exact = options.find((option) => option.toLowerCase() === lower);
  if (exact) return exact;
  const contained = options.filter(
    (option) =>
      option.toLowerCase().includes(lower) || lower.includes(option.toLowerCase()),
  );
  if (contained.length) {
    // Prefer the most specific (longest) canonical label that still matches.
    return contained.sort((a, b) => b.length - a.length)[0];
  }
  const tokens = new Set(lower.split(/[^a-z0-9]+/).filter((token) => token.length > 2));
  let best = "";
  let bestScore = 0;
  for (const option of options) {
    const optionTokens = option.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2);
    const score = optionTokens.filter((token) => tokens.has(token)).length;
    if (score > bestScore) {
      bestScore = score;
      best = option;
    }
  }
  return bestScore > 0 ? best : "";
}

/** high → auto-populate, medium → suggested, low → needs confirmation. */
function confidenceTier(confidence: unknown): "high" | "medium" | "low" {
  const value = Number(confidence ?? 0);
  if (value >= 0.7) return "high";
  if (value >= 0.45) return "medium";
  return "low";
}

/** value + confidence; the app attaches the `source` (gemini_detected). */
const DETECTED_FIELD = {
  type: Type.OBJECT,
  properties: {
    value: { type: Type.STRING },
    confidence: { type: Type.NUMBER },
  },
  required: ["value", "confidence"],
} as const;

/**
 * Stone quality can only be auto-resolved from EXPLICIT readable evidence, so
 * the model must always declare where the grade came from.
 */
const QUALITY_FIELD = {
  type: Type.OBJECT,
  properties: {
    value: { type: Type.STRING },
    confidence: { type: Type.NUMBER },
    qualityEvidenceSource: {
      type: Type.STRING,
      enum: ["cad_text", "certification", "product_text", "user_input", "visual_only"],
    },
    qualityEvidenceNote: { type: Type.STRING },
  },
  required: ["value", "confidence", "qualityEvidenceSource"],
} as const;

/** Evidence sources that may auto-populate a clarity grade. */
const EXPLICIT_QUALITY_EVIDENCE = new Set([
  "cad_text",
  "certification",
  "product_text",
  "user_input",
]);



const INTAKE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    productCount: { type: Type.NUMBER },
    products: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          productIndex: { type: Type.NUMBER },
          label: { type: Type.STRING },
          jewelryType: DETECTED_FIELD,
          metal: DETECTED_FIELD,
          stoneType: DETECTED_FIELD,
          stoneColor: DETECTED_FIELD,
          stoneQuality: QUALITY_FIELD,
          dimensions: DETECTED_FIELD,
          weight: DETECTED_FIELD,
          visibleComponents: STRING_ARRAY,
          connectedComponents: STRING_ARRAY,
          settings: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                // Reasoning FIRST, then the canonical enum (or needs_confirmation).
                settingClassificationReason: { type: Type.STRING },
                setting: { type: Type.STRING },
                region: { type: Type.STRING },
                confidence: { type: Type.NUMBER },
                settingVisualSignature: { type: Type.STRING },
                evidenceReferenceIndexes: { type: Type.ARRAY, items: { type: Type.NUMBER } },
              },
              required: ["settingClassificationReason", "setting", "region", "confidence"],
            },
          },


          settingSignatures: { type: Type.ARRAY, items: SETTING_SIGNATURE_SCHEMA as any },
          references: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                referenceIndex: { type: Type.NUMBER },
                role: { type: Type.STRING },
                roleConfidence: { type: Type.NUMBER },
                designAuthorityLikely: { type: Type.BOOLEAN },
                designAuthorityConfidence: { type: Type.NUMBER },
              },
              required: [
                "referenceIndex",
                "role",
                "roleConfidence",
                "designAuthorityLikely",
                "designAuthorityConfidence",
              ],
            },
          },
          needsConfirmation: STRING_ARRAY,
          notes: { type: Type.STRING },
        },
        required: [
          "productIndex",
          "label",
          "jewelryType",
          "metal",
          "stoneType",
          "stoneColor",
          "stoneQuality",
          "visibleComponents",
          "settings",
          "references",
          "needsConfirmation",
        ],
      },
    },
    conflictWarnings: STRING_ARRAY,
  },
  required: ["productCount", "products"],
} as const;

function buildIntakePrompt(args: {
  references: JewelryReferenceInput[];
  roleVocabulary: string[];
  options: IntakeOptions;
  unavailable?: Set<number>;
}) {
  const refLines = args.references.map((ref, index) =>
    `REFERENCE ${index} (referenceIndex ${index})${ref.role ? ` — user label "${ref.role}"` : ""}${
      ref.cad ? " — user marked as design authority" : ""
    }${args.unavailable?.has(index) ? " — IMAGE UNAVAILABLE (no image supplied for this index; skip it entirely and do not invent findings for it)" : ""}`
  );

  const options = args.options;
  const vocabulary = (label: string, values: string[]) =>
    values.length ? `${label}: ${values.join(" | ")}` : "";
  const regionLines = Object.entries(options.settingRegions).map(
    ([type, regions]) => `  ${type} → ${regions.join(" | ")}`,
  );
  return [
    "You are a jewelry intake classifier. This is RECOGNITION, CLASSIFICATION and EXTRACTION — not generation. Return JSON only.",
    "You never generate images or video, and you never invent facts.",
    "",
    "UPLOADED REFERENCE IMAGES, in this exact order (images follow this text):",
    ...refLines,
    "",
    "COMPLETE-SET REASONING (mandatory): every image above belongs to the SAME intake batch. Resolve every field by reasoning across the WHOLE set, not image by image and not from the first image. A CAD / technical render alone must NEVER lock the product class when photographs make the real product obvious: if the photographs show a wrist-worn Cuban link bracelet, the answer is a BRACELET even when a CAD render is cropped so tightly that it resembles a pendant or a single link. Photography decides the product class; CAD decides internal geometry.",
    "",
    "CANONICAL VOCABULARIES — you MUST answer using values from these lists verbatim. Never invent a new label, never return a synonym, never return a value that is not in the list. If nothing in a list truly matches, return an EMPTY value with low confidence instead of forcing a wrong option.",
    vocabulary("jewelryType", options.jewelryTypes),
    vocabulary("metal", options.metals),
    vocabulary("stoneType", options.stones),
    vocabulary("stoneColor", options.stoneColors),
    vocabulary("stoneQuality", options.qualities),
    vocabulary("setting", options.settingTypes),
    regionLines.length ? "region (type-aware — use the list matching the resolved jewelryType):" : "",
    ...regionLines,
    "",
    "TASKS:",
    "1. GROUPING — decide how many DISTINCT PHYSICAL PIECES these images show, and assign every referenceIndex to exactly one product. Different angles, macro crops, CAD renders and lifestyle shots of the SAME piece belong to the SAME product. Never merge clearly different products (different silhouette, different type, different stone layout) into one product. Set productCount accordingly.",
    "2. ROLES — for each reference, propose a role from this vocabulary when it fits: " +
    args.roleVocabulary.join(", ") +
    ". Use \"Uncertain\" when you are not reasonably sure. Set designAuthorityLikely = true only for genuine CAD / technical / design-authority renders (clean synthetic render, wireframe, spec drawing), with a confidence you actually believe.",
    "3. EXTRACTION — per product, detect jewelryType, metal, stoneType, stoneColor, stoneQuality, settings, visibleComponents, and connectedComponents (e.g. a chain physically attached to a pendant). Give dimensions and weight ONLY when explicitly readable in the image (printed CAD dimensions, a spec sheet, a caption) — otherwise leave value empty.",
    "4. SETTING CLASSIFICATION — REASON BEFORE YOU NORMALIZE. For EVERY settings entry you MUST fill settingClassificationReason FIRST, as a short evidence statement, and only then choose the canonical enum. That reason must explicitly address: stone-size uniform vs mixed; whether larger ANCHOR stones exist; whether smaller FILLER stones sit around larger ones; regular vs irregular layout; whether stone borders visually overlap; stone orientation/rotation; individual vs shared prongs (or beads, channel walls, bezels, flush/burnish, rails); how much metal is exposed; whether the arrangement follows each link's own geometry; whether it repeats link-by-link; and whether the CLASP construction differs from the LINK construction.",
    "4b. HARD RULE — dense small-diamond coverage ALONE is NOT evidence for a micro/pavé-family setting. Never pick a pavé-family value just because a surface looks densely iced. Choose a canonical setting ONLY when the physical characteristics you described actually match that setting's construction. If the characteristics do not clearly match exactly one canonical value, return setting = \"needs_confirmation\" for that region with a confidence below 0.45 — do NOT force the closest common name, and do NOT prefer or assume any particular named setting.",
    "4c. REASON↔ENUM CONSISTENCY RULE — pavé-family settings (Pavé, Micro Pavé) REQUIRE uniform, similarly-sized stones set in regular rows or fields. If your own settingClassificationReason describes MIXED stone sizes, larger ANCHOR stones with smaller FILLER stones, stones filling gaps, irregular or non-uniform sizing, or size variation that follows the link/piece geometry, you MUST NOT choose Pavé or Micro Pavé. In that mixed-size case, choose the canonical setting from the provided list that actually matches multi-size / anchor-and-filler / tiled construction; if none clearly matches, return setting = \"needs_confirmation\" with confidence below 0.45. Never fall back to Micro Pavé or Pavé merely because the surface is densely iced. The chosen canonical setting MUST be logically consistent with your settingClassificationReason — a reason describing uniform stones permits a uniform-construction setting; a reason describing mixed/irregular construction forbids any uniform-only setting. Stay universal: map only to the app's existing canonical enums and never assume any particular named setting.",
    "5. MULTI-REGION SETTINGS — return ONE settings entry per physically distinct construction region you can actually see (for a bracelet typically the links, then the clasp, then the sidewall / underside; for a pendant the main face, border, lettering, bail). Use the canonical region labels for the resolved jewelryType. Include settingVisualSignature (the observed physical construction, in your own words), settingClassificationReason and evidenceReferenceIndexes (which referenceIndexes you actually saw it in) for every entry. Regions can legitimately differ — classify the clasp independently of the links. If only one construction exists across the whole piece, return exactly one entry.",
    "5b. STONE QUALITY EVIDENCE — clarity/quality grades (FL, IF, VVS, VS, SI, I…) are NEVER inferable from ordinary photography. Always set stoneQuality.qualityEvidenceSource to one of cad_text | certification | product_text | user_input | visual_only. Use visual_only whenever you are reading the stones off photographs or renders with no readable grade text; in that case leave value empty and confidence below 0.45. Only return an actual grade when the grade is explicitly READABLE (CAD annotation, certificate, product/spec text) or supplied by the user.",

    "6. SETTING SIGNATURES — one universal signature entry per setting region, populated exactly as described: echo the setting name in declaredSetting and describe the physical construction you observe, using the ENTIRE reference library as evidence. Never privilege or assume any particular named setting.",
    "7. CONFIDENCE — every detected field carries confidence 0..1. Anything below 0.7 must ALSO be listed in needsConfirmation by field name (jewelryType, metal, stoneType, stoneColor, stoneQuality, settings, dimensions, weight). Never guess to fill a field, and never turn uncertainty into a generic default: an empty value with low confidence is correct behaviour.",
    "Short phrases only. Never output URLs, file names, base64 or media of any kind.",
  ].filter(Boolean).join("\n");
}

/**
 * The cache key is the FULL intake input: urls + user roles + user authority
 * flags + the canonical vocabularies. Any of them changing is a genuinely
 * different question, so it never serves a previous set's answer.
 */
async function referenceFingerprint(
  references: JewelryReferenceInput[],
  options: IntakeOptions,
  videoReferences: VideoReferenceInput[] = [],
  userConfirmedFacts: UserConfirmedFact[] = [],
) {
  return await sha256Hex(
    JSON.stringify({
      version: `${INTAKE_VERSION}+${PKM_VERSION}`,
      model: GEMINI_ANALYSIS_MODEL,
      references: references.map(normalizeRefKey).sort(),
      clips: videoReferences
        .map((clip) => `${clip.videoReferenceId}|${clip.duration}|${clip.keyframeTimestamps.join(",")}`)
        .sort(),
      // A new user confirmation is a new understanding — cache key changes.
      confirmed: userConfirmedFacts
        .map((fact) => `${fact.attribute}=${fact.value}@${fact.appliesTo ?? "*"}`)
        .sort(),
      options,
    }),
  );
}


/**
 * The Gemini batch is capped, so CAD and photographic stills are kept first and
 * the remaining slots are filled with EVENLY SPACED video keyframes — a long
 * clip can never crowd out the product photography.
 */
function selectIntakeBatch(references: JewelryReferenceInput[], limit: number) {
  if (references.length <= limit) return references;
  const stills = references.filter((ref) => ref.kind !== "product_reference_video");
  const keyframes = references.filter((ref) => ref.kind === "product_reference_video");
  const kept = stills.slice(0, limit);
  const slots = Math.max(0, limit - kept.length);
  if (!slots || !keyframes.length) return kept;
  const step = keyframes.length / slots;
  const picked = Array.from(
    { length: slots },
    (_, index) => keyframes[Math.min(keyframes.length - 1, Math.floor(index * step))],
  );
  // Preserve the caller's original ordering so referenceIdAt stays meaningful.
  const chosen = new Set([...kept, ...picked]);
  return references.filter((ref) => chosen.has(ref));
}



async function runIntake(args: {
  ai: GoogleGenAI;
  references: JewelryReferenceInput[];
  roleVocabulary: string[];
  options: IntakeOptions;
}) {
  // Independent downloads run concurrently. An image that cannot be read is
  // labelled unavailable and skipped — referenceIndex numbering is preserved so
  // the client's index → file mapping never shifts.
  const fetchStarted = Date.now();
  const settled = await inlineImages(args.references.map((ref) => ref.url));
  const referenceFetchMs = Date.now() - fetchStarted;
  const unavailable = new Set<number>();
  const imageParts: unknown[] = [];
  settled.forEach((result, index) => {
    if (result.ok) imageParts.push(result.value);
    else {
      unavailable.add(index);
      console.warn(`[intake] reference ${index} unavailable: ${result.error}`);
    }
  });

  const parts: unknown[] = [
    {
      text: buildIntakePrompt({
        references: args.references,
        roleVocabulary: args.roleVocabulary,
        options: args.options,
        unavailable,
      }),
    },
    ...imageParts,
  ];

  const geminiStarted = Date.now();
  const response = await args.ai.models.generateContent({
    model: GEMINI_ANALYSIS_MODEL,
    contents: [{ role: "user", parts }] as any,
    config: {
      responseMimeType: "application/json",
      responseSchema: INTAKE_SCHEMA as any,
      maxOutputTokens: 8192,
      temperature: 0,
      // Recognition/extraction workload — keep reasoning minimal so intake is fast.
      thinkingConfig: { thinkingLevel: "low" },
    },
  });
  const geminiMs = Date.now() - geminiStarted;

  return {
    intake: JSON.parse((response.text ?? "").trim()),
    // Re-used by the fused knowledge-map pass so references are fetched ONCE.
    imageParts,
    unavailable,
    timings: { referenceFetchMs, geminiMs, unavailableReferences: [...unavailable] },
  };
}

/* ------------------------------------------------------------------ *
 * PRODUCT KNOWLEDGE MAP — one fused engineering understanding
 * ------------------------------------------------------------------ *
 * ANALYSIS ONLY. Forms a single reconciled understanding of the replacement
 * piece from ALL replacement evidence (CAD + product photos + macro shots +
 * product-video keyframes) instead of reading each asset independently.
 * Nothing here generates or modifies media, and nothing here changes how
 * references are routed to the image model.
 */

const PKM_VERSION = "jewelry-knowledge-map-v2";

const CONFIDENCE = { type: Type.NUMBER } as const;

/**
 * PROVENANCE — how a geometry / stone / setting claim was established.
 * Only the first five may ever become a HARD Nano constraint;
 * LOW_CONFIDENCE_INFERENCE is advisory-only, forever.
 */
const PROVENANCE_VALUES = [
  "DIRECTLY_OBSERVED",
  "CROSS_VIEW_CONFIRMED",
  "CAD_CONFIRMED",
  "REPEATED_MODULE_INFERRED",
  "USER_CONFIRMED",
  "LOW_CONFIDENCE_INFERENCE",
] as const;

const HARD_LOCK_PROVENANCE = new Set<string>([
  "DIRECTLY_OBSERVED",
  "CROSS_VIEW_CONFIRMED",
  "CAD_CONFIRMED",
  "REPEATED_MODULE_INFERRED",
  "USER_CONFIRMED",
]);

const PROVENANCE = { type: Type.STRING, enum: [...PROVENANCE_VALUES] } as const;

/**
 * True only when a claim may be stated to the image model as a hard fact.
 * Maps produced before provenance existed carry none, and stay lockable so
 * cached v1 analyses keep behaving exactly as they do today.
 */
function lockable(provenance: unknown) {
  if (provenance === undefined || provenance === null || provenance === "") return true;
  return HARD_LOCK_PROVENANCE.has(String(provenance));
}


/** Per-attribute evidence strength (0..1) — replaces any global "good photo" score. */
const EVIDENCE_STRENGTH = {
  type: Type.OBJECT,
  properties: {
    silhouette: CONFIDENCE,
    dimensions: CONFIDENCE,
    stoneCut: CONFIDENCE,
    stoneSize: CONFIDENCE,
    stonePlacement: CONFIDENCE,
    settingMechanics: CONFIDENCE,
    metalColor: CONFIDENCE,
    componentGeometry: CONFIDENCE,
    manufacturedAppearance: CONFIDENCE,
  },
} as const;

/**
 * SETTING ONTOLOGY — engineering signatures, not prose. Classification compares
 * OBSERVED construction against these; the ontology is data, extensible, and
 * contains no product-type branching whatsoever.
 */
type SettingOntologyEntry = {
  canonicalName: string;
  aliases: string[];
  expectedStoneSizePattern: string;
  expectedCuts: string[];
  expectedPackingPattern: string;
  expectedProngBehavior: string;
  expectedMetalVisibility: string;
  expectedRows: string;
  expectedOrientationBehavior: string;
  compatibleSurfaceGeometry: string[];
};

const SETTING_ONTOLOGY: SettingOntologyEntry[] = [
  {
    canonicalName: "Mosaic",
    aliases: ["mosaic set", "cluster mosaic", "puzzle set"],
    expectedStoneSizePattern: "mixed sizes fitted to a tiled field, or one repeated size tiled edge-to-edge",
    expectedCuts: ["round_brilliant", "baguette", "princess", "custom", "mixed"],
    expectedPackingPattern: "tiled/interlocking fill following the surface outline, minimal gaps, no straight repeating rows",
    expectedProngBehavior: "few or no visible prongs; stones retained by shared metal walls or beads at junctions",
    expectedMetalVisibility: "very low between stones, visible only at field boundaries",
    expectedRows: "no regular row structure",
    expectedOrientationBehavior: "orientation varies per tile to close gaps",
    compatibleSurfaceGeometry: ["flat", "convex", "curved", "irregular", "letter/plaque"],
  },
  {
    canonicalName: "Reverse Mosaic",
    aliases: ["inverted mosaic", "negative mosaic"],
    expectedStoneSizePattern: "tiled field with the metal forming the figure and stones the ground (or vice versa)",
    expectedCuts: ["round_brilliant", "baguette", "custom", "mixed"],
    expectedPackingPattern: "tiled fill with deliberate metal negative-space motif",
    expectedProngBehavior: "shared walls; beads at junctions",
    expectedMetalVisibility: "moderate — the metal pattern is intentional",
    expectedRows: "no regular row structure",
    expectedOrientationBehavior: "orientation follows the negative-space motif",
    compatibleSurfaceGeometry: ["flat", "convex", "letter/plaque"],
  },
  {
    canonicalName: "Micro Pavé",
    aliases: ["micropave", "micro pave"],
    expectedStoneSizePattern: "uniform, very small stones (physically uniform after perspective normalization)",
    expectedCuts: ["round_brilliant"],
    expectedPackingPattern: "dense honeycomb of tiny stones, regular spacing",
    expectedProngBehavior: "tiny shared beads between stones",
    expectedMetalVisibility: "minimal, thin bead walls",
    expectedRows: "regular multi-row or honeycomb",
    expectedOrientationBehavior: "table-up, uniform",
    compatibleSurfaceGeometry: ["flat", "convex", "curved"],
  },
  {
    canonicalName: "Pavé",
    aliases: ["pave", "bright cut pave"],
    expectedStoneSizePattern: "uniform small stones",
    expectedCuts: ["round_brilliant"],
    expectedPackingPattern: "regular dense rows or honeycomb",
    expectedProngBehavior: "shared beads, 2–4 per stone",
    expectedMetalVisibility: "low",
    expectedRows: "regular rows",
    expectedOrientationBehavior: "table-up, uniform",
    compatibleSurfaceGeometry: ["flat", "convex", "curved"],
  },
  {
    canonicalName: "Bead Set",
    aliases: ["bead setting", "grain set"],
    expectedStoneSizePattern: "uniform or lightly graduated",
    expectedCuts: ["round_brilliant"],
    expectedPackingPattern: "individually beaded seats with visible metal between stones",
    expectedProngBehavior: "discrete raised beads per stone, not shared",
    expectedMetalVisibility: "moderate",
    expectedRows: "single or multi row",
    expectedOrientationBehavior: "table-up",
    compatibleSurfaceGeometry: ["flat", "convex"],
  },
  {
    canonicalName: "Prong Set",
    aliases: ["claw set", "basket set"],
    expectedStoneSizePattern: "individual larger stones, sizes may differ",
    expectedCuts: ["round_brilliant", "oval", "pear", "emerald", "cushion", "marquise", "princess"],
    expectedPackingPattern: "discrete stones with open metal between them",
    expectedProngBehavior: "3–6 distinct prongs per stone, tips over the crown",
    expectedMetalVisibility: "high; open gallery underneath",
    expectedRows: "none required",
    expectedOrientationBehavior: "per-stone, aligned to its seat",
    compatibleSurfaceGeometry: ["flat", "convex", "open gallery"],
  },
  {
    canonicalName: "Shared Prong",
    aliases: ["common prong", "shared claw"],
    expectedStoneSizePattern: "uniform along a run",
    expectedCuts: ["round_brilliant", "princess"],
    expectedPackingPattern: "continuous line of stones sharing prongs between neighbours",
    expectedProngBehavior: "one prong retains two adjacent stones",
    expectedMetalVisibility: "low between stones, visible prong tips",
    expectedRows: "single continuous row",
    expectedOrientationBehavior: "aligned along the run",
    compatibleSurfaceGeometry: ["curved", "linear run"],
  },
  {
    canonicalName: "Channel Set",
    aliases: ["channel setting"],
    expectedStoneSizePattern: "uniform within the channel",
    expectedCuts: ["round_brilliant", "princess", "baguette"],
    expectedPackingPattern: "stones held between two continuous metal rails, touching, no prongs",
    expectedProngBehavior: "no prongs; rails compress the girdles",
    expectedMetalVisibility: "two parallel rails only",
    expectedRows: "one row per channel",
    expectedOrientationBehavior: "uniform along the channel axis",
    compatibleSurfaceGeometry: ["linear run", "curved", "flat"],
  },
  {
    canonicalName: "Baguette Channel",
    aliases: ["baguette channel set", "step channel"],
    expectedStoneSizePattern: "uniform or tapered baguettes",
    expectedCuts: ["baguette", "tapered_baguette", "emerald"],
    expectedPackingPattern: "rectangular stones abutting inside rails, long edges parallel",
    expectedProngBehavior: "no prongs; rails only",
    expectedMetalVisibility: "rails plus end walls",
    expectedRows: "one row per channel",
    expectedOrientationBehavior: "long axis perpendicular or parallel to the run, consistently",
    compatibleSurfaceGeometry: ["linear run", "curved"],
  },
  {
    canonicalName: "Bezel",
    aliases: ["bezel set", "rub over"],
    expectedStoneSizePattern: "individual stones",
    expectedCuts: ["round_brilliant", "oval", "emerald", "cushion", "cabochon", "custom"],
    expectedPackingPattern: "each stone fully surrounded by a continuous metal collar",
    expectedProngBehavior: "no prongs; collar rubbed over the girdle",
    expectedMetalVisibility: "high — continuous rim per stone",
    expectedRows: "none required",
    expectedOrientationBehavior: "per-stone",
    compatibleSurfaceGeometry: ["flat", "convex", "irregular"],
  },
  {
    canonicalName: "Invisible Set",
    aliases: ["invisible setting", "mystery set"],
    expectedStoneSizePattern: "uniform squares/rectangles",
    expectedCuts: ["princess", "baguette"],
    expectedPackingPattern: "stones abutting with NO visible metal between them, grooved girdles on a hidden rail",
    expectedProngBehavior: "none visible",
    expectedMetalVisibility: "none between stones; only outer frame",
    expectedRows: "grid",
    expectedOrientationBehavior: "grid-aligned",
    compatibleSurfaceGeometry: ["flat", "convex"],
  },
  {
    canonicalName: "Flush/Gypsy",
    aliases: ["flush set", "gypsy set", "burnish set"],
    expectedStoneSizePattern: "individual or scattered",
    expectedCuts: ["round_brilliant"],
    expectedPackingPattern: "stones sunk level with the metal surface, no raised metal",
    expectedProngBehavior: "burnished metal edge, no prongs or beads",
    expectedMetalVisibility: "the whole surface is metal",
    expectedRows: "none required",
    expectedOrientationBehavior: "table flush with the surface",
    compatibleSurfaceGeometry: ["flat", "convex", "curved"],
  },
  {
    canonicalName: "Custom/Unknown",
    aliases: ["custom", "hybrid", "unclear"],
    expectedStoneSizePattern: "as observed",
    expectedCuts: ["custom", "mixed", "unclear"],
    expectedPackingPattern: "as observed — use when construction matches no single signature",
    expectedProngBehavior: "as observed",
    expectedMetalVisibility: "as observed",
    expectedRows: "as observed",
    expectedOrientationBehavior: "as observed",
    compatibleSurfaceGeometry: ["any"],
  },
];

/** Extensible cut vocabulary — a low-confidence custom stone stays custom. */
const CUT_VALUES = [
  "round_brilliant",
  "baguette",
  "tapered_baguette",
  "emerald",
  "princess",
  "cushion",
  "pear",
  "marquise",
  "oval",
  "heart",
  "trillion",
  "kite",
  "asscher",
  "radiant",
  "rose_cut",
  "cabochon",
  "custom",
  "unclear",
] as const;


const PKM_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    productType: { type: Type.STRING },
    productTypeConfidence: CONFIDENCE,
    dimensions: {
      type: Type.OBJECT,
      properties: {
        summary: { type: Type.STRING },
        scaleSource: {
          type: Type.STRING,
          enum: [
            "cad_dimensions",
            "spec_sheet",
            "user_entered",
            "known_stone_size",
            "repeated_structural_dimension",
            "photographic_estimate",
            "none",
          ],
        },
        measurementBasis: { type: Type.STRING, enum: ["estimated", "measured_from_authority"] },
        relativeRatios: STRING_ARRAY,
        /**
         * SCALE PROVENANCE: an exact millimetre claim and a "uniform size"
         * claim are DIFFERENT claims and are stored separately.
         */
        scaleClaims: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              claim: { type: Type.STRING },
              appliesTo: { type: Type.STRING },
              basis: {
                type: Type.STRING,
                enum: [
                  "measured_from_spec",
                  "measured_from_cad",
                  "user_specified",
                  "derived_from_known_stone",
                  "derived_from_repeated_geometry",
                  "visually_estimated",
                ],
              },
              provenance: PROVENANCE,
              confidence: CONFIDENCE,
            },
            required: ["claim", "basis", "provenance", "confidence"],
          },
        },
        provenance: PROVENANCE,
        confidence: CONFIDENCE,
      },
      required: ["scaleSource", "measurementBasis", "confidence"],
    },

    components: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          componentId: { type: Type.STRING },
          label: { type: Type.STRING },
          role: { type: Type.STRING },
          geometry: { type: Type.STRING },
          repeatModuleId: { type: Type.STRING },
          connectedTo: STRING_ARRAY,
          confidence: CONFIDENCE,
          evidenceReferenceIds: STRING_ARRAY,
          inferredFromCAD: { type: Type.BOOLEAN },
          inferredFromSymmetry: { type: Type.BOOLEAN },
          provenance: PROVENANCE,

        },
        required: ["componentId", "label", "geometry", "confidence", "evidenceReferenceIds"],
      },
    },
    regions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          regionId: { type: Type.STRING },
          componentId: { type: Type.STRING },
          label: { type: Type.STRING },
          surfaceType: { type: Type.STRING },
          confidence: CONFIDENCE,
        },
        required: ["regionId", "componentId", "label", "confidence"],
      },
    },
    referenceCatalog: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          referenceId: { type: Type.STRING },
          kind: {
            type: Type.STRING,
            enum: ["cad", "photographic_still", "product_reference_video", "unclear"],
          },
          authorityFor: STRING_ARRAY,
          notAuthorityFor: STRING_ARRAY,
          /** ATTRIBUTE-SPECIFIC strength 0..1 — never one global rating. */
          evidenceStrength: EVIDENCE_STRENGTH,
          captureIssues: STRING_ARRAY,
          confidence: CONFIDENCE,
        },
        required: ["referenceId", "kind", "authorityFor", "evidenceStrength", "confidence"],
      },
    },
    repeatedModules: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          repeatModuleId: { type: Type.STRING },
          /** The reconstructed MASTER instance every matching module inherits. */
          masterModuleId: { type: Type.STRING },
          componentIds: STRING_ARRAY,
          memberComponentIds: STRING_ARRAY,
          masterGeometry: { type: Type.STRING },
          masterStoneMap: { type: Type.STRING },
          /** Where the master was reconstructed from (clearest instances/CAD). */
          masterEvidenceReferenceIds: STRING_ARRAY,
          repeatCount: { type: Type.NUMBER },
          exceptions: STRING_ARRAY,
          exceptionComponentIds: STRING_ARRAY,
          provenance: PROVENANCE,
          confidence: CONFIDENCE,
        },
        required: ["repeatModuleId", "masterModuleId", "masterGeometry", "provenance", "confidence"],
      },
    },

    stones: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          stoneId: { type: Type.STRING },
          /**
           * CROSS-VIEW REGISTRATION: several per-reference observations of the
           * SAME real stone share one physicalStoneId. One physical stone is
           * NEVER counted once per photo.
           */
          physicalStoneId: { type: Type.STRING },
          observedInReferenceId: { type: Type.STRING },
          componentId: { type: Type.STRING },
          regionId: { type: Type.STRING },
          cut: { type: Type.STRING, enum: [...CUT_VALUES] },
          /** Physical class AFTER perspective normalization. */
          relativeSizeClass: {
            type: Type.STRING,
            enum: ["anchor", "large", "medium", "small", "filler", "unclear"],
          },
          /** Raw on-image class BEFORE normalization (perspective artefact). */
          apparentSizeClass: {
            type: Type.STRING,
            enum: ["anchor", "large", "medium", "small", "filler", "unclear"],
          },
          perspectiveNormalized: { type: Type.BOOLEAN },
          normalizedPosition: {
            type: Type.OBJECT,
            properties: { x: { type: Type.NUMBER }, y: { type: Type.NUMBER } },
          },
          orientation: { type: Type.STRING },
          seatDepthClass: {
            type: Type.STRING,
            enum: ["flush", "shallow", "medium", "deep", "unclear"],
          },
          neighbors: STRING_ARRAY,
          apparentSettingType: { type: Type.STRING },
          provenance: PROVENANCE,
          confidence: CONFIDENCE,
          evidenceReferenceIds: STRING_ARRAY,
        },
        required: ["stoneId", "regionId", "cut", "relativeSizeClass", "confidence"],
      },
    },
    /**
     * One entry per RECONCILED physical stone — the cross-view fusion of the
     * per-reference `stones[]` observations that share its physicalStoneId.
     * Confidence RISES with the number of independently agreeing views.
     */
    physicalStones: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          physicalStoneId: { type: Type.STRING },
          componentId: { type: Type.STRING },
          regionId: { type: Type.STRING },
          repeatModuleId: { type: Type.STRING },
          cut: { type: Type.STRING, enum: [...CUT_VALUES] },
          physicalSizeClass: {
            type: Type.STRING,
            enum: ["anchor", "large", "medium", "small", "filler", "unclear"],
          },
          normalizedPosition: {
            type: Type.OBJECT,
            properties: { x: { type: Type.NUMBER }, y: { type: Type.NUMBER } },
          },
          orientation: { type: Type.STRING },
          seatDepthClass: {
            type: Type.STRING,
            enum: ["flush", "shallow", "medium", "deep", "unclear"],
          },
          neighbors: STRING_ARRAY,
          observationIds: STRING_ARRAY,
          evidenceReferenceIds: STRING_ARRAY,
          /** How many independent references agree on this reconciliation. */
          agreementCount: { type: Type.NUMBER },
          conflictingEvidence: STRING_ARRAY,
          provenance: PROVENANCE,
          confidence: CONFIDENCE,
        },
        required: ["physicalStoneId", "regionId", "cut", "physicalSizeClass", "provenance", "confidence"],
      },
    },

    stoneGroups: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          regionId: { type: Type.STRING },
          componentId: { type: Type.STRING },
          count: { type: Type.NUMBER },
          sizeClasses: STRING_ARRAY,
          minSizeClass: { type: Type.STRING },
          medianSizeClass: { type: Type.STRING },
          maxSizeClass: { type: Type.STRING },
          anchorToFillerRatio: { type: Type.STRING },
          repeatPattern: { type: Type.STRING },
          gradient: { type: Type.STRING },
          measurementBasis: { type: Type.STRING, enum: ["estimated", "measured_from_authority"] },
          /** PERSPECTIVE-NORMALIZED sizing — apparent ≠ physical. */
          sizeUniformity: {
            type: Type.STRING,
            enum: ["uniform", "mixed", "graduated", "unclear"],
          },
          physicalSizeDifference: { type: Type.BOOLEAN },
          apparentSizeDifference: { type: Type.BOOLEAN },
          perspectiveNormalizationBasis: { type: Type.STRING },
          provenance: PROVENANCE,
          confidence: CONFIDENCE,

        },
        required: ["regionId", "count", "measurementBasis", "confidence"],
      },
    },
    settings: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          componentId: { type: Type.STRING },
          regionId: { type: Type.STRING },
          settingClassificationReason: { type: Type.STRING },
          canonicalSetting: { type: Type.STRING },
          settingVisualSignature: { type: Type.STRING },
          evidenceReferenceIds: STRING_ARRAY,
          provenance: PROVENANCE,
          /** How the OBSERVED construction scored against the ontology entry. */
          ontologyMatch: {
            type: Type.OBJECT,
            properties: {
              canonicalName: { type: Type.STRING },
              matchedSignals: STRING_ARRAY,
              deviatingSignals: STRING_ARRAY,
              score: CONFIDENCE,
            },
          },
          confidence: CONFIDENCE,
        },

        required: [
          "regionId",
          "settingClassificationReason",
          "canonicalSetting",
          "settingVisualSignature",
          "confidence",
        ],
      },
    },
    materialRegions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          regionId: { type: Type.STRING },
          componentId: { type: Type.STRING },
          metalColor: { type: Type.STRING },
          karat: { type: Type.STRING },
          karatEvidence: { type: Type.STRING },
          finish: { type: Type.STRING },
          capturedEnvironmentTint: { type: Type.STRING },
          confidence: CONFIDENCE,
        },
        required: ["regionId", "metalColor", "confidence"],
      },
    },
    constructionConflicts: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          topic: { type: Type.STRING },
          cadClaim: { type: Type.STRING },
          photoClaim: { type: Type.STRING },
          resolution: { type: Type.STRING },
        },
        required: ["topic", "resolution"],
      },
    },
    inferredFeatures: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          feature: { type: Type.STRING },
          basis: {
            type: Type.STRING,
            enum: ["inferredFromCAD", "inferredFromSymmetry", "inferredFromOtherView", "weak"],
          },
          confidence: CONFIDENCE,
        },
        required: ["feature", "basis", "confidence"],
      },
    },
    unresolvedFeatures: STRING_ARRAY,
    /** Jeweler STYLE slang only — never engineering, never a setting name. */
    styleDescriptors: STRING_ARRAY,
    /**
     * AGENTIC EVIDENCE-SEEKING: what was still open after the first pass, and
     * whether the EXISTING reference set already answered it.
     */
    evidenceGaps: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          attribute: { type: Type.STRING },
          resolvedFromExistingEvidence: { type: Type.BOOLEAN },
          resolutionEvidenceReferenceIds: STRING_ARRAY,
          resolutionMethod: {
            type: Type.STRING,
            enum: [
              "other_still",
              "other_video_keyframe",
              "repeated_module",
              "cad",
              "symmetry",
              "not_resolved",
            ],
          },
          requestedUserReference: { type: Type.STRING },
          note: { type: Type.STRING },
        },
        required: ["attribute", "resolvedFromExistingEvidence", "resolutionMethod"],
      },
    },

    coverage: {
      type: Type.OBJECT,
      properties: {
        geometry: { type: Type.STRING, enum: ["excellent", "good", "partial", "weak"] },
        stoneLayout: { type: Type.STRING, enum: ["excellent", "good", "partial", "weak"] },
        setting: { type: Type.STRING, enum: ["excellent", "good", "partial", "weak"] },
        clasp: { type: Type.STRING, enum: ["excellent", "good", "partial", "weak", "not_applicable"] },
      },
      required: ["geometry", "stoneLayout", "setting", "clasp"],
    },
    videoAnalyses: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          referenceId: { type: Type.STRING },
          productIdentityEvidence: { type: Type.STRING },
          geometryEvidence: { type: Type.STRING },
          materialEvidence: { type: Type.STRING },
          stoneEvidence: { type: Type.STRING },
          settingEvidence: { type: Type.STRING },
          keyframes: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                referenceId: { type: Type.STRING },
                detectedView: { type: Type.STRING },
                coverage: {
                  type: Type.STRING,
                  enum: ["full_object", "partial_object", "macro_detail", "unclear"],
                },
                regionsVisible: STRING_ARRAY,
                usableFor: STRING_ARRAY,
                contextRisk: STRING_ARRAY,
                disposableContext: STRING_ARRAY,
                confidence: CONFIDENCE,
              },
              required: ["referenceId", "detectedView", "coverage", "confidence"],
            },
          },
        },
        required: ["referenceId", "productIdentityEvidence", "keyframes"],
      },
    },
  },
  required: ["productType", "components", "regions", "coverage"],
} as const;

function buildKnowledgeMapPrompt(args: {
  references: JewelryReferenceInput[];
  videoReferences: VideoReferenceInput[];
  intake: any;
  options: IntakeOptions;
  unavailable: Set<number>;
  /** USER_CONFIRMED facts — Gemini may never override these. */
  userConfirmedFacts?: UserConfirmedFact[];
}) {

  const refLines = args.references.map((ref, index) => {
    const id = referenceIdAt(index);
    const clip = ref.videoReferenceId
      ? ` — PRODUCT VIDEO KEYFRAME from clip "${ref.videoReferenceId}"${
        Number.isFinite(Number(ref.timestamp)) ? ` at ${Number(ref.timestamp).toFixed(2)}s` : ""
      }`
      : "";
    return `${id} (index ${index}) — kind: ${ref.kind ?? "photographic_still"}${
      ref.role ? `; user label "${ref.role}"` : ""
    }${ref.cad ? "; user marked DESIGN AUTHORITY" : ""}${clip}${
      args.unavailable.has(index) ? " — IMAGE UNAVAILABLE (skip entirely)" : ""
    }`;
  });

  const clipLines = args.videoReferences.map((clip) =>
    `CLIP "${clip.videoReferenceId}": ${clip.duration.toFixed(2)}s, ${clip.keyframeCount} keyframes sampled${
      clip.aspectRatio ? `, ${clip.aspectRatio}` : ""
    }`
  );

  const products = Array.isArray(args.intake?.products) ? args.intake.products : [];
  const confirmedSpec = products.map((product: any, index: number) =>
    `PIECE ${index + 1}: type ${detectedValue(product?.jewelryType) || "?"}; metal ${
      detectedValue(product?.metal) || "?"
    }; stone ${detectedValue(product?.stoneType) || "?"}; components ${
      listOf(product?.visibleComponents).join(", ") || "?"
    }`
  );

  return [
    "You are a jewelry ENGINEERING analyst. This is ANALYSIS ONLY: return JSON only, never an image, never a video, never a URL, never bytes. You never generate or modify jewelry.",
    "",
    "ASSET FIREWALL: every image below is a REPLACEMENT_PRODUCT_REFERENCE — evidence of the ACTUAL replacement piece (geometry / material / stone / setting / component authority). None of them is source cinematography, and you are given NO source footage: never describe camera work of a shoot, only the physical product.",
    "",
    "REPLACEMENT EVIDENCE, in this exact order (images follow this text):",
    ...refLines,
    clipLines.length ? "" : "",
    ...clipLines,
    "",
    "ALREADY-RECOGNISED INTAKE (reconcile with it, do not contradict it without stating a conflict):",
    ...(confirmedSpec.length ? confirmedSpec : ["(none)"]),
    "",
    "USER_CONFIRMED FACTS — these are FINAL. Never contradict, soften, re-derive or override them; every claim that depends on one carries provenance USER_CONFIRMED. They apply to ANY jewelry type:",
    ...((args.userConfirmedFacts ?? []).length
      ? (args.userConfirmedFacts ?? []).map((fact) =>
        `- ${fact.attribute}: ${fact.value}${fact.appliesTo ? ` (applies to ${fact.appliesTo})` : ""}`
      )
      : ["(none)"]),
    "",
    "AUTHORITY ORDER (attribute-specific — one asset can be authority for some attributes and not others):",
    "USER_CONFIRMED > CONFIRMED STRUCTURED SPEC > relevant CAD / design geometry > high-confidence product-video evidence > photographic analysis > weak inference.",

    "Use CAD for silhouette, dimensions, placement, seat depth and topology. Use photos and video keyframes for real stone sizes, prong/bead reality, polish, finish and packing density. When CAD and photography genuinely disagree, record a constructionConflict with a resolution — NEVER silently average them.",
    "",
    "TASKS — build ONE fused Product Knowledge Map for the replacement piece(s):",
    "1. TOPOLOGY FIRST. Discover the components that actually exist and give each a persistent componentId (C1, C2, …). Evidence from different views must attach to the SAME componentId. Never assume a piece type or a component that is not visible: this must work for pendants, rings, watches, Cuban chains, tennis chains, bracelets, earrings, grillz, charms and complex mechanical jewelry alike. Then define regions (R1, R2, …) on those components.",
    "2. REPEAT MODULES. When a structure repeats (links, rows, segments), define ONE master module (geometry + master stone map + repeat count) and list only the genuine exceptions (terminal link, clasp, hinge). Do NOT re-describe every repetition independently.",
    "3. STONE MAP. Where resolution supports it, emit stone-by-stone observations (stoneId S1…, componentId, regionId, cut, relativeSizeClass, normalizedPosition 0..1 within its region, orientation, seatDepthClass, neighbors, apparentSettingType, confidence, evidenceReferenceIds). Also emit per-region stoneGroups: count, size classes, min/median/max, anchor-vs-filler ratio, repeat pattern, gradient. If resolution does not support individual stones in a region, emit the group only.",
    "4. MULTI-VIEW TRIANGULATION. A feature seen in several references is ONE physical feature — register it once and cite every reference as evidence. Never triple-count the same stone or seat across views.",
    "5. OCCLUSION. Never invent hidden geometry. Infer a hidden feature only from CAD, another view, or genuine symmetry, and record it in inferredFeatures with basis inferredFromCAD / inferredFromSymmetry / inferredFromOtherView. Anything you cannot establish goes in unresolvedFeatures.",
    "6. SCALE. Never state exact millimetres without scale evidence. Scale priority: explicit CAD dimensions > spec sheet > user-entered dimensions > known stone-size labels > repeated structural dimensions > photographic estimate. Prefer relative ratios (\"anchor stones ≈ 2.2x filler stones\") and set measurementBasis to measured_from_authority ONLY when a real dimension was readable; otherwise estimated.",
    "7. SETTINGS AFTER THE STONE MAP. Classify construction from prong count, shared prongs, beads, rails, bezels, channels, seat depth, metal visibility and packing — never from visual density alone. Give settingClassificationReason FIRST, then map to one of the app's canonical settings: " +
    (args.options.settingTypes.join(" | ") || "(none supplied)") +
    ". If the construction does not clearly match exactly one canonical value, return \"needs_confirmation\" with confidence below 0.45. Dense small-stone coverage is NOT evidence for a pavé-family setting, and a reason describing mixed anchor+filler sizing FORBIDS any uniform-only setting.",
    "8. MATERIALS. Separate the stone's real material from captured environment tint: colourless stones photographed under rose gold or warm light are still colourless — record the tint in capturedEnvironmentTint. Metal COLOUR is separate from karat: never claim 10K/14K/18K without explicitly readable evidence (leave karat empty and say so in karatEvidence). Never hallucinate a clarity grade (FL/VVS/VS/SI) — without a certificate or readable text it stays unresolved.",
    "9. PRODUCT VIDEO EVIDENCE. For each CLIP, summarise what the clip establishes (product identity, geometry, material, stone, setting) and describe each of its keyframes: detectedView, coverage, regionsVisible, usableFor, contextRisk and disposableContext (hands, gloves, trays, busts, other jewelry, backgrounds — context that must NEVER enter a generated composition).",
    "10. GRANULAR CONFIDENCE. Every entry carries its OWN confidence 0..1 — never one global score. Low-confidence details must stay low: they are advisory only and must never read like a hard instruction.",
    "11. COVERAGE. Rate how well the evidence covers geometry, stoneLayout, setting and clasp (excellent | good | partial | weak; clasp may be not_applicable).",
    "",
    "RECONSTRUCTION ORDER — the setting NAME is the OUTPUT of physical reconstruction, never the starting question. Observe all evidence -> identify components -> register the same component/stone across views -> map stones -> estimate relative size, cut and position -> find repeating patterns -> infer how stones are physically RETAINED -> only THEN classify the setting.",
    "These references are typically high-detail custom / hip-hop jewelry shot under bad conditions: phone video, messaging-app compression, scintillation, blown highlights, shallow depth of field, black gloves, motion blur, partial and overlapping views. Never trust a single hero photo — the point of multiple references is to recover what any one of them leaves ambiguous. Deterministic crop, resize and contrast reasoning is fine; never treat invented or upscaled detail as ground truth — the original reference is the authority.",
    "",
    "12. CROSS-VIEW REGISTRATION (most important). The same physical stone or component usually appears in several references. Register those observations into ONE hypothesis using component location, neighbours, cut, relative size, orientation, edge distances, repeated geometry and CAD seats. Emit stones[] as PER-REFERENCE observations (each with observedInReferenceId) and give every observation of the same real stone the SAME physicalStoneId, then emit ONE physicalStones[] entry per real stone with observationIds, evidenceReferenceIds and agreementCount. Confidence RISES as independent views agree. Never count one physical stone once per photo; never report a total stone count inflated by multiple views.",
    "13. REPEATED-MODULE RECOVERY. Identify master modules (Cuban link, tennis link, chain link, watch link, repeated letter border, halo section). Reconstruct the MASTER geometry and master stone map from the CLEAREST instances across ALL references (and CAD), record masterModuleId, masterEvidenceReferenceIds, memberComponentIds and repeatCount, then treat that master as the authority for every matching module — a stone obscured on link 4 is RECOVERED from the clearly visible identical link 8 or from CAD (provenance REPEATED_MODULE_INFERRED). Identical modules are never unrelated, and never hallucinate each one independently. List genuine exceptions (terminal link, clasp link, hinge) with exceptionComponentIds.",
    "14. PERSPECTIVE-NORMALIZED SIZING. NEVER classify stone-size distribution from raw pixel diameter. A stone farther from the camera, on a turned link, or near a curved edge LOOKS smaller — that is perspective, not a new size class. Normalize apparent size using local component perspective, known CAD geometry, repeated calibrated modules, relative depth and agreement across views. Record apparentSizeClass (raw) separately from relativeSizeClass / physicalSizeClass (normalized), set perspectiveNormalized, and on each stoneGroup set sizeUniformity, physicalSizeDifference, apparentSizeDifference and perspectiveNormalizationBasis. Report multiple size classes ONLY when they survive normalization; otherwise report uniform size and state the evidence.",
    "15. ATTRIBUTE-SPECIFIC EVIDENCE STRENGTH. For every referenceCatalog entry score evidenceStrength 0..1 per attribute: silhouette, dimensions, stoneCut, stoneSize, stonePlacement, settingMechanics, metalColor, componentGeometry, manufacturedAppearance. A blurry full shot can be strong for silhouette and useless for prongs; a macro can be strong for stone distribution and useless for overall dimensions. Answer each physical question from the reference(s) strongest for THAT attribute, and cite them in evidenceReferenceIds.",
    "16. PROVENANCE. Every important geometry, stone, setting, scale and module claim carries provenance: DIRECTLY_OBSERVED | CROSS_VIEW_CONFIRMED | CAD_CONFIRMED | REPEATED_MODULE_INFERRED | USER_CONFIRMED | LOW_CONFIDENCE_INFERENCE. Mark anything you could not actually establish as LOW_CONFIDENCE_INFERENCE — it will be treated as advisory only and can never become a hard physical constraint.",
    "17. SETTING ONTOLOGY. Compare the OBSERVED construction against the engineering signatures below and fill ontologyMatch with the best-matching canonicalName, matchedSignals, deviatingSignals and a score. Give settingClassificationReason FIRST, and keep it consistent with the enum you choose. A uniform, perspective-explained field must NOT be classified as a mixed-size setting, and a mixed-size field must NOT be classified as a uniform pavé-family setting. If no single signature matches, use Custom/Unknown or needs_confirmation with confidence below 0.45.",
    "SETTING SIGNATURES:",
    ...SETTING_ONTOLOGY.map((entry) =>
      `- ${entry.canonicalName} (aliases: ${entry.aliases.join(", ")}): sizes ${entry.expectedStoneSizePattern}; cuts ${
        entry.expectedCuts.join("/")
      }; packing ${entry.expectedPackingPattern}; prongs ${entry.expectedProngBehavior}; metal ${entry.expectedMetalVisibility}; rows ${entry.expectedRows}; orientation ${entry.expectedOrientationBehavior}; surfaces ${
        entry.compatibleSurfaceGeometry.join("/")
      }`
    ),
    "18. STYLE SLANG SEPARATION. Jeweler style language (\"iced out\", \"fully flooded\", \"VVS look\", \"buster\", \"custom Cuban\") goes ONLY in styleDescriptors. It must never appear in the engineering map, a setting name, a settingClassificationReason or a signature.",
    "19. SCALE CLAIMS. Exact millimetres only with real evidence, priority: explicit user dimensions > CAD / spec > known stone dimensions > repeated calibrated geometry > photographic estimate. Store each claim separately in dimensions.scaleClaims with its basis, e.g. \"1.25mm\" basis measured_from_spec versus \"~1.2-1.5mm\" basis visually_estimated versus \"uniform stone size\" (a uniformity claim is NOT a millimetre claim).",
    "20. CONTRADICTIONS. Never silently merge disagreeing evidence: record it in constructionConflicts (or a physicalStone's conflictingEvidence) and resolve it by ATTRIBUTE authority, stating which reference won for which attribute.",
    "21. AGENTIC EVIDENCE-SEEKING. After forming the map, list every attribute that is still unresolved or low-confidence in evidenceGaps and FIRST try to resolve each one from the EXISTING reference set (other stills, other video keyframes, repeated modules, CAD, symmetry) — set resolvedFromExistingEvidence and resolutionMethod accordingly. Only when the existing evidence is genuinely exhausted set requestedUserReference to a specific, actionable ask (e.g. \"a clasp-side reference would improve accuracy\").",
    "NO PRODUCT-TYPE SHORTCUTS: never infer a setting, component list, stone count or module from the product type or from the piece's name. Everything must come from what the references physically show.",
    "Short phrases only. No prose paragraphs. Never output URLs, file names, base64 or media of any kind.",

  ].filter(Boolean).join("\n");
}

/** ONE extra analysis call, reusing the already-inlined reference images. */
async function runKnowledgeMap(args: {
  ai: GoogleGenAI;
  imageParts: unknown[];
  references: JewelryReferenceInput[];
  videoReferences: VideoReferenceInput[];
  intake: any;
  options: IntakeOptions;
  unavailable: Set<number>;
  userConfirmedFacts?: UserConfirmedFact[];
}) {
  const started = Date.now();
  const response = await args.ai.models.generateContent({
    model: GEMINI_ANALYSIS_MODEL,
    contents: [
      {
        role: "user",
        parts: [
          { text: buildKnowledgeMapPrompt(args) },
          ...args.imageParts,
        ],
      },
    ] as any,
    config: {
      responseMimeType: "application/json",
      responseSchema: PKM_SCHEMA as any,
      maxOutputTokens: 24576,
      temperature: 0,
      // Engineering reconciliation genuinely needs reasoning budget.
      thinkingConfig: { thinkingLevel: "medium" },
    },
  });
  const map = JSON.parse((response.text ?? "").trim());
  map.version = PKM_VERSION;
  // The user's confirmations are persisted with the map and win forever.
  map.userConfirmedFacts = args.userConfirmedFacts ?? [];
  // The ontology travels with the map so the admin panel and any later
  // classification compare against the SAME signatures.
  map.settingOntology = SETTING_ONTOLOGY.map((entry) => entry.canonicalName);
  return { knowledgeMap: applyUserConfirmedFacts(map, args.userConfirmedFacts ?? []), geminiMs: Date.now() - started };
}

/**
 * Enforces the USER_CONFIRMED layer after the fact: any map entry whose
 * attribute the user has locked is re-stamped USER_CONFIRMED at full
 * confidence, so no Gemini pass can quietly demote it.
 */
function applyUserConfirmedFacts(map: any, facts: UserConfirmedFact[]) {
  if (!facts.length || !map || typeof map !== "object") return map;
  const locked = new Set(facts.map((fact) => fact.attribute.toLowerCase()));

  const lock = (entry: any) => {
    if (!entry || typeof entry !== "object") return;
    entry.provenance = "USER_CONFIRMED";
    entry.confidence = 1;
    entry.needsConfirmation = false;
  };

  if (locked.has("setting")) for (const setting of arrayOf(map.settings)) lock(setting);
  if (locked.has("stone_size") || locked.has("stone_sizes")) {
    for (const group of arrayOf(map.stoneGroups)) lock(group);
  }
  if (locked.has("metal")) for (const region of arrayOf(map.materialRegions)) lock(region);
  if (locked.has("dimensions") && map.dimensions) lock(map.dimensions);
  return map;
}

function arrayOf(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}




/**
 * Stamps provenance AND resolves every detected field onto the app's canonical
 * enums, so "Auto from reference" can become a real value downstream. Each
 * field gets: resolvedValue (canonical or ""), confidenceTier and source.
 */
function stampSources(intake: any, options: IntakeOptions) {
  const fields: [string, string[]][] = [
    ["jewelryType", options.jewelryTypes],
    ["metal", options.metals],
    ["stoneType", options.stones],
    ["stoneColor", options.stoneColors],
    ["stoneQuality", options.qualities],
    ["dimensions", []],
    ["weight", []],
  ];
  for (const product of Array.isArray(intake?.products) ? intake.products : []) {
    const needs = (): string[] =>
      Array.isArray(product.needsConfirmation)
        ? product.needsConfirmation
        : (product.needsConfirmation = []);
    const flag = (field: string) => {
      const list = needs();
      if (!list.includes(field)) list.push(field);
    };

    /**
     * Clarity grades are only trustworthy with explicit readable evidence.
     * Photograph-only reads are demoted to "needs confirmation" and never
     * auto-populate a grade.
     */
    const quality = product?.stoneQuality;
    if (quality && typeof quality === "object") {
      const evidence = String(quality.qualityEvidenceSource ?? "visual_only").trim();
      quality.qualityEvidenceSource = evidence || "visual_only";
      if (!EXPLICIT_QUALITY_EVIDENCE.has(quality.qualityEvidenceSource)) {
        quality.value = "";
        quality.confidence = Math.min(Number(quality.confidence ?? 0), 0.3);
        quality.needsConfirmation = true;
        flag("stoneQuality");
      }
    }

    for (const [field, vocabulary] of fields) {
      const entry = product?.[field];
      if (!entry || typeof entry !== "object") continue;
      const canonical = toCanonical(entry.value, vocabulary);
      const tier = confidenceTier(entry.confidence);
      // Low confidence never auto-populates a control — it only suggests.
      entry.resolvedValue = tier === "low" ? "" : canonical;
      entry.confidenceTier = tier;
      entry.source = canonical ? "gemini_detected" : "unknown";
      if (!entry.resolvedValue) {
        if (String(entry.value ?? "").trim()) flag(field);
      }
    }

    // Regions are type-aware: use the list for the resolved product type when
    // one exists, otherwise validate against every region the app knows.
    const resolvedType = String(product?.jewelryType?.resolvedValue ?? "").toLowerCase();
    const regionKey = Object.keys(options.settingRegions).find((key) =>
      resolvedType.includes(key) || key.includes(resolvedType),
    );
    const regionVocabulary = (regionKey && options.settingRegions[regionKey]) || allRegions(options);

    for (const setting of Array.isArray(product?.settings) ? product.settings : []) {
      const tier = confidenceTier(setting.confidence);
      const raw = String(setting.setting ?? "").trim();
      // The classifier may explicitly decline; that is a valid, honest answer.
      const declined = /needs?[_\s-]?confirmation/i.test(raw) || !raw;
      setting.resolvedRegion = toCanonical(setting.region, regionVocabulary);
      setting.resolvedSetting =
        declined || tier === "low" ? "" : toCanonical(setting.setting, options.settingTypes);
      setting.confidenceTier = tier;
      setting.needsConfirmation = !setting.resolvedSetting;
      setting.source = setting.resolvedSetting ? "gemini_detected" : "unknown";
      if (setting.needsConfirmation) flag("settings");
    }

    for (const ref of Array.isArray(product?.references) ? product.references : []) {
      ref.source = ref?.designAuthorityLikely === true ? "cad" : "reference_inference";
    }
  }
  return intake;
}


async function handleIntake(req: Request, body: any, user: { id: string }, apiKey?: string) {
  const startedAt = Date.now();
  // Every reference here is explicitly typed REPLACEMENT_PRODUCT_REFERENCE.
  const references: JewelryReferenceInput[] = readReferences(body?.jewelryReferences);
  const videoReferences = readVideoReferences(body?.videoReferences);


  if (!references.length) return json({ error: "Add at least one jewelry reference" }, 400);

  const roleVocabulary: string[] = (Array.isArray(body?.roleVocabulary) ? body.roleVocabulary : [])
    .map((entry: any) => String(entry ?? "").trim())
    .filter(Boolean)
    .slice(0, 60);

  const options = readOptions(body?.options ?? {});
  const userConfirmedFacts = readUserConfirmedFacts(body?.userConfirmedFacts);
  // Echoed back untouched so the client can discard a stale response.
  const setVersion = body?.setVersion ? String(body.setVersion) : null;
  const requestId = Number.isFinite(Number(body?.requestId)) ? Number(body.requestId) : null;

  const fingerprint = await referenceFingerprint(references, options, videoReferences, userConfirmedFacts);

  const admin = createAdminClient();

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
      setVersion,
      requestId,
      version: cached.version ?? INTAKE_VERSION,
      analyzedAt: cached.analyzed_at,
      intake: cached.analysis,
      timings: { cacheHit: true, totalMs: Date.now() - startedAt },
    });
  }

  if (!apiKey) return json({ error: "Jewelry analysis is unavailable (analysis key not configured)" }, 503);

  const ai = new GoogleGenAI({ apiKey });
  // ONE call for the whole settled reference set — never one call per image.
  const batch = selectIntakeBatch(references, MAX_IMAGES_PER_CALL);
  const run = await runIntake({ ai, references: batch, roleVocabulary, options });
  const intake = stampSources(run.intake, options);
  intake.version = INTAKE_VERSION;
  intake.referenceCount = batch.length;

  /* ---- ONE fused engineering pass, reusing the already-fetched images ---- */
  let knowledgeMapMs = 0;
  try {
    const fused = await runKnowledgeMap({
      ai,
      imageParts: run.imageParts,
      references: batch,
      videoReferences,
      intake,
      options,
      unavailable: run.unavailable,
      userConfirmedFacts,
    });

    knowledgeMapMs = fused.geminiMs;
    intake.knowledgeMap = fused.knowledgeMap;
    intake.videoAnalyses = Array.isArray(fused.knowledgeMap?.videoAnalyses)
      ? fused.knowledgeMap.videoAnalyses
      : [];
  } catch (error) {
    // The engineering map is an ENHANCEMENT: intake must still succeed without it.
    console.warn("[intake] knowledge map unavailable:", errorMessage(error));
  }

  const timings = {
    cacheHit: false,
    referenceFetchMs: run.timings.referenceFetchMs,
    geminiMs: run.timings.geminiMs,
    knowledgeMapMs,
    videoReferenceCount: videoReferences.length,
    keyframeReferenceCount: batch.filter((ref) => ref.kind === "product_reference_video").length,
    unavailableReferences: run.timings.unavailableReferences,
    totalMs: Date.now() - startedAt,
  };
  // DEV-ONLY telemetry: server logs, never surfaced to normal users.
  console.log("[intake] timings", JSON.stringify(timings));


  const stripped = assertAnalysisOnly(intake, "intake");
  if (stripped.length) console.warn("intake guard stripped:", stripped.join(", "));


  await admin.from("jewelry_still_analyses").upsert(
    {
      user_id: user.id,
      fingerprint,
      version: INTAKE_VERSION,
      analysis: intake,
      analyzed_at: new Date().toISOString(),
    },
    { onConflict: "user_id,fingerprint" },
  );

  return json({
    cached: false,
    fingerprint,
    setVersion,
    requestId,
    version: INTAKE_VERSION,
    analyzedAt: new Date().toISOString(),
    intake,
    guardStripped: stripped,
    timings,
  });


}


/** Physical-fidelity report for one generated still — ANALYSIS ONLY. */
const VALIDATION_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    verdict: { type: Type.STRING, enum: ["consistent", "minor_deviation", "violation"] },
    confidence: CONFIDENCE,
    summary: { type: Type.STRING },
    violations: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          attribute: { type: Type.STRING },
          expected: { type: Type.STRING },
          observed: { type: Type.STRING },
          severity: { type: Type.STRING, enum: ["low", "medium", "high"] },
          regionId: { type: Type.STRING },
        },
        required: ["attribute", "expected", "observed", "severity"],
      },
    },
    matchedConstraints: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ["verdict", "confidence", "summary", "violations"],
} as const;

/**
 * POST-GENERATION VALIDATION. Compares a finished image against the locked
 * physical constraints of the knowledge map and reports deviations. It never
 * generates, re-renders or edits anything — the caller decides what to do.
 */
async function handleValidate(body: any, apiKey?: string) {
  if (!apiKey) return json({ error: "Jewelry analysis is unavailable (analysis key not configured)" }, 503);

  const imageUrl = String(body?.imageUrl ?? "").trim();
  if (!/^https?:\/\//.test(imageUrl)) return json({ error: "A generated image URL is required" }, 400);

  const pkm = body?.knowledgeMap ?? null;
  const lockLines = pkm ? engineeringLockLines(pkm) : [];
  if (!lockLines.length) {
    return json({ validation: null, skipped: "no_locked_constraints" });
  }

  const part = await inlineImage(imageUrl);
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: GEMINI_ANALYSIS_MODEL,
    contents: [
      {
        role: "user",
        parts: [
          {
            text: [
              "You are a jewelry physical-fidelity auditor. Return JSON only: never an image, never a URL, never bytes.",
              "The image below was GENERATED. Judge ONLY whether the jewelry in it obeys the established physical constraints of the real replacement piece.",
              "",
              "LOCKED PHYSICAL CONSTRAINTS (established from the real references):",
              ...lockLines.map((line) => `- ${line}`),
              "",
              "Report each genuine physical deviation: stone size distribution that contradicts the locked uniformity, wrong stone count in a repeated module, invented components, wrong setting mechanics, wrong metal, wrong proportions or ratios.",
              "Never flag lighting, pose, background, crop, camera angle, exposure or styling — those are free.",
              "Never flag a difference you cannot actually see. Judge apparent size ONLY after accounting for perspective: a stone farther from the camera looks smaller and that is NOT a violation.",
              "verdict: consistent (no real deviation), minor_deviation (cosmetic only), violation (a locked physical constraint is broken).",
            ].join("\n"),
          },
          part,
        ],
      },
    ] as any,
    config: {
      responseMimeType: "application/json",
      responseSchema: VALIDATION_SCHEMA as any,
      maxOutputTokens: 2048,
      temperature: 0,
    },
  });

  const validation = JSON.parse((response.text ?? "").trim());
  const stripped = assertAnalysisOnly(validation, "validate");
  if (stripped.length) console.warn("validate guard stripped:", stripped.join(", "));
  return json({ validation, checkedConstraints: lockLines.length, guardStripped: stripped });
}




Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const startedAt = Date.now();


  let user;
  try {
    user = await requireUser(req);
  } catch (error) {
    return json({ error: errorMessage(error) }, 401);
  }

  const apiKey = Deno.env.get("GEMINI_API_KEY")?.trim();
  // Non-sensitive binding check: presence only, never the value.
  console.log("[analyze-jewelry-frames] gemini key present:", Boolean(apiKey));


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

    // INTAKE: reference-only recognition/grouping/extraction (no source frames).
    if (String(body?.mode ?? "").trim() === "intake") {
      return await handleIntake(req, body, user, apiKey);
    }

    // VALIDATE: compare a finished still against the established knowledge map.
    if (String(body?.mode ?? "").trim() === "validate") {
      return await handleValidate(body, apiKey);
    }



    const sourceFrames: SourceFrame[] = (Array.isArray(body?.sourceFrames) ? body.sourceFrames : [])
      .map((frame: any) => ({
        frameId: String(frame?.frameId ?? "").trim(),
        timestamp: Number(frame?.timestamp ?? 0) || 0,
        imageUrl: String(frame?.imageUrl ?? "").trim(),
      }))
      .filter((frame: SourceFrame) => frame.frameId && /^https?:\/\//.test(frame.imageUrl));

    // Replacement references (CAD, stills, product-video keyframes) — typed.
    const jewelryReferences: JewelryReferenceInput[] = readReferences(body?.jewelryReferences);

    const jewelrySpecs: any[] = Array.isArray(body?.jewelrySpecs) ? body.jewelrySpecs : [];

    // The persisted intake this reference set was already understood through.
    const intakeFingerprint = String(body?.intakeFingerprint ?? "").trim() || null;
    const intakeReferences: JewelryReferenceInput[] = readReferences(body?.intakeReferences);


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
        timings: { analysisCacheHit: true, totalAnalysisMs: Date.now() - startedAt },
      });
    }

    if (!apiKey) {
      return json({ error: "Shot analysis is unavailable (analysis key not configured)" }, 503);
    }

    const ai = new GoogleGenAI({ apiKey });
    const references = jewelryReferences.slice(0, MAX_REFERENCE_IMAGES);

    /* ---- Can we reuse the persisted PRODUCT KNOWLEDGE MAP? -------------- */
    let knowledge: ReturnType<typeof buildKnowledgeMap> = null;
    if (intakeFingerprint && sameReferenceSet(intakeReferences, jewelryReferences)) {
      const { data: intakeRow } = await admin
        .from("jewelry_still_analyses")
        .select("analysis, version")
        .eq("user_id", user.id)
        .eq("fingerprint", intakeFingerprint)
        .maybeSingle();
      if (intakeRow?.analysis && intakeRow.version === INTAKE_VERSION) {
        knowledge = buildKnowledgeMap({
          intake: intakeRow.analysis,
          intakeReferences,
          references,
        });
      }
    }
    const knowledgeMapReused = Boolean(knowledge);

    // Source frames always come from the wire; references only when the map
    // could NOT be reused. Both fetch with bounded concurrency.
    const frameBudget = knowledgeMapReused
      ? MAX_IMAGES_PER_CALL
      : Math.max(1, MAX_IMAGES_PER_CALL - references.length);
    const wantedFrames = sourceFrames.slice(0, frameBudget);

    const referenceFetchStarted = Date.now();
    const referenceSettled = knowledgeMapReused
      ? []
      : await inlineImages(references.map((ref) => ref.url));
    const referenceFetchMs = knowledgeMapReused ? 0 : Date.now() - referenceFetchStarted;

    const unavailableReferences = new Set<number>();
    const referenceParts: unknown[] = [];
    referenceSettled.forEach((result, index) => {
      if (result.ok) referenceParts.push(result.value);
      else {
        unavailableReferences.add(index);
        console.warn(`[shot-analysis] reference ${index} unavailable: ${result.error}`);
      }
    });
    if (!knowledgeMapReused && !referenceParts.length) {
      throw new Error("None of the jewelry references could be read");
    }

    const frameFetchStarted = Date.now();
    const frameSettled = await inlineImages(wantedFrames.map((frame) => frame.imageUrl));
    const sourceFrameFetchMs = Date.now() - frameFetchStarted;

    // A frame whose image cannot be read is dropped from the batch — never
    // allowed to stall or fail the other frames.
    const batchFramesInput: SourceFrame[] = [];
    const frameParts: unknown[] = [];
    frameSettled.forEach((result, index) => {
      if (result.ok) {
        batchFramesInput.push(wantedFrames[index]);
        frameParts.push(result.value);
      } else {
        console.warn(`[shot-analysis] source frame ${index} unavailable: ${result.error}`);
      }
    });
    if (!batchFramesInput.length) throw new Error("None of the selected frames could be read");

    const geminiStarted = Date.now();
    const parsed = knowledge
      ? await rankFramesWithKnowledgeMap({
        ai,
        frameParts,
        frames: batchFramesInput,
        catalogLines: knowledge.catalogLines,
        mapLines: knowledge.mapLines,
        specs: jewelrySpecs,
      })
      : await analyseBatch({
        ai,
        referenceParts,
        frameParts,
        references,
        frames: batchFramesInput,
        specs: jewelrySpecs,
      });
    const geminiMs = Date.now() - geminiStarted;

    // Reused map → the product half of the answer comes from the persisted
    // intake, so the output shape is identical without re-analysing anything.
    const productAnalysis: any = knowledge
      ? knowledge.productAnalysis
      : parsed?.productAnalysis ?? null;
    const returnedFrames = Array.isArray(parsed?.frames) ? parsed.frames : [];
    const frames: any[] = [];
    batchFramesInput.forEach((frame, index) => {
      const entry = returnedFrames.find((item: any) => item?.frameId === frame.frameId) ??
        returnedFrames[index];
      if (entry) frames.push({ ...entry, frameId: frame.frameId, timestamp: frame.timestamp });
    });

    // Reference metadata is keyed by referenceId; keep the id → label mapping
    // stable so the deterministic selector can resolve the ranking.
    if (productAnalysis && Array.isArray(productAnalysis.references)) {
      productAnalysis.references = productAnalysis.references
        .filter((entry: any) => entry && typeof entry === "object")
        .map((entry: any, index: number) => ({
          ...entry,
          referenceId: String(entry.referenceId ?? "").trim() || referenceIdAt(index),
        }));
    }
    if (productAnalysis) productAnalysis.referenceIds = references.map((_, i) => referenceIdAt(i));

    if (!productAnalysis || !frames.length) throw new Error("The analysis returned no usable result");

    // The reused engineering map travels with the analysis for the admin panel;
    // the routing-facing prompt still reads only productAnalysis / frames.
    const analysis: Record<string, unknown> = {
      version: ANALYSIS_VERSION,
      productAnalysis,
      frames,
      ...(knowledge?.pkm ? { knowledgeMap: knowledge.pkm } : {}),
    };

    const stripped = assertAnalysisOnly(analysis);
    if (stripped.length) {
      console.warn("analysis-only guard stripped non-analysis fields:", stripped.join(", "));
    }

    const timings = {
      analysisCacheHit: false,
      knowledgeMapReused,
      referenceImagesSent: knowledgeMapReused ? 0 : referenceParts.length,
      sourceFramesSent: frameParts.length,
      geminiCalls: 1,
      referenceFetchMs,
      sourceFrameFetchMs,
      geminiMs,
      totalAnalysisMs: Date.now() - startedAt,
    };
    // DEV-ONLY telemetry: server logs + response field, never customer UI.
    console.log("[shot-analysis] timings", JSON.stringify(timings));

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
      timings,
    });

  } catch (error) {
    const raw = errorMessage(error);
    const safe = apiKey ? raw.split(apiKey).join("[redacted]") : raw;
    return json({ error: safe.slice(0, 4000) }, 500);
  }
});
