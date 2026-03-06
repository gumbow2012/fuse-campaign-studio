import { Env } from "./types";

/**
 * Upload a file to R2 and return its key.
 * Key format: projects/{projectId}/{filename}
 */
export async function uploadToR2(
  env: Env,
  projectId: string,
  filename: string,
  body: ReadableStream | ArrayBuffer | string,
  contentType?: string,
): Promise<string> {
  const key = `projects/${projectId}/${filename}`;
  await env.FUSE_ASSETS.put(key, body, {
    httpMetadata: contentType ? { contentType } : undefined,
  });
  return key;
}

/**
 * Generate a signed URL for an R2 object (valid for 1 hour).
 * Note: R2 presigned URLs require the S3-compatible API.
 * For simplicity, this returns a worker-proxied URL.
 */
export function getAssetUrl(workerUrl: string, key: string): string {
  return `${workerUrl}/assets/${encodeURIComponent(key)}`;
}

/**
 * Serve an R2 object by key (used by the /assets/:key route).
 */
export async function serveAsset(env: Env, key: string): Promise<Response> {
  const object = await env.FUSE_ASSETS.get(key);

  if (!object) {
    return new Response("Not found", { status: 404 });
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Cache-Control", "public, max-age=3600");

  return new Response(object.body, { headers });
}
