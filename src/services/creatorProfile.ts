/**
 * FUSE Creator public profile service (ADDITIVE).
 *
 * Reads/writes ONLY the public `creator_profiles` fields — never billing email,
 * Stripe ids or any private profile data. No generation, credit or billing code
 * is touched here.
 */

import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_ACCENT, resolveAccent } from "@/lib/creatorAccents";
import { countCreatorTemplatesPublic } from "@/services/creatorDashboard";

export type CreatorProfile = {
  id: string;
  user_id: string;
  handle: string;
  display_name: string;
  avatar_url: string | null;
  banner_url: string | null;
  bio: string | null;
  description: string | null;
  location: string | null;
  website: string | null;
  instagram: string | null;
  tiktok: string | null;
  x_handle: string | null;
  portfolio_url: string | null;
  specialties: string[];
  accent: string;
  is_public: boolean;
  created_at: string;
  updated_at: string;
};

export type CreatorProfileInput = {
  handle: string;
  display_name: string;
  avatar_url?: string | null;
  banner_url?: string | null;
  bio?: string | null;
  description?: string | null;
  location?: string | null;
  website?: string | null;
  instagram?: string | null;
  tiktok?: string | null;
  x_handle?: string | null;
  portfolio_url?: string | null;
  specialties?: string[];
  accent?: string;
  is_public?: boolean;
};

const PUBLIC_FIELDS =
  "id,user_id,handle,display_name,avatar_url,banner_url,bio,description,location,website,instagram,tiktok,x_handle,portfolio_url,specialties,accent,is_public,created_at,updated_at";

const BUCKET = "fuse-assets";
/** Profile images must outlive a browsing session by a wide margin. */
const IMAGE_URL_TTL = 60 * 60 * 24 * 365;

/* -------------------------------- handles -------------------------------- */

export const HANDLE_PATTERN = /^[a-z0-9](?:[a-z0-9_-]{1,28})[a-z0-9]$/;

/** URL-safe slug: lowercase, a–z 0–9 - _ , 3–30 chars. */
export function normalizeHandle(raw: string) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^@+/, "")
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "")
    .slice(0, 30);
}

export function validateHandle(raw: string): string | null {
  const handle = normalizeHandle(raw);
  if (handle.length < 3) return "Handles need at least 3 characters.";
  if (!HANDLE_PATTERN.test(handle)) {
    return "Use letters, numbers, dashes or underscores only.";
  }
  return null;
}

/** True when the handle is free (ignoring the caller's own row). */
export async function isHandleAvailable(raw: string, ownUserId?: string) {
  const handle = normalizeHandle(raw);
  if (!handle) return false;
  const { data, error } = await supabase
    .from("creator_profiles")
    .select("user_id")
    .eq("handle", handle)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return true;
  return Boolean(ownUserId) && data.user_id === ownUserId;
}

/* --------------------------------- reads --------------------------------- */

export async function getCreatorProfileByHandle(handle: string) {
  const { data, error } = await supabase
    .from("creator_profiles")
    .select(PUBLIC_FIELDS)
    .eq("handle", normalizeHandle(handle))
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as CreatorProfile | null) ?? null;
}

/**
 * Public creator directory (READ-ONLY). Returns only rows the creator has
 * explicitly made public. Never invents counts, uses or earnings.
 */
export async function listPublicCreatorProfiles(limit = 6) {
  const { data, error } = await supabase
    .from("creator_profiles")
    .select(PUBLIC_FIELDS)
    .eq("is_public", true)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data as CreatorProfile[] | null) ?? [];
}

export type PublicCreatorListing = CreatorProfile & {
  verification_status?: string | null;
};

/**
 * PUBLIC creators directory listing. Selects only public profile columns
 * (+ verification_status where the column exists) — `verification_reason` is
 * ADMIN-ONLY and is never selected here.
 */
