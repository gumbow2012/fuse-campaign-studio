/**
 * FT4 — Reusable brand-asset library.
 *
 * Reads/writes `public.library_assets` directly through the supabase client;
 * RLS scopes every row to the owning user. No migrations here — if the table
 * is not present on the active backend every call degrades gracefully
 * (empty list / silent no-op save) so template runs are never blocked.
 */

import { supabase } from "@/integrations/supabase/client";
import type { TemplateAssetType } from "@/lib/templateAssetRequirements";

export const LIBRARY_ASSET_KINDS = [
  "garment",
  "product",
  "logo",
  "avatar",
  "jewelry",
  "packaging",
  "reference",
  "image",
  "video",
] as const;

export type LibraryAssetKind = (typeof LIBRARY_ASSET_KINDS)[number];

export interface LibraryAsset {
  id: string;
  user_id: string;
  kind: LibraryAssetKind;
  url: string;
  name: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export const LIBRARY_CATEGORIES: { kind: LibraryAssetKind; label: string }[] = [
  { kind: "garment", label: "Garments" },
  { kind: "product", label: "Products" },
  { kind: "logo", label: "Logos" },
  { kind: "avatar", label: "Avatars" },
  { kind: "jewelry", label: "Jewelry" },
  { kind: "packaging", label: "Packaging" },
  { kind: "reference", label: "References" },
];

/** Maps FT2 assetType metadata onto a library kind. */
export function libraryKindForAssetType(assetType?: TemplateAssetType | null): LibraryAssetKind {
  switch (assetType) {
    case "garment-front":
    case "garment-back":
      return "garment";
    case "logo":
      return "logo";
    case "product":
      return "product";
    case "avatar":
      return "avatar";
    case "jewelry":
      return "jewelry";
    case "packaging":
      return "packaging";
    case "video":
      return "video";
    case "image":
      return "image";
    default:
      return "reference";
  }
}

// The table is not part of the generated types on every backend, so go through
// an untyped client handle.
function table() {
  return (supabase as unknown as {
    from: (name: string) => any;
  }).from("library_assets");
}

function normalize(row: Record<string, unknown>): LibraryAsset {
  return {
    id: String(row.id),
    user_id: String(row.user_id ?? ""),
    kind: (LIBRARY_ASSET_KINDS as readonly string[]).includes(String(row.kind))
      ? (String(row.kind) as LibraryAssetKind)
      : "reference",
    url: String(row.url ?? ""),
    name: typeof row.name === "string" ? row.name : null,
    metadata: (row.metadata as Record<string, unknown> | null) ?? null,
    created_at: String(row.created_at ?? ""),
  };
}

export async function listLibraryAssets(
  userId: string,
  kind?: LibraryAssetKind | LibraryAssetKind[],
): Promise<LibraryAsset[]> {
  if (!userId) return [];
  try {
    let query = table().select("*").eq("user_id", userId).order("created_at", { ascending: false });
    if (Array.isArray(kind)) {
      if (kind.length) query = query.in("kind", kind);
    } else if (kind) {
      query = query.eq("kind", kind);
    }
    const { data, error } = await query;
    if (error) throw error;
    return (Array.isArray(data) ? data : []).map(normalize).filter((asset) => !!asset.url);
  } catch (error) {
    console.warn("library_assets unavailable:", error);
    return [];
  }
}

export async function saveLibraryAsset(input: {
  kind: LibraryAssetKind;
  url: string;
  name?: string | null;
  metadata?: Record<string, unknown> | null;
}): Promise<LibraryAsset | null> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || !input.url) return null;

    const existing = await table()
      .select("id")
      .eq("user_id", user.id)
      .eq("url", input.url)
      .limit(1)
      .maybeSingle();
    if (existing?.data?.id) return null;

    const { data, error } = await table()
      .insert({
        user_id: user.id,
        kind: input.kind,
        url: input.url,
        name: input.name ?? null,
        metadata: input.metadata ?? {},
      })
      .select("*")
      .maybeSingle();
    if (error) throw error;
    return data ? normalize(data) : null;
  } catch (error) {
    // Best-effort: never block a run because the library save failed.
    console.warn("Could not save asset to library:", error);
    return null;
  }
}

export async function deleteLibraryAsset(id: string): Promise<boolean> {
  try {
    const { error } = await table().delete().eq("id", id);
    if (error) throw error;
    return true;
  } catch (error) {
    console.warn("Could not delete library asset:", error);
    return false;
  }
}
