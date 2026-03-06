import type { Env } from "../auth";
import { verifyToken } from "../auth";

const WORKER_URL = "https://shiny-rice-e95bfuse-api.kade-fc1.workers.dev";

export async function handlePresign(request: Request, env: Env) {
  const userId = await verifyToken(request, env);
  const body = await request.json<any>();

  if (!body.filename) {
    return Response.json({ error: "filename required" }, { status: 400 });
  }

  const ext = body.filename.split(".").pop() || "bin";
  const key = `uploads/${userId}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
  const uploadUrl = `${WORKER_URL}/api/uploads/${encodeURIComponent(key)}`;

  return Response.json({
    key,
    upload_url: uploadUrl,
    content_type: body.content_type || "application/octet-stream",
  });
}

export async function handleUploadPut(request: Request, env: Env, key: string) {
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

export async function handleUploadMultipart(request: Request, env: Env) {
  const userId = await verifyToken(request, env);

  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return Response.json({ error: "No 'file' field in form data" }, { status: 400 });
  }

  const ext = file.name.split(".").pop() || "bin";
  const key = `uploads/${userId}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;

  await env.FUSE_ASSETS.put(key, file.stream(), {
    httpMetadata: { contentType: file.type || "application/octet-stream" },
  });

  const url = `${WORKER_URL}/assets/${encodeURIComponent(key)}`;

  return Response.json({
    ok: true,
    marker: "UPLOAD_ROUTE_WORKING",
    key,
    url,
    assetKey: key,
    assetUrl: url,
  });
}