export async function listPublicCreators(limit = 200): Promise<PublicCreatorListing[]> {
  const withStatus = await supabase
    .from("creator_profiles")
    .select(`${PUBLIC_FIELDS},verification_status`)
    .eq("is_public", true)
    .order("created_at", { ascending: false })
    .limit(limit);

  const rows = withStatus.error
    ? await supabase
        .from("creator_profiles")
        .select(PUBLIC_FIELDS)
        .eq("is_public", true)
        .order("created_at", { ascending: false })
        .limit(limit)
    : withStatus;

  if (rows.error) throw new Error(rows.error.message);
  const list = ((rows.data ?? []) as unknown as PublicCreatorListing[]).slice();

  // Verified first, then newest (the SQL order already provides newest-first).
  const badged = (value: unknown) =>
    typeof value === "string" && value !== "creator" && value.length > 0;
  return list.sort((a, b) => Number(badged(b.verification_status)) - Number(badged(a.verification_status)));
}


export async function getOwnCreatorProfile() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const userId = session?.user?.id;
  if (!userId) return null;
  const { data, error } = await supabase
    .from("creator_profiles")
    .select(PUBLIC_FIELDS)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as CreatorProfile | null) ?? null;
}

/**
 * REAL DATA ONLY: the number of templates this creator actually owns.
 *
 * PRODUCTION SCHEMA: authorship is `fuse_templates.created_by`, which the
 * browser client cannot read, so this goes through the `creator-portfolio`
 * edge function (service role, real prod tables). Nothing is invented —
 * uses / likes / followers are not tracked and are never returned.
 */
export async function countCreatorTemplates(userId: string) {
  return countCreatorTemplatesPublic({ userId });
}

export async function countCreatorTemplatesByHandle(handle: string) {
  return countCreatorTemplatesPublic({ handle });
}

/* --------------------------------- writes -------------------------------- */

function cleanText(value: string | null | undefined) {
  const trimmed = (value ?? "").trim();
  return trimmed.length ? trimmed : null;
}

/** Create or update the signed-in creator's own row. */
export async function upsertOwnCreatorProfile(input: CreatorProfileInput) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const userId = session?.user?.id;
  if (!userId) throw new Error("Please sign in again to edit your profile.");

  const handleError = validateHandle(input.handle);
  if (handleError) throw new Error(handleError);
  const handle = normalizeHandle(input.handle);
  if (!(await isHandleAvailable(handle, userId))) {
    throw new Error("That handle is already taken.");
  }
  const displayName = cleanText(input.display_name);
  if (!displayName) throw new Error("Add a display name.");

  const row = {
    user_id: userId,
    handle,
    display_name: displayName,
    avatar_url: cleanText(input.avatar_url),
    banner_url: cleanText(input.banner_url),
    bio: cleanText(input.bio),
    description: cleanText(input.description),
    location: cleanText(input.location),
    website: cleanText(input.website),
    instagram: cleanText(input.instagram)?.replace(/^@+/, "") ?? null,
    tiktok: cleanText(input.tiktok)?.replace(/^@+/, "") ?? null,
    x_handle: cleanText(input.x_handle)?.replace(/^@+/, "") ?? null,
    portfolio_url: cleanText(input.portfolio_url),
    specialties: input.specialties ?? [],
    accent: resolveAccent(input.accent ?? DEFAULT_ACCENT).id,
    is_public: input.is_public ?? true,
  };

  const { data, error } = await supabase
    .from("creator_profiles")
    .upsert(row, { onConflict: "user_id" })
    .select(PUBLIC_FIELDS)
    .single();
  if (error) throw new Error(error.message);
  return data as CreatorProfile;
}

/* -------------------------------- uploads -------------------------------- */

/** Avatar / banner upload — reuses the existing fuse-assets storage pattern. */
export async function uploadCreatorImage(kind: "avatar" | "banner", file: File | Blob) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const userId = session?.user?.id;
  if (!userId) throw new Error("Please sign in again to upload images.");

  const ext = (file as File).type?.includes("png") ? "png" : "jpg";
  const path = `creator/${userId}/${kind}-${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    upsert: true,
    contentType: (file as File).type || "image/jpeg",
  });
  if (error) throw new Error(error.message);

  const { data, error: signError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, IMAGE_URL_TTL);
  if (signError || !data?.signedUrl) {
    throw new Error(signError?.message ?? "Could not link that image.");
  }
  return { path, url: data.signedUrl };
}
