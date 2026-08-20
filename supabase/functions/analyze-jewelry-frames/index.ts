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
type JewelryReferenceInput = { url: string; role?: string | null; cad?: boolean };

/** Stable, order-independent handle for a reference inside one analysis batch. */
function referenceIdAt(index: number) {
  return `REF_${index + 1}`;
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
  return `${ref.url}|${ref.role ?? ""}|${ref.cad ? 1 : 0}`;
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

  const productAnalysis = {
    jewelryType: detectedValue(products[0]?.jewelryType),
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
    catalogLines: catalogLines.sort(),
    mapLines,
  };
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
async function referenceFingerprint(references: JewelryReferenceInput[], options: IntakeOptions) {
  return await sha256Hex(
    JSON.stringify({
      version: INTAKE_VERSION,
      model: GEMINI_ANALYSIS_MODEL,
      references: references
        .map((ref) => `${ref.url}|${ref.role ?? ""}|${ref.cad ? 1 : 0}`)
        .sort(),
      options,
    }),
  );
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
    timings: { referenceFetchMs, geminiMs, unavailableReferences: [...unavailable] },
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
  const references: JewelryReferenceInput[] =
    (Array.isArray(body?.jewelryReferences) ? body.jewelryReferences : [])
      .map((ref: any) => ({
        url: String(ref?.url ?? "").trim(),
        role: ref?.role ? String(ref.role).trim() : null,
        cad: ref?.cad === true,
      }))
      .filter((ref: JewelryReferenceInput) => /^https?:\/\//.test(ref.url));

  if (!references.length) return json({ error: "Add at least one jewelry reference" }, 400);

  const roleVocabulary: string[] = (Array.isArray(body?.roleVocabulary) ? body.roleVocabulary : [])
    .map((entry: any) => String(entry ?? "").trim())
    .filter(Boolean)
    .slice(0, 60);

  const options = readOptions(body?.options ?? {});
  // Echoed back untouched so the client can discard a stale response.
  const setVersion = body?.setVersion ? String(body.setVersion) : null;
  const requestId = Number.isFinite(Number(body?.requestId)) ? Number(body.requestId) : null;

  const fingerprint = await referenceFingerprint(references, options);
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
    });
  }

  if (!apiKey) return json({ error: "Jewelry analysis is unavailable (analysis key not configured)" }, 503);

  const ai = new GoogleGenAI({ apiKey });
  // ONE call for the whole settled reference set — never one call per image.
  const batch = references.slice(0, MAX_IMAGES_PER_CALL);
  const intake = stampSources(
    await runIntake({ ai, references: batch, roleVocabulary, options }),
    options,
  );
  intake.version = INTAKE_VERSION;
  intake.referenceCount = batch.length;

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
  });

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
    // ONE batch call: EVERY reference and EVERY selected source frame are
    // analysed together so the per-frame ranking can compare the whole library.
    const references = jewelryReferences.slice(0, MAX_REFERENCE_IMAGES);
    const referenceParts: unknown[] = [];
    for (const ref of references) referenceParts.push(await inlineImage(ref.url));

    const frameBudget = Math.max(1, MAX_IMAGES_PER_CALL - references.length);
    const batchFramesInput = sourceFrames.slice(0, frameBudget);

    const parsed = await analyseBatch({
      ai,
      referenceParts,
      references,
      frames: batchFramesInput,
      specs: jewelrySpecs,
    });

    const productAnalysis: any = parsed?.productAnalysis ?? null;
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
