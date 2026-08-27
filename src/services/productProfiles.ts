/**
 * FT5 — Product / garment profiles (public.product_profiles, RLS own-rows only).
 * No migrations: every call degrades gracefully if the table is absent.
 */
import { supabase } from "@/integrations/supabase/client";
import { looseTable } from "@/services/looseTable";

export type ProductProfileType = "product" | "garment";

export interface ProductProfileAsset {
  role: string;
  url: string;
}

export interface ProductProfile {
  id: string;
  user_id: string;
  brand_id: string | null;
  name: string;
  type: ProductProfileType;
  description: string | null;
  attributes: Record<string, unknown> | null;
  assets: ProductProfileAsset[];
  created_at: string;
  updated_at: string;
}

export interface ProductProfileInput {
  name: string;
  type: ProductProfileType;
  brand_id?: string | null;
  description?: string | null;
  attributes?: Record<string, unknown> | null;
  assets?: ProductProfileAsset[];
}

/** Suggested asset roles per profile type. */
export const PROFILE_ASSET_ROLES: Record<ProductProfileType, string[]> = {
  garment: ["Front", "Back", "Detail", "Logo"],
  product: ["Front", "Side", "Back", "Macro", "Packaging"],
};

function table() {
  return looseTable("product_profiles");
}

function normalizeAssets(value: unknown): ProductProfileAsset[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      const item = (entry ?? {}) as Record<string, unknown>;
      return { role: String(item.role ?? "Reference"), url: String(item.url ?? "") };
    })
    .filter((asset) => !!asset.url);
}

function normalize(row: Record<string, unknown>): ProductProfile {
  const type = row.type === "garment" ? "garment" : "product";
  return {
    id: String(row.id),
    user_id: String(row.user_id ?? ""),
    brand_id: typeof row.brand_id === "string" ? row.brand_id : null,
    name: String(row.name ?? "Untitled"),
    type,
    description: typeof row.description === "string" ? row.description : null,
    attributes: (row.attributes as Record<string, unknown> | null) ?? null,
    assets: normalizeAssets(row.assets),
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

export async function listProductProfiles(userId: string): Promise<ProductProfile[]> {
  if (!userId) return [];
  try {
    const { data, error } = await table()
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (Array.isArray(data) ? data : []).map(normalize);
  } catch (error) {
    console.warn("product_profiles unavailable:", error);
    return [];
  }
}

export async function createProductProfile(input: ProductProfileInput): Promise<ProductProfile | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in to save a product profile.");

  const { data, error } = await table()
    .insert({
      user_id: user.id,
      brand_id: input.brand_id ?? null,
      name: input.name,
      type: input.type,
      description: input.description ?? null,
      attributes: input.attributes ?? {},
      assets: input.assets ?? [],
    })
    .select("*")
    .maybeSingle();
  if (error) throw error;
  // Phase 7 activation analytics — fire-and-forget, safe props only.
  try {
    track(ACTIVATION_EVENTS.productAdded, {
      active_brand_exists: !!input.brand_id,
      product_type: input.type ?? null,
    });
  } catch {
    /* analytics must never break a save */
  }
  return data ? normalize(data) : null;
}

export async function updateProductProfile(id: string, input: ProductProfileInput): Promise<void> {
  const { error } = await table()
    .update({
      brand_id: input.brand_id ?? null,
      name: input.name,
      type: input.type,
      description: input.description ?? null,
      attributes: input.attributes ?? {},
      assets: input.assets ?? [],
    })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteProductProfile(id: string): Promise<void> {
  const { error } = await table().delete().eq("id", id);
  if (error) throw error;
}
