/**
 * MARKET3 — Template Collections service.
 *
 * Thin wrapper over `template_collections` / `template_collection_items`.
 * RLS does all scoping: owners see + write their own rows, anyone (including
 * signed-out visitors) can read rows belonging to a public collection.
 *
 * Template display data is NOT stored here — items only reference the catalog
 * `template_id` (the catalog's `ApiTemplate.id`) and are joined client-side
 * against the existing `lab-template-catalog` response.
 */

import { supabase } from "@/integrations/supabase/client";

export type TemplateCollection = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  cover_url: string | null;
  slug: string;
  is_public: boolean;
  created_at: string;
  updated_at: string;
};

export type TemplateCollectionItem = {
  id: string;
  collection_id: string;
  template_id: string;
  position: number;
  created_at: string;
};

export type CollectionInput = {
  title: string;
  description?: string | null;
  cover_url?: string | null;
  is_public?: boolean;
};

const COLLECTION_FIELDS =
  "id,user_id,title,description,cover_url,slug,is_public,created_at,updated_at";
const ITEM_FIELDS = "id,collection_id,template_id,position,created_at";

/* --------------------------------- slugs --------------------------------- */

/**
 * Slug strategy: url-safe slug of the title (lowercase, non-alphanumerics
 * collapsed to dashes, trimmed to 40 chars) + "-" + a 6-char random base36
 * suffix. The suffix keeps the globally-unique `slug` column collision-free
 * without leaking ids or requiring a lookup round-trip; on the (very unlikely)
 * unique-violation we retry with a fresh suffix.
 */
export function slugifyTitle(title: string) {
  return (
    title
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40)
      .replace(/-+$/g, "") || "collection"
  );
}

function randomSuffix() {
  return Math.random().toString(36).slice(2, 8);
}

export function buildCollectionSlug(title: string) {
  return `${slugifyTitle(title)}-${randomSuffix()}`;
}

/* --------------------------------- reads --------------------------------- */

export async function listMyCollections(userId: string) {
  const { data, error } = await supabase
    .from("template_collections")
    .select(COLLECTION_FIELDS)
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as TemplateCollection[];
}

/** Public read by slug — works signed-out for `is_public` collections. */
export async function getCollectionBySlug(slug: string) {
  const { data, error } = await supabase
    .from("template_collections")
    .select(COLLECTION_FIELDS)
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as TemplateCollection | null) ?? null;
}

export async function listCollectionItems(collectionId: string) {
  const { data, error } = await supabase
    .from("template_collection_items")
    .select(ITEM_FIELDS)
    .eq("collection_id", collectionId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as TemplateCollectionItem[];
}

/** Item counts for a set of collections (single query, grouped client-side). */
export async function countCollectionItems(collectionIds: string[]) {
  if (!collectionIds.length) return {} as Record<string, number>;
  const { data, error } = await supabase
    .from("template_collection_items")
    .select("collection_id")
    .in("collection_id", collectionIds);
  if (error) throw new Error(error.message);
  const counts: Record<string, number> = {};
  for (const row of (data ?? []) as Array<{ collection_id: string }>) {
    counts[row.collection_id] = (counts[row.collection_id] ?? 0) + 1;
  }
  return counts;
}

/* --------------------------------- writes -------------------------------- */

function clean(value: string | null | undefined) {
  const trimmed = (value ?? "").trim();
  return trimmed.length ? trimmed : null;
}

async function requireUserId() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const userId = session?.user?.id;
  if (!userId) throw new Error("Please sign in again to manage collections.");
  return userId;
}

export async function createCollection(input: CollectionInput) {
  const userId = await requireUserId();
  const title = clean(input.title);
  if (!title) throw new Error("Add a collection title.");

  let lastError: string | null = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const { data, error } = await supabase
      .from("template_collections")
      .insert({
        user_id: userId,
        title,
        description: clean(input.description),
        cover_url: clean(input.cover_url),
        slug: buildCollectionSlug(title),
        is_public: input.is_public ?? false,
      })
      .select(COLLECTION_FIELDS)
      .single();
    if (!error) return data as TemplateCollection;
    // 23505 = unique violation on `slug`; retry with a new random suffix.
    if (error.code !== "23505") throw new Error(error.message);
    lastError = error.message;
  }
  throw new Error(lastError ?? "Could not create that collection.");
}

export async function updateCollection(
  id: string,
  patch: Partial<CollectionInput>,
) {
  const row: Record<string, unknown> = {};
  if (patch.title !== undefined) {
    const title = clean(patch.title);
    if (!title) throw new Error("Add a collection title.");
    row.title = title;
  }
  if (patch.description !== undefined) row.description = clean(patch.description);
  if (patch.cover_url !== undefined) row.cover_url = clean(patch.cover_url);
  if (patch.is_public !== undefined) row.is_public = patch.is_public;

  const { data, error } = await supabase
    .from("template_collections")
    .update(row)
    .eq("id", id)
    .select(COLLECTION_FIELDS)
    .single();
  if (error) throw new Error(error.message);
  return data as TemplateCollection;
}

export async function deleteCollection(id: string) {
  const { error } = await supabase.from("template_collections").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function addTemplateToCollection(
  collectionId: string,
  templateId: string,
) {
  const { data: existing, error: readError } = await supabase
    .from("template_collection_items")
    .select("position")
    .eq("collection_id", collectionId)
    .order("position", { ascending: false })
    .limit(1);
  if (readError) throw new Error(readError.message);
  const nextPosition = Number((existing?.[0] as { position?: number } | undefined)?.position ?? -1) + 1;

  const { data, error } = await supabase
    .from("template_collection_items")
    .insert({
      collection_id: collectionId,
      template_id: templateId,
      position: nextPosition,
    })
    .select(ITEM_FIELDS)
    .single();
  if (error) {
    if (error.code === "23505") throw new Error("That template is already in this collection.");
    throw new Error(error.message);
  }
  return data as TemplateCollectionItem;
}

export async function removeTemplateFromCollection(
  collectionId: string,
  templateId: string,
) {
  const { error } = await supabase
    .from("template_collection_items")
    .delete()
    .eq("collection_id", collectionId)
    .eq("template_id", templateId);
  if (error) throw new Error(error.message);
}

/** Persists the given order as sequential `position` values (0..n-1). */
export async function reorderCollectionItems(
  collectionId: string,
  orderedTemplateIds: string[],
) {
  for (let index = 0; index < orderedTemplateIds.length; index += 1) {
    const { error } = await supabase
      .from("template_collection_items")
      .update({ position: index })
      .eq("collection_id", collectionId)
      .eq("template_id", orderedTemplateIds[index]);
    if (error) throw new Error(error.message);
  }
}
