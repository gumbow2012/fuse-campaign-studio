import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, supabase } from "@/integrations/supabase/client";
import type { SwapGeneration } from "@/services/outfitSwap";

export type { SwapGeneration };

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
