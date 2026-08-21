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
import {
  attachResearchToMap,
  collectUncertainTerms,
  researchUncertainTerms,
} from "./research.ts";

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
 * REPLACEMENT_PRODUCT_REFERENCE → CAD and product photos of the ACTUAL
 *   replacement piece, plus replacement product VIDEOS. Geometry, material,
 *   stone, setting and component authority. A replacement video is analysed as
 *   a COMPLETE clip by Gemini's multimodal video path — it is never reduced to
 *   keyframe image references, and it is never sent to the image renderer.
 */
type AssetPurpose = "SOURCE_CINEMATOGRAPHY" | "REPLACEMENT_PRODUCT_REFERENCE";

/** How FUSE auto-classified an uploaded replacement IMAGE (user never labels). */
type ReferenceKind = "cad" | "photographic_still";

/**
 * ONE CARD = ONE PHYSICAL PIECE. Every asset that shares a productCaseId is a
 * DIFFERENT OBSERVATION of the SAME physical object (CAD front + front/side/
 * macro/clasp stills + the replacement product video), never a product of its
 * own. A second case exists ONLY when the user explicitly adds a piece, or when
 * the user answers a separation question — never because one reference looked
 * different.
 */
type JewelryProductCase = {
  productCaseId: string;
  /** Image observations of this one piece (CAD + stills). */
  references: JewelryReferenceInput[];
  /** Full-clip video observations of the SAME piece. */
  videoReferences: VideoReferenceInput[];
  /** Per-reference observations: what each asset can and cannot see. */
  observations: any[];
  /** The single fused reconstruction of the piece. */
  productKnowledgeMap: any;
  /** The canonical spec the app renders from, after fusion. */
  resolvedJewelrySpec: any;
};

const DEFAULT_PRODUCT_CASE_ID = "CASE_1";

type JewelryReferenceInput = {
  url: string;
  role?: string | null;
  cad?: boolean;
  /** Always REPLACEMENT_PRODUCT_REFERENCE on this path. */
  assetPurpose?: AssetPurpose;
  kind?: ReferenceKind;
  /** The ONE physical piece this observation belongs to. */
  productCaseId?: string;
};

/** One replacement product VIDEO — the whole clip is the analysis unit. */
type VideoReferenceInput = {
  videoReferenceId: string;
  /** Storage URL of the actual stored clip, fetched here for Gemini. */
  videoUrl: string;
  name?: string | null;
  duration: number;
  aspectRatio?: string | null;
  /** The ONE physical piece this clip observes. */
  productCaseId?: string;
};


/**
 * Every reference on this path is REPLACEMENT_PRODUCT_REFERENCE, typed
 * explicitly so nothing downstream can mistake it for source cinematography.
 */
