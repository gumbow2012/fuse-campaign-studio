import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * `fuse-assets` is a private bucket: stored URLs are canonical (and are what the server signs for
 * providers), but a browser can only show a short-lived signed URL. Never persist the signed value.
 */
const BUCKET = "fuse-assets";
const MARKER = `/storage/v1/object/public/${BUCKET}/`;
const TTL_SECONDS = 3600;

const cache = new Map<string, { url: string; expires: number }>();

function storagePath(url: string): string | null {
  const at = url.indexOf(MARKER);
  return at < 0 ? null : decodeURIComponent(url.slice(at + MARKER.length).split("?")[0]);
}

export async function signedDisplayUrl(url: string): Promise<string> {
  const path = storagePath(url);
  if (!path) return url;
  const hit = cache.get(url);
  if (hit && hit.expires > Date.now()) return hit.url;
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, TTL_SECONDS);
  const signed = data?.signedUrl ?? url;
  cache.set(url, { url: signed, expires: Date.now() + (TTL_SECONDS - 300) * 1000 });
  return signed;
}

/** "" until a private URL is signed; other URLs pass straight through. */
export function useSignedUrl(url: string): string {
  const [signed, setSigned] = useState(() => (url && !storagePath(url) ? url : ""));
  useEffect(() => {
    let off = false;
    if (!url) setSigned("");
    else void signedDisplayUrl(url).then((s) => !off && setSigned(s));
    return () => {
      off = true;
    };
  }, [url]);
  return signed;
}
