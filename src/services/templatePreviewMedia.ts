/**
 * Template Preview Gallery — reads the public `template-preview-media` endpoint.
 *
 * URLs returned here are SHORT-LIVED SIGNED urls (≈1h). They are fetched when a
 * gallery opens and never persisted to any database field or long-lived cache.
 */

import { supabase } from "@/integrations/supabase/client";

export interface TemplatePreviewItem {
  id: string;
  media_type: "image" | "video";
  url: string;
  poster_url: string | null;
  alt: string;
  label: string | null;
  is_primary: boolean;
  sort_order: number;
}

function normalize(raw: unknown, index: number): TemplatePreviewItem | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const url = typeof row.url === "string" ? row.url : "";
  if (!url) return null;
  return {
    id: String(row.id ?? `preview-${index}`),
    media_type: row.media_type === "video" ? "video" : "image",
    url,
    poster_url: typeof row.poster_url === "string" && row.poster_url ? row.poster_url : null,
    alt: typeof row.alt === "string" ? row.alt : "",
    label: typeof row.label === "string" && row.label ? row.label : null,
    is_primary: row.is_primary === true,
    sort_order: Number(row.sort_order ?? index) || 0,
  };
}

/**
 * Items already arrive sorted (primary first, then sort_order) — order is
 * preserved as-is. Any failure resolves to an empty list so callers can fall
 * back to the template's existing single preview.
 */
export async function fetchTemplatePreviewMedia(
  templateId: string,
): Promise<TemplatePreviewItem[]> {
  if (!templateId) return [];
  try {
    const { data, error } = await supabase.functions.invoke("template-preview-media", {
      body: { template_id: templateId },
    });
    if (error) throw error;
    const items = (data as { items?: unknown[] } | null)?.items;
    return (Array.isArray(items) ? items : [])
      .map((entry, index) => normalize(entry, index))
      .filter((entry): entry is TemplatePreviewItem => !!entry);
  } catch (err) {
    console.warn("template-preview-media unavailable:", err);
    return [];
  }
}
