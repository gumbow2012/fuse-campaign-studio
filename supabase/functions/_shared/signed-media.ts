/**
 * Stage A of asset isolation: short-lived signed-URL delivery for private
 * customer media stored in the `fuse-assets` bucket.
 *
 * Signing happens at response-assembly time only — stored DB values
 * (assets.supabase_storage_url) remain canonical. Defensive by design: any
 * failure falls back to the original URL so nothing breaks while the bucket
 * is still public.
 */

const BUCKET = "fuse-assets";

const URL_MARKERS = [
  `/storage/v1/object/public/${BUCKET}/`,
  `/storage/v1/object/sign/${BUCKET}/`,
  `/storage/v1/object/${BUCKET}/`,
];

/** Known top-level object prefixes used inside the fuse-assets bucket. */
const BARE_PATH_PREFIXES = [
  `${BUCKET}/`,
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

function extractObjectPath(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("data:") || trimmed.startsWith("blob:")) return null;

  const withoutQuery = trimmed.split("?")[0];

  const isHttp = /^https?:\/\//i.test(trimmed);
  if (isHttp) {
    for (const marker of URL_MARKERS) {
      const index = withoutQuery.indexOf(marker);
      if (index === -1) continue;
      const path = withoutQuery.slice(index + marker.length);
      return path ? decodeURIComponent(path) : null;
    }
    return null;
  }

  if (trimmed.includes("http")) return null;

  const normalized = withoutQuery.replace(/^\/+/, "");
  if (!BARE_PATH_PREFIXES.some((prefix) => normalized.startsWith(prefix))) return null;
  return normalized.startsWith(`${BUCKET}/`) ? normalized.slice(BUCKET.length + 1) : normalized;
}

export async function signFuseAssetUrl(
  admin: any,
  input: string | null,
  ttlSeconds = 3600,
): Promise<string | null> {
  if (!input || typeof input !== "string") return input;
  try {
    const path = extractObjectPath(input);
    if (!path) return input;
    const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(path, ttlSeconds);
    if (error || !data?.signedUrl) return input;
    return data.signedUrl as string;
  } catch {
    return input;
  }
}

export async function signFuseAssetUrls(
  admin: any,
  inputs: (string | null)[],
  ttlSeconds = 3600,
): Promise<(string | null)[]> {
  return await Promise.all((inputs ?? []).map((input) => signFuseAssetUrl(admin, input, ttlSeconds)));
}
