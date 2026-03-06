import type { Env } from "./auth";
import { handleEnqueue, handleProjectStatus } from "./routes/runner";
import { handlePresign, handleUploadMultipart, handleUploadPut } from "./routes/uploads";
import { serveAsset } from "./r2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Service-Call, X-Api-Key, X-User-Id",
};

function corsResponse(response: Response) {
  const newHeaders = new Headers(response.headers);
  for (const [k, v] of Object.entries(CORS_HEADERS)) {
    newHeaders.set(k, v);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      let response: Response;

      if (path.match(/^\/api\/projects\/[^/]+$/) && request.method === "GET") {
        const projectId = path.split("/")[3];
        response = await handleProjectStatus(request, env, projectId);
      } else if (path === "/api/uploads" && request.method === "POST") {
        response = await handleUploadMultipart(request, env);
      } else if (path === "/api/uploads/presign" && request.method === "POST") {
        response = await handlePresign(request, env);
      } else if (path.startsWith("/api/uploads/") && request.method === "PUT") {
        const key = decodeURIComponent(path.slice("/api/uploads/".length));
        response = await handleUploadPut(request, env, key);
      } else if (path === "/api/enqueue" && request.method === "POST") {
        response = await handleEnqueue(request, env, ctx);
      } else if (path.startsWith("/assets/") && request.method === "GET") {
        const key = decodeURIComponent(path.slice("/assets/".length));
        response = await serveAsset(env, key);
      } else if (path === "/debug-upload-check" || path === "/debug-routes") {
        response = Response.json({
          ok: true,
          marker: "DEBUG_UPLOAD_CHECK_LIVE",
          path,
          time: new Date().toISOString(),
          routes: [
            "POST /api/uploads",
            "POST /api/uploads/presign",
            "PUT  /api/uploads/:key",
            "POST /api/enqueue",
            "GET  /api/projects/:id",
            "GET  /assets/:key",
            "GET  /health",
          ],
        });
      } else if (path === "/health") {
        response = Response.json({ ok: true, timestamp: Date.now() });
      } else {
        response = Response.json({ error: "Not found" }, { status: 404 });
      }

      return corsResponse(response);
    } catch (err: any) {
      const message = err instanceof Error ? err.message : "Internal error";
      const status =
        message.includes("Missing") || message.includes("invalid") || message.includes("required")
          ? 401
          : 500;

      return corsResponse(Response.json({ error: message }, { status }));
    }
  },
};
