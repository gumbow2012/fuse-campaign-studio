import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, supabase } from "@/integrations/supabase/client";
import type { SwapGeneration } from "@/services/outfitSwap";

export type { SwapGeneration };

/** Which image model produced a swapped frame. */
export type JewelryImageModel = "pro" | "nb2";

/** A stored animation direction summary for a Kling clip. */
export type AnimationDirectionSummary = {
  shot?: string;
  camera?: string;
  focus?: string;
  light?: string;
  end?: string;
};

/** Jewelry Swap adds the image-model + preferred-angle metadata to each record. */
export type JewelryGeneration = SwapGeneration & {
  imageModel?: JewelryImageModel | null;
  preferredRole?: string | null;
  /** Resolution sent to the Nano Banana Pro endpoint ("2K" | "4K"). */
  resolution?: string | null;
  /** Same value in UI form: "2k" | "4k". Absent on the nb2 path. */
  nanoQuality?: "2k" | "4k" | string | null;

  /** True when MACRO REPLACEMENT MODE was applied for this frame. */
  macroMode?: boolean | null;
  /** Per-frame replacement strategy used: "auto" | "standard" | "macro". */
  replacementMode?: "auto" | "standard" | "macro" | null;
  /** Animate stage: the chosen shot + its direction summary and full prompt. */
  shotKey?: string | null;
  shotLabel?: string | null;
  cameraDirection?: string | null;
  directionSummary?: AnimationDirectionSummary | null;
  animationPrompt?: string | null;
};

/** Animate-stage camera direction options exposed in the UI. */
export const CAMERA_DIRECTIONS = [
  { value: "auto", label: "Auto — Jewelry Cinematic" },
  { value: "hero_push", label: "Hero Push" },
  { value: "extreme_macro", label: "Extreme Macro" },
  { value: "surface_scan", label: "Surface Scan" },
  { value: "edge_glide", label: "Edge Glide" },
  { value: "micro_orbit", label: "Micro Orbit" },
  { value: "rack_focus", label: "Rack Focus" },
  { value: "overhead_descent", label: "Overhead Descent" },
  { value: "chain_track", label: "Chain / Link Track" },
  { value: "light_sweep", label: "Light Sweep" },
  { value: "whip_transition", label: "Whip Transition" },
  { value: "kaleidoscope", label: "Kaleidoscope Transition" },
  { value: "custom", label: "Custom" },
] as const;

export type CameraDirection = (typeof CAMERA_DIRECTIONS)[number]["value"];

/** Animate one approved frame with a camera direction (and optional custom text). */
export async function animateJewelryFrame(args: {
  imageUrl: string;
  frameIndex: number;
  frameTime: number;
  cameraDirection: string;
  customPrompt?: string | null;
  setIndex: number;
  setSize: number;
  pieceTypes: string[];
}) {
  const data = await callJewelrySwap<{ generation: JewelryGeneration }>({
    action: "animate_frame",
    imageUrl: args.imageUrl,
    frameIndex: args.frameIndex,
    frameTime: args.frameTime,
    cameraDirection: args.cameraDirection,
    customPrompt: args.customPrompt ?? null,
    setIndex: args.setIndex,
    setSize: args.setSize,
    pieceTypes: args.pieceTypes,
  });
  return data.generation;
}

/** A completed generation the user can re-use as an input. */
export type LibraryAsset = {
  id: string;
  outputUrl: string;
  outputType: "image" | "video";
  kind: string | null;
  prompt: string | null;
  feature: string | null;
  createdAt: string;
  /** Where the asset came from: a prior generation or one of the user's uploads. */
  source?: "generated" | "upload";

};

/** The caller's completed generations, newest first. */
/**
 * Library listing, cached for the session. The picker is opened repeatedly
 * (source, piece, extra angle) and the underlying set rarely changes mid-visit,
 * so reopening it should not re-enumerate storage every time. Call
 * `invalidateAssetCache()` after anything that adds a new asset.
 */
