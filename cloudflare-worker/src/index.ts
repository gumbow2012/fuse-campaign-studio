import { Env } from "./types";
import { handleSubmit } from "./routes/submit";
import { handleStatus } from "./routes/status";
import { handleRerun } from "./routes/rerun";
import { handleUpload, handleRunTemplate, handleJobStatus } from "./routes/papparazi";
import { handleWeavyTrigger } from "./routes/weavy-trigger";
import { handleUsage } from "./routes/usage";
import { handleEnqueue, handleProjectStatus } from "./routes/runner";
import { handlePresign, handleUploadPut, handleUploadMultipart } from "./routes/uploads";
import { serveAsset } from "./r2";
import { handleTestKling } from "./routes/test-kling";
import { handleNanoRun } from "./routes/nano";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Service-Call, X-Api-Key, X-User-Id",
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

      // ── New: Project status (replaces weavy-job-status) ──
      if (path.match(/^\/api\/projects\/[^/]+$/) && request.method === "GET") {
        const projectId = path.split("/")[3];
        response = await handleProjectStatus(request, env, projectId);

      // ── Direct multipart upload to R2 ──
      } else if (path === "/api/uploads" && request.method === "POST") {
        response = await handleUploadMultipart(request, env);

      // ── Presigned upload (step 1: get key + url) ──
      } else if (path === "/api/uploads/presign" && request.method === "POST") {
        response = await handlePresign(request, env);

      // ── Direct upload to R2 (step 2: PUT file) ──
      } else if (path.startsWith("/api/uploads/") && request.method === "PUT") {
        const key = decodeURIComponent(path.slice("/api/uploads/".length));
        response = await handleUploadPut(request, env, key);

      // ── New: Enqueue job for runner ──
      } else if (path === "/api/enqueue" && request.method === "POST") {
        response = await handleEnqueue(request, env);

      // ── Legacy job routes ──
      } else if (path === "/jobs/submit" && request.method === "POST") {
        response = await handleSubmit(request, env);
      } else if (path.match(/^\/jobs\/[^/]+\/status$/) && request.method === "GET") {
        const projectId = path.split("/")[2];
        response = await handleStatus(request, env, projectId);
      } else if (path === "/jobs/rerun-step" && request.method === "POST") {
        response = await handleRerun(request, env);

      // ── Papparazi / legacy pipeline ──
      } else if (path === "/api/upload" && request.method === "POST") {
        response = await handleUpload(request, env);
      } else if (path === "/api/run-template" && request.method === "POST") {
        response = await handleRunTemplate(request, env);
      } else if (path.match(/^\/api\/job\/[^/]+$/) && request.method === "GET") {
        const jobId = path.split("/")[3];
        response = await handleJobStatus(request, env, jobId);

      // ── Usage / dashboard stats ──
      } else if (path === "/api/usage" && request.method === "GET") {
        response = await handleUsage(request, env);

      // ── Weavy trigger (legacy) ──
      } else if (path === "/weavy/trigger" && request.method === "POST") {
        response = await handleWeavyTrigger(request, env);

      // ── R2 asset proxy ──
      } else if (path.startsWith("/assets/") && request.method === "GET") {
        const key = decodeURIComponent(path.slice("/assets/".length));
        response = await serveAsset(env, key);

      // ── Weavy flow proxy ──
      } else if (path.startsWith("/weavy/flow/") && request.method === "GET") {
        const flowPath = path.slice("/weavy".length);
        const target = `https://app.weavy.ai${flowPath}${url.search}`;
        const upstream = await fetch(target, {
          headers: { "User-Agent": request.headers.get("User-Agent") || "" },
          redirect: "follow",
        });
        const headers = new Headers(upstream.headers);
        headers.delete("x-frame-options");
        headers.delete("content-security-policy");
        headers.set("access-control-allow-origin", "*");
        response = new Response(upstream.body, {
          status: upstream.status,
          statusText: upstream.statusText,
          headers,
        });

      // ── Test Kling auth ──
      } else if (path === "/api/test-kling" && request.method === "GET") {
        response = await handleTestKling(request, env);

      // ── Nano Banana (Gemini image gen) ──
      } else if (path === "/api/nano/run" && request.method === "POST") {
        response = await handleNanoRun(request, env);

      // ── Debug: prove correct bundle is live ──
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
            "POST /api/upload (legacy)",
            "POST /api/run-template (legacy)",
            "GET  /api/job/:id (legacy)",
            "GET  /api/usage",
            "GET  /assets/:key",
            "GET  /health",
          ],
        });

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
