import { supabase } from "@/integrations/supabase/client";

/**
 * iPhone clips are usually HEVC/H.265, which most browsers cannot decode: the
 * <video> element reports 0×0 and every extracted frame is solid black. The
 * `normalize-video` function transcodes those files to H.264 and hands back a
 * playable URL. These helpers are the client half of that flow.
 */

export type NormalizationStatus = "probing" | "converting" | "ready" | "failed";

export type NormalizationRow = {
  source_path?: string | null;
  status?: NormalizationStatus | null;
  needs_normalization?: boolean | null;
  width?: number | null;
  height?: number | null;
  normalized_path?: string | null;
  playback_url?: string | null;
  error?: string | null;
};

const BUCKET = "fuse-assets";

/**
 * The storage OBJECT PATH inside fuse-assets — never a signed URL. Accepts a
 * bare path, a signed URL or a public URL.
 */
export function storagePathFromUrl(value: string | null | undefined): string | null {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith("blob:") || trimmed.startsWith("data:")) return null;

  for (const marker of [
    `/object/sign/${BUCKET}/`,
    `/object/public/${BUCKET}/`,
    `/object/${BUCKET}/`,
  ]) {
    const index = trimmed.indexOf(marker);
    if (index === -1) continue;
    const path = trimmed.slice(index + marker.length).split("?")[0];
    return path ? decodeURIComponent(path) : null;
  }

  if (/^https?:\/\//i.test(trimmed)) return null;
  const bare = trimmed.replace(/^\/+/, "").split("?")[0];
  return bare.startsWith(`${BUCKET}/`) ? bare.slice(BUCKET.length + 1) : bare || null;
}

/** Kick (or poll) normalization for one source object path. */
export async function requestNormalization(
  sourcePath: string,
  retry = false,
): Promise<NormalizationRow> {
  const { data, error } = await supabase.functions.invoke("normalize-video", {
    body: retry ? { sourcePath, retry: true } : { sourcePath },
  });
  if (error) throw new Error(error.message ?? "Could not prepare that video");
  const row = (data ?? {}) as NormalizationRow & { error?: string };
  return row;
}

export const NORMALIZE_POLL_MS = 2500;
