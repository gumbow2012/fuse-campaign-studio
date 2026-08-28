/**
 * Admin merchandising data access for the marketplace shelves.
 *
 * Reads/writes ONLY the two merchandising tables created in P1
 * (`marketplace_collections`, `marketplace_collection_templates`) plus a
 * read of the marketplace-live templates (`fuse_templates` joined to an
 * active, non-fork `template_versions` row).
 *
 * Writes rely on the existing admin RLS (has_role) — no service-role access,
 * no workflow/billing surface is touched here.
 */

import { supabase } from "@/integrations/supabase/client";

/* These tables are not present in the generated Supabase types on every
   backend, so queries go through a loose handle. RLS still gates every row. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export interface MerchShelf {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  sortOrder: number;
  isVisible: boolean;
  isAlgorithmic: boolean;
}

export interface MerchShelfItem {
  id: string;
  collectionId: string;
  templateId: string;
  sortOrder: number;
  pinned: boolean;
}

export interface MerchTemplate {
  id: string;
  name: string;
  description: string | null;
  previewUrl: string | null;
  createdBy: string | null;
  live: boolean;
}

export interface MerchandisingSnapshot {
  shelves: MerchShelf[];
  items: MerchShelfItem[];
  templates: MerchTemplate[];
}

function text(value: unknown): string | null {
  const raw = typeof value === "string" ? value.trim() : "";
  return raw ? raw : null;
}

export async function loadMerchandising(): Promise<MerchandisingSnapshot> {
  const [collectionsRes, itemsRes, versionsRes] = await Promise.all([
    db
      .from("marketplace_collections")
      .select("id, slug, title, subtitle, sort_order, is_visible, is_algorithmic")
      .order("sort_order", { ascending: true }),
    db
      .from("marketplace_collection_templates")
      .select("id, collection_id, template_id, sort_order, pinned")
      .order("sort_order", { ascending: true }),
    db
      .from("template_versions")
      .select(
        "id, template_id, is_active, fork_id, fuse_templates!inner(id, name, description, preview_url, created_by)",
      )
      .eq("is_active", true)
      .is("fork_id", null),
  ]);

  const firstError = collectionsRes.error || itemsRes.error || versionsRes.error;
  if (firstError) throw new Error(firstError.message || "Could not load merchandising data");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const shelves: MerchShelf[] = ((collectionsRes.data ?? []) as any[]).map((row) => ({
    id: String(row.id),
    slug: String(row.slug ?? ""),
    title: String(row.title ?? row.slug ?? "Untitled shelf"),
    subtitle: text(row.subtitle),
    sortOrder: Number(row.sort_order ?? 0),
    isVisible: row.is_visible !== false,
    isAlgorithmic: row.is_algorithmic === true,
  }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items: MerchShelfItem[] = ((itemsRes.data ?? []) as any[]).map((row) => ({
    id: String(row.id),
    collectionId: String(row.collection_id),
    templateId: String(row.template_id),
    sortOrder: Number(row.sort_order ?? 0),
    pinned: row.pinned === true,
  }));

  const templateMap = new Map<string, MerchTemplate>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of (versionsRes.data ?? []) as any[]) {
    const template = row.fuse_templates;
    if (!template?.id) continue;
    templateMap.set(String(template.id), {
      id: String(template.id),
      name: String(template.name ?? "Untitled template"),
      description: text(template.description),
      previewUrl: text(template.preview_url),
      createdBy: text(template.created_by),
      live: true,
    });
  }

  return {
    shelves,
    items,
    templates: [...templateMap.values()].sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/** Persists shelf order. One update per changed shelf — admin RLS applies. */
export async function saveShelfOrder(rows: { id: string; sortOrder: number }[]) {
  for (const row of rows) {
    const { error } = await db
      .from("marketplace_collections")
      .update({ sort_order: row.sortOrder })
      .eq("id", row.id);
    if (error) throw new Error(error.message);
  }
}

export async function saveShelfVisibility(id: string, isVisible: boolean) {
  const { error } = await db
    .from("marketplace_collections")
    .update({ is_visible: isVisible })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/** Persists template order + pinned state inside shelves. */
export async function saveItemOrder(rows: { id: string; sortOrder: number; pinned: boolean }[]) {
  for (const row of rows) {
    const { error } = await db
      .from("marketplace_collection_templates")
      .update({ sort_order: row.sortOrder, pinned: row.pinned })
      .eq("id", row.id);
    if (error) throw new Error(error.message);
  }
}

export async function addTemplatesToShelf(
  collectionId: string,
  templateIds: string[],
  startSortOrder: number,
) {
  if (!templateIds.length) return;
  const payload = templateIds.map((templateId, index) => ({
    collection_id: collectionId,
    template_id: templateId,
    sort_order: startSortOrder + index,
    pinned: false,
  }));
  const { error } = await db.from("marketplace_collection_templates").insert(payload);
  if (error) throw new Error(error.message);
}

export async function removeShelfItem(id: string) {
  const { error } = await db.from("marketplace_collection_templates").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
