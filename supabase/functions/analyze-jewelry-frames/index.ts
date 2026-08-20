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
    `${referenceIdAt(index)}: user label "${ref.role || "Unlabeled view"}"${
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
          stoneQuality: DETECTED_FIELD,
          dimensions: DETECTED_FIELD,
          weight: DETECTED_FIELD,
          visibleComponents: STRING_ARRAY,
          connectedComponents: STRING_ARRAY,
          settings: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                setting: { type: Type.STRING },
                region: { type: Type.STRING },
                confidence: { type: Type.NUMBER },
              },
              required: ["setting", "region", "confidence"],
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

function buildIntakePrompt(args: { references: JewelryReferenceInput[]; roleVocabulary: string[] }) {
  const refLines = args.references.map((ref, index) =>
    `REFERENCE ${index} (referenceIndex ${index})${ref.role ? ` — user label "${ref.role}"` : ""}`
  );
  return [
    "You are a jewelry intake classifier. This is RECOGNITION, CLASSIFICATION and EXTRACTION — not deep reasoning and not generation. Be fast and literal. Return JSON only.",
    "You never generate images or video, and you never invent facts.",
    "",
    "UPLOADED REFERENCE IMAGES, in this exact order (images follow this text):",
    ...refLines,
    "",
    "TASKS:",
    "1. GROUPING — decide how many DISTINCT PHYSICAL PIECES these images show, and assign every referenceIndex to exactly one product. Different angles, macro crops, CAD renders and lifestyle shots of the SAME piece belong to the SAME product. Never merge clearly different products (different silhouette, different type, different stone layout) into one product. Set productCount accordingly.",
    "2. ROLES — for each reference, propose a role from this vocabulary when it fits: " +
    args.roleVocabulary.join(", ") +
    ". Use \"Uncertain\" when you are not reasonably sure. Set designAuthorityLikely = true only for genuine CAD / technical / design-authority renders (clean synthetic render, wireframe, spec drawing), with a confidence you actually believe.",
    "3. EXTRACTION — per product, detect jewelryType, metal, stoneType, stoneColor, stoneQuality, settings (setting name + region, one entry per region), visibleComponents, and connectedComponents (e.g. a chain physically attached to a pendant). Give dimensions and weight ONLY when explicitly readable in the image (printed CAD dimensions, a spec sheet, a caption) — otherwise leave value empty.",
    "4. SETTING SIGNATURES — one universal signature entry per setting region, populated exactly as described: echo the setting name in declaredSetting and describe the physical construction you observe. Never privilege or assume any particular named setting.",
    "5. CONFIDENCE — every detected field carries confidence 0..1. Anything below 0.7 must ALSO be listed in needsConfirmation by field name (jewelryType, metal, stoneType, stoneColor, stoneQuality, settings, dimensions, weight). Never guess to fill a field: an empty value with low confidence is correct behaviour.",
    "Short phrases only. Never output URLs, file names, base64 or media of any kind.",
  ].join("\n");
}

async function referenceFingerprint(references: JewelryReferenceInput[]) {
  return await sha256Hex(
    JSON.stringify({
      version: INTAKE_VERSION,
      model: GEMINI_ANALYSIS_MODEL,
      references: references.map((ref) => ref.url).sort(),
    }),
  );
}

async function runIntake(args: {
  ai: GoogleGenAI;
  references: JewelryReferenceInput[];
  roleVocabulary: string[];
}) {
  const parts: unknown[] = [
    { text: buildIntakePrompt({ references: args.references, roleVocabulary: args.roleVocabulary }) },
  ];
  for (const ref of args.references) parts.push(await inlineImage(ref.url));

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

  return JSON.parse((response.text ?? "").trim());
}

/** Every detected field is stamped with its provenance for the app's priority rules. */
function stampSources(intake: any) {
  const fields = [
    "jewelryType",
    "metal",
    "stoneType",
    "stoneColor",
    "stoneQuality",
    "dimensions",
    "weight",
  ];
  for (const product of Array.isArray(intake?.products) ? intake.products : []) {
    for (const field of fields) {
      const entry = product?.[field];
      if (entry && typeof entry === "object") {
        entry.source = String(entry.value ?? "").trim() ? "gemini_detected" : "unknown";
      }
    }
    for (const setting of Array.isArray(product?.settings) ? product.settings : []) {
      setting.source = "gemini_detected";
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

  const fingerprint = await referenceFingerprint(references);
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
      version: cached.version ?? INTAKE_VERSION,
      analyzedAt: cached.analyzed_at,
      intake: cached.analysis,
    });
  }

  if (!apiKey) return json({ error: "Jewelry analysis is unavailable (analysis key not configured)" }, 503);

  const ai = new GoogleGenAI({ apiKey });
  const batch = references.slice(0, MAX_IMAGES_PER_CALL);
  const intake = stampSources(await runIntake({ ai, references: batch, roleVocabulary }));
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
