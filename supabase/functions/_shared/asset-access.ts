/**
 * Asset access hardening: mint short-lived signed URLs for objects living in
 * the private-capable `fuse-assets` bucket.
 *
 * Signed URLs are DISPLAY/ACCESS tokens only — never persist them as canonical
 * values. Stored values (assets.supabase_storage_url) stay canonical.
 *
 * Fully backward compatible: signed URLs work while the bucket is still public,
 * and any failure falls back to the original reference (never throws).
 */

const FUSE_BUCKET = "fuse-assets";

const URL_MARKERS = [
  `/storage/v1/object/public/${FUSE_BUCKET}/`,
  `/storage/v1/object/sign/${FUSE_BUCKET}/`,
  `/storage/v1/object/${FUSE_BUCKET}/`,
];

/** Known top-level object prefixes used inside the fuse-assets bucket. */
const BARE_PATH_PREFIXES = [
  `${FUSE_BUCKET}/`,
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

/** Returns the object path inside fuse-assets, or null when not a fuse-assets ref. */
export function extractFuseAssetPath(ref: string | null): string | null {
  if (!ref || typeof ref !== "string") return null;
  const trimmed = ref.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("data:") || trimmed.startsWith("blob:")) return null;

  const withoutQuery = trimmed.split("?")[0];

  if (/^https?:\/\//i.test(trimmed)) {
    for (const marker of URL_MARKERS) {
      const index = withoutQuery.indexOf(marker);
      if (index === -1) continue;
      const path = withoutQuery.slice(index + marker.length);
      return path ? decodeURIComponent(path) : null;
    }
    return null;
  }

  if (trimmed.includes("http")) return null;

  if (withoutQuery.startsWith(`${FUSE_BUCKET}:`)) {
    const path = withoutQuery.slice(FUSE_BUCKET.length + 1).replace(/^\/+/, "");
    return path || null;
  }

  const normalized = withoutQuery.replace(/^\/+/, "");
  const known = BARE_PATH_PREFIXES.some((prefix) => normalized.startsWith(prefix)) ||
    UUID_PREFIX.test(normalized);
  if (!known) return null;
  return normalized.startsWith(`${FUSE_BUCKET}/`)
    ? normalized.slice(FUSE_BUCKET.length + 1)
    : normalized;
}

async function sign(admin: any, ref: string | null, ttlSeconds: number): Promise<string | null> {
  if (!ref || typeof ref !== "string") return ref;
  try {
    const path = extractFuseAssetPath(ref);
    if (!path) return ref;
    const { data, error } = await admin.storage.from(FUSE_BUCKET).createSignedUrl(path, ttlSeconds);
    if (error || !data?.signedUrl) return ref;
    return data.signedUrl as string;
  } catch {
    return ref;
  }
}

/** Short-lived URL for browser display. */
export function resolveDisplayUrl(
  admin: any,
  ref: string | null,
  ttlSeconds = 3600,
): Promise<string | null> {
  return sign(admin, ref, ttlSeconds);
}

/** Long-lived URL (6h) for provider payloads — covers slow provider queues. */
export function resolveExecutionUrl(
  admin: any,
  ref: string | null,
  ttlSeconds = 21600,
): Promise<string | null> {
  return sign(admin, ref, ttlSeconds);
}

export const resolveDisplayUrls = (
  admin: any,
  refs: (string | null)[],
  ttl?: number,
): Promise<(string | null)[]> =>
  Promise.all((refs ?? []).map((ref) => resolveDisplayUrl(admin, ref, ttl)));

export const resolveExecutionUrls = (
  admin: any,
  refs: (string | null)[],
  ttl?: number,
): Promise<(string | null)[]> =>
  Promise.all((refs ?? []).map((ref) => resolveExecutionUrl(admin, ref, ttl)));

export { FUSE_BUCKET };

/**
 * Deep response signer: walks a browser-bound payload and replaces every
 * fuse-assets reference with a short-lived signed URL. Anything else (external
 * provider URLs, fuse-public URLs, data URLs, plain text) is left untouched.
 * Never throws — on failure the original value survives.
 */
export async function signDeepDisplayUrls<T>(
  admin: any,
  value: T,
  ttlSeconds = 3600,
  cache = new Map<string, string>(),
  depth = 0,
): Promise<T> {
  if (depth > 8 || value == null) return value;

  if (typeof value === "string") {
    if (!extractFuseAssetPath(value)) return value;
    const cached = cache.get(value);
    if (cached) return cached as unknown as T;
    const signed = (await resolveDisplayUrl(admin, value, ttlSeconds)) as string;
    if (signed && signed !== value) cache.set(value, signed);
    return signed as unknown as T;
  }

  if (Array.isArray(value)) {
    return (await Promise.all(
      value.map((entry) => signDeepDisplayUrls(admin, entry, ttlSeconds, cache, depth + 1)),
    )) as unknown as T;
  }

  if (typeof value === "object") {
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(source)) {
      out[key] = await signDeepDisplayUrls(admin, entry, ttlSeconds, cache, depth + 1);
    }
    return out as unknown as T;
  }

  return value;
}