function readReferences(raw: unknown): JewelryReferenceInput[] {
  return (Array.isArray(raw) ? raw : [])
    .map((ref: any) => {
      const cad = ref?.cad === true;
      return {
        url: String(ref?.url ?? "").trim(),
        role: ref?.role ? String(ref.role).trim() : null,
        cad,
        assetPurpose: "REPLACEMENT_PRODUCT_REFERENCE" as AssetPurpose,
        kind: (cad ? "cad" : "photographic_still") as ReferenceKind,
        // Absent client id ⇒ everything in this request observes ONE piece.
        productCaseId: String(ref?.productCaseId ?? "").trim() || DEFAULT_PRODUCT_CASE_ID,
      };
    })
    .filter((ref: JewelryReferenceInput) => /^https?:\/\//.test(ref.url));
}

function readVideoReferences(raw: unknown): VideoReferenceInput[] {
  return (Array.isArray(raw) ? raw : [])
    .map((entry: any) => ({
      videoReferenceId: String(entry?.videoReferenceId ?? "").trim(),
      videoUrl: String(entry?.videoUrl ?? "").trim(),
      name: entry?.name ? String(entry.name).trim() : null,
      duration: Number(entry?.duration ?? 0) || 0,
      aspectRatio: entry?.aspectRatio ? String(entry.aspectRatio).trim() : null,
      productCaseId: String(entry?.productCaseId ?? "").trim() || DEFAULT_PRODUCT_CASE_ID,
    }))
    .filter(
      (entry: VideoReferenceInput) =>
        entry.videoReferenceId && /^https?:\/\//.test(entry.videoUrl),
    );
}

/**
 * The ONE case this request reconstructs. Mixed client ids never silently
 * become several products here: the first id wins as the case identity, and the
 * whole settled asset set is fused into a single ProductKnowledgeMap.
 */
function resolveProductCaseId(
  references: JewelryReferenceInput[],
  videoReferences: VideoReferenceInput[],
) {
  return (
    references.find((ref) => ref.productCaseId)?.productCaseId ??
      videoReferences.find((clip) => clip.productCaseId)?.productCaseId ??
      DEFAULT_PRODUCT_CASE_ID
  );
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
 * only ever hold plain analysis text (a clip's id, the per-clip evidence
 * blocks). Their values are still checked for anything media-shaped, so a stored
 * clip URL can never ride along inside the analysis.
 */
const ANALYSIS_ONLY_KEYS = new Set([
  "videoReferenceId",
  "videoAnalyses",
  "videoAnalysisIssues",
  "videoEvidence",
  "temporalObservations",
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

/* ------------------------------------------------------------------ *
 * REPLACEMENT VIDEO → Gemini multimodal video input
 * ------------------------------------------------------------------ *
 * The COMPLETE clip is handed to Gemini. Small clips travel inline; anything
 * larger goes through the Files API, because inline request bodies are capped.
 * A clip is NEVER decomposed into keyframe image references, and it is never
 * forwarded to the image renderer.
 */

/** Above this, inline bytes are unsafe for a single request — use the Files API. */
const INLINE_VIDEO_MAX_BYTES = 16 * 1024 * 1024;
const VIDEO_FETCH_TIMEOUT_MS = 60_000;
const VIDEO_ACTIVE_TIMEOUT_MS = 90_000;

function videoMimeFor(url: string, headerMime: string | null) {
  const mime = (headerMime ?? "").split(";")[0].trim();
  if (/^video\//.test(mime)) return mime;
  if (/\.mov($|\?)/i.test(url)) return "video/quicktime";
  if (/\.webm($|\?)/i.test(url)) return "video/webm";
  return "video/mp4";
}

function base64Of(buffer: Uint8Array) {
  let binary = "";
  for (let i = 0; i < buffer.length; i += 8192) {
    binary += String.fromCharCode(...buffer.subarray(i, i + 8192));
  }
  return btoa(binary);
}

/**
 * Fetches the stored clip and returns the Gemini part carrying the WHOLE video.
 */
async function videoPartFor(ai: GoogleGenAI, clip: VideoReferenceInput) {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), VIDEO_FETCH_TIMEOUT_MS);
  let bytes: Uint8Array;
  let mimeType: string;
  try {
    const response = await fetch(clip.videoUrl, { signal: abort.signal });
    if (!response.ok) throw new Error(`Could not read the product video (${response.status})`);
    mimeType = videoMimeFor(clip.videoUrl, response.headers.get("content-type"));
    bytes = new Uint8Array(await response.arrayBuffer());
  } finally {
    clearTimeout(timer);
  }
  if (!bytes.length) throw new Error("The product video was empty");

  if (bytes.length <= INLINE_VIDEO_MAX_BYTES) {
    return { part: { inlineData: { mimeType, data: base64Of(bytes) } }, transport: "inline" as const, bytes: bytes.length };
  }

  // Files API: upload, then wait until the clip is ACTIVE before referencing it.
  const uploaded = await ai.files.upload({
    file: new Blob([bytes], { type: mimeType }),
    config: { mimeType, displayName: clip.name ?? clip.videoReferenceId },
  });
  const deadline = Date.now() + VIDEO_ACTIVE_TIMEOUT_MS;
  let file: any = uploaded;
  while (file?.state === "PROCESSING" && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    file = await ai.files.get({ name: String(uploaded.name) });
  }
  if (file?.state !== "ACTIVE") throw new Error("The product video could not be prepared for analysis");
  return {
    part: { fileData: { mimeType: file.mimeType ?? mimeType, fileUri: file.uri } },
    transport: "files_api" as const,
    bytes: bytes.length,
  };
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
  return `${ref.url}|${ref.role ?? ""}|${ref.cad ? 1 : 0}|${ref.kind ?? ""}`;
}

/** Storage URLs can carry volatile query strings — the path identifies the clip. */
function normalizeUrlKey(url: string) {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return url;
  }
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

  // Every catalogued reference is a genuine still or CAD view: replacement
  // videos never enter the image reference set.
  const annotatedCatalog = catalogLines;


  /* ---- The fused engineering understanding, when one was persisted ------- */
  const pkm = args.intake?.knowledgeMap && typeof args.intake.knowledgeMap === "object"
    ? args.intake.knowledgeMap
    : null;
  const lock = pkm ? engineeringLockLines(pkm) : [];
  if (lock.length) {
    console.log(`[analyze-jewelry-frames] PKM ENGINEERING LOCK ${JSON.stringify(lock).slice(0, 4000)}`);
    mapLines.push("  ENGINEERING LOCK (fused from CAD + photos + full-clip product video):");
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

  // COMPOSITIONAL SETTING FACTS — the Nano engineering lock reads the fused
  // PKM axes, never the first-pass single-image classifier.
  const settingAnalysis = pkm?.settingAnalysis;
  if (settingAnalysis && typeof settingAnalysis === "object" && settingAnalysis.needsConfirmation !== true) {
    if (settingAnalysis.stoneFieldTopology) {
      lines.push(
        `preserve the observed ${String(settingAnalysis.stoneFieldTopology).slice(0, 60)} stone-field topology: ${
          (listOf(settingAnalysis.physicalSizeClasses).join(", ") || "as mapped").slice(0, 160)
        } (perspective-normalized physical size classes, not apparent size)`,
      );
    }
    if (settingAnalysis.retentionConstruction) {
      lines.push(
        `retain the stones by the observed ${String(settingAnalysis.retentionConstruction).slice(0, 60)} construction${
          listOf(settingAnalysis.retentionEvidence).length
            ? `: ${listOf(settingAnalysis.retentionEvidence).slice(0, 2).join("; ").slice(0, 160)}`
            : ""
        }`,
      );
    }
    if (settingAnalysis.coverageStyle) {
      lines.push(`coverage: ${String(settingAnalysis.coverageStyle).slice(0, 60)} — coverage only, never a retention method`);
    }
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

  // Derived negative constraints (still advisory text, provenance-gated groups only).
  const hardGroups = (Array.isArray(pkm?.stoneGroups) ? pkm.stoneGroups : []).filter((g: any) => hard(g, 0.5));
  const anyUniform = hardGroups.some((g: any) => g?.sizeUniformity === "uniform");
  const anyMixed = hardGroups.some((g: any) => g?.sizeUniformity === "mixed");
  if (anyUniform && !anyMixed) {
    lines.push(
      "do NOT invent anchor/filler or secondary stone-size classes; one physical size class per cross-view analysis",
    );
  }
  if (anyMixed) {
    lines.push("do NOT flatten the mapped stone-size classes into a single uniform field");
  }
  if (hardGroups.length) {
    lines.push(
      "preserve mapped stone centers, spacing and orientation; do NOT convert the observed field into generic uniform pavé rows",
    );
  }

  // VIDEO-DERIVED physical facts: the full-clip analysis is evidence of the real
  // object, so its temporal reconciliations become explicit constraints.
  for (const analysis of (Array.isArray(pkm?.videoAnalyses) ? pkm.videoAnalyses : []).slice(0, 2)) {
    const master = (Array.isArray(analysis?.repeatedModules) ? analysis.repeatedModules : [])[0];
    if (master?.masterGeometry) {
      lines.push(
        `preserve the master ${String(master?.label ?? "module")} geometry observed continuously in the product video: ${String(master.masterGeometry).slice(0, 160)}`,
      );
    }
    const normalized = (Array.isArray(analysis?.temporalComponentTracking) ? analysis.temporalComponentTracking : [])
      .some((entry: any) => entry?.apparentSizeDifference === true && entry?.physicalSizeDifference === false);
    if (normalized) {
      lines.push(
        "maintain one perspective-normalized physical stone-size class where cross-angle video evidence confirms uniformity; do NOT read smaller apparent stones on receding surfaces as smaller physical stones",
      );
    }
    const retention = analysis?.settingEvidence?.observedRetentionMechanics;
    if (retention) lines.push(`retention as observed across the clip: ${String(retention).slice(0, 140)}`);
    const exposed = analysis?.stoneEvidence?.exposedMetalPattern;
    if (exposed) lines.push(`preserve the observed exposed-metal pattern: ${String(exposed).slice(0, 140)}`);
    if (analysis?.claspEvidence) {
      lines.push(
        `reproduce the clasp as its own component per the construction established when it becomes fully visible: ${String(analysis.claspEvidence).slice(0, 140)}`,
      );
    }
  }

  return lines.filter(Boolean).slice(0, 24);
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
        // The clip URL + duration identify the expensive full-video analysis, so
        // adding or removing unrelated source frames never re-triggers it.
        .map((clip) => `${clip.videoReferenceId}|${normalizeUrlKey(clip.videoUrl)}|${clip.duration}`)
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
 * The Gemini batch is capped. Only CAD and photographic stills are image
 * references now, so the cap simply keeps the first `limit` of them.
 */
function selectIntakeBatch(references: JewelryReferenceInput[], limit: number) {
  return references.length <= limit ? references : references.slice(0, limit);
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
 * product video) instead of reading each asset independently.
 * Nothing here generates or modifies media, and nothing here changes how
 * references are routed to the image model.
 */

const PKM_VERSION = "jewelry-knowledge-map-v3";

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
    overallGeometry: CONFIDENCE,
    dimensions: CONFIDENCE,
    componentTopology: CONFIDENCE,
    stoneSeatLayout: CONFIDENCE,
    stoneCut: CONFIDENCE,
    stoneSize: CONFIDENCE,
    stonePlacement: CONFIDENCE,
    settingMechanics: CONFIDENCE,
    prongConstruction: CONFIDENCE,
    thicknessDepth: CONFIDENCE,
    claspBailConnector: CONFIDENCE,
    metalColor: CONFIDENCE,
    materialAppearance: CONFIDENCE,
    componentGeometry: CONFIDENCE,
    manufacturedAppearance: CONFIDENCE,
    manufacturedFinish: CONFIDENCE,
  },
} as const;


/**
 * JEWELRY TERMINOLOGY ONTOLOGY — engineering signatures, not prose.
 *
 * ONE ontology for the whole vocabulary (this is the 9a67a639 setting-signature
 * work extended with `vocabularyDomain`, `aliases` and `definition` — there is
 * deliberately no second parallel ontology). Classification compares OBSERVED
 * construction against `engineeringSignature`; a NAME match alone never counts.
 *
 * The domains are kept STRICTLY separate: traditional/gemological terminology
 * and modern custom-jeweler terminology do not always describe the same thing
 * (classical "Mosaic" = tesserae forming a picture; a custom jeweler's "Mosaic
 * Setting" is a specific diamond packing/retention construction). Same-sounding
 * terms therefore live as distinct entries in distinct domains, linked only via
 * `aliases` / `relatedTerms`. The data is seedable and extensible, and contains
 * no product-type branching whatsoever.
 */
type VocabularyDomain = "classical" | "gemological" | "manufacturing" | "hip_hop_custom";

type JewelryTerm = {
  canonicalName: string;
  vocabularyDomain: VocabularyDomain;
  aliases: string[];
  definition: string;
  /** Which decision this term can be the answer to. */
  termKind: "setting" | "component" | "cut" | "construction";
  /** Terms in another domain that sound the same but mean something else. */
  relatedTerms?: string[];
  engineeringSignature: {
    expectedStoneCuts: string[];
    stoneSizePattern: string;
    packingPattern: string;
    retentionMechanics: string;
    prongBehavior: string;
    metalVisibility: string;
    rowBehavior: string;
    orientationBehavior: string;
    compatibleGeometry: string[];
  };
};

const NO_STONE_SIGNATURE = (retention: string, geometry: string[]) => ({
  expectedStoneCuts: [],
  stoneSizePattern: "not a stone-field term",
  packingPattern: "not a stone-field term",
  retentionMechanics: retention,
  prongBehavior: "n/a",
  metalVisibility: "as observed",
  rowBehavior: "n/a",
  orientationBehavior: "as observed",
  compatibleGeometry: geometry,
});

/* -------------------- Layer 1: classical / gemological / manufacturing ----- */

const CLASSICAL_TERMS: JewelryTerm[] = [
  {
    canonicalName: "Pavé",
    vocabularyDomain: "classical",
    aliases: ["pave", "bright cut pave"],
    definition:
      "Established bench term: small stones of uniform size set close together in regular rows or a honeycomb, retained by small shared metal beads so the surface reads as paved with stone.",
    termKind: "setting",
    engineeringSignature: {
      expectedStoneCuts: ["round_brilliant"],
      stoneSizePattern: "uniform small stones (uniform AFTER perspective normalization)",
      packingPattern: "regular dense rows or honeycomb",
      retentionMechanics: "shared beads raised from the surrounding metal",
      prongBehavior: "shared beads, 2–4 per stone",
      metalVisibility: "low",
      rowBehavior: "regular rows",
      orientationBehavior: "table-up, uniform",
      compatibleGeometry: ["flat", "convex", "curved"],
    },
  },
  {
    canonicalName: "Micro Pavé",
    vocabularyDomain: "classical",
    aliases: ["micropave", "micro pave"],
    definition:
      "Pavé executed with very small stones (typically well under 1.3mm) and correspondingly tiny beads; construction is identical to pavé, only the scale differs.",
    termKind: "setting",
    engineeringSignature: {
      expectedStoneCuts: ["round_brilliant"],
      stoneSizePattern: "uniform, very small stones (physically uniform after perspective normalization)",
      packingPattern: "dense honeycomb of tiny stones, regular spacing",
      retentionMechanics: "tiny shared beads between neighbouring stones",
      prongBehavior: "tiny shared beads",
      metalVisibility: "minimal, thin bead walls",
      rowBehavior: "regular multi-row or honeycomb",
      orientationBehavior: "table-up, uniform",
      compatibleGeometry: ["flat", "convex", "curved"],
    },
  },
  {
    canonicalName: "Bead Set",
    vocabularyDomain: "manufacturing",
    aliases: ["bead setting", "grain set"],
    definition:
      "Each stone sits in its own cut seat and is retained by discrete beads raised with a graver; unlike pavé the beads are not shared and metal remains visible between stones.",
    termKind: "setting",
    engineeringSignature: {
      expectedStoneCuts: ["round_brilliant"],
      stoneSizePattern: "uniform or lightly graduated",
      packingPattern: "individually beaded seats with visible metal between stones",
      retentionMechanics: "raised beads per stone, not shared",
      prongBehavior: "discrete raised beads per stone",
      metalVisibility: "moderate",
      rowBehavior: "single or multi row",
      orientationBehavior: "table-up",
      compatibleGeometry: ["flat", "convex"],
    },
  },
  {
    canonicalName: "Prong Set",
    vocabularyDomain: "classical",
    aliases: ["claw set", "basket set"],
    definition:
      "Individual stones held by discrete metal claws bent over the crown, with open metal (and usually an open gallery) around and beneath each stone.",
    termKind: "setting",
    engineeringSignature: {
      expectedStoneCuts: ["round_brilliant", "oval", "pear", "emerald", "cushion", "marquise", "princess"],
      stoneSizePattern: "individual larger stones, sizes may differ",
      packingPattern: "discrete stones with open metal between them",
      retentionMechanics: "prong tips folded over each girdle/crown",
      prongBehavior: "3–6 distinct prongs per stone, tips over the crown",
      metalVisibility: "high; open gallery underneath",
      rowBehavior: "none required",
      orientationBehavior: "per-stone, aligned to its seat",
      compatibleGeometry: ["flat", "convex", "open gallery"],
    },
  },
  {
    canonicalName: "Shared Prong",
    vocabularyDomain: "manufacturing",
    aliases: ["common prong", "shared claw"],
    definition:
      "A continuous run of stones where one prong retains two neighbouring stones, minimising metal between them (classic tennis construction).",
    termKind: "setting",
    engineeringSignature: {
      expectedStoneCuts: ["round_brilliant", "princess"],
      stoneSizePattern: "uniform along a run",
      packingPattern: "continuous line of stones sharing prongs between neighbours",
      retentionMechanics: "one prong retains two adjacent stones",
      prongBehavior: "shared prong tips at each junction",
      metalVisibility: "low between stones, visible prong tips",
      rowBehavior: "single continuous row",
      orientationBehavior: "aligned along the run",
      compatibleGeometry: ["curved", "linear run"],
    },
  },
  {
    canonicalName: "Channel Set",
    vocabularyDomain: "classical",
    aliases: ["channel setting"],
    definition:
      "Stones suspended between two continuous parallel metal rails that grip the girdles; no prongs or beads are used.",
    termKind: "setting",
    engineeringSignature: {
      expectedStoneCuts: ["round_brilliant", "princess", "baguette"],
      stoneSizePattern: "uniform within the channel",
      packingPattern: "stones held between two continuous rails, touching, no prongs",
      retentionMechanics: "rails compress the girdles along the run",
      prongBehavior: "no prongs",
      metalVisibility: "two parallel rails only",
      rowBehavior: "one row per channel",
      orientationBehavior: "uniform along the channel axis",
      compatibleGeometry: ["linear run", "curved", "flat"],
    },
  },
  {
    canonicalName: "Baguette Channel",
    vocabularyDomain: "manufacturing",
    aliases: ["baguette channel set", "step channel"],
    definition:
      "Channel construction dimensioned for step-cut rectangular stones, whose long edges abut inside the rails.",
    termKind: "setting",
    engineeringSignature: {
      expectedStoneCuts: ["baguette", "tapered_baguette", "emerald"],
      stoneSizePattern: "uniform or tapered baguettes",
      packingPattern: "rectangular stones abutting inside rails, long edges parallel",
      retentionMechanics: "rails plus end walls",
      prongBehavior: "no prongs",
      metalVisibility: "rails plus end walls",
      rowBehavior: "one row per channel",
      orientationBehavior: "long axis consistently parallel or perpendicular to the run",
      compatibleGeometry: ["linear run", "curved"],
    },
  },
  {
    canonicalName: "Bezel",
    vocabularyDomain: "classical",
    aliases: ["bezel set", "rub over", "rub-over set"],
    definition:
      "A continuous metal collar surrounds the stone and is rubbed over its girdle; the rim is a visible design element.",
    termKind: "setting",
    engineeringSignature: {
      expectedStoneCuts: ["round_brilliant", "oval", "emerald", "cushion", "cabochon", "custom"],
      stoneSizePattern: "individual stones",
      packingPattern: "each stone fully surrounded by a continuous metal collar",
      retentionMechanics: "collar burnished over the girdle",
      prongBehavior: "no prongs",
      metalVisibility: "high — continuous rim per stone",
      rowBehavior: "none required",
      orientationBehavior: "per-stone",
      compatibleGeometry: ["flat", "convex", "irregular"],
    },
  },
  {
    canonicalName: "Invisible Set",
    vocabularyDomain: "classical",
    aliases: ["invisible setting", "mystery set", "serti mysterieux"],
    definition:
      "Calibrated step/square cuts with grooved girdles are locked onto a hidden sub-rail so no metal at all shows between the stones.",
    termKind: "setting",
    engineeringSignature: {
      expectedStoneCuts: ["princess", "baguette"],
      stoneSizePattern: "uniform squares/rectangles",
      packingPattern: "stones abutting with NO visible metal between them",
      retentionMechanics: "grooved girdles engaged on a concealed rail below the surface",
      prongBehavior: "none visible",
      metalVisibility: "none between stones; only the outer frame",
      rowBehavior: "grid",
      orientationBehavior: "grid-aligned",
      compatibleGeometry: ["flat", "convex"],
    },
  },
  {
    canonicalName: "Flush/Gypsy",
    vocabularyDomain: "classical",
    aliases: ["flush set", "gypsy set", "burnish set"],
    definition:
      "The stone is sunk into the metal so its table sits level with the surface and the surrounding metal is burnished against the girdle.",
    termKind: "setting",
    engineeringSignature: {
      expectedStoneCuts: ["round_brilliant"],
      stoneSizePattern: "individual or scattered",
      packingPattern: "stones sunk level with the metal surface, no raised metal",
      retentionMechanics: "surrounding metal burnished down onto the girdle",
      prongBehavior: "no prongs or beads",
      metalVisibility: "the whole surface is metal",
      rowBehavior: "none required",
      orientationBehavior: "table flush with the surface",
      compatibleGeometry: ["flat", "convex", "curved"],
    },
  },
  {
    canonicalName: "Tension Set",
    vocabularyDomain: "manufacturing",
    aliases: ["tension setting"],
    definition:
      "The stone is held by the spring pressure of two metal ends bearing on opposite girdle points, with no prongs, bezel or rail.",
    termKind: "setting",
    engineeringSignature: {
      expectedStoneCuts: ["round_brilliant", "princess", "emerald", "oval"],
      stoneSizePattern: "single focal stone",
      packingPattern: "one stone spanning a gap in the metal",
      retentionMechanics: "compressive spring load on two girdle points, notched seats",
      prongBehavior: "none",
      metalVisibility: "high; stone appears suspended",
      rowBehavior: "none",
      orientationBehavior: "girdle plane aligned to the metal ends",
      compatibleGeometry: ["open span"],
    },
  },
  {
    canonicalName: "A-jour/Open Back",
    vocabularyDomain: "manufacturing",
    aliases: ["a jour", "ajour", "open back", "open gallery"],
    definition:
      "A construction property rather than a retention method: the seat is pierced through so light passes behind the stone and the pavilion is visible from the reverse.",
    termKind: "construction",
    engineeringSignature: {
      expectedStoneCuts: [],
      stoneSizePattern: "any",
      packingPattern: "any",
      retentionMechanics: "pierced seat behind each stone; combines with prongs, beads or bezel",
      prongBehavior: "as per the retention term used with it",
      metalVisibility: "open metal visible from the reverse",
      rowBehavior: "any",
      orientationBehavior: "any",
      compatibleGeometry: ["open gallery", "flat", "convex"],
    },
  },
  {
    canonicalName: "Closed Back",
    vocabularyDomain: "manufacturing",
    aliases: ["solid back", "blind seat"],
    definition:
      "The reverse of the stone field is solid metal: no piercing behind the seats, so no light enters from behind.",
    termKind: "construction",
    engineeringSignature: {
      expectedStoneCuts: [],
      stoneSizePattern: "any",
      packingPattern: "any",
      retentionMechanics: "blind seats drilled into solid metal",
      prongBehavior: "as per the retention term used with it",
      metalVisibility: "solid metal on the reverse",
      rowBehavior: "any",
      orientationBehavior: "any",
      compatibleGeometry: ["flat", "convex", "irregular"],
    },
  },
  {
    canonicalName: "Mosaic (classical)",
    vocabularyDomain: "classical",
    aliases: ["micromosaic", "pietra dura", "tessera work"],
    definition:
      "The TRADITIONAL decorative-arts meaning: small tesserae of stone, glass or enamel laid to form a picture or ornamental image. This is NOT the modern custom-jeweler setting term of the same name.",
    termKind: "construction",
    relatedTerms: ["Mosaic Setting (custom)"],
    engineeringSignature: {
      expectedStoneCuts: ["custom", "cabochon"],
      stoneSizePattern: "small tesserae, sizes chosen to render an image",
      packingPattern: "tesserae abutting to depict a figure or pattern; cement/adhesive ground",
      retentionMechanics: "tesserae bedded into a matrix inside a frame — not individually set in metal",
      prongBehavior: "none",
      metalVisibility: "only the surrounding frame",
      rowBehavior: "image-driven, no rows",
      orientationBehavior: "follows the depicted image",
      compatibleGeometry: ["flat", "plaque"],
    },
  },
  {
    canonicalName: "Bail",
    vocabularyDomain: "manufacturing",
    aliases: ["bale", "hanger", "pendant loop"],
    definition:
      "The loop or fitting through which a chain passes to carry a pendant or charm; may be fixed, hinged or a bar-and-tube arrangement.",
    termKind: "component",
    engineeringSignature: NO_STONE_SIGNATURE(
      "connects the pendant body to the chain; load path runs through the loop into the body",
      ["loop", "tube", "hinge"],
    ),
  },
  {
    canonicalName: "Curb Link",
    vocabularyDomain: "classical",
    aliases: ["curb chain", "flat curb"],
    definition:
      "Chain of interlocking oval/round links twisted so they lie flat in one plane; the Miami-Cuban family is a heavier, tighter derivative.",
    termKind: "component",
    engineeringSignature: NO_STONE_SIGNATURE(
      "links twisted 90° so consecutive links lie flat and interlock in one plane",
      ["linear run", "curved"],
    ),
  },
  {
    canonicalName: "Lobster/Box Clasp",
    vocabularyDomain: "manufacturing",
    aliases: ["lobster claw", "box clasp", "tongue clasp", "box lock"],
    definition:
      "Discrete closure component: a spring-loaded claw, or a tongue engaging a sprung box, usually with a safety catch on heavier work.",
    termKind: "component",
    engineeringSignature: NO_STONE_SIGNATURE(
      "spring gate or sprung tongue-in-box carrying the full tensile load of the piece",
      ["terminal component"],
    ),
  },
  {
    canonicalName: "Brilliant Cut",
    vocabularyDomain: "gemological",
    aliases: ["round brilliant", "RBC"],
    definition:
      "Gemological cut class: 57/58 triangular and kite facets optimised for return of light, circular girdle outline.",
    termKind: "cut",
    engineeringSignature: {
      expectedStoneCuts: ["round_brilliant"],
      stoneSizePattern: "any",
      packingPattern: "circular girdles leave interstitial gaps when tiled",
      retentionMechanics: "seated on a round bearing",
      prongBehavior: "any",
      metalVisibility: "interstitial metal is unavoidable between round girdles",
      rowBehavior: "rows or honeycomb",
      orientationBehavior: "rotationally symmetric — orientation not readable",
      compatibleGeometry: ["flat", "convex", "curved"],
    },
  },
  {
    canonicalName: "Step Cut",
    vocabularyDomain: "gemological",
    aliases: ["baguette", "emerald cut", "asscher"],
    definition:
      "Gemological cut class: parallel elongated facets in steps with a rectangular or square girdle outline and corner facets.",
    termKind: "cut",
    engineeringSignature: {
      expectedStoneCuts: ["baguette", "tapered_baguette", "emerald", "asscher"],
      stoneSizePattern: "calibrated",
      packingPattern: "straight girdles abut, so fields can close with no interstitial gaps",
      retentionMechanics: "seated on straight bearings or rails",
      prongBehavior: "corner prongs or rails",
      metalVisibility: "can approach zero between stones",
      rowBehavior: "rows, borders, rails",
      orientationBehavior: "long axis is readable and consistent",
      compatibleGeometry: ["linear run", "flat", "border"],
    },
  },
  {
    canonicalName: "Custom/Unknown",
    vocabularyDomain: "manufacturing",
    aliases: ["custom", "hybrid", "unclear"],
    definition:
      "Use when the observed construction genuinely matches no single signature in any domain, or the evidence cannot separate two candidates.",
    termKind: "setting",
    engineeringSignature: {
      expectedStoneCuts: ["custom", "mixed", "unclear"],
      stoneSizePattern: "as observed",
      packingPattern: "as observed — use when construction matches no single signature",
      retentionMechanics: "as observed",
      prongBehavior: "as observed",
      metalVisibility: "as observed",
      rowBehavior: "as observed",
      orientationBehavior: "as observed",
      compatibleGeometry: ["any"],
    },
  },
];

/* -------------------- Layer 2: modern custom / hip-hop vocabulary ---------- */

/**
 * SEPARATE domain on purpose. These are the terms working custom jewelers use,
 * and several of them collide with classical names while meaning something
 * physically different. Never rewrite one of these into its classical namesake.
 */
const HIP_HOP_TERMS: JewelryTerm[] = [
  {
    canonicalName: "Mosaic Setting (custom)",
    vocabularyDomain: "hip_hop_custom",
    aliases: ["mosaic set", "mosaic", "puzzle set", "tile set"],
    definition:
      "Modern custom-jeweler term (NOT the classical tesserae meaning): stones of mixed sizes are fitted like a puzzle to fill a surface edge-to-edge, larger stones placed first and smaller stones fitted into the remaining gaps, retained by shared walls and junction beads so almost no metal shows.",
    termKind: "setting",
    relatedTerms: ["Mosaic (classical)"],
    engineeringSignature: {
      expectedStoneCuts: ["round_brilliant", "baguette", "princess", "custom", "mixed"],
      stoneSizePattern:
        "mixed physical size classes fitted to a tiled field (anchor stones plus smaller fitted fillers), or one repeated size tiled edge-to-edge",
      packingPattern: "tiled/interlocking fill following the surface outline, minimal gaps, no straight repeating rows",
      retentionMechanics: "shared metal walls between neighbours with beads worked at the junctions",
      prongBehavior: "few or no discrete prongs; junction beads only",
      metalVisibility: "very low between stones, visible mainly at field boundaries",
      rowBehavior: "no regular row structure",
      orientationBehavior: "orientation varies per tile to close gaps",
      compatibleGeometry: ["flat", "convex", "curved", "irregular", "letter/plaque"],
    },
  },
  {
    canonicalName: "Reverse Mosaic (custom)",
    vocabularyDomain: "hip_hop_custom",
    aliases: ["inverted mosaic", "negative mosaic", "reverse mosaic"],
    definition:
      "Mosaic-family custom construction where the METAL is the deliberate figure and the tiled stone field is the ground (or the motif is cut out of the stone field), so the metal pattern is intentional rather than leftover.",
    termKind: "setting",
    relatedTerms: ["Mosaic Setting (custom)"],
    engineeringSignature: {
      expectedStoneCuts: ["round_brilliant", "baguette", "custom", "mixed"],
      stoneSizePattern: "tiled field sized to the motif boundaries",
      packingPattern: "tiled fill shaped around a deliberate metal negative-space motif",
      retentionMechanics: "shared walls and junction beads, plus the motif walls themselves",
      prongBehavior: "junction beads",
      metalVisibility: "moderate — the metal pattern is intentional",
      rowBehavior: "no regular row structure",
      orientationBehavior: "orientation follows the negative-space motif",
      compatibleGeometry: ["flat", "convex", "letter/plaque"],
    },
  },
  {
    canonicalName: "Honeycomb Set (custom)",
    vocabularyDomain: "hip_hop_custom",
    aliases: ["honeycomb", "flooded honeycomb"],
    definition:
      "Custom term for a dense field of ONE uniform round size packed hexagonally to full coverage. Physically pavé-family construction, but jewelers name it for the hexagonal packing rather than the bead work.",
    termKind: "setting",
    relatedTerms: ["Micro Pavé", "Pavé"],
    engineeringSignature: {
      expectedStoneCuts: ["round_brilliant"],
      stoneSizePattern: "ONE uniform physical size class after perspective normalization",
      packingPattern: "hexagonal close packing to full coverage",
      retentionMechanics: "shared beads at every junction",
      prongBehavior: "shared beads",
      metalVisibility: "minimal thin bead walls",
      rowBehavior: "offset rows forming hexagons",
      orientationBehavior: "table-up, uniform",
      compatibleGeometry: ["flat", "convex", "curved", "letter/plaque"],
    },
  },
  {
    canonicalName: "Cluster/Buster Set (custom)",
    vocabularyDomain: "hip_hop_custom",
    aliases: ["cluster set", "buster", "flower cluster"],
    definition:
      "Custom construction where groups of small stones are massed around a larger centre so the cluster reads as one big stone; each cluster is a repeated module.",
    termKind: "setting",
    engineeringSignature: {
      expectedStoneCuts: ["round_brilliant", "princess", "mixed"],
      stoneSizePattern: "clear anchor centre with a ring of smaller stones, repeated per cluster",
      packingPattern: "radial clusters repeated across the surface, metal visible between clusters",
      retentionMechanics: "beads or shared prongs within each cluster; cluster head is its own module",
      prongBehavior: "beads inside the cluster, sometimes prongs on the centre",
      metalVisibility: "low inside a cluster, visible between clusters",
      rowBehavior: "clusters may sit in rows; stones within a cluster do not",
      orientationBehavior: "radial about each cluster centre",
      compatibleGeometry: ["flat", "convex", "irregular"],
    },
  },
  {
    canonicalName: "Rail/Bar Set (custom)",
    vocabularyDomain: "hip_hop_custom",
    aliases: ["rail set", "bar set", "channel-look"],
    definition:
      "Custom construction where continuous metal rails run the length of the piece and rows of stones sit between them; reads like channel work but rails are decorative full-length members.",
    termKind: "setting",
    relatedTerms: ["Channel Set"],
    engineeringSignature: {
      expectedStoneCuts: ["round_brilliant", "baguette", "princess"],
      stoneSizePattern: "uniform within each rail run",
      packingPattern: "one or more stone rows bounded by continuous longitudinal rails",
      retentionMechanics: "rails plus beads or shared prongs inside the run",
      prongBehavior: "beads or shared prongs between neighbours",
      metalVisibility: "rails clearly visible, low between stones",
      rowBehavior: "regular rows following the rails",
      orientationBehavior: "aligned to the rail axis",
      compatibleGeometry: ["linear run", "curved"],
    },
  },
  {
    canonicalName: "Iced Out (custom)",
    vocabularyDomain: "hip_hop_custom",
    aliases: ["fully iced", "flooded", "fully flooded", "blinged out"],
    definition:
      "COVERAGE description only, never a retention method: every available surface is stone-covered. It says nothing about how the stones are held, so it can never be the answer to a setting decision.",
    termKind: "construction",
    engineeringSignature: {
      expectedStoneCuts: [],
      stoneSizePattern: "any",
      packingPattern: "full-coverage stone field; coverage only, construction unspecified",
      retentionMechanics: "UNSPECIFIED — must be resolved to a real retention term",
      prongBehavior: "unspecified",
      metalVisibility: "low by definition",
      rowBehavior: "unspecified",
      orientationBehavior: "unspecified",
      compatibleGeometry: ["any"],
    },
  },
  {
    canonicalName: "Baguette Iced (custom)",
    vocabularyDomain: "hip_hop_custom",
    aliases: ["all baguette", "bag set", "emerald cut set"],
    definition:
      "Custom construction using step cuts only, abutted so the field closes with essentially no visible metal; may or may not be true invisible setting depending on whether the girdles are grooved onto a hidden rail.",
    termKind: "setting",
    relatedTerms: ["Invisible Set", "Baguette Channel"],
    engineeringSignature: {
      expectedStoneCuts: ["baguette", "tapered_baguette", "emerald", "princess"],
      stoneSizePattern: "calibrated step cuts, often tapered to the outline",
      packingPattern: "straight girdles abutting to close the field, minimal interstitial metal",
      retentionMechanics: "rails, corner beads or grooved girdles — inspect before naming invisible setting",
      prongBehavior: "corner beads or none visible",
      metalVisibility: "near zero between stones",
      rowBehavior: "rows, borders or radiating fans",
      orientationBehavior: "long axes consistent within a run",
      compatibleGeometry: ["flat", "convex", "letter/plaque", "linear run"],
    },
  },
  /**
   * STONE-FIELD TOPOLOGY term. Deliberately NOT over-specified: Galaxy names a
   * size topology, so its retention mechanics must be observed, never assumed.
   * New hip_hop_custom terms are added here alone — no schema change needed.
   */
  {
    canonicalName: "Galaxy Setting",
    vocabularyDomain: "hip_hop_custom",
    aliases: ["galaxy", "galaxy set", "galaxy setting"],
    definition:
      "Modern custom/hip-hop jewelry term for a stone field characterized primarily by deliberate variation in physical stone size across a surface. Exact packing and retention mechanics may vary by jeweler and piece, so Galaxy must be identified from the observed stone-size topology and overall construction rather than a single assumed prong pattern.",
    termKind: "setting",
    relatedTerms: ["Mosaic Setting (custom)"],
    engineeringSignature: {
      stoneSizePattern:
        "multiple deliberate physical stone-size classes; size variation is structural and must remain after perspective normalization",
      packingPattern:
        "typically non-uniform / organic / irregular compared with regimented uniform pavé; exact packing must be derived from the references",
      expectedStoneCuts: ["round_brilliant", "mixed", "custom"],
      retentionMechanics:
        "VARIABLE — determine from observed construction; Galaxy describes the stone-field topology and must not imply one universal retention system",
      prongBehavior: "VARIABLE — observe rather than assume",
      metalVisibility: "derive from references",
      rowBehavior:
        "generally not dependent on one repeated uniform-size row system; derive actual topology from evidence",
      orientationBehavior: "derive from physical stone map",
      compatibleGeometry: ["flat", "convex", "curved", "irregular", "plaque", "link", "tooth"],
    },
  },
];


/** ONE ontology, two clearly labelled vocabulary layers. */
const JEWELRY_TERMS: JewelryTerm[] = [...CLASSICAL_TERMS, ...HIP_HOP_TERMS];

/** Only terms that can actually answer a setting decision. */
const SETTING_ONTOLOGY: JewelryTerm[] = JEWELRY_TERMS.filter((term) => term.termKind === "setting");


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
            enum: ["cad", "photographic_still", "unclear"],
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
          /** The ontology term the OBSERVED construction actually satisfies. */
          detectedSetting: { type: Type.STRING },
          /** Which vocabulary layer that term belongs to — never blended. */
          vocabularyDomain: {
            type: Type.STRING,
            enum: ["classical", "gemological", "manufacturing", "hip_hop_custom"],
          },
          /** Observed signature elements that MATCH the chosen term. */
          matchedSignals: STRING_ARRAY,
          /** Observed elements that CONTRADICT the chosen term. */
          conflictingSignals: STRING_ARRAY,
          /** True when the label came from the user and may not be renamed. */
          userConfirmedTerm: { type: Type.BOOLEAN },
          settingVisualSignature: { type: Type.STRING },
          evidenceReferenceIds: STRING_ARRAY,
          provenance: PROVENANCE,
          /** How the OBSERVED construction scored against the ontology entry. */
          ontologyMatch: {
            type: Type.OBJECT,
            properties: {
              canonicalName: { type: Type.STRING },
              vocabularyDomain: { type: Type.STRING },
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
          "detectedSetting",
          "vocabularyDomain",
          "matchedSignals",
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
          attribute: { type: Type.STRING },
          cadClaim: { type: Type.STRING },
          photoClaim: { type: Type.STRING },
          resolution: { type: Type.STRING },
          /** True ONLY when both sides are high-confidence — then we ask the user. */
          needsUserDecision: { type: Type.BOOLEAN },
          question: { type: Type.STRING },
          options: STRING_ARRAY,
          confidence: CONFIDENCE,
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
              "product_video",
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

    /**
     * ONE PHYSICAL PRODUCT, MANY OBSERVATIONS. Each reference reports ONLY what
     * IT can see plus what it CANNOT — never its own product interpretation.
     */
    perReferenceObservations: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          referenceId: { type: Type.STRING },
          /** CAD FRONT / MACRO / SIDE / CLASP / VIDEO … evidence role only. */
          evidenceRole: { type: Type.STRING },
          observations: STRING_ARRAY,
          /** What this asset physically cannot answer (occluded/out of frame). */
          unknown: STRING_ARRAY,
          componentIds: STRING_ARRAY,
          /** Never a product verdict — only whether it fits the one case. */
          consistentWithCase: { type: Type.BOOLEAN },
          confidence: CONFIDENCE,
        },
        required: ["referenceId", "observations", "unknown"],
      },
    },
    /**
     * Component-level merges ACROSS references: same clasp / same master link /
     * same border / same bail / same stone cluster from another angle. A merge
     * NEVER duplicates a component just because several assets show it.
     */
    crossReferenceMatches: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          matchId: { type: Type.STRING },
          feature: { type: Type.STRING },
          componentId: { type: Type.STRING },
          physicalStoneIds: STRING_ARRAY,
          repeatModuleId: { type: Type.STRING },
          matchedReferenceIds: STRING_ARRAY,
          matchBasis: STRING_ARRAY,
          merged: { type: Type.BOOLEAN },
          agreementCount: { type: Type.NUMBER },
          provenance: PROVENANCE,
          confidence: CONFIDENCE,
        },
        required: ["feature", "matchedReferenceIds", "merged", "confidence"],
      },
    },
    /**
     * NON-STICKY early reads. Anything not USER_CONFIRMED is a preliminary
     * observation that MUST be revised when later macro/video evidence
     * establishes different construction.
     */
    fusionState: {
      type: Type.OBJECT,
      properties: {
        modelVersion: { type: Type.NUMBER },
        referenceCount: { type: Type.NUMBER },
        classificationStatus: {
          type: Type.STRING,
          enum: ["PRELIMINARY_OBSERVATION", "CROSS_VIEW_CONFIRMED", "USER_CONFIRMED"],
        },
        revisedFromPreliminary: STRING_ARRAY,
        stillPreliminary: STRING_ARRAY,
      },
      required: ["classificationStatus"],
    },
    /**
     * ASKS, never splits. Set only with very strong evidence that unrelated
     * objects were uploaded together — the user answers, FUSE never decides.
     */
    separatePieceSuggestion: {
      type: Type.OBJECT,
      properties: {
        suspected: { type: Type.BOOLEAN },
        question: { type: Type.STRING },
        confidence: CONFIDENCE,
        groups: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              label: { type: Type.STRING },
              referenceIds: STRING_ARRAY,
              reason: { type: Type.STRING },
            },
            required: ["label", "referenceIds"],
          },
        },
      },
      required: ["suspected"],
    },
    /** ONE post-fusion name for the whole card (e.g. "Cuban Bracelet"). */
    productCaseName: { type: Type.STRING },

    /**
     * COMPOSITIONAL SETTING MODEL. One mutually-exclusive dropdown value is too
     * lossy: stone-field TOPOLOGY (e.g. Galaxy) and RETENTION/packing
     * CONSTRUCTION (e.g. Mosaic, Prong, Bead) are independent axes and may both
     * be true at once. Coverage is a third, separate axis.
     */
    settingAnalysis: {
      type: Type.OBJECT,
      properties: {
        stoneFieldTopology: { type: Type.STRING },
        retentionConstruction: { type: Type.STRING },
        coverageStyle: { type: Type.STRING },
        customTerminology: STRING_ARRAY,
        /** How the topology decision was reached — evidence, not a name. */
        topologyEvidence: STRING_ARRAY,
        retentionEvidence: STRING_ARRAY,
        conflictingSignals: STRING_ARRAY,
        /** Raw (pre-normalization) vs surviving PHYSICAL size classes. */
        apparentSizeClasses: STRING_ARRAY,
        physicalSizeClasses: STRING_ARRAY,
        perspectiveNormalizationBasis: { type: Type.STRING },
        physicalSizeVariationConfirmed: { type: Type.BOOLEAN },
        repeatedModuleSizeComparison: { type: Type.STRING },
        videoSizeEvidence: { type: Type.STRING },
        vocabularyDomain: { type: Type.STRING },
        provenance: PROVENANCE,
        confidence: CONFIDENCE,
        needsConfirmation: { type: Type.BOOLEAN },
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
    /**
     * Attached in code from the dedicated FULL-CLIP video passes — never
     * generated by this call, and never a set of keyframe references.
     */

  },
  required: ["productType", "components", "regions", "coverage"],
} as const;

