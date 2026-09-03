/**
 * Short-lived signed URL resolution for private `fuse-assets` media.
 *
 * The bucket is PRIVATE, so stored `/object/public/fuse-assets/...` URLs return
 * 400. Thumbnails must be resolved at render time through the owner-scoped
 * `sign-asset-urls` edge function. Signed URLs are ephemeral: they live in an
 * in-memory session cache only and are never persisted anywhere.
 */

import { supabase } from "@/integrations/supabase/client";

const TTL_FALLBACK_SECONDS = 3600;
/** Re-sign this long before the real expiry so images never 400 mid-view. */
const REFRESH_MARGIN_MS = 5 * 60 * 1000;
const MAX_PER_CALL = 200;

/** CDN hosts that are already publicly reachable — never sign these. */
const DIRECT_HOSTS = ["fal.media", "fal.run", "cdn.lovable", "googleusercontent.com"];

const FUSE_MARKERS = [
  "/object/public/fuse-assets/",
  "/object/sign/fuse-assets/",
  "/object/fuse-assets/",
];

const BARE_PREFIXES = [
  "fuse-assets/",
  "system/",
  "anon-temp/",
  "reference-archive/",
  "template-references/",
  "runs/",
  "run-inputs/",
  "uploads/",
  "inputs/",
  "outputs/",
  "assets/",
  "templates/",
  "template-inputs/",
  "template-assets/",
  "references/",
  "cast/",
  "brand/",
  "studio/",
  "previews/",
];

const UUID_PREFIX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\//i;

/** True when the reference points at the private fuse-assets bucket. */
export function needsSigning(ref: string | null | undefined): boolean {
  if (!ref || typeof ref !== "string") return false;
  const trimmed = ref.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("data:") || trimmed.startsWith("blob:")) return false;

  if (/^https?:\/\//i.test(trimmed)) {
    if (DIRECT_HOSTS.some((host) => trimmed.includes(host))) return false;
    return FUSE_MARKERS.some((marker) => trimmed.split("?")[0].includes(marker));
  }

  const normalized = trimmed.split("?")[0].replace(/^\/+/, "");
  return BARE_PREFIXES.some((prefix) => normalized.startsWith(prefix)) || UUID_PREFIX.test(normalized);
}

/**
 * Stable cache key: the object path inside the bucket when we can derive it,
 * otherwise the raw reference. Signed URLs are never used as keys.
 */
export function stableAssetKey(ref: string): string {
  const withoutQuery = ref.trim().split("?")[0];
  for (const marker of FUSE_MARKERS) {
    const index = withoutQuery.indexOf(marker);
    if (index !== -1) return withoutQuery.slice(index + marker.length);
  }
  return withoutQuery.replace(/^\/+/, "");
}

interface CacheEntry {
  url: string | null;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<void>>();
/** Sticky "not owned / not found" keys — never retried in a loop. */
const denied = new Set<string>();

function fresh(key: string): CacheEntry | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt - REFRESH_MARGIN_MS <= Date.now()) return null;
  return entry;
}

/** Cached signed URL for a reference, if one is still valid. */
export function getCachedSignedUrl(ref: string): string | null {
  const entry = fresh(stableAssetKey(ref));
  return entry?.url ?? null;
}

export function isDeniedAsset(ref: string): boolean {
  return denied.has(stableAssetKey(ref));
}

/** Drops the cached signature so the next resolve mints a new one. */
export function invalidateSignedUrl(ref: string): void {
  const key = stableAssetKey(ref);
  cache.delete(key);
  denied.delete(key);
}

async function requestSignatures(refs: string[]): Promise<void> {
  const { data, error } = await supabase.functions.invoke("sign-asset-urls", {
    body: { urls: refs },
  });
  if (error) throw error;

  const signed = (data?.signed ?? {}) as Record<string, string | null>;
  const ttl = Number(data?.ttl) > 0 ? Number(data.ttl) : TTL_FALLBACK_SECONDS;
  const expiresAt = Date.now() + ttl * 1000;

  for (const ref of refs) {
    const key = stableAssetKey(ref);
    const value = signed[ref] ?? signed[key] ?? null;
    if (value) {
      denied.delete(key);
      cache.set(key, { url: value, expiresAt });
    } else {
      denied.add(key);
      cache.set(key, { url: null, expiresAt });
    }
  }
}

/**
 * Batch-signs a page of references in as few calls as possible. Returns a map
 * from the ORIGINAL reference to a usable URL (or null when unavailable).
 *
 * References that don't need signing pass through untouched. If the signing
 * endpoint is unavailable we degrade to the original reference rather than
 * blanking the grid.
 */
export async function resolveAssetUrls(
  refs: (string | null | undefined)[],
  options: { force?: boolean } = {},
): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {};
  const pending: string[] = [];

  for (const raw of refs) {
    if (!raw) continue;
    const ref = raw.trim();
    if (!ref || ref in out) continue;
    if (!needsSigning(ref)) {
      out[ref] = ref;
      continue;
    }
    const key = stableAssetKey(ref);
    if (options.force) {
      cache.delete(key);
      denied.delete(key);
    }
    const hit = fresh(key);
    if (hit) {
      out[ref] = hit.url;
      continue;
    }
    pending.push(ref);
  }

  if (!pending.length) return out;

  const batches: string[][] = [];
  for (let index = 0; index < pending.length; index += MAX_PER_CALL) {
    batches.push(pending.slice(index, index + MAX_PER_CALL));
  }

  await Promise.all(
    batches.map(async (batch) => {
      const signature = batch.map(stableAssetKey).sort().join("|");
      let job = inflight.get(signature);
      if (!job) {
        job = requestSignatures(batch).finally(() => inflight.delete(signature));
        inflight.set(signature, job);
      }
      try {
        await job;
      } catch (error) {
        console.warn("sign-asset-urls unavailable:", error);
      }
    }),
  );

  for (const ref of pending) {
    const entry = cache.get(stableAssetKey(ref));
    // No entry at all = the signing call failed; fall back to the stored ref.
    out[ref] = entry ? entry.url : ref;
  }

  return out;
}
