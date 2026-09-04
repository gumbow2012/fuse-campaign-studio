/**
 * Template Detail page data + admin media management.
 *
 * Reads the public `template-detail-page` edge function (signed media urls,
 * ~1h ttl — fetched on page load, never persisted). Admin media operations go
 * through `admin-template-media` / `admin-storage-upload-url` with the caller's
 * session JWT; non-admin callers never reach these paths in the UI and are
 * rejected server-side regardless.
 */

import { supabase } from "@/integrations/supabase/client";

export type TemplateMediaType = "image" | "video";

export type TemplateMediaCategory = "full_body" | "product_detail" | "lifestyle";

export interface TemplateGalleryItem {
  id: string;
  media_type: TemplateMediaType;
  url: string;
  poster_url: string | null;
  label: string | null;
  category: string | null;
  is_primary: boolean;
}

export interface TemplateDetailPageData {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  aspect_ratio: string | null;
  image_count: number;
  video_count: number;
  total_outputs: number;
  required_inputs: Array<{ name: string; label: string; expected: TemplateMediaType | string }>;
  est_generation_seconds: number | null;
  allow_customer_edit: boolean;
  hero: { media_type: TemplateMediaType; url: string; poster_url: string | null } | null;
  featured: { media_type: TemplateMediaType; url: string; poster_url: string | null } | null;
  gallery: TemplateGalleryItem[];
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function mediaType(value: unknown): TemplateMediaType {
  return value === "video" ? "video" : "image";
}

function normalizeGalleryItem(raw: unknown, index: number): TemplateGalleryItem | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const url = str(row.url);
  if (!url) return null;
  return {
    id: String(row.id ?? `gallery-${index}`),
    media_type: mediaType(row.media_type),
    url,
    poster_url: str(row.poster_url) || null,
    label: str(row.label) || null,
    category: str(row.category) || null,
    is_primary: row.is_primary === true,
  };
}

function normalizeDetail(raw: unknown): TemplateDetailPageData | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const id = str(row.id);
  const name = str(row.name);
  if (!id && !name) return null;

  const featuredRaw = row.featured as Record<string, unknown> | null | undefined;
  const featuredUrl = featuredRaw ? str(featuredRaw.url) : "";
  const heroRaw = (row.hero ?? row.featured) as Record<string, unknown> | null | undefined;
  const heroUrl = heroRaw ? str(heroRaw.url) : "";

  return {
    id,
    slug: str(row.slug),
    name,
    description: str(row.description) || null,
    aspect_ratio: str(row.aspect_ratio) || null,
    image_count: Number(row.image_count ?? 0) || 0,
    video_count: Number(row.video_count ?? 0) || 0,
    total_outputs: Number(row.total_outputs ?? 0) || 0,
    required_inputs: Array.isArray(row.required_inputs)
      ? (row.required_inputs as unknown[])
          .map((entry) => {
            if (!entry || typeof entry !== "object") return null;
            const input = entry as Record<string, unknown>;
            const inputName = str(input.name);
            if (!inputName) return null;
            return {
              name: inputName,
              label: str(input.label) || inputName,
              expected: str(input.expected) || "image",
            };
          })
          .filter((entry): entry is { name: string; label: string; expected: string } => !!entry)
      : [],
    est_generation_seconds:
      row.est_generation_seconds == null ? null : Number(row.est_generation_seconds) || 0,
    allow_customer_edit: row.allow_customer_edit === true,
    hero: heroUrl
      ? {
          media_type: mediaType(heroRaw?.media_type),
          url: heroUrl,
          poster_url: str(heroRaw?.poster_url) || null,
        }
      : null,
    featured: featuredUrl
      ? {
          media_type: mediaType(featuredRaw?.media_type),
          url: featuredUrl,
          poster_url: str(featuredRaw?.poster_url) || null,
        }
      : null,
    gallery: Array.isArray(row.gallery)
      ? (row.gallery as unknown[])
          .map((entry, index) => normalizeGalleryItem(entry, index))
          .filter((entry): entry is TemplateGalleryItem => !!entry)
      : [],
  };
}