const assetCache = new Map<string, { at: number; assets: LibraryAsset[] }>();
const ASSET_CACHE_TTL_MS = 5 * 60 * 1000;

export function invalidateAssetCache() {
  assetCache.clear();
}

export async function listAssets(
  type: "image" | "video" | "all" = "all",
  options?: { force?: boolean },
) {
  const cached = assetCache.get(type);
  if (!options?.force && cached && Date.now() - cached.at < ASSET_CACHE_TTL_MS) {
    return cached.assets;
  }
  const data = await callJewelrySwap<{ assets: LibraryAsset[] }>({
    action: "list_assets",
    type,
  });
  const assets = data.assets ?? [];
  assetCache.set(type, { at: Date.now(), assets });
  return assets;
}


/* ------------------------------------------------------------------ *
 * STAGE A — still-image shot analysis (Jewelry Swap only)
 * ------------------------------------------------------------------ *
 * Analysis only: JSON in, JSON out. The source VIDEO is never sent —
 * only the still frames the user selected, plus product references and
 * the structured specification.
 */

export type JewelryFrameAnalysis = {
  frameId: string;
  timestamp?: number;
  view?: string;
  coverage?: "full_object" | "partial_object" | "macro_detail";
  detailType?: string;
  magnification?: string;
  composition?: {
    fullProductShouldBeVisible?: boolean;
    preserveIntentionalCrop?: boolean;
    negativeSpace?: string;
  };
  orientation?: string;
  camera?: { angleDescription?: string; depthOfField?: string };
  recommendedReferenceRoles?: string[];
  avoidReferenceRoles?: string[];
  /** Ranked referenceIds ("REF_1"...) for THIS frame, best-first. */
  recommendedReferences?: string[];
  avoidReferences?: string[];
  rankingReasons?: string[];

  replacementBehavior?: string;
  riskFlags?: string[];
};

export type JewelryProductAnalysis = Record<string, unknown>;

export type JewelryProjectAnalysis = {
  version?: string;
  productAnalysis: JewelryProductAnalysis;
  frames: JewelryFrameAnalysis[];
  /** The reused / rebuilt fused understanding this analysis was retrieved from. */
  knowledgeMap?: ProductKnowledgeMap;
};

/** DEV-ONLY timing telemetry. Never rendered in the customer UI. */
export type JewelryAnalysisTimings = {
  analysisCacheHit?: boolean;
  knowledgeMapReused?: boolean;
  referenceImagesSent?: number;
  sourceFramesSent?: number;
  geminiCalls?: number;
  referenceFetchMs?: number;
  sourceFrameFetchMs?: number;
  geminiMs?: number;
  totalAnalysisMs?: number;
};

export type JewelryAnalysisResult = {
  cached: boolean;
  fingerprint: string;
  version: string;
  analyzedAt: string;
  analysis: JewelryProjectAnalysis;
  timings?: JewelryAnalysisTimings;
};

/** Runs (or reuses) the still-image shot analysis for the selected frames. */
export async function analyzeJewelryFrames(args: {
  sourceFrames: { frameId: string; timestamp: number; imageUrl: string }[];
  jewelryReferences: JewelryReferenceAsset[];
  jewelrySpecs: Record<string, unknown>[];
  /**
   * The persisted intake this reference set was already understood through.
   * When it still matches the current references, the backend reuses the stored
   * Product Knowledge Map instead of re-analysing the reference IMAGES.
   */
  intakeFingerprint?: string | null;
  intakeReferences?: JewelryReferenceAsset[] | null;

}): Promise<JewelryAnalysisResult> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const response = await fetch(`${SUPABASE_URL}/functions/v1/analyze-jewelry-frames`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${session?.access_token ?? SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify({
      sourceFrames: args.sourceFrames,
      jewelryReferences: args.jewelryReferences,
      jewelrySpecs: args.jewelrySpecs,
      intakeFingerprint: args.intakeFingerprint ?? null,
      intakeReferences: args.intakeReferences ?? null,
    }),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok || data?.error) {
    throw new Error(data?.error ?? `Shot analysis failed (${response.status})`);
  }
  return data as JewelryAnalysisResult;
}

