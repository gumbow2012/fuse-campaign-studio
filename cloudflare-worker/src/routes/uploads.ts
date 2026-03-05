/**
 * POST /api/uploads/presign — Proxy-upload a file to R2.
 *
 * R2 doesn't support presigned PUT URLs natively from Workers bindings,
 * so we use a "proxy presign" approach:
 *   1. Frontend gets { key, upload_url } where upload_url points back to this Worker.
 *   2. Frontend PUTs the file to upload_url.
 *   3. Worker streams it into R2.
 *
 * Alternatively, for simplicity, we support direct upload:
 *   POST /api/uploads  (multipart body) → streams to R2, returns { key, url }.
 */

import { Env } from "../types";
import { verifyToken } from "../auth";

const WORKER_URL = "https://shiny-rice-e95bfuse-api.kade-fc1.workers.dev";

/**
 * POST /api/uploads/presign
 * Body: { filename, content_type }
 * Returns: { key, upload_url }
 *
 * The upload_url is PUT /api/uploads/:key on this same Worker.
 */
export async function handlePresign(request: Request, env: Env): Promise<Response> {
  const userId = await verifyToken(request, env);

  const body = await request.json() as { filename?: string; content_type?: string };
  if (!body.filename) {
    return Response.json({ error: "filename required" }, { status: 400 });
  }

  const ext = body.filename.split(".").pop() || "bin";
  const key = `uploads/${userId}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
  const uploadUrl = `${WORKER_URL}/api/uploads/${encodeURIComponent(key)}`;

  return Response.json({ key, upload_url: uploadUrl, content_type: body.content_type || "application/octet-stream" });
}

/**
 * PUT /api/uploads/:key
 * Streams the request body directly into R2.
 */
export async function handleUploadPut(request: Request, env: Env, key: string): Promise<Response> {
  await verifyToken(request, env);

  const contentType = request.headers.get("Content-Type") || "application/octet-stream";

  if (!request.body) {
    return Response.json({ error: "No body" }, { status: 400 });
  }

  await env.FUSE_ASSETS.put(key, request.body, {
    httpMetadata: { contentType },
  });

  const url = `${WORKER_URL}/assets/${encodeURIComponent(key)}`;

  return Response.json({ key, url });
}
