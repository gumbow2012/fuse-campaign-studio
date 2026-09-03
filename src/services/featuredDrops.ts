/**
 * Exclusive Creator Collabs — reads the public `featured-drops` endpoint.
 *
 * `preview_url` values are SHORT-LIVED SIGNED urls (≈1h): fetched on page load
 * and never persisted anywhere.
 */

import { supabase } from "@/integrations/supabase/client";

export interface FeaturedDropTemplate {
  id: string;
  name: string;
  description: string;
  media_type: "image" | "video";
  preview_url: string | null;
}

export interface FeaturedDropCreator {
  name: string;
  avatar_url: string | null;
  blurb: string;
  starts_at: string | null;
  ends_at: string | null;
}

export interface FeaturedDrop {
  creator: FeaturedDropCreator;
  templates: FeaturedDropTemplate[];
}

function normalizeTemplate(raw: unknown, index: number): FeaturedDropTemplate | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const id = String(row.id ?? "").trim();
  const name = String(row.name ?? "").trim();
  if (!id && !name) return null;
  return {
    id: id || `featured-${index}`,
    name,
    description: typeof row.description === "string" ? row.description : "",
    media_type: row.media_type === "video" ? "video" : "image",
    preview_url:
      typeof row.preview_url === "string" && row.preview_url ? row.preview_url : null,
  };
}

/** Returns null when there is no active featured drop (section hides entirely). */
export async function fetchFeaturedDrop(): Promise<FeaturedDrop | null> {
  try {
    const { data, error } = await supabase.functions.invoke("featured-drops", {
      method: "GET",
    });
    if (error) throw error;
    const featured = (data as { featured?: unknown } | null)?.featured;
    if (!featured || typeof featured !== "object") return null;

    const row = featured as Record<string, unknown>;
    const creatorRaw = (row.creator ?? {}) as Record<string, unknown>;
    const creatorName = String(creatorRaw.name ?? "").trim();
    const templates = (Array.isArray(row.templates) ? row.templates : [])
      .map((entry, index) => normalizeTemplate(entry, index))
      .filter((entry): entry is FeaturedDropTemplate => !!entry);

    if (!creatorName || !templates.length) return null;

    return {
      creator: {
        name: creatorName,
        avatar_url:
          typeof creatorRaw.avatar_url === "string" && creatorRaw.avatar_url
            ? creatorRaw.avatar_url
            : null,
        blurb: typeof creatorRaw.blurb === "string" ? creatorRaw.blurb : "",
        starts_at: typeof creatorRaw.starts_at === "string" ? creatorRaw.starts_at : null,
        ends_at: typeof creatorRaw.ends_at === "string" ? creatorRaw.ends_at : null,
      },
      templates,
    };
  } catch (err) {
    console.warn("featured-drops unavailable:", err);
    return null;
  }
}