/* ------------------------------------------------------------------ *
 * DEV-ONLY performance telemetry
 * ------------------------------------------------------------------ *
 * Kept out of the customer UI entirely: timings are logged to the browser
 * console in dev and buffered for the admin-only surface.
 */

export type JewelryTimingEntry = {
  label: string;
  ms: number;
  at: string;
  detail?: Record<string, unknown>;
};

const timingBuffer: JewelryTimingEntry[] = [];

export function recordJewelryTiming(
  label: string,
  ms: number,
  detail?: Record<string, unknown>,
) {
  const entry: JewelryTimingEntry = {
    label,
    ms: Math.round(ms),
    at: new Date().toISOString(),
    detail,
  };
  timingBuffer.push(entry);
  if (timingBuffer.length > 100) timingBuffer.shift();
  if (import.meta.env.DEV) {
    console.info(`[jewelry-perf] ${label}: ${entry.ms}ms`, detail ?? "");
  }
}

/** Admin-only surface reads the buffered timings from here. */
export function jewelryTimings() {
  return [...timingBuffer];
}


/* ------------------------------------------------------------------ *
 * ASSET FIREWALL — explicit backend typing (never mixed)
 * ------------------------------------------------------------------ *
 * SOURCE_CINEMATOGRAPHY          → the source clip: camera / framing / crop /
 *   focus / lighting / placement / perspective / motion authority ONLY, with
 *   ZERO jewelry-design authority.
 * REPLACEMENT_PRODUCT_REFERENCE  → CAD, photos and videos of the ACTUAL
 *   replacement piece: geometry / material / stone / setting / component
 *   authority.
 */
export type AssetPurpose = "SOURCE_CINEMATOGRAPHY" | "REPLACEMENT_PRODUCT_REFERENCE";

/** How FUSE auto-classified an uploaded replacement asset (user never labels). */
export type ReferenceKind = "cad" | "photographic_still";

/** One replacement IMAGE reference handed to the analysis. */
export type JewelryReferenceAsset = {
  url: string;
  role?: string | null;
  cad?: boolean;
  /** Always REPLACEMENT_PRODUCT_REFERENCE on this path. */
  assetPurpose?: AssetPurpose;
  kind?: ReferenceKind;
};

/**
 * One uploaded replacement product VIDEO. The COMPLETE clip is analysed by
 * Gemini's multimodal video path — it is never turned into image references and
 * never reaches the image renderer.
 */
export type JewelryVideoReferenceInput = {
  videoReferenceId: string;
  /** Storage URL of the actual stored clip. */
  videoUrl: string;
  name?: string | null;
  duration: number;
  aspectRatio?: string | null;
};

/** One timestamped observation — INTERNAL evidence only, never a reference image. */
export type JewelryTemporalObservation = {
  timestamp?: number;
  observation?: string;
  resolves?: string;
  confidence?: number;
};

export type JewelryTemporalComponentTracking = {
  componentId?: string;
  label?: string;
  observedFrom?: string[];
  apparentSizeDifference?: boolean;
  physicalSizeDifference?: boolean;
  reconciliation?: string;
  confidence?: number;
};

