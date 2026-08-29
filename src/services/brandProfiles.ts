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

/** Brand images usable as template inputs (logos, tagged by role). */
export function brandProfileAssets(brand: BrandProfile): { role: string; url: string }[] {
  const assets: { role: string; url: string }[] = [];
  if (brand.primary_logo_url) assets.push({ role: "Primary logo", url: brand.primary_logo_url });
  if (brand.secondary_logo_url) assets.push({ role: "Secondary logo", url: brand.secondary_logo_url });
  return assets;
}
