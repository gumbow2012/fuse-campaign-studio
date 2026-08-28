import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, supabase } from "@/integrations/supabase/client";

export type SwapGeneration = {
  id: string;
  status: "queued" | "running" | "complete" | "failed" | "canceled";
  kind: string | null;
  stage?: string | null;
  prompt: string | null;
  outputUrl: string | null;
  outputType: string | null;
  error: string | null;
  estimatedCredits: number | null;
  estimatedCostUsd: number | null;
  providerModel: string | null;
  frameIndex: number | null;
  frameTime: number | null;
  sourceFrameUrl: string | null;
  createdAt: string | null;
};

/** Call the outfit-swap edge function with a just-in-time session token. */
export async function callOutfitSwap<T = any>(body: Record<string, unknown>): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const response = await fetch(`${SUPABASE_URL}/functions/v1/outfit-swap`, {
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

export type OutfitSwapTemplateResult = {
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
 * Serializes the current Outfit Swap run into a real, editable template
 * (fuse_templates + template_versions + nodes + edges).
 */
export async function createTemplateFromOutfitSwap(
  body: Record<string, unknown>,
): Promise<OutfitSwapTemplateResult> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const response = await fetch(`${SUPABASE_URL}/functions/v1/outfit-swap-to-template`, {
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
  return data as OutfitSwapTemplateResult;
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
 * PHASE 1 — SOURCE ANALYSIS (analysis only, never generation)
 * ------------------------------------------------------------------ */

export type OutfitSwapOrientation =
  | "FRONT"
  | "BACK"
  | "LEFT_3_4"
  | "RIGHT_3_4"
  | "SIDE"
  | "OCCLUDED"
  | "UNCERTAIN";

export type OutfitSwapFrameSubject = {
  subjectId: string;
  faceOrientation: OutfitSwapOrientation;
  bodyOrientation: OutfitSwapOrientation;
  garmentOrientation: OutfitSwapOrientation;
  torsoVisibility: number;
  garmentVisibility: number;
  occlusion: "none" | "partial" | "heavy";
  confidence: number;
};

export type OutfitSwapSourceAnalysis = {
  version: string;
  frameCount: number;
  subjectCount: number;
  subjectTracks: {
    subjectId: string;
    description: string;
    appearsStart: number;
    appearsEnd: number;
    frameCount: number | null;
    confidence: number;
  }[];
  frames: { frameId: string; timestamp: number; subjects: OutfitSwapFrameSubject[] }[];
};

export type OutfitSwapAnalysisResult = {
  cached: boolean;
  fingerprint: string;
  version: string;
  analyzedAt: string | null;
  analysis: OutfitSwapSourceAnalysis;
};

/**
 * Detects the subjects (with stable temporal ids) and wardrobe orientation in
 * the already-extracted source frames. This performs NO generation and does not
 * touch the frame-edit or video reconstruction paths.
 */
export async function analyzeOutfitSwapSource(
  frames: { frameId: string; timestamp: number; imageUrl: string }[],
): Promise<OutfitSwapAnalysisResult> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const response = await fetch(`${SUPABASE_URL}/functions/v1/outfit-swap-analyze`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${session?.access_token ?? SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify({ frames }),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok || data?.error) {
    throw new Error(data?.error ?? `Analysis failed (${response.status})`);
  }
  return data as OutfitSwapAnalysisResult;
}