/** Full-clip video understanding (Gemini multimodal video, analysis only). */
export type JewelryVideoAnalysis = {
  videoReferenceId: string;
  duration?: number;
  productIdentity?: string;
  components?: { componentId?: string; label?: string; construction?: string; confidence?: number }[];
  temporalComponentTracking?: JewelryTemporalComponentTracking[];
  geometryEvidence?: {
    silhouette?: string;
    linkGeometry?: string;
    curvature?: string;
    thickness?: string;
    depth?: string;
    sidewalls?: string;
    rearConstruction?: string;
  };
  stoneEvidence?: {
    dominantCuts?: string[];
    physicalSizeClasses?: string[];
    sizeUniformity?: string;
    packingPattern?: string;
    stonePlacement?: string;
    orientationPattern?: string;
    exposedMetalPattern?: string;
  };
  settingEvidence?: {
    observedRetentionMechanics?: string;
    prongBehavior?: string;
    beadBehavior?: string;
    rails?: string;
    channels?: string;
    bezels?: string;
    seatDepth?: string;
    metalVisibility?: string;
  };
  repeatedModules?: {
    moduleId?: string;
    label?: string;
    masterGeometry?: string;
    stoneMap?: string;
    memberCount?: number;
    exceptions?: string[];
    confidence?: number;
  }[];
  claspEvidence?: string;
  bailEvidence?: string;
  connectorEvidence?: string;
  materialEvidence?: string;
  manufacturedFinish?: string;
  temporalObservations?: JewelryTemporalObservation[];
  conflictingEvidence?: string[];
  unresolvedFeatures?: string[];
  evidenceStrength?: EvidenceStrength;
};


/* ------------------------------------------------------------------ *
 * PRODUCT KNOWLEDGE MAP — one fused, cacheable understanding
 * ------------------------------------------------------------------ */

export type ConfidenceTier = "high" | "medium" | "low";

/**
 * How a physical claim was established. Only the first five may become a hard
 * constraint for image synthesis; LOW_CONFIDENCE_INFERENCE stays advisory.
 */
export type Provenance =
  | "DIRECTLY_OBSERVED"
  | "CROSS_VIEW_CONFIRMED"
  | "CAD_CONFIRMED"
  | "REPEATED_MODULE_INFERRED"
  | "USER_CONFIRMED"
  | "LOW_CONFIDENCE_INFERENCE";

export const HARD_LOCK_PROVENANCE: Provenance[] = [
  "DIRECTLY_OBSERVED",
  "CROSS_VIEW_CONFIRMED",
  "CAD_CONFIRMED",
  "REPEATED_MODULE_INFERRED",
  "USER_CONFIRMED",
];

export function isLockableProvenance(provenance?: Provenance | string | null) {
  if (!provenance) return true;
  return (HARD_LOCK_PROVENANCE as string[]).includes(provenance);
}

/** Per-attribute evidence strength (0..1) for ONE reference. */
export type EvidenceStrength = {
  silhouette?: number;
  overallGeometry?: number;
  dimensions?: number;
  componentTopology?: number;
  stoneSeatLayout?: number;
  stoneCut?: number;
  stoneSize?: number;
  stonePlacement?: number;
  settingMechanics?: number;
  prongConstruction?: number;
  thicknessDepth?: number;
  claspBailConnector?: number;
  metalColor?: number;
  materialAppearance?: number;
  componentGeometry?: number;
  manufacturedAppearance?: number;
  manufacturedFinish?: number;
};


/** A fact the user locked; analysis may never override it. */
export type UserConfirmedFact = {
  attribute: string;
  value: string;
  appliesTo?: string | null;
};

export type PkmComponent = {
  componentId: string;
  label?: string;
  role?: string;
  geometry?: string;
  repeatModuleId?: string | null;
  connectedTo?: string[];
  confidence?: number;
  evidenceReferenceIds?: string[];
  inferredFromCAD?: boolean;
  inferredFromSymmetry?: boolean;
  provenance?: Provenance;
};

export type PkmRegion = {
  regionId: string;
  componentId?: string;
  label?: string;
  surfaceType?: string;
  confidence?: number;
};

