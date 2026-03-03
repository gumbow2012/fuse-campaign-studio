import { Env } from "./types";
import { handleSubmit } from "./routes/submit";
import { handleStatus } from "./routes/status";
import { handleRerun } from "./routes/rerun";
import { handleUpload, handleRunTemplate, handleJobStatus } from "./routes/papparazi";
import { handleWeavyTrigger } from "./routes/weavy-trigger";
import { serveAsset } from "./r2";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function corsResponse(response: Response): Response {
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
  async fetch(request: Request, env: Env): Promise<Response> {
    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      let response: Response;

      // ── Job routes ──
      if (path === "/jobs/submit" && request.method === "POST") {
        response = await handleSubmit(request, env);
      } else if (path.match(/^\/jobs\/[^/]+\/status$/) && request.method === "GET") {
        const projectId = path.split("/")[2];
        response = await handleStatus(request, env, projectId);
      } else if (path === "/jobs/rerun-step" && request.method === "POST") {
        response = await handleRerun(request, env);

      // ── Papparazi custom pipeline ──
      } else if (path === "/api/upload" && request.method === "POST") {
        response = await handleUpload(request, env);
      } else if (path === "/api/run-template" && request.method === "POST") {
        response = await handleRunTemplate(request, env);
      } else if (path.match(/^\/api\/job\/[^/]+$/) && request.method === "GET") {
        const jobId = path.split("/")[3];
        response = await handleJobStatus(request, env, jobId);

      // ── Weavy trigger (new dedicated route) ──
      } else if (path === "/weavy/trigger" && request.method === "POST") {
        response = await handleWeavyTrigger(request, env);

      // ── R2 asset proxy ──
      } else if (path.startsWith("/assets/") && request.method === "GET") {
        const key = decodeURIComponent(path.slice("/assets/".length));
        response = await serveAsset(env, key);

      // ── Health check ──
      } else if (path === "/health") {
        response = Response.json({ ok: true, timestamp: Date.now() });

      } else {
        response = Response.json({ error: "Not found" }, { status: 404 });
      }

      return corsResponse(response);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Internal error";
      const status = message.includes("Missing") || message.includes("Invalid") ? 401 : 500;
      return corsResponse(Response.json({ error: message }, { status }));
    }
  },
} satisfies ExportedHandler<Env>;
