/**
 * FT6 — Avatar profiles (public.avatar_profiles).
 * RLS scopes rows: users manage their own USER avatars and can read published
 * FUSE avatars. No migrations — every read degrades gracefully.
 */
import { supabase } from "@/integrations/supabase/client";
import { looseTable } from "@/services/looseTable";

export type AvatarSourceType = "FUSE" | "USER";

export interface AvatarProfile {
  id: string;
  user_id: string | null;
  source_type: AvatarSourceType;
  name: string;
  thumbnail_url: string | null;
  reference_assets: string[];
  visual_description: string | null;
  style_tags: string[];
  consistency_profile: Record<string, unknown> | null;
  permission_confirmed: boolean;
  is_public: boolean;
  favorited: boolean;
  created_at: string;
  updated_at: string;
}

export interface AvatarProfileInput {
  name: string;
  thumbnail_url?: string | null;
  reference_assets?: string[];
  visual_description?: string | null;
  style_tags?: string[];
  consistency_profile?: Record<string, unknown> | null;
}

function table() {
  return looseTable("avatar_profiles");
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((entry) => String(entry)).filter(Boolean) : [];
}

function normalize(row: Record<string, unknown>): AvatarProfile {
  const references = toStringArray(row.reference_assets);
  return {
    id: String(row.id),
    user_id: typeof row.user_id === "string" ? row.user_id : null,
    source_type: row.source_type === "FUSE" ? "FUSE" : "USER",
    name: String(row.name ?? "Untitled avatar"),
    thumbnail_url:
      typeof row.thumbnail_url === "string" && row.thumbnail_url ? row.thumbnail_url : references[0] ?? null,
    reference_assets: references,
    visual_description: typeof row.visual_description === "string" ? row.visual_description : null,
    style_tags: toStringArray(row.style_tags),
    consistency_profile: (row.consistency_profile as Record<string, unknown> | null) ?? null,
    permission_confirmed: Boolean(row.permission_confirmed),
    is_public: Boolean(row.is_public),
    favorited: Boolean(row.favorited),
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

export async function listMyAvatars(userId: string): Promise<AvatarProfile[]> {
  if (!userId) return [];
  try {
    const { data, error } = await table()
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (Array.isArray(data) ? data : []).map(normalize);
  } catch (error) {
    console.warn("avatar_profiles unavailable:", error);
    return [];
  }
}

export async function listFuseAvatars(): Promise<AvatarProfile[]> {
  try {
    const { data, error } = await table()
      .select("*")
      .eq("source_type", "FUSE")
      .eq("is_public", true)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (Array.isArray(data) ? data : []).map(normalize);
  } catch (error) {
    console.warn("avatar_profiles (FUSE) unavailable:", error);
    return [];
  }
}

export async function createUserAvatar(input: AvatarProfileInput): Promise<AvatarProfile | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in to save an avatar.");

  const references = input.reference_assets ?? [];
  const { data, error } = await table()
    .insert({
      user_id: user.id,
      source_type: "USER",
      name: input.name,
      thumbnail_url: input.thumbnail_url ?? references[0] ?? null,
      reference_assets: references,
      visual_description: input.visual_description ?? null,
      style_tags: input.style_tags ?? [],
      consistency_profile: input.consistency_profile ?? {},
      permission_confirmed: true,
      is_public: false,
    })
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data ? normalize(data) : null;
}

export async function updateAvatar(id: string, patch: Partial<AvatarProfileInput>): Promise<void> {
  const values: Record<string, unknown> = {};
  if (patch.name !== undefined) values.name = patch.name;
  if (patch.thumbnail_url !== undefined) values.thumbnail_url = patch.thumbnail_url;
  if (patch.reference_assets !== undefined) values.reference_assets = patch.reference_assets;
  if (patch.visual_description !== undefined) values.visual_description = patch.visual_description;
  if (patch.style_tags !== undefined) values.style_tags = patch.style_tags;
  if (patch.consistency_profile !== undefined) values.consistency_profile = patch.consistency_profile;
  if (!Object.keys(values).length) return;

  const { error } = await table().update(values).eq("id", id);
  if (error) throw error;
}

export async function deleteAvatar(id: string): Promise<void> {
  const { error } = await table().delete().eq("id", id);
  if (error) throw error;
}

export async function toggleFavorite(id: string, favorited: boolean): Promise<void> {
  const { error } = await table().update({ favorited }).eq("id", id);
  if (error) throw error;
}

export const AVATAR_UPLOAD_TIPS = [
  "One clear, unobstructed face per image",
  "Several angles (front, three-quarter, profile) beat one perfect shot",
  "High resolution — avoid heavy compression or screenshots",
  "Readable, even lighting; no hard colored washes",
  "Minimal obstruction: no sunglasses, heavy filters, or motion blur",
];
