/**
 * CAMPAIGN PHOTOGRAPHY PROFILE — client access (analysis only).
 *
 * A LOOK profile: HOW the product should be photographed. It is deliberately
 * separate from product identity — the Master Product Lock owns geometry, stone
 * layout, setting, components and materials, and photography references carry
 * ZERO authority over any of them.
 *
 * Not wired into generation prompts in this commit.
 */

import { supabase } from "@/integrations/supabase/client";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

export const CAMPAIGN_PHOTOGRAPHY_VERSION = "campaign-photography-v1";

export type CampaignPhotographyProfile = {
  version?: string;
  lensCharacter?: string | null;
  macroMagnification?: string | null;
  cameraHeight?: string | null;
  cameraDistance?: string | null;
  lensCompression?: string | null;
  lightingFamily?: string | null;
  exposure?: string | null;
  contrast?: string | null;
  whiteBalance?: string | null;
  surfaceEnvironment?: string | null;
  depthOfField?: string | null;
  focusBehavior?: string | null;
  negativeSpace?: string | null;
  confidence?: number | null;
  notes?: string[];
};

export type CampaignPhotographyField = Exclude<
  keyof CampaignPhotographyProfile,
  "version" | "confidence" | "notes"
>;

/** Display order + labels for the engineering surface. */
export const CAMPAIGN_PHOTOGRAPHY_FIELDS: { key: CampaignPhotographyField; label: string }[] = [
  { key: "lensCharacter", label: "Lens character" },
  { key: "macroMagnification", label: "Macro magnification" },
  { key: "cameraHeight", label: "Camera height" },
  { key: "cameraDistance", label: "Camera distance" },
  { key: "lensCompression", label: "Lens compression" },
  { key: "lightingFamily", label: "Lighting family" },
  { key: "exposure", label: "Exposure" },
  { key: "contrast", label: "Contrast" },
  { key: "whiteBalance", label: "White balance" },
  { key: "surfaceEnvironment", label: "Surface / environment" },
  { key: "depthOfField", label: "Depth of field" },
  { key: "focusBehavior", label: "Focus behavior" },
  { key: "negativeSpace", label: "Negative space" },
];

export type CampaignPhotographyResult = {
  cached: boolean;
  fingerprint: string;
  version: string;
  analyzedAt?: string | null;
  profile: CampaignPhotographyProfile | null;
  timings?: Record<string, unknown>;
};

/**
 * The photography reference-set fingerprint. The profile is recomputed ONLY when
 * this changes — reopening a project reuses the stored profile.
 */
export function photographySetVersion(urls: string[]) {
  return JSON.stringify(urls);
}

/** Analyse the user's photography references. Never generates media. */
export async function analyzeCampaignPhotography(
  args: { referenceUrls: string[]; force?: boolean },
  signal?: AbortSignal,
): Promise<CampaignPhotographyResult> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const response = await fetch(`${SUPABASE_URL}/functions/v1/analyze-campaign-photography`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${session?.access_token ?? SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify({
      referenceUrls: args.referenceUrls,
      force: args.force === true,
    }),
    signal,
  });

  const text = await response.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error("Photography analysis returned an unexpected response.");
  }
  if (!response.ok) {
    throw new Error(String(data?.error ?? "Photography analysis failed."));
  }
  return data as CampaignPhotographyResult;
}

/** Compact summary for the engineering surface. */
export function campaignPhotographySummary(profile: CampaignPhotographyProfile | null) {
  if (!profile) return null;
  const filled = CAMPAIGN_PHOTOGRAPHY_FIELDS.filter(({ key }) => Boolean(profile[key])).length;
  const lead = [profile.lensCharacter, profile.lightingFamily]
    .map((part) => (part ? String(part).split(/[.;]/)[0].trim() : null))
    .filter(Boolean);
  return [...lead, `${filled}/${CAMPAIGN_PHOTOGRAPHY_FIELDS.length} fields`].join(" · ");
}