export type StoneObservation = {
  stoneId: string;
  componentId?: string;
  regionId?: string;
  cut?: string;
  relativeSizeClass?: string;
  normalizedPosition?: { x?: number; y?: number };
  orientation?: string;
  seatDepthClass?: string;
  neighbors?: string[];
  apparentSettingType?: string;
  confidence?: number;
  evidenceReferenceIds?: string[];
  /** Which reference this single observation came from. */
  observedInReferenceId?: string;
  /** Links every view of the SAME real stone together. */
  physicalStoneId?: string;
  /** Raw on-image size before perspective is accounted for. */
  apparentSizeClass?: string;
  /** True once size was normalized for camera distance / surface angle. */
  perspectiveNormalized?: boolean;
  provenance?: Provenance;
};

/** One REAL stone, reconciled from all of its per-reference observations. */
export type PkmPhysicalStone = {
  physicalStoneId: string;
  componentId?: string;
  regionId?: string;
  observationIds?: string[];
  evidenceReferenceIds?: string[];
  /** Independent views that agree — confidence rises with this number. */
  agreementCount?: number;
  cut?: string;
  physicalSizeClass?: string;
  seatDepthClass?: string;
  conflictingEvidence?: string[];
  confidence?: number;
  provenance?: Provenance;
};

export type PkmStoneGroup = {
  regionId?: string;
  componentId?: string;
  count?: number;
  sizeClasses?: string[];
  minSizeClass?: string;
  medianSizeClass?: string;
  maxSizeClass?: string;
  anchorToFillerRatio?: string;
  repeatPattern?: string;
  gradient?: string;
  /** "estimated" (relative only) vs "measured_from_authority" (CAD/spec). */
  measurementBasis?: "estimated" | "measured_from_authority";
  /** PHYSICAL uniformity — never a raw pixel-size read. */
  sizeUniformity?: "uniform" | "mixed" | "unknown";
  physicalSizeDifference?: string;
  /** Size differences explained purely by camera distance / angle. */
  apparentSizeDifference?: string;
  perspectiveNormalizationBasis?: string;
  confidence?: number;
  provenance?: Provenance;
};

export type PkmSetting = {
  componentId?: string;
  regionId?: string;
  canonicalSetting?: string;
  confidence?: number;
  settingClassificationReason?: string;
  evidenceReferenceIds?: string[];
  settingVisualSignature?: string;
  needsConfirmation?: boolean;
  provenance?: Provenance;
  /** Best match against the engineering setting ontology. */
  ontologyMatch?: {
    canonicalName?: string;
    score?: number;
    matchedSignals?: string[];
    deviatingSignals?: string[];
  };
};

export type PkmMaterialRegion = {
  regionId?: string;
  componentId?: string;
  metalColor?: string;
  /** Karat is only ever asserted with explicit readable evidence. */
  karat?: string | null;
  karatEvidence?: string | null;
  finish?: string;
  capturedEnvironmentTint?: string | null;
  confidence?: number;
  provenance?: Provenance;
};

export type PkmRepeatedModule = {
  repeatModuleId: string;
  componentIds?: string[];
  masterGeometry?: string;
  masterStoneMap?: string;
  repeatCount?: number;
  exceptions?: string[];
  confidence?: number;
  /** The single reconstructed master every instance inherits from. */
  masterModuleId?: string;
  /** Clearest instances used to recover the master. */
  masterEvidenceReferenceIds?: string[];
  memberComponentIds?: string[];
  exceptionComponentIds?: string[];
  provenance?: Provenance;
};

/** One scale statement, kept separate so estimates never read as measurements. */
export type PkmScaleClaim = {
  claim?: string;
  basis?:
    | "measured_from_cad"
    | "measured_from_spec"
    | "user_provided"
    | "derived_from_known_stone"
    | "derived_from_repeated_geometry"
    | "visually_estimated"
    | string;
  appliesTo?: string;
  confidence?: number;
  provenance?: Provenance;
};