/* ------------------------------------------------------------------ *
 * FULL-CLIP VIDEO UNDERSTANDING (analysis only)
 * ------------------------------------------------------------------ */

const VIDEO_EVIDENCE_STRENGTH = {
  type: Type.OBJECT,
  properties: {
    silhouette: CONFIDENCE,
    componentGeometry: CONFIDENCE,
    thicknessDepth: CONFIDENCE,
    stoneCut: CONFIDENCE,
    stoneSize: CONFIDENCE,
    stonePlacement: CONFIDENCE,
    settingMechanics: CONFIDENCE,
    claspBailConnector: CONFIDENCE,
    materialAppearance: CONFIDENCE,
    manufacturedFinish: CONFIDENCE,
  },
} as const;

const VIDEO_ANALYSIS_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    productIdentity: { type: Type.STRING },
    components: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          componentId: { type: Type.STRING },
          label: { type: Type.STRING },
          construction: { type: Type.STRING },
          confidence: CONFIDENCE,
        },
        required: ["componentId", "label"],
      },
    },
    /** The SAME physical component followed across the clip. */
    temporalComponentTracking: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          componentId: { type: Type.STRING },
          label: { type: Type.STRING },
          observedFrom: STRING_ARRAY,
          apparentSizeDifference: { type: Type.BOOLEAN },
          physicalSizeDifference: { type: Type.BOOLEAN },
          reconciliation: { type: Type.STRING },
          confidence: CONFIDENCE,
        },
        required: ["componentId", "apparentSizeDifference", "physicalSizeDifference"],
      },
    },
    geometryEvidence: {
      type: Type.OBJECT,
      properties: {
        silhouette: { type: Type.STRING },
        linkGeometry: { type: Type.STRING },
        curvature: { type: Type.STRING },
        thickness: { type: Type.STRING },
        depth: { type: Type.STRING },
        sidewalls: { type: Type.STRING },
        rearConstruction: { type: Type.STRING },
      },
    },
    stoneEvidence: {
      type: Type.OBJECT,
      properties: {
        dominantCuts: STRING_ARRAY,
        physicalSizeClasses: STRING_ARRAY,
        sizeUniformity: { type: Type.STRING },
        packingPattern: { type: Type.STRING },
        stonePlacement: { type: Type.STRING },
        orientationPattern: { type: Type.STRING },
        exposedMetalPattern: { type: Type.STRING },
      },
    },
    settingEvidence: {
      type: Type.OBJECT,
      properties: {
        observedRetentionMechanics: { type: Type.STRING },
        prongBehavior: { type: Type.STRING },
        beadBehavior: { type: Type.STRING },
        rails: { type: Type.STRING },
        channels: { type: Type.STRING },
        bezels: { type: Type.STRING },
        seatDepth: { type: Type.STRING },
        metalVisibility: { type: Type.STRING },
      },
    },
    repeatedModules: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          moduleId: { type: Type.STRING },
          label: { type: Type.STRING },
          masterGeometry: { type: Type.STRING },
          masterStoneMap: { type: Type.STRING },
          memberCount: { type: Type.NUMBER },
          exceptions: STRING_ARRAY,
          confidence: CONFIDENCE,
        },
        required: ["moduleId", "label"],
      },
    },
    claspEvidence: { type: Type.STRING },
    bailEvidence: { type: Type.STRING },
    connectorEvidence: { type: Type.STRING },
    materialEvidence: { type: Type.STRING },
    manufacturedFinish: { type: Type.STRING },
    /** INTERNAL evidence only — timestamps never become reference images. */
    temporalObservations: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          timestamp: { type: Type.NUMBER },
          observation: { type: Type.STRING },
          resolves: { type: Type.STRING },
          confidence: CONFIDENCE,
        },
        required: ["observation"],
      },
    },
    conflictingEvidence: STRING_ARRAY,
    unresolvedFeatures: STRING_ARRAY,
    evidenceStrength: VIDEO_EVIDENCE_STRENGTH,
  },
  required: ["productIdentity", "components", "geometryEvidence", "stoneEvidence", "settingEvidence"],
} as const;

