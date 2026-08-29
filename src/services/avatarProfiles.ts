/**
 * FT6 — Avatar profiles (public.avatar_profiles).
 * RLS scopes rows: users manage their own USER avatars and can read published
 * FUSE avatars. No migrations — every read degrades gracefully.
 */
import { supabase } from "@/integrations/supabase/client";
import { looseTable } from "@/services/looseTable";
import { track } from "@/lib/analytics/track";
import { ACTIVATION_EVENTS } from "@/lib/brandActivation";

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
  // Phase 7 activation analytics — fire-and-forget, safe props only.
  try {
    track(ACTIVATION_EVENTS.castAdded, { source: "user_avatar_created" });
  } catch {
    /* analytics must never break a save */
  }
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

/** Identity reference uploads — separate semantics from campaign run inputs. */
export const AVATAR_REFERENCE_MIME = ["image/jpeg", "image/png", "image/webp"] as const;
export const MAX_AVATAR_REFERENCE_BYTES = 15 * 1024 * 1024;

const AVATAR_BUCKET = "fuse-assets";

function avatarExtension(file: File) {
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return "jpg";
}

/**
 * Uploads one identity reference image straight to Storage.
 * Path starts with the user id to satisfy "authenticated_upload_fuse_assets".
 */
export async function uploadAvatarReference(file: File): Promise<string> {
  if (!(AVATAR_REFERENCE_MIME as readonly string[]).includes(file.type)) {
    throw new Error(`${file.name || "This file"} is not a JPG, PNG or WEBP image.`);
  }
  if (file.size > MAX_AVATAR_REFERENCE_BYTES) {
    throw new Error(
      `${file.name || "This image"} is ${(file.size / (1024 * 1024)).toFixed(1)} MB — the limit is 15 MB.`,
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Please sign in to upload a reference image.");

  const path = `${user.id}/avatar-references/${crypto.randomUUID()}.${avatarExtension(file)}`;
  const { error } = await supabase.storage.from(AVATAR_BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
    cacheControl: "3600",
  });
  if (error) throw new Error(error.message || "Upload failed — please try again.");

  const url = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path).data.publicUrl;
  if (!url) throw new Error("Upload succeeded but no public URL was returned.");
  return url;
}

export const AVATAR_UPLOAD_TIPS = [
  "One clear, unobstructed face per image",
  "Several angles (front, three-quarter, profile) beat one perfect shot",
  "High resolution — avoid heavy compression or screenshots",
  "Readable, even lighting; no hard colored washes",
  "Minimal obstruction: no sunglasses, heavy filters, or motion blur",
];
