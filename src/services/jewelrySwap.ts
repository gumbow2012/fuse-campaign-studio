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
export async function listAssets(type: "image" | "video" | "all" = "all") {
  const data = await callJewelrySwap<{ assets: LibraryAsset[] }>({
    action: "list_assets",
    type,
  });
  return data.assets ?? [];
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
};

export type JewelryAnalysisResult = {
  cached: boolean;
  fingerprint: string;
  version: string;
  analyzedAt: string;
  analysis: JewelryProjectAnalysis;
};

/** Runs (or reuses) the still-image shot analysis for the selected frames. */
export async function analyzeJewelryFrames(args: {
  sourceFrames: { frameId: string; timestamp: number; imageUrl: string }[];
  jewelryReferences: { url: string; role?: string | null; cad?: boolean }[];
  jewelrySpecs: Record<string, unknown>[];
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
    }),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok || data?.error) {
    throw new Error(data?.error ?? `Shot analysis failed (${response.status})`);
  }
  return data as JewelryAnalysisResult;
}

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
};


/** One fast batch pass over the uploaded references (recognition/grouping). */
export async function analyzeJewelryIntake(
  args: {
    jewelryReferences: { url: string; role?: string | null; cad?: boolean }[];
    roleVocabulary?: string[];
    force?: boolean;
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
      roleVocabulary: args.roleVocabulary ?? [],
      force: args.force === true,
    }),
    signal,
  });

  const data = await response.json().catch(() => null);
  if (!response.ok || data?.error) {
    throw new Error(data?.error ?? `Jewelry analysis failed (${response.status})`);
  }
  return data as JewelryIntakeResult;
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