/** Public read — resolves by slug (or template id when the slug is a uuid). */
export async function fetchTemplateDetailPage(
  slug: string,
): Promise<TemplateDetailPageData | null> {
  const value = slug.trim();
  if (!value) return null;
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
  const { data, error } = await supabase.functions.invoke("template-detail-page", {
    body: isUuid ? { template_id: value } : { slug: value },
  });
  if (error) throw error;
  return normalizeDetail((data as { template?: unknown } | null)?.template);
}

/* ── Admin media manager ── */

export interface AdminTemplateMediaRow {
  id: string;
  media_type: TemplateMediaType;
  url: string | null;
  poster_url: string | null;
  label: string | null;
  category: string | null;
  published: boolean;
  is_featured: boolean;
  sort_order: number;
}

function normalizeAdminRow(raw: unknown, index: number): AdminTemplateMediaRow | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const id = String(row.id ?? "");
  if (!id) return null;
  return {
    id,
    media_type: mediaType(row.media_type),
    url: str(row.url) || str(row.signed_url) || null,
    poster_url: str(row.poster_url) || null,
    label: str(row.label) || null,
    category: str(row.category) || null,
    published: row.published !== false,
    is_featured: row.is_featured === true || row.is_primary === true,
    sort_order: Number(row.sort_order ?? index) || 0,
  };
}

async function mediaOp<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("admin-template-media", { body });
  if (error) throw error;
  return data as T;
}

export async function listAdminTemplateMedia(templateId: string) {
  const data = await mediaOp<{ items?: unknown[]; media?: unknown[] }>({
    op: "list",
    template_id: templateId,
  });
  const items = Array.isArray(data?.items) ? data.items : Array.isArray(data?.media) ? data.media : [];
  return items
    .map((entry, index) => normalizeAdminRow(entry, index))
    .filter((entry): entry is AdminTemplateMediaRow => !!entry);
}

function extension(file: File) {
  const fromName = file.name.split(".").pop();
  if (fromName && fromName.length <= 5) return fromName.toLowerCase();
  return file.type.includes("video") ? "mp4" : "jpg";
}

function randomToken() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Signed PUT upload into the admin template-media folder. Returns the object path. */
export async function uploadTemplateMediaFile(templateId: string, file: File): Promise<string> {
  const path = `system/template-covers/${templateId}/media/${randomToken()}.${extension(file)}`;
  const { data, error } = await supabase.functions.invoke("admin-storage-upload-url", {
    body: { path },
  });
  if (error) throw error;
  const signedUrl = str((data as Record<string, unknown> | null)?.signedUrl);
  if (!signedUrl) throw new Error("Upload URL unavailable");
  const response = await fetch(signedUrl, {
    method: "PUT",
    headers: { "content-type": file.type || "application/octet-stream" },
    body: file,
  });
  if (!response.ok) throw new Error(`Upload failed (${response.status})`);
  return path;
}

export async function addTemplateMedia(input: {
  templateId: string;
  sourcePath: string;
  mediaType: TemplateMediaType;
  label: string;
  category?: string | null;
  posterPath?: string | null;
}) {
  return mediaOp({
    op: "add",
    template_id: input.templateId,
    source_path: input.sourcePath,
    media_type: input.mediaType,
    label: input.label,
    ...(input.category ? { category: input.category } : {}),
    ...(input.posterPath ? { poster_path: input.posterPath } : {}),
  });
}

export async function reorderTemplateMedia(templateId: string, order: string[]) {
  return mediaOp({ op: "reorder", template_id: templateId, order });
}

export async function updateTemplateMediaLabel(id: string, label: string) {
  return mediaOp({ op: "update", id, label });
}

export async function updateTemplateMediaCategory(id: string, category: string | null) {
  return mediaOp({ op: "update", id, category });
}

export async function setTemplateMediaPublished(id: string, published: boolean) {
  return mediaOp({ op: "set_published", id, published });
}

export async function setTemplateMediaFeatured(id: string) {
  return mediaOp({ op: "set_featured", id });
}

export async function deleteTemplateMedia(id: string) {
  return mediaOp({ op: "delete", id });
}