export type PkmDimensions = {
  summary?: string;
  scaleSource?:
    | "cad_dimensions"
    | "spec_sheet"
    | "user_entered"
    | "known_stone_size"
    | "repeated_structural_dimension"
    | "photographic_estimate"
    | string;
  measurementBasis?: "estimated" | "measured_from_authority";
  relativeRatios?: string[];
  scaleClaims?: PkmScaleClaim[];
  confidence?: number;
  provenance?: Provenance;
};

/** An attribute still unresolved — resolved from evidence first, user last. */
export type PkmEvidenceGap = {
  attribute?: string;
  why?: string;
  resolvedFromExistingEvidence?: boolean;
  resolutionMethod?: string;
  requestedUserReference?: string | null;
};

export type ProductKnowledgeMap = {
  version?: string;
  productType?: string;
  productTypeConfidence?: number;
  dimensions?: PkmDimensions;
  components?: PkmComponent[];
  regions?: PkmRegion[];
  referenceCatalog?: {
    referenceId: string;
    kind?: ReferenceKind;
    authorityFor?: string[];
    notAuthorityFor?: string[];
    confidence?: number;
    /** Attribute-level authority: strong for silhouette, weak for prongs, etc. */
    evidenceStrength?: EvidenceStrength;
  }[];
  repeatedModules?: PkmRepeatedModule[];
  stones?: StoneObservation[];
  physicalStones?: PkmPhysicalStone[];
  stoneGroups?: PkmStoneGroup[];
  settings?: PkmSetting[];
  materialRegions?: PkmMaterialRegion[];
  constructionConflicts?: {
    topic?: string;
    /** Which physical attribute the two references disagree about. */
    attribute?: string;
    cadClaim?: string;
    photoClaim?: string;
    resolution?: string;
    /** True ONLY when both sides are high-confidence and a human must decide. */
    needsUserDecision?: boolean;
    /** Plain-language question shown to the user (no engineering jargon). */
    question?: string;
    /** The two (or three) answers the user can pick from. */
    options?: string[];
    confidence?: number;
  }[];

  inferredFeatures?: { feature?: string; basis?: string; confidence?: number }[];
  unresolvedFeatures?: string[];
  /** Jeweler slang, kept strictly out of the engineering map. */
  styleDescriptors?: string[];
  evidenceGaps?: PkmEvidenceGap[];
  userConfirmedFacts?: UserConfirmedFact[];
  settingOntology?: string[];
  /** Coverage read-out for the compact "FUSE UNDERSTOOD" summary. */
  coverage?: {
    geometry?: string;
    stoneLayout?: string;
    setting?: string;
    clasp?: string;
  };
  videoAnalyses?: JewelryVideoAnalysis[];
};

/** Post-generation physical-fidelity report (analysis only). */
export type JewelryValidationReport = {
  verdict: "consistent" | "minor_deviation" | "violation";
  confidence?: number;
  summary?: string;
  violations?: {
    attribute: string;
    expected: string;
    observed: string;
    severity: "low" | "medium" | "high";
    regionId?: string;
  }[];
  matchedConstraints?: string[];
};


/* ------------------------------------------------------------------ *
 * INTAKE — fast batch recognition of the uploaded jewelry references
 * ------------------------------------------------------------------ *
 * Analysis only. References in, structured JSON out. Every detected
 * field carries a `source`, and user overrides always win in the UI.
 */

export type DetectedField = {
  value?: string | null;
  /** Canonical value mapped onto the app's dropdowns ("" when unusable). */
  resolvedValue?: string | null;
  confidence?: number | null;
  confidenceTier?: "high" | "medium" | "low";
  source?: "user_override" | "cad" | "gemini_detected" | "reference_inference" | "unknown";
  /** stoneQuality only: where a clarity grade was actually read from. */
  qualityEvidenceSource?:
    | "cad_text"
    | "certification"
    | "product_text"
    | "user_input"
    | "visual_only"
    | string
    | null;
  /** True when the field must be confirmed by the user before it is trusted. */
  needsConfirmation?: boolean;
};


