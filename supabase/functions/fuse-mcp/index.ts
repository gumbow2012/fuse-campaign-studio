// FUSE MCP + public API. One edge function, several surfaces:
//   /mcp                                   MCP (Streamable HTTP, stateless JSON; GET → 405)
//   /api/*                                 REST for Custom GPT Actions / developers
//   /openapi.json                          OpenAPI 3.1 for the REST surface
//   /.well-known/oauth-protected-resource  RFC 9728 → Supabase Auth OAuth 2.1 server
//   /health                                liveness
//   POST (legacy) {action: create_key|list_keys|revoke_key}  → /account/developer key management
// verify_jwt is OFF: this function does its own auth (see auth.ts). It never uses runner/service bypasses for user actions.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { adminClient, ANONYMOUS, resolveAuth, type AuthContext } from "./auth.ts";
import { asFuseError, FuseError } from "./errors.ts";
import { callTool, handleRpc, PROTOCOL_VERSIONS } from "./mcp.ts";
import { TOOLS, type ToolContext } from "./tools.ts";
import { buildOpenApi } from "./openapi.ts";
import { sha256Hex } from "./confirm.ts";
import { SCOPES } from "./auth.ts";

const PUBLIC_ORIGIN = Deno.env.get("FUSE_PUBLIC_ORIGIN") ?? "https://fuse-us.com";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const AUTH_SERVER = `${SUPABASE_URL}/auth/v1`;
const ALLOWED_ORIGINS = [
  PUBLIC_ORIGIN,
  "https://chatgpt.com",
  "https://chat.openai.com",
  "https://claude.ai",
  "https://platform.openai.com",
  "https://id-preview--f8513825-94a6-4c8d-ae1f-b88e22a49b58.lovable.app",
  "http://localhost:8080",
  "http://localhost:3000",
  "http://localhost:5173",
  "http://127.0.0.1:6274",
];

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, mcp-protocol-version, mcp-session-id, x-fuse-client",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Expose-Headers": "mcp-protocol-version, www-authenticate",
};
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json", ...headers } });

/** Path inside the function. The edge runtime strips `/functions/v1`, so the pathname is `/fuse-mcp/…` (or `/fuse-mcp-staging/…`). */
function routePath(url: URL): { path: string; staging: boolean } {
  const m = url.pathname.match(/^(?:\/functions\/v1)?\/(fuse-mcp(?:-staging)?)(\/.*)?$/);
  const staging = m?.[1] === "fuse-mcp-staging";
  let path = m ? (m[2] ?? "/") : url.pathname;
  if (path === "") path = "/";
  return { path: path.replace(/\/+$/, "") || "/", staging };
}

function originAllowed(req: Request): boolean {
  const origin = req.headers.get("Origin");
  if (!origin) return true; // non-browser clients (ChatGPT/Claude servers, curl) send no Origin
  return ALLOWED_ORIGINS.includes(origin) || /^https:\/\/([a-z0-9-]+\.)*(fuse-us\.com|lovable\.app|openai\.com|chatgpt\.com|claude\.ai|anthropic\.com)$/i.test(origin);
}

function clientOf(req: Request): string {
  const explicit = req.headers.get("x-fuse-client");
  if (explicit) return explicit.slice(0, 32);
  const ua = (req.headers.get("user-agent") ?? "").toLowerCase();
  if (ua.includes("openai") || ua.includes("chatgpt")) return "chatgpt";
  if (ua.includes("claude") || ua.includes("anthropic")) return "claude";
  if (ua.includes("cursor")) return "cursor";
  if (ua.includes("mcp-inspector") || ua.includes("node")) return "mcp-client";
  return "api";
}

