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
  /** True when MACRO REPLACEMENT MODE was forced for this frame. */
  macroMode?: boolean | null;
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
};

/** The caller's completed generations, newest first. */
export async function listAssets(type: "image" | "video" | "all" = "all") {
  const data = await callJewelrySwap<{ assets: LibraryAsset[] }>({
    action: "list_assets",
    type,
  });
  return data.assets ?? [];
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