/** The canonical dropdown vocabularies handed to the intake analysis. */
export type IntakeOptions = {
  jewelryTypes: string[];
  metals: string[];
  stones: string[];
  stoneColors: string[];
  qualities: string[];
  settingTypes: string[];
  settingRegions: Record<string, string[]>;
};

export type IntakeSetting = {
  setting: string;
  region: string;
  /** Canonical setting / region, resolved server-side against the app's enums. */
  resolvedSetting?: string | null;
  resolvedRegion?: string | null;
  confidence?: number;
  confidenceTier?: "high" | "medium" | "low";
  settingVisualSignature?: string | null;
  /** The classifier's evidence statement, produced before the enum choice. */
  settingClassificationReason?: string | null;
  /** True when the construction did not clearly match one canonical setting. */
  needsConfirmation?: boolean;
  evidenceReferenceIndexes?: number[];
  source?: string;
};


export type IntakeProduct = {
  productIndex: number;
  label?: string;
  jewelryType?: DetectedField;
  metal?: DetectedField;
  stoneType?: DetectedField;
  stoneColor?: DetectedField;
  stoneQuality?: DetectedField;
  dimensions?: DetectedField;
  weight?: DetectedField;
  visibleComponents?: string[];
  connectedComponents?: string[];
  settings?: IntakeSetting[];
  settingSignatures?: Record<string, unknown>[];
  references?: {
    referenceIndex: number;
    role?: string;
    roleConfidence?: number;
    designAuthorityLikely?: boolean;
    designAuthorityConfidence?: number;
    source?: string;
  }[];
  needsConfirmation?: string[];
  notes?: string;
};

export type JewelryIntake = {
  version?: string;
  productCount?: number;
  referenceCount?: number;
  products: IntakeProduct[];
  conflictWarnings?: string[];
  /** The fused engineering understanding of the replacement piece(s). */
  knowledgeMap?: ProductKnowledgeMap;
  videoAnalyses?: JewelryVideoAnalysis[];
};

export type JewelryIntakeResult = {
  cached: boolean;
  fingerprint: string;
  version: string;
  analyzedAt: string;
  intake: JewelryIntake;
  /** Echoed straight back so the caller can discard a stale response. */
  setVersion?: string | null;
  requestId?: number | null;
  timings?: { cacheHit?: boolean; referenceFetchMs?: number; geminiMs?: number; totalMs?: number };
};



/** One fast batch pass over the uploaded references (recognition/grouping). */
export async function analyzeJewelryIntake(
  args: {
    jewelryReferences: JewelryReferenceAsset[];
    /** Metadata for each replacement VIDEO whose keyframes are in the set. */
    videoReferences?: JewelryVideoReferenceInput[];
    roleVocabulary?: string[];
    options?: IntakeOptions;
    /** Reference-set version + monotonic id, echoed back for stale detection. */
    setVersion?: string;
    requestId?: number;
    force?: boolean;
    /** Facts the user locked — analysis may never override them. */
    userConfirmedFacts?: UserConfirmedFact[];
  },
  signal?: AbortSignal,
): Promise<JewelryIntakeResult> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const response = await fetch(`${SUPABASE_URL}/functions/v1/analyze-jewelry-frames`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${session?.access_token ?? SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify({
      mode: "intake",
      jewelryReferences: args.jewelryReferences,
      videoReferences: args.videoReferences ?? [],
      roleVocabulary: args.roleVocabulary ?? [],
      options: args.options ?? null,
      setVersion: args.setVersion ?? null,
      requestId: args.requestId ?? null,
      force: args.force === true,
      userConfirmedFacts: args.userConfirmedFacts ?? [],
    }),
    signal,
  });



  const data = await response.json().catch(() => null);
  if (!response.ok || data?.error) {
    throw new Error(data?.error ?? `Jewelry analysis failed (${response.status})`);
  }
  return data as JewelryIntakeResult;
}


