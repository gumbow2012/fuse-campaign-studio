/**
 * Stage A of asset isolation: short-lived signed-URL delivery for private
 * customer media stored in the `fuse-assets` bucket.
 *
 * The canonical implementation now lives in ./asset-access.ts — this module
 * keeps the original names/signatures so existing callers keep working.
 */

export {
  extractFuseAssetPath,
  resolveDisplayUrl,
  resolveDisplayUrls,
  resolveExecutionUrl,
  resolveExecutionUrls,
} from "./asset-access.ts";

import { resolveDisplayUrl } from "./asset-access.ts";

export function signFuseAssetUrl(
  admin: any,
  input: string | null,
  ttlSeconds = 3600,
): Promise<string | null> {
  return resolveDisplayUrl(admin, input, ttlSeconds);
}

export async function signFuseAssetUrls(
  admin: any,
  inputs: (string | null)[],
  ttlSeconds = 3600,
): Promise<(string | null)[]> {
  return await Promise.all((inputs ?? []).map((input) => signFuseAssetUrl(admin, input, ttlSeconds)));
}
