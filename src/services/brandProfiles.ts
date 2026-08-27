/**
 * FT5 — Brand profiles (public.brand_profiles, RLS own-rows only).
 * No migrations: every call degrades gracefully if the table is absent.
 */
import { supabase } from "@/integrations/supabase/client";
import { looseTable } from "@/services/looseTable";

export interface BrandProfile {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  website: string | null;
  primary_logo_url: string | null;
  secondary_logo_url: string | null;
  colors: string[];
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface BrandProfileInput {
  name: string;
  description?: string | null;
  website?: string | null;
  primary_logo_url?: string | null;
  secondary_logo_url?: string | null;
  colors?: string[];
  metadata?: Record<string, unknown> | null;
}

function table() {
  return looseTable("brand_profiles");
}

function normalize(row: Record<string, unknown>): BrandProfile {
  const colors = Array.isArray(row.colors) ? row.colors.map((color) => String(color)) : [];
  return {
    id: String(row.id),
    user_id: String(row.user_id ?? ""),
    name: String(row.name ?? "Untitled brand"),
    description: typeof row.description === "string" ? row.description : null,
    website: typeof row.website === "string" ? row.website : null,
    primary_logo_url: typeof row.primary_logo_url === "string" ? row.primary_logo_url : null,
    secondary_logo_url: typeof row.secondary_logo_url === "string" ? row.secondary_logo_url : null,
    colors,
    metadata: (row.metadata as Record<string, unknown> | null) ?? null,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

export async function listBrandProfiles(userId: string): Promise<BrandProfile[]> {
  if (!userId) return [];
  try {
    const { data, error } = await table()
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (Array.isArray(data) ? data : []).map(normalize);
  } catch (error) {
    console.warn("brand_profiles unavailable:", error);
    return [];
  }
}

export async function createBrandProfile(input: BrandProfileInput): Promise<BrandProfile | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in to save a brand profile.");

  const { data, error } = await table()
    .insert({
      user_id: user.id,
      name: input.name,
      description: input.description ?? null,
      website: input.website ?? null,
      primary_logo_url: input.primary_logo_url ?? null,
      secondary_logo_url: input.secondary_logo_url ?? null,
      colors: input.colors ?? [],
      metadata: input.metadata ?? {},
    })
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data ? normalize(data) : null;
}

export async function updateBrandProfile(id: string, input: BrandProfileInput): Promise<void> {
  const { error } = await table()
    .update({
      name: input.name,
      description: input.description ?? null,
      website: input.website ?? null,
      primary_logo_url: input.primary_logo_url ?? null,
      secondary_logo_url: input.secondary_logo_url ?? null,
      colors: input.colors ?? [],
      metadata: input.metadata ?? {},
    })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteBrandProfile(id: string): Promise<void> {
  const { error } = await table().delete().eq("id", id);
  if (error) throw error;
}

/** Active brand pointer lives on the caller's own profiles row. */
export async function getActiveBrandId(): Promise<string | null> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    const { data, error } = await looseTable("profiles")
      .select("active_brand_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) throw error;
    const value = data?.active_brand_id;
    return typeof value === "string" && value ? value : null;
  } catch (error) {
    console.warn("active_brand_id unavailable:", error);
    return null;
  }
}

export async function setActiveBrand(brandId: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in to switch brands.");
  const { error } = await looseTable("profiles")
    .update({ active_brand_id: brandId })
    .eq("user_id", user.id);
  if (error) throw error;
}

/**
 * Phase 6 — brand aesthetic captured during onboarding ("Creative DNA").
 * `tags` / `references` are kept as legacy mirrors of `styleSignals` /
 * `referenceImages` so older readers keep working.
 */
export interface BrandVisualStyle {
  tags: string[];
  tone: string;
  references: string[];
  notes: string;
  styleSignals: string[];
  instagram: string | null;
  pinterest: string | null;
  referenceBrands: string[];
  referenceImages: string[];
}


/** Phase 8 — wizard progress so setup can always be resumed. */
export interface BrandOnboardingState {
  currentStep: number;
  completedSteps: number[];
  startedAt: string;
  completedAt: string | null;
}

export function readVisualStyle(brand: BrandProfile | null): BrandVisualStyle | null {
  const raw = (brand?.metadata ?? {}) as Record<string, unknown>;
  const value = raw.visualStyle as Record<string, unknown> | undefined;
  if (!value || typeof value !== "object") return null;
  const list = (input: unknown) =>
    Array.isArray(input) ? input.map(String).filter(Boolean) : [];
  const text = (input: unknown) => (typeof input === "string" ? input : "");
  const link = (input: unknown) => (typeof input === "string" && input.trim() ? input : null);

  const tags = list(value.tags);
  const styleSignals = list(value.styleSignals);
  const references = list(value.references);
  const referenceImages = list(value.referenceImages);

  return {
    tags: tags.length ? tags : styleSignals,
    tone: text(value.tone),
    references: references.length ? references : referenceImages,
    notes: text(value.notes),
    styleSignals: styleSignals.length ? styleSignals : tags,
    instagram: link(value.instagram),
    pinterest: link(value.pinterest),
    referenceBrands: list(value.referenceBrands),
    referenceImages: referenceImages.length ? referenceImages : references,
  };
}


export function readOnboarding(brand: BrandProfile | null): BrandOnboardingState | null {
  const raw = (brand?.metadata ?? {}) as Record<string, unknown>;
  const value = raw.onboarding as Record<string, unknown> | undefined;
  if (!value || typeof value !== "object") return null;
  return {
    currentStep: Number(value.currentStep) || 1,
    completedSteps: Array.isArray(value.completedSteps) ? value.completedSteps.map(Number) : [],
    startedAt: typeof value.startedAt === "string" ? value.startedAt : "",
    completedAt: typeof value.completedAt === "string" ? value.completedAt : null,
  };
}

export function readModelIds(brand: BrandProfile | null): string[] {
  const raw = (brand?.metadata ?? {}) as Record<string, unknown>;
  return Array.isArray(raw.modelIds) ? raw.modelIds.map(String).filter(Boolean) : [];
}

/** Partial update — only the provided columns are written. */
export async function patchBrandProfile(
  id: string,
  patch: Partial<BrandProfileInput>,
): Promise<void> {
  const { error } = await table().update({ ...patch }).eq("id", id);
  if (error) throw error;
}

/** Shallow-merges keys into brand_profiles.metadata (autosave-safe). */
export async function patchBrandMetadata(
  brand: BrandProfile,
  patch: Record<string, unknown>,
): Promise<void> {
  const metadata = { ...((brand.metadata ?? {}) as Record<string, unknown>), ...patch };
  await patchBrandProfile(brand.id, { metadata });
}



/** Brand images usable as template inputs (logos, tagged by role). */
export function brandProfileAssets(brand: BrandProfile): { role: string; url: string }[] {
  const assets: { role: string; url: string }[] = [];
  if (brand.primary_logo_url) assets.push({ role: "Primary logo", url: brand.primary_logo_url });
  if (brand.secondary_logo_url) assets.push({ role: "Secondary logo", url: brand.secondary_logo_url });
  return assets;
}