/**
 * Post-generation check: does a finished still obey the locked physical
 * constraints of the knowledge map? Analysis only — nothing is regenerated.
 */
export async function validateAgainstKnowledgeMap(
  args: { imageUrl: string; knowledgeMap: ProductKnowledgeMap },
  signal?: AbortSignal,
): Promise<JewelryValidationReport | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const response = await fetch(`${SUPABASE_URL}/functions/v1/analyze-jewelry-frames`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${session?.access_token ?? SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify({
      mode: "validate",
      imageUrl: args.imageUrl,
      knowledgeMap: args.knowledgeMap,
    }),
    signal,
  });

  const data = await response.json().catch(() => null);
  if (!response.ok || data?.error) {
    throw new Error(data?.error ?? `Validation failed (${response.status})`);
  }
  return (data?.validation ?? null) as JewelryValidationReport | null;
}



/** Call the jewelry-swap edge function with a just-in-time session token. */
export async function callJewelrySwap<T = any>(body: Record<string, unknown>): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const response = await fetch(`${SUPABASE_URL}/functions/v1/jewelry-swap`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${session?.access_token ?? SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok || data?.error) {
    throw new Error(data?.error ?? `Request failed (${response.status})`);
  }
  return data as T;
}

export type JewelrySwapTemplateResult = {
  templateId: string;
  templateName: string;
  versionId: string;
  previewUrl: string | null;
  inputSlotCount: number;
  productReferenceCount: number;
  klingClipCount: number;
  nodeCount: number;
  edgeCount: number;
  positions: Record<string, { x: number; y: number }>;
};

/**
 * Serializes the current Jewelry Swap run into a real, editable template
 * (fuse_templates + template_versions + nodes + edges).
 */
export async function createTemplateFromJewelrySwap(
  body: Record<string, unknown>,
): Promise<JewelrySwapTemplateResult> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const response = await fetch(`${SUPABASE_URL}/functions/v1/jewelry-swap-to-template`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${session?.access_token ?? SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok || data?.error) {
    throw new Error(data?.error ?? `Request failed (${response.status})`);
  }
  return data as JewelrySwapTemplateResult;
}

/** The canvas stores node positions locally, keyed by template version. */
export function persistTemplateLayout(
  versionId: string,
  positions: Record<string, { x: number; y: number }>,
) {
  try {
    window.localStorage.setItem(
      `fuse-template-canvas-layout-v1:${versionId}`,
      JSON.stringify(positions),
    );
  } catch {
    // Layout is a convenience only — the canvas falls back to auto lanes.
  }
}

/* ------------------------------------------------------------------ *
 * Bounded-concurrency job submission
 * ------------------------------------------------------------------ *
 * Submitting N provider jobs strictly one-after-another makes the user wait
 * for the whole chain; firing them all at once risks provider rate limits.
 * This runs a small number in flight at a time, isolates every failure, and
 * always resolves so one bad submission never blocks the rest.
 */

export type SubmissionOutcome<T> =
  | { ok: true; index: number; value: T }
  | { ok: false; index: number; error: Error };

export async function submitWithConcurrency<T, R>(
  items: T[],
  limit: number,
  submit: (item: T, index: number) => Promise<R>,
): Promise<SubmissionOutcome<R>[]> {
  const results: SubmissionOutcome<R>[] = new Array(items.length);
  let cursor = 0;
  const workers = Math.max(1, Math.min(limit, items.length));
  const worker = async () => {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      try {
        results[index] = { ok: true, index, value: await submit(items[index], index) };
      } catch (error) {
        results[index] = {
          ok: false,
          index,
          error: error instanceof Error ? error : new Error(String(error)),
        };
      }
    }
  };
  await Promise.all(Array.from({ length: workers }, worker));
  return results;
}