function buildVideoAnalysisPrompt(clip: VideoReferenceInput, options: IntakeOptions) {
  return [
    "You are FUSE's jewelry reconstruction analyst. You are watching the COMPLETE product video of ONE physical replacement jewelry piece.",
    `CLIP: "${clip.videoReferenceId}"${clip.duration ? `, ${clip.duration.toFixed(2)}s` : ""}${clip.aspectRatio ? `, ${clip.aspectRatio}` : ""}.`,
    "ANALYSIS ONLY. You never generate, render or describe an output image. You reconstruct the physical object.",
    "",
    "RECONSTRUCTION PRECEDES CLASSIFICATION. Watch the whole clip before naming anything. Never classify a setting from the first second.",
    "",
    "TEMPORAL REASONING (required):",
    "- Track the SAME physical component across time as the camera moves; give it one componentId for the whole clip.",
    "- Track the SAME stone field across changing angles. Distinguish APPARENT size change (perspective, foreshortening, distance, receding surfaces) from REAL physical size difference. If stones look smaller as a link rotates away but identical links facing camera show the same apparent size, set apparentSizeDifference=true and physicalSizeDifference=false — do NOT invent separate physical size classes.",
    "- Use geometry that becomes visible LATER to resolve ambiguity EARLIER: a fact clear at 7s resolves a doubt at 2s.",
    "- Recover repeated link/module construction: reconstruct the MASTER module geometry and stone map, count members, and record exceptions.",
    "- Reconcile front, side and rear relationships into one coherent object.",
    "",
    "Record timestamps in temporalObservations as INTERNAL evidence (e.g. best side profile, clasp fully visible). They are never used as generation reference images.",
    "",
    "SETTING MECHANICS: report what you OBSERVE (retention, prongs, beads, rails, channels, bezels, seat depth, exposed metal, packing) before any classification. If the evidence is insufficient, say so in unresolvedFeatures instead of guessing.",
    "evidenceStrength: how strongly THIS clip supports each attribute (0-1).",
    options.detailLevel ? `Detail level: ${options.detailLevel}.` : "",
    "Short factual phrases. No marketing slang. Never output URLs, file names or base64.",
  ].filter(Boolean).join("\n");
}