function unauthorized(resourceMetadataUrl: string, fe: FuseError, scope?: string) {
  return json({ error: fe.toJSON() }, 401, {
    "WWW-Authenticate": `Bearer resource_metadata="${resourceMetadataUrl}"${scope ? `, scope="${scope}"` : ""}, error="invalid_token", error_description="${fe.userMessage.replace(/"/g, "'")}"`,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const url = new URL(req.url);
  const { path, staging } = routePath(url);
  const publicOrigin = staging ? `${SUPABASE_URL}/functions/v1/fuse-mcp-staging` : PUBLIC_ORIGIN;
  const resourceMetadataUrl = `${publicOrigin}/.well-known/oauth-protected-resource`;

  if (!originAllowed(req)) return json({ error: { code: "FORBIDDEN", message: "Origin not allowed", user_safe_message: "This origin can't call FUSE.", retryable: false } }, 403);

  const admin = adminClient();
  const client = clientOf(req);
  const log = (auth: AuthContext, surface: string) => (entry: any) => {
    admin.from("mcp_tool_calls").insert({
      tool: entry.tool, surface, client, auth_kind: auth.kind, user_id: auth.userId, api_key_id: auth.apiKeyId,
      template_slug: entry.template_slug ?? null, run_id: entry.run_id ?? null, credits: entry.credits ?? null,
      ok: entry.ok, error_code: entry.error_code ?? null, latency_ms: entry.latency_ms, idempotency_key: entry.idempotency_key ?? null,
    }).then(() => {}, () => {});
    if (auth.apiKeyId) admin.from("api_key_usage").insert({ api_key_id: auth.apiKeyId, tool: entry.tool, status: entry.ok ? 200 : 400 }).then(() => {}, () => {});
  };

  // ---------- discovery / docs ----------
  if (path === "/health" && req.method === "GET") {
    return json({ ok: true, service: "fuse-mcp", environment: staging ? "staging" : "production", tools: TOOLS.length, protocol_versions: PROTOCOL_VERSIONS });
  }
  if (path === "/.well-known/oauth-protected-resource" || path === "/.well-known/oauth-protected-resource/mcp") {
    return json({
      resource: `${publicOrigin}/mcp`,
      authorization_servers: [AUTH_SERVER],
      scopes_supported: [...SCOPES],
      bearer_methods_supported: ["header"],
      resource_name: "FUSE Campaign Studio",
      resource_documentation: `${PUBLIC_ORIGIN}/docs/mcp`,
    }, 200, { "Cache-Control": "public, max-age=300" });
  }
  if (path === "/openapi.json" && req.method === "GET") {
    return json(buildOpenApi(publicOrigin, AUTH_SERVER), 200, { "Cache-Control": "public, max-age=300" });
  }

  // ---------- auth (shared by every surface) ----------
  let auth: AuthContext = ANONYMOUS;
  try {
    auth = await resolveAuth(req, admin);
  } catch (error) {
    const fe = asFuseError(error);
    if (fe.code === "INVALID_TOKEN" || fe.code === "AUTH_REQUIRED") return unauthorized(resourceMetadataUrl, fe);
    return json({ error: fe.toJSON() }, fe.status);
  }
  const ctx: ToolContext = { admin, auth, resourceMetadataUrl, client };

  // ---------- MCP ----------
  if (path === "/mcp") {
    if (req.method === "GET") return new Response(null, { status: 405, headers: { ...CORS, Allow: "POST, OPTIONS" } });
    if (req.method === "DELETE") return new Response(null, { status: 405, headers: { ...CORS, Allow: "POST, OPTIONS" } });
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    const version = req.headers.get("mcp-protocol-version");
    if (version && !PROTOCOL_VERSIONS.includes(version)) return json({ error: `Unsupported MCP-Protocol-Version ${version}` }, 400);
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400);
    }
    const messages = Array.isArray(body) ? body : [body];
    const responses = [];
    for (const m of messages) {
      if (!m || typeof m !== "object" || (m as any).jsonrpc !== "2.0") {
        responses.push({ jsonrpc: "2.0", id: (m as any)?.id ?? null, error: { code: -32600, message: "Invalid Request" } });
        continue;
      }
      const r = await handleRpc(m as any, ctx, log(auth, "mcp"));
      if (r) responses.push(r);
    }
    if (!responses.length) return new Response(null, { status: 202, headers: CORS });
    const headers = { "MCP-Protocol-Version": version ?? PROTOCOL_VERSIONS[0] };
    return json(Array.isArray(body) ? responses : responses[0], 200, headers);
  }

  // ---------- REST (OpenAPI / Custom GPT Actions) ----------
  if (path.startsWith("/api/")) {
    const match = TOOLS.map((t) => {
      const pattern = new RegExp("^" + t.rest.path.replace(/\{(\w+)\}/g, "(?<$1>[^/]+)") + "$");
      const m = path.match(pattern);
      return m && t.rest.method === req.method ? { tool: t, params: m.groups ?? {} } : null;
    }).find(Boolean);
    if (!match) return json({ error: { code: "NOT_FOUND", message: `No route ${req.method} ${path}`, user_safe_message: "Unknown endpoint.", retryable: false, next_action: `See ${publicOrigin}/openapi.json` } }, 404);
    let args: Record<string, unknown> = { ...match.params };
    if (req.method === "GET") {
      for (const [k, v] of url.searchParams) args[k] = v.includes(",") && (match.tool.inputSchema as any).properties?.[k]?.type === "array" ? v.split(",") : v;
      if (args.max_results) args.max_results = Number(args.max_results);
      if (args.limit) args.limit = Number(args.limit);
    } else {
      const b = await req.json().catch(() => ({}));
      args = { ...args, ...(b && typeof b === "object" ? b : {}) };
    }
    // Path params win over body (run_id in the URL is authoritative). `{slug}` maps to template_slug.
    for (const [k, v] of Object.entries(match.params)) args[k === "slug" ? "template_slug" : k] = v;
    try {
      const { result } = await callTool(match.tool.name, args, ctx, log(auth, "rest"));
      return json(result, 200);
    } catch (error) {
      const fe = asFuseError(error);
      if (fe.code === "AUTH_REQUIRED" || fe.code === "INVALID_TOKEN") return unauthorized(resourceMetadataUrl, fe, match.tool.scope ?? undefined);
      return json({ error: fe.toJSON() }, fe.status);
    }
  }

  // ---------- legacy v1 API-key management (used by /account/developer) ----------
  if (path === "/" && req.method === "POST") {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const action = String(body.action ?? "");
    if (auth.kind === "anonymous") return unauthorized(resourceMetadataUrl, new FuseError("AUTH_REQUIRED"));
    if (auth.kind === "api_key") {
      // v1 action API compatibility for the old stdio bridge.
      const map: Record<string, string> = { discovery: "fuse_search_templates", "templates.list": "fuse_search_templates", "template.get": "fuse_get_campaign_template", "job.status": "fuse_get_run_status", "runs.get": "fuse_get_run_status" };
      const toolName = map[action];
      if (!toolName) return json({ error: "unknown_tool", tools: Object.keys(map), note: "Use the MCP endpoint /mcp or the REST API /api/* instead." }, 400);
      try {
        const legacyArgs = action === "template.get" ? { template_id: body.template_id ?? body.id } : action.startsWith("job") || action === "runs.get" ? { run_id: body.job_id ?? body.id } : { query: "" };
        const { result } = await callTool(toolName, legacyArgs as any, ctx, log(auth, "legacy"));
        return json(result, 200);
      } catch (error) {
        const fe = asFuseError(error);
        return json({ error: fe.toJSON() }, fe.status);
      }
    }
    const userId = auth.userId!;
    if (action === "create_key") {
      const name = String(body.name ?? "").trim().slice(0, 60) || "Untitled key";
      const requested = Array.isArray(body.scopes) ? body.scopes.map(String) : [];
      const scopes = requested.length ? requested : ["fuse.templates.read", "fuse.pricing.read", "fuse.runs.read", "fuse.outputs.read", "fuse.account.read"];
      const bytes = new Uint8Array(24);
      crypto.getRandomValues(bytes);
      const raw = "fuse_live_" + btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      const { data, error } = await admin.from("api_keys").insert({ user_id: userId, name, scopes, key_prefix: raw.slice(0, 18), key_hash: await sha256Hex(raw) }).select("id,name,scopes,key_prefix,created_at").single();
      if (error) return json({ error: error.message }, 400);
      return json({ ...data, key: raw, note: "Store this key now — it is shown only once." });
    }
    if (action === "list_keys") {
      const { data } = await admin.from("api_keys").select("id,name,scopes,key_prefix,last_used_at,revoked_at,created_at").eq("user_id", userId).order("created_at", { ascending: false });
      return json({ keys: data ?? [] });
    }
    if (action === "revoke_key") {
      const { error } = await admin.from("api_keys").update({ revoked_at: new Date().toISOString() }).eq("id", String(body.id ?? "")).eq("user_id", userId);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }
    return json({ error: "unknown_management_action", actions: ["create_key", "list_keys", "revoke_key"], mcp: `${publicOrigin}/mcp`, openapi: `${publicOrigin}/openapi.json` }, 400);
  }

  if (path === "/" && req.method === "GET") {
    return json({ service: "fuse-mcp", environment: staging ? "staging" : "production", mcp: `${publicOrigin}/mcp`, openapi: `${publicOrigin}/openapi.json`, resource_metadata: resourceMetadataUrl, docs: `${PUBLIC_ORIGIN}/docs/mcp` });
  }
  return json({ error: { code: "NOT_FOUND", message: `No route ${req.method} ${path}`, user_safe_message: "Unknown endpoint.", retryable: false } }, 404);
});