/**
 * ONE analysis call per clip carrying the ENTIRE video. The clip is never split
 * into image references and never reaches the image renderer.
 */
async function runVideoAnalysis(args: {
  ai: GoogleGenAI;
  videoReferences: VideoReferenceInput[];
  options: IntakeOptions;
}) {
  const analyses: any[] = [];
  const failures: string[] = [];
  let geminiMs = 0;
  for (const clip of args.videoReferences) {
    const started = Date.now();
    try {
      const { part, transport, bytes } = await videoPartFor(args.ai, clip);
      const response = await args.ai.models.generateContent({
        model: GEMINI_ANALYSIS_MODEL,
        contents: [
          { role: "user", parts: [{ text: buildVideoAnalysisPrompt(clip, args.options) }, part] },
        ] as any,
        config: {
          responseMimeType: "application/json",
          responseSchema: VIDEO_ANALYSIS_SCHEMA as any,
          maxOutputTokens: 16384,
          temperature: 0,
          thinkingConfig: { thinkingLevel: "medium" },
        },
      });
      const parsed = JSON.parse((response.text ?? "").trim());
      analyses.push({
        ...parsed,
        videoReferenceId: clip.videoReferenceId,
        duration: clip.duration,
        transport,

      });
      console.log(
        `[analyze-jewelry-frames] VIDEO ANALYSIS SUMMARY clip=${clip.videoReferenceId} transport=${transport} bytes=${bytes} identity=${String(parsed?.productIdentity ?? "?").slice(0, 160)}`,
      );
      console.log(
        `[analyze-jewelry-frames] PHYSICAL STONE SIZE PATTERN clip=${clip.videoReferenceId} classes=${(parsed?.stoneEvidence?.physicalSizeClasses ?? []).join(" | ")} uniformity=${parsed?.stoneEvidence?.sizeUniformity ?? "?"} packing=${parsed?.stoneEvidence?.packingPattern ?? "?"}`,
      );
      console.log(
        `[analyze-jewelry-frames] SETTING MECHANICS EVIDENCE clip=${clip.videoReferenceId} retention=${parsed?.settingEvidence?.observedRetentionMechanics ?? "?"} prongs=${parsed?.settingEvidence?.prongBehavior ?? "?"} metal=${parsed?.settingEvidence?.metalVisibility ?? "?"}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Video analysis failed";
      failures.push(`${clip.videoReferenceId}: ${message}`.slice(0, 400));
      console.error(`[analyze-jewelry-frames] video analysis failed clip=${clip.videoReferenceId}`, message);
    } finally {
      geminiMs += Date.now() - started;
    }
  }
  return { videoAnalyses: analyses, videoFailures: failures, geminiMs };
}

/** The full-clip findings, condensed for the fusion prompt. */
function videoEvidenceLines(analyses: any[]) {
  return analyses.flatMap((analysis) => {
    const id = analysis?.videoReferenceId ?? "clip";
    const tracking = (analysis?.temporalComponentTracking ?? [])
      .map((entry: any) =>
        `      ${entry?.label ?? entry?.componentId}: apparentSizeDifference=${entry?.apparentSizeDifference === true}, physicalSizeDifference=${entry?.physicalSizeDifference === true}${entry?.reconciliation ? ` — ${entry.reconciliation}` : ""}`,
      );
    const modules = (analysis?.repeatedModules ?? []).map((module: any) =>
      `      MASTER ${module?.label ?? module?.moduleId}: ${module?.masterGeometry ?? "?"}; stones ${module?.masterStoneMap ?? "?"}; members ${module?.memberCount ?? "?"}`,
    );
    return [
      `  FULL VIDEO "${id}" (complete clip analysed):`,
      `    identity: ${analysis?.productIdentity ?? "?"}`,
      `    geometry: ${Object.values(analysis?.geometryEvidence ?? {}).filter(Boolean).join("; ") || "?"}`,
      `    stones: cuts ${(analysis?.stoneEvidence?.dominantCuts ?? []).join(", ") || "?"}; physical size classes ${(analysis?.stoneEvidence?.physicalSizeClasses ?? []).join(", ") || "?"}; uniformity ${analysis?.stoneEvidence?.sizeUniformity ?? "?"}; packing ${analysis?.stoneEvidence?.packingPattern ?? "?"}; exposed metal ${analysis?.stoneEvidence?.exposedMetalPattern ?? "?"}`,
      `    setting mechanics observed: ${Object.values(analysis?.settingEvidence ?? {}).filter(Boolean).join("; ") || "?"}`,
      `    clasp: ${analysis?.claspEvidence ?? "?"}; bail: ${analysis?.bailEvidence ?? "?"}; connector: ${analysis?.connectorEvidence ?? "?"}`,
      `    material: ${analysis?.materialEvidence ?? "?"}; manufactured finish: ${analysis?.manufacturedFinish ?? "?"}`,
      tracking.length ? "    temporal component tracking:" : "",
      ...tracking,
      modules.length ? "    repeated-module masters:" : "",
      ...modules,
      (analysis?.conflictingEvidence ?? []).length
        ? `    conflicts: ${(analysis.conflictingEvidence ?? []).join("; ")}`
        : "",
      (analysis?.unresolvedFeatures ?? []).length
        ? `    unresolved: ${(analysis.unresolvedFeatures ?? []).join("; ")}`
        : "",
    ].filter(Boolean);
  });
}


function buildKnowledgeMapPrompt(args: {
  references: JewelryReferenceInput[];
  videoReferences: VideoReferenceInput[];
  /** Structured findings from the COMPLETE-clip video passes. */
  videoAnalyses?: any[];
  intake: any;
  options: IntakeOptions;
  unavailable: Set<number>;
  /** USER_CONFIRMED facts — Gemini may never override these. */
  userConfirmedFacts?: UserConfirmedFact[];
  /** The ONE physical piece all of these assets observe. */
  productCaseId?: string;
}) {


  const refLines = args.references.map((ref, index) => {
    const id = referenceIdAt(index);
    return `${id} (index ${index}) — kind: ${ref.kind ?? "photographic_still"}${
      ref.role ? `; user label "${ref.role}"` : ""
    }${ref.cad ? "; user marked DESIGN AUTHORITY" : ""}${
      args.unavailable.has(index) ? " — IMAGE UNAVAILABLE (skip entirely)" : ""
    }`;
  });

  const clipLines = videoEvidenceLines(args.videoAnalyses ?? []);


  const products = Array.isArray(args.intake?.products) ? args.intake.products : [];
  const confirmedSpec = products.map((product: any, index: number) =>
    `PIECE ${index + 1}: type ${detectedValue(product?.jewelryType) || "?"}; metal ${
      detectedValue(product?.metal) || "?"
    }; stone ${detectedValue(product?.stoneType) || "?"}; components ${
      listOf(product?.visibleComponents).join(", ") || "?"
    }`
  );

  /**
   * ONE CARD = ONE PHYSICAL PIECE. Stated up front so no reference is ever
   * classified as a product of its own.
   */
  const observationCount = args.references.length + (args.videoReferences?.length ?? 0);
  const onePhysicalProductLine =
    "ONE PHYSICAL PRODUCT (case " +
    (args.productCaseId ?? DEFAULT_PRODUCT_CASE_ID) +
    ") · " +
    observationCount +
    " OBSERVATIONS. Every asset listed below — CAD, front, side, macro, clasp still and the full product video — is a DIFFERENT OBSERVATION OF THE SAME PHYSICAL PIECE (one bracelet, pendant, ring, watch, earring, grill or custom object). RECONSTRUCT THE SINGLE OBJECT by combining complementary evidence. Do NOT produce one product interpretation per reference, do NOT finalise productType, metal, stone, setting, geometry, clasp, bail or stone layout from a single reference while other evidence for this case exists, and do NOT treat a reference that shows only a fragment (a tight CAD crop, a macro of three stones, a clasp close-up) as a different product. Return exactly ONE fused ProductKnowledgeMap plus perReferenceObservations, crossReferenceMatches and conflicts.";


  return [
    "You are a jewelry ENGINEERING analyst. This is ANALYSIS ONLY: return JSON only, never an image, never a video, never a URL, never bytes. You never generate or modify jewelry.",
    "",
    "ASSET FIREWALL: every image below is a REPLACEMENT_PRODUCT_REFERENCE — evidence of the ACTUAL replacement piece (geometry / material / stone / setting / component authority). None of them is source cinematography, and you are given NO source footage: never describe camera work of a shoot, only the physical product.",
    "",
    onePhysicalProductLine,

    "",
    "REPLACEMENT EVIDENCE, in this exact order (images follow this text):",

    ...refLines,
    clipLines.length
      ? "\nFULL-CLIP PRODUCT VIDEO UNDERSTANDING — already extracted by watching the ENTIRE clip end to end (no video is attached here; these findings ARE the video evidence and are authoritative for depth, physical relationships, setting behaviour, repeated geometry and clasp construction):"
      : "",
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

    "Attribute authority is per attribute — no source is globally authoritative. CAD → silhouette, proportions, stone seats, topology. FULL VIDEO UNDERSTANDING → depth, physical relationships, setting behaviour, repeated module geometry, clasp construction. Macro stills → prongs, cut, packing density. Hero product photo → manufactured finish, metal appearance, stone realism. When two sources genuinely disagree, record a constructionConflict with a resolution — NEVER silently average them.",
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
    "9. FULL-CLIP VIDEO EVIDENCE. Fuse the FULL-CLIP PRODUCT VIDEO UNDERSTANDING above with the stills and CAD. Honour its temporal reconciliations: where it reports apparentSizeDifference=true with physicalSizeDifference=false, record ONE perspective-normalized physical size class and never split it into several physical classes. Adopt its master-module geometry for repeated links, and its clasp/bail construction where the clip established it. Classify the setting only AFTER this fusion.",
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
    "17. TERMINOLOGY ONTOLOGY — MATCH CONSTRUCTION, NOT NAMES. Never classify a setting, cut or component from general visual intuition or from what a piece is usually called. Before committing ANY label, compare the OBSERVED physical construction (retention mechanics, prong/bead behaviour, rails, walls, seat depth, metal visibility, packing, physical size classes, orientation, surface geometry) against the engineeringSignature of the candidate terms below, and choose the term whose SIGNATURE the evidence actually satisfies. A name or alias match ALONE is never sufficient evidence, and a term's popularity for that product type is not evidence at all. For EVERY setting decision output: detectedSetting (the ontology canonicalName), vocabularyDomain (classical | gemological | manufacturing | hip_hop_custom), matchedSignals (the observed signature elements that MATCH), conflictingSignals (observed elements that CONTRADICT the chosen term), confidence and evidenceReferenceIds. Keep settingClassificationReason FIRST and consistent with everything you output, and separately map to one of the app's canonical enums. If conflictingSignals outweigh matchedSignals, or two terms fit equally, use Custom/Unknown or needs_confirmation with confidence below 0.45 — never guess.",
    "17a. THE TWO VOCABULARY LAYERS ARE NOT INTERCHANGEABLE. Traditional/gemological/manufacturing terms and modern custom-jeweler (hip-hop) terms are separate vocabularies, and some names exist in BOTH with DIFFERENT physical meanings (e.g. classical \"Mosaic\" = tesserae forming a picture, versus the custom jeweler's \"Mosaic Setting\" = a mixed-size puzzle-fitted diamond field). Never translate a custom term into its classical namesake, never apply the classical definition to a custom construction, and never rename the user's vocabulary. Always state which domain the term you chose came from. If the construction matches a custom-domain signature, report the custom-domain term with vocabularyDomain hip_hop_custom.",
    "17b. COVERAGE WORDS ARE NOT SETTINGS. A term whose retentionMechanics is UNSPECIFIED (e.g. the iced-out/flooded coverage family) can never be a setting answer — resolve to the real retention term or needs_confirmation.",
    "17c. USER-SUPPLIED TERMINOLOGY WINS AND IS NEVER RENAMED. If a USER_CONFIRMED fact names the setting, cut, component or construction (e.g. Setting = Mosaic), that LABEL is final: set detectedSetting to the user's wording exactly, set userConfirmedTerm true, provenance USER_CONFIRMED, and pick the vocabularyDomain the user's wording belongs to (custom-jeweler wording stays hip_hop_custom). You may and should still describe the exact physical construction underneath that label in settingVisualSignature, matchedSignals and conflictingSignals — recording an honest conflictingSignals entry is correct — but you must NEVER substitute a different canonicalName, translate the term into another vocabulary domain, append a corrected name, or downgrade it to needs_confirmation.",

    "TERMINOLOGY ONTOLOGY (candidate terms, grouped by vocabulary domain — signature must be satisfied by observation):",
    ...JEWELRY_TERMS.map((term) =>
      `- [${term.vocabularyDomain}/${term.termKind}] ${term.canonicalName} (aliases: ${
        term.aliases.join(", ") || "none"
      }${term.relatedTerms?.length ? `; different-domain look-alikes: ${term.relatedTerms.join(", ")}` : ""}): ${term.definition} SIGNATURE → retention ${term.engineeringSignature.retentionMechanics}; prongs ${term.engineeringSignature.prongBehavior}; sizes ${term.engineeringSignature.stoneSizePattern}; cuts ${
        term.engineeringSignature.expectedStoneCuts.join("/") || "n/a"
      }; packing ${term.engineeringSignature.packingPattern}; metal ${term.engineeringSignature.metalVisibility}; rows ${term.engineeringSignature.rowBehavior}; orientation ${term.engineeringSignature.orientationBehavior}; surfaces ${
        term.engineeringSignature.compatibleGeometry.join("/")
      }`
    ),
    "The ontology is a comparison table, not a menu of likely answers: if the evidence satisfies no signature, say so instead of picking the nearest name.",

    "18. STYLE SLANG SEPARATION. Jeweler style language (\"iced out\", \"fully flooded\", \"VVS look\", \"buster\", \"custom Cuban\") goes ONLY in styleDescriptors. It must never appear in the engineering map, a setting name, a settingClassificationReason or a signature.",
    "19. SCALE CLAIMS. Exact millimetres only with real evidence, priority: explicit user dimensions > CAD / spec > known stone dimensions > repeated calibrated geometry > photographic estimate. Store each claim separately in dimensions.scaleClaims with its basis, e.g. \"1.25mm\" basis measured_from_spec versus \"~1.2-1.5mm\" basis visually_estimated versus \"uniform stone size\" (a uniformity claim is NOT a millimetre claim).",
    "20. CONTRADICTIONS. Never silently merge disagreeing evidence: record it in constructionConflicts (or a physicalStone's conflictingEvidence) and resolve it by ATTRIBUTE authority, stating which reference won for which attribute.",
    "21. AGENTIC EVIDENCE-SEEKING. After forming the map, list every attribute that is still unresolved or low-confidence in evidenceGaps and FIRST try to resolve each one from the EXISTING evidence (other stills, the full-clip product video understanding, repeated modules, CAD, symmetry) — set resolvedFromExistingEvidence and resolutionMethod accordingly. Only when the existing evidence is genuinely exhausted set requestedUserReference to a specific, actionable ask (e.g. \"a clasp-side reference would improve accuracy\").",
    "22. AUTOMATIC ATTRIBUTE AUTHORITY (the user never assigns authority — you do). For EVERY reference in referenceCatalog fill evidenceStrength 0-1 for each attribute (silhouette, overallGeometry, dimensions, componentTopology, stoneSeatLayout, stoneCut, stoneSize, stonePlacement, settingMechanics, prongConstruction, thicknessDepth, claspBailConnector, metalColor, materialAppearance, manufacturedFinish) using occlusion, blur, glare, scintillation, compression, angle, distance, scale, visible region and disposable context. Then set authorityFor to ONLY the attributes where that reference is among the strongest, and notAuthorityFor where it must not be trusted. NEVER a single global score, and NEVER assume CAD is authority for everything: CAD/render → geometry, proportions, topology, stone seats; macro → stone size, cut, setting mechanics, prongs; side profile → thickness/depth/sidewall; product front → manufactured finish, metal appearance, stone realism. Different references may each be authoritative for different attributes.",
    "23. GENUINE CONFLICTS → ONE PLAIN QUESTION. When two HIGH-confidence references disagree on an attribute (e.g. CAD and product photos show different clasps), add a constructionConflicts entry with attribute, needsUserDecision true, a short plain-language question a non-technical owner can answer (\"CAD and the product photos show different clasp designs — which one is the final piece?\") and 2-3 concrete options. If either side is low-confidence, set needsUserDecision false and resolve it yourself by attribute authority — never nag on weak differences.",
    "24. REFERENCES PRODUCE OBSERVATIONS, NOT PRODUCTS. For EVERY reference emit one perReferenceObservations entry with what it CAN see (observations), what it CANNOT (unknown), the componentIds it contributes, and a short evidenceRole describing its role as evidence ONLY (e.g. CAD FRONT, MACRO, SIDE PROFILE, CLASP, FULL VIDEO). Never give a reference its own productType, metal, setting or stone verdict, never write a per-reference product title, and never describe an asset as a render or a design of its own — it is one observation of this case.",
    "25. CROSS-REFERENCE RECONCILIATION IS MANDATORY. Explicitly attempt, for every candidate feature, to match it across references: is this the SAME clasp, the SAME master link, the SAME border, the SAME bail, the SAME stone cluster from another angle? Record each attempt in crossReferenceMatches with feature, componentId, matchedReferenceIds, matchBasis, merged and agreementCount, and MERGE the evidence onto the one componentId / physicalStoneId / repeatModuleId when it matches (reuse the cross-view registration rules 12-13). Never duplicate a component, stone or module just because it appears in several references, and never inflate counts across views.",
    "26. THE MODEL IS REVISED, NOT REPLACED — EARLY READS ARE NOT STICKY. The whole settled asset set yields ONE consolidated result: one reference gives a preliminary model, adding a second gives version 2 of the SAME model (never a second interpretation beside the first), a third gives version 3. Mark any classification that rests on limited evidence with fusionState.classificationStatus PRELIMINARY_OBSERVATION and list it in stillPreliminary; when later macro, side or full-video evidence establishes a different construction you MUST change it and list the attribute in revisedFromPreliminary — never defend an earlier read because you made it first. Only USER_CONFIRMED values are permanently locked. Set fusionState.referenceCount to the number of assets fused and modelVersion to that same count.",
    "27. CONFLICTS ARE ATTRIBUTE-SPECIFIC, NEVER 'TWO PRODUCTS'. If two references disagree, NEVER conclude they show separate pieces. First investigate the mundane causes — perspective, distance, lighting and white balance, glare and scintillation, compression artefacts, occlusion, CAD versus manufactured piece, prototype versus final production, or a contaminated reference (a stock or lookalike image) — and record the disagreement against THAT attribute only (constructionConflicts / conflictingEvidence). Everything else about the piece stays fused. Only for a genuine HIGH-confidence conflict ask the plain question per rule 23.",
    "28. A SECOND PIECE ONLY WHEN THE USER SAYS SO. You may NEVER split this case. If — and only if — you have very strong evidence that unrelated objects were uploaded together, set separatePieceSuggestion.suspected true with the candidate groups (label + referenceIds + reason) and a plain question (\"These files appear to contain two different pieces: A — Cuban Bracelet, B — Pendant. Separate them?\"). The user answers; you never act on it, and everything stays in ONE fused map until they do. Different angles, crops, fragments, CAD renders, lighting or finishes are NOT evidence of a second piece.",
    "29. NAME THE CASE AFTER FUSION. Set productCaseName to ONE short, plain post-fusion name for the whole piece derived from the fused reconstruction (e.g. \"Cuban Bracelet\", \"Diamond Cross Pendant\"). Never an asset-style or render-style title (no \"Render\", \"Design\", \"Mockup\", \"Untitled\", file names, resolutions or per-image descriptions), and never one name per reference.",
    "30. COMPOSITIONAL SETTING MODEL — TOPOLOGY IS NOT RETENTION. Fill settingAnalysis with INDEPENDENT axes: stoneFieldTopology (how the physical stone sizes are distributed across the surface, e.g. Galaxy for deliberate multi-size variation, or a uniform-field topology), retentionConstruction (how the stones are physically held, e.g. Mosaic, Prong, Bead, Rail, Channel, Bezel or a custom term), coverageStyle (coverage only, e.g. Fully Iced / partial) and customTerminology (every custom term that genuinely applies). These are NOT mutually exclusive and NOT a single dropdown: \"Galaxy Mosaic\", \"Galaxy + Prong\" and \"Galaxy + Bead\" are all valid results, and a piece may be stoneFieldTopology Galaxy AND retentionConstruction Mosaic at the same time. Never force a topology term to imply one retention mechanic, and never let choosing one axis suppress the other. Record topologyEvidence, retentionEvidence and conflictingSignals as observed physical statements, and set needsConfirmation true (confidence below 0.45) rather than guessing an axis you could not establish.",
    "31. GALAXY REQUIRES REAL PHYSICAL SIZE VARIATION (HARD GATE). Before Galaxy may ever appear in settingAnalysis you MUST run and report this pipeline: (a) list the RAW apparent stone-size classes in apparentSizeClasses; (b) perspective-normalize them (perspectiveNormalizationBasis); (c) compare the same stone field across views/references; (d) compare corresponding stones on repeated identical modules (repeatedModuleSizeComparison); (e) use the full-clip video size persistence across rotation (videoSizeEvidence); then (f) state the surviving physicalSizeClasses and set physicalSizeVariationConfirmed. If the apparent differences DISAPPEAR after normalization, that is NOT Galaxy evidence and Galaxy must not be used. Only persistent real size differences confirmed by multiple views or the full clip are strong Galaxy evidence. Do not steer toward or away from Galaxy — it competes on evidence like every other term.",
    "32. THE VISIBLE SETTING COMES FROM THIS FUSED MAP. Your settings[] entries and settingAnalysis are the FINAL user-facing setting authority; any earlier single-pass first-image impression is a PRELIMINARY observation only and must be overridden here when the fused evidence disagrees. Never output vague placeholders like \"Mixed/Multiple\" as a conclusion when the evidence supports a real compositional answer; if the evidence genuinely does not support one, say needs_confirmation.",

    "NO PRODUCT-TYPE SHORTCUTS: never infer a setting, component list, stone count or module from the product type or from the piece's name. Everything must come from what the references physically show.",


    "Short phrases only. No prose paragraphs. Never output URLs, file names, base64 or media of any kind.",

  ].filter(Boolean).join("\n");
}

/** ONE fusion call: reference images + the FULL-CLIP video findings. */
async function runKnowledgeMap(args: {
  ai: GoogleGenAI;
  imageParts: unknown[];
  references: JewelryReferenceInput[];
  videoReferences: VideoReferenceInput[];
  videoAnalyses?: any[];
  intake: any;
  options: IntakeOptions;
  unavailable: Set<number>;
  userConfirmedFacts?: UserConfirmedFact[];
  /** The ONE physical piece this whole asset set observes. */
  productCaseId?: string;

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
  // The full-clip understanding is persisted alongside the fused map.
  map.videoAnalyses = args.videoAnalyses ?? [];
  // ONE CASE. Every asset in this request fused into this single map.
  const caseId = args.productCaseId ?? DEFAULT_PRODUCT_CASE_ID;
  const referenceCount = args.references.length + args.videoReferences.length;
  map.productCaseId = caseId;
  map.perReferenceObservations = arrayOf(map.perReferenceObservations);
  map.crossReferenceMatches = arrayOf(map.crossReferenceMatches);
  map.fusionState = {
    ...(map.fusionState ?? {}),
    // Non-sticky by default: only the USER_CONFIRMED layer is permanent.
    classificationStatus: map?.fusionState?.classificationStatus ?? "PRELIMINARY_OBSERVATION",
    referenceCount,
    modelVersion: Number(map?.fusionState?.modelVersion ?? referenceCount) || referenceCount,
  };
  // A suggestion only — the split never happens without the user's answer.
  map.separatePieceSuggestion = {
    suspected: map?.separatePieceSuggestion?.suspected === true,
    question: map?.separatePieceSuggestion?.question ?? null,
    confidence: map?.separatePieceSuggestion?.confidence ?? null,
    groups: arrayOf(map?.separatePieceSuggestion?.groups),
  };
  // The user's confirmations are persisted with the map and win forever.
  map.userConfirmedFacts = args.userConfirmedFacts ?? [];
  // The ontology travels with the map so the admin panel and any later
  // classification compare against the SAME signatures, with the two vocabulary
  // layers kept distinguishable (domain + which decision each term can answer).

  // layers kept distinguishable (domain + which decision each term can answer).
  map.settingOntology = SETTING_ONTOLOGY.map((entry) => entry.canonicalName);
  map.terminologyOntology = {
    version: PKM_VERSION,
    terms: JEWELRY_TERMS.map((term) => ({
      canonicalName: term.canonicalName,
      vocabularyDomain: term.vocabularyDomain,
      termKind: term.termKind,
      aliases: term.aliases,
      relatedTerms: term.relatedTerms ?? [],
    })),
  };
  for (const setting of arrayOf(map.settings)) {
    console.log(
      `[analyze-jewelry-frames] SETTING TERM MATCH region=${setting?.regionId ?? "?"} detected=${setting?.detectedSetting ?? setting?.canonicalSetting ?? "?"} domain=${setting?.vocabularyDomain ?? "?"} matched=${
        arrayOf(setting?.matchedSignals).length
      } conflicting=${arrayOf(setting?.conflictingSignals).length} confidence=${setting?.confidence ?? "?"}`,
    );
  }
  console.log(
    `[analyze-jewelry-frames] ONE PRODUCT FUSION case=${caseId} name=${map?.productCaseName ?? "?"} references=${referenceCount} observations=${map.perReferenceObservations.length} crossRefMerges=${
      map.crossReferenceMatches.filter((match: any) => match?.merged).length
    }/${map.crossReferenceMatches.length} status=${map.fusionState.classificationStatus} v${map.fusionState.modelVersion} splitSuggested=${map.separatePieceSuggestion.suspected}`,
  );
  // COMPOSITIONAL SETTING MODEL + the Galaxy perspective gate, enforced in code.
  normalizeSettingAnalysis(map);
  logSettingAcceptance(map);
  console.log(
    `[analyze-jewelry-frames] FINAL SETTING CLASSIFICATION setting=${detectedValue(map?.setting) || map?.setting?.canonical || "?"} reason=${String(map?.settingClassificationReason ?? "").slice(0, 300)}`,
  );


  return { knowledgeMap: applyUserConfirmedFacts(map, args.userConfirmedFacts ?? []), geminiMs: Date.now() - started };
}

/** Every term whose signature is a stone-field TOPOLOGY rather than retention. */
const TOPOLOGY_TERMS = SETTING_ONTOLOGY.filter((term) =>
  /VARIABLE/i.test(term.engineeringSignature.retentionMechanics)
).map((term) => term.canonicalName);

function termByName(name: string) {
  const lower = String(name ?? "").trim().toLowerCase();
  if (!lower) return null;
  return (
    JEWELRY_TERMS.find((term) =>
      term.canonicalName.toLowerCase() === lower ||
      term.aliases.some((alias) => alias.toLowerCase() === lower)
    ) ??
    JEWELRY_TERMS.find((term) =>
      lower.includes(term.canonicalName.toLowerCase()) ||
      term.aliases.some((alias) => lower.includes(alias.toLowerCase()))
    ) ?? null
  );
}

/**
 * Guarantees the compositional shape exists, and enforces the ONE structural
 * rule in code: a stone-field topology that depends on real physical size
 * variation (Galaxy and any future term like it) may not survive when the
 * apparent size differences did not survive perspective normalization.
 * Retention construction is untouched — the axes are independent.
 */
function normalizeSettingAnalysis(map: any) {
  const raw = map?.settingAnalysis && typeof map.settingAnalysis === "object" ? map.settingAnalysis : {};
  const groups = arrayOf(map?.stoneGroups);
  const physicalVariation = raw.physicalSizeVariationConfirmed === true ||
    groups.some((group: any) =>
      group?.physicalSizeDifference === true ||
      ["mixed", "graduated"].includes(String(group?.sizeUniformity ?? ""))
    );

  const analysis = {
    stoneFieldTopology: String(raw.stoneFieldTopology ?? "").trim() || null,
    retentionConstruction: String(raw.retentionConstruction ?? "").trim() || null,
    coverageStyle: String(raw.coverageStyle ?? "").trim() || null,
    customTerminology: arrayOf(raw.customTerminology).map((entry: any) => String(entry).trim()).filter(Boolean),
    topologyEvidence: arrayOf(raw.topologyEvidence),
    retentionEvidence: arrayOf(raw.retentionEvidence),
    conflictingSignals: arrayOf(raw.conflictingSignals),
    apparentSizeClasses: arrayOf(raw.apparentSizeClasses),
    physicalSizeClasses: arrayOf(raw.physicalSizeClasses),
    perspectiveNormalizationBasis: String(raw.perspectiveNormalizationBasis ?? "").trim() || null,
    physicalSizeVariationConfirmed: physicalVariation,
    repeatedModuleSizeComparison: String(raw.repeatedModuleSizeComparison ?? "").trim() || null,
    videoSizeEvidence: String(raw.videoSizeEvidence ?? "").trim() || null,
    vocabularyDomain: String(raw.vocabularyDomain ?? "").trim() || null,
    provenance: raw.provenance ?? "LOW_CONFIDENCE_INFERENCE",
    confidence: Number.isFinite(Number(raw.confidence)) ? Number(raw.confidence) : 0,
    needsConfirmation: raw.needsConfirmation === true,
    /** Set when the perspective gate removed a size-variation topology claim. */
    perspectiveGateApplied: false,
  };

  // HARD GATE — universal, driven by the ontology signature, never hardcoded to
  // one product or one term name.
  const topologyTerm = analysis.stoneFieldTopology ? termByName(analysis.stoneFieldTopology) : null;
  const dependsOnSizeVariation = Boolean(
    topologyTerm && /size/i.test(topologyTerm.engineeringSignature.stoneSizePattern) &&
      /variation|classes|mixed/i.test(topologyTerm.engineeringSignature.stoneSizePattern),
  );
  if (dependsOnSizeVariation && !physicalVariation) {
    analysis.conflictingSignals = [
      ...analysis.conflictingSignals,
      `apparent stone-size variation did not survive perspective normalization — "${analysis.stoneFieldTopology}" topology not supported`,
    ];
    analysis.stoneFieldTopology = null;
    analysis.customTerminology = analysis.customTerminology.filter(
      (term: string) => termByName(term)?.canonicalName !== topologyTerm?.canonicalName,
    );
    analysis.needsConfirmation = true;
    analysis.perspectiveGateApplied = true;
  }

  map.settingAnalysis = analysis;
  // The compositional axes ARE the user-facing terminology.
  map.resolvedSettingTerminology = [
    analysis.stoneFieldTopology,
    analysis.retentionConstruction,
  ].filter(Boolean).join(" ") || null;
  map.settingTopologyTerms = TOPOLOGY_TERMS;
  return map;
}

/** ACCEPTANCE LOG — one line per required signal, no product hardcoding. */
function logSettingAcceptance(map: any) {
  const analysis = map?.settingAnalysis ?? {};
  const groups = arrayOf(map?.stoneGroups);
  const settings = arrayOf(map?.settings);
  const signalsFor = (name: string) => {
    const term = termByName(name);
    const match = settings.find((setting: any) =>
      termByName(setting?.detectedSetting ?? setting?.canonicalSetting ?? "")?.canonicalName ===
        term?.canonicalName
    );
    return {
      matched: arrayOf(match?.matchedSignals),
      conflicting: arrayOf(match?.conflictingSignals),
    };
  };
  const line = (label: string, value: unknown) =>
    console.log(`[analyze-jewelry-frames] ${label}: ${
      typeof value === "string" ? value : JSON.stringify(value ?? null)
    }`);

  line("RAW APPARENT STONE SIZE CLASSES", arrayOf(analysis.apparentSizeClasses));
  line("PERSPECTIVE-NORMALIZED PHYSICAL SIZE CLASSES", arrayOf(analysis.physicalSizeClasses));
  line("PERSPECTIVE NORMALIZATION BASIS", analysis.perspectiveNormalizationBasis ?? "none");
  line("REPEATED MODULE SIZE COMPARISON", analysis.repeatedModuleSizeComparison ?? "none");
  line("FULL-VIDEO SIZE EVIDENCE", analysis.videoSizeEvidence ?? "none");
  line(
    "STONE GROUP UNIFORMITY",
    groups.map((group: any) => ({
      region: group?.regionId ?? null,
      uniformity: group?.sizeUniformity ?? null,
      physicalSizeDifference: group?.physicalSizeDifference ?? null,
      apparentSizeDifference: group?.apparentSizeDifference ?? null,
    })),
  );
  for (const candidate of ["Galaxy Setting", "Mosaic Setting (custom)"]) {
    const { matched, conflicting } = signalsFor(candidate);
    line(`${candidate.toUpperCase()} MATCH SIGNALS`, matched);
    line(`${candidate.toUpperCase()} CONFLICTING SIGNALS`, conflicting);
  }
  line("PERSPECTIVE GATE APPLIED", analysis.perspectiveGateApplied === true);
  line("FINAL STONE FIELD TOPOLOGY", analysis.stoneFieldTopology ?? "needs_confirmation");
  line("FINAL RETENTION CONSTRUCTION", analysis.retentionConstruction ?? "needs_confirmation");
  line("FINAL COVERAGE STYLE", analysis.coverageStyle ?? "none");
  line("FINAL USER-FACING TERMINOLOGY", map?.resolvedSettingTerminology ?? "needs_confirmation");
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

  // TERMINOLOGY LOCK: when the user named the setting, that WORDING is final.
  // Gemini may describe the construction underneath it, but never rename it.
  const settingTerm = facts.find((fact) =>
    ["setting", "setting_name", "setting_terminology", "terminology"].includes(fact.attribute.toLowerCase())
  );
  if (settingTerm?.value) {
    const label = String(settingTerm.value).trim();
    const scope = settingTerm.appliesTo ? String(settingTerm.appliesTo).trim() : "";
    for (const setting of arrayOf(map.settings)) {
      // A scoped confirmation only locks the region/component it names.
      if (scope && ![setting?.regionId, setting?.componentId].includes(scope)) continue;
      setting.detectedSetting = label;
      setting.canonicalSetting = label;
      setting.userConfirmedTerm = true;
      // The observed construction is kept — only the LABEL is locked.
      lock(setting);
    }
    // The compositional axes carry the user's wording too: a user-supplied
    // topology term lands on topology, anything else on retention.
    const analysis = map.settingAnalysis && typeof map.settingAnalysis === "object"
      ? map.settingAnalysis
      : (map.settingAnalysis = {});
    const isTopology = (TOPOLOGY_TERMS as string[]).some((term) =>
      term.toLowerCase().includes(label.toLowerCase()) || label.toLowerCase().includes(term.toLowerCase())
    );
    if (isTopology) analysis.stoneFieldTopology = label;
    else analysis.retentionConstruction = label;
    analysis.customTerminology = [
      ...new Set([...(Array.isArray(analysis.customTerminology) ? analysis.customTerminology : []), label]),
    ];
    analysis.provenance = "USER_CONFIRMED";
    analysis.confidence = 1;
    analysis.needsConfirmation = false;
    analysis.perspectiveGateApplied = false;
    map.resolvedSettingTerminology = [analysis.stoneFieldTopology, analysis.retentionConstruction]
      .filter(Boolean).join(" ") || label;
  }


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
 * THE user-facing setting authority. Built from the FUSED map only:
 * complete reference set + complete product-video analysis -> PKM ->
 * terminology ontology -> resolvedJewelrySpec -> UI + Nano engineering lock.
 * The first-pass single-image classifier never contributes here.
 */
function buildResolvedJewelrySpec(pkm: any, options: IntakeOptions) {
  const analysis = pkm?.settingAnalysis ?? null;
  const terminology = pkm?.resolvedSettingTerminology ?? null;
  const canonicalOf = (value: unknown) => {
    const raw = String(value ?? "").trim();
    if (!raw) return "";
    const canonical = toCanonical(raw, options.settingTypes);
    return canonical || "";
  };

  const settings = arrayOf(pkm?.settings).map((setting: any) => {
    const label = String(setting?.detectedSetting ?? setting?.canonicalSetting ?? "").trim();
    const needsConfirmation = setting?.needsConfirmation === true ||
      /needs_confirmation/i.test(label) ||
      Number(setting?.confidence ?? 0) < 0.45;
    return {
      region: String(setting?.regionId ?? setting?.componentId ?? "").trim() || null,
      // The composed compositional terminology is what the user reads.
      displayLabel: needsConfirmation ? "" : (terminology || label),
      setting: needsConfirmation ? "" : (canonicalOf(terminology) || canonicalOf(label)),
      detectedSetting: label || null,
      vocabularyDomain: setting?.vocabularyDomain ?? analysis?.vocabularyDomain ?? null,
      matchedSignals: arrayOf(setting?.matchedSignals),
      conflictingSignals: arrayOf(setting?.conflictingSignals),
      reason: String(setting?.settingClassificationReason ?? "").trim() || null,
      provenance: setting?.provenance ?? analysis?.provenance ?? null,
      userConfirmedTerm: setting?.userConfirmedTerm === true,
      confidence: Number(setting?.confidence ?? 0) || 0,
      needsConfirmation,
    };
  });

  // A map with the compositional axes but no per-region rows still resolves.
  if (!settings.length && terminology) {
    settings.push({
      region: null,
      displayLabel: terminology,
      setting: canonicalOf(terminology),
      detectedSetting: terminology,
      vocabularyDomain: analysis?.vocabularyDomain ?? null,
      matchedSignals: arrayOf(analysis?.topologyEvidence),
      conflictingSignals: arrayOf(analysis?.conflictingSignals),
      reason: null,
      provenance: analysis?.provenance ?? null,
      userConfirmedTerm: analysis?.provenance === "USER_CONFIRMED",
      confidence: Number(analysis?.confidence ?? 0) || 0,
      needsConfirmation: analysis?.needsConfirmation === true,
    });
  }

  return {
    source: pkm ? "product_knowledge_map" : "unavailable",
    version: pkm?.version ?? null,
    productCaseId: pkm?.productCaseId ?? null,
    userFacingTerminology: terminology,
    settingAnalysis: analysis,
    settings,
  };
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


  // A video-only set is valid: the complete clip is itself the evidence.
  if (!references.length && !videoReferences.length) {
    return json({ error: "Add at least one jewelry reference" }, 400);
  }


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
  const run = batch.length
    ? await runIntake({ ai, references: batch, roleVocabulary, options })
    : {
      intake: { products: [] } as any,
      imageParts: [] as unknown[],
      unavailable: new Set<number>(),
      timings: { referenceFetchMs: 0, geminiMs: 0, unavailableReferences: 0 },
    };
  const intake = stampSources(run.intake, options);
  intake.version = INTAKE_VERSION;
  intake.referenceCount = batch.length;

  /* ---- FULL-CLIP video understanding: the whole video, once per clip ------ */
  const video = videoReferences.length
    ? await runVideoAnalysis({ ai, videoReferences, options })
    : { videoAnalyses: [], videoFailures: [], geminiMs: 0 };
  intake.videoAnalyses = video.videoAnalyses;
  if (video.videoFailures.length) intake.videoAnalysisIssues = video.videoFailures;

  /* ---- ONE fused engineering pass, reusing the already-fetched images ---- */
  let knowledgeMapMs = 0;
  try {
    const fused = await runKnowledgeMap({
      ai,
      imageParts: run.imageParts,
      references: batch,
      videoReferences,
      videoAnalyses: video.videoAnalyses,
      intake,
      options,
      unavailable: run.unavailable,
      userConfirmedFacts,
      productCaseId: resolveProductCaseId(batch, videoReferences),

    });

    knowledgeMapMs = fused.geminiMs;
    intake.knowledgeMap = fused.knowledgeMap;
  } catch (error) {
    // The engineering map is an ENHANCEMENT: intake must still succeed without it.
    console.warn("[intake] knowledge map unavailable:", errorMessage(error));
  }

  /* ---- TARGETED RESEARCH AGENT — product understanding only, only if unsure -- */
  // Never per frame, never per generation. Vocabulary research only: the observed
  // product evidence keeps full authority over every classified axis.
  let researchMs = 0;
  let researchedTermCount = 0;
  // Attached AFTER the media guard so the citation URLs survive it.
  let researchedTerms: Awaited<ReturnType<typeof researchUncertainTerms>>["researchedTerms"] = [];
  if (intake.knowledgeMap) {
    try {
      const uncertain = collectUncertainTerms(
        intake.knowledgeMap,
        (name: string) => Boolean(termByName(name)),
      );
      if (uncertain.length) {
        console.log(
          `[intake] RESEARCH TRIGGERED terms=${
            uncertain.map((entry) => `${entry.term}(${entry.triggers.join("|")})`).join(", ")
          }`,
        );
        const research = await researchUncertainTerms({
          ai,
          admin,
          model: GEMINI_ANALYSIS_MODEL,
          map: intake.knowledgeMap,
          uncertain,
        });
        researchMs = research.researchMs;
        researchedTerms = research.researchedTerms;
        researchedTermCount = research.researchedTerms.length;
        console.log(
          `[intake] RESEARCH DONE terms=${researchedTermCount} cacheHits=${research.cacheHits} ms=${researchMs}`,
        );
      } else {
        console.log("[intake] RESEARCH SKIPPED — setting confidently classified");
      }
    } catch (error) {
      // Research is an enhancement: intake must still succeed without it.
      console.warn("[intake] research agent unavailable:", errorMessage(error));
    }
  }



  /* ---- THE VISIBLE SETTING COMES FROM THE FUSED MAP, NOT THE FIRST PASS --- */
  // The single-pass, first-image classifier is demoted to PRELIMINARY evidence:
  // it can never drive the user-facing field or the Nano engineering lock.
  for (const product of arrayOf(intake.products)) {
    for (const setting of arrayOf(product?.settings)) {
      setting.preliminary = true;
      setting.provenance = "PRELIMINARY_OBSERVATION";
    }
  }
  intake.resolvedJewelrySpec = buildResolvedJewelrySpec(intake.knowledgeMap, options);
  console.log(
    `[intake] RESOLVED SETTING SPEC source=${intake.resolvedJewelrySpec.source} terminology=${
      intake.resolvedJewelrySpec.userFacingTerminology ?? "needs_confirmation"
    } regions=${intake.resolvedJewelrySpec.settings.length}`,
  );


  const timings = {
    cacheHit: false,
    referenceFetchMs: run.timings.referenceFetchMs,
    geminiMs: run.timings.geminiMs,
    knowledgeMapMs,
    researchMs,
    researchedTermCount,
    videoAnalysisMs: video.geminiMs,
    videoReferenceCount: videoReferences.length,
    unavailableReferences: run.timings.unavailableReferences,
    totalMs: Date.now() - startedAt,
  };

  // DEV-ONLY telemetry: server logs, never surfaced to normal users.
  console.log("[intake] timings", JSON.stringify(timings));


  const stripped = assertAnalysisOnly(intake, "intake");
  if (stripped.length) console.warn("intake guard stripped:", stripped.join(", "));

  // Research findings are TEXT + citation links only (never media), so they are
  // attached after the media guard and stay candidates, never overrides.
  if (intake.knowledgeMap && researchedTerms.length) {
    attachResearchToMap(intake.knowledgeMap, researchedTerms);
  }




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

    // Replacement references (CAD, stills) — typed.
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
