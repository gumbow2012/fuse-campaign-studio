/**
 * MCP JSON-RPC over Streamable HTTP (stateless JSON responses; no SSE, no sessions).
 * Implements initialize / ping / tools / prompts / resources. Errors from tools
 * become `isError` tool results with the model-readable error object.
 */
import { asFuseError, FuseError } from "./errors.ts";
import { TOOL_BY_NAME, TOOLS, type ToolContext } from "./tools.ts";
import { PROMPTS } from "./prompts.ts";
import { WIDGET_CSP, WIDGETS } from "./widgets/index.ts";
import { getPricingSummary } from "./core/pricing.ts";
import { getTemplateDetail, listPublicTemplates } from "./core/templates.ts";
import { getCampaignHistory, getRunStatus } from "./core/runs.ts";
import { getHelp } from "./core/help.ts";

export const PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];
export const SERVER_INFO = { name: "fuse", title: "FUSE Campaign Studio", version: "2.0.0" };

type Rpc = { jsonrpc: "2.0"; id?: string | number | null; method?: string; params?: any; result?: unknown; error?: unknown };

const rpcError = (id: Rpc["id"], code: number, message: string, data?: unknown): Rpc => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message, ...(data !== undefined ? { data } : {}) } });
const rpcResult = (id: Rpc["id"], result: unknown): Rpc => ({ jsonrpc: "2.0", id: id ?? null, result });

function toolDescriptor(t: (typeof TOOLS)[number], resourceMetadataUrl: string) {
  const securitySchemes = t.scope ? [{ type: "oauth2", scopes: [t.scope] }] : [{ type: "noauth" }];
  return {
    name: t.name,
    title: t.title,
    description: t.description,
    inputSchema: t.inputSchema,
    annotations: { title: t.title, ...t.annotations },
    securitySchemes,
    _meta: {
      ...(t.widget
        ? {
          ui: { resourceUri: t.widget },
          "openai/outputTemplate": t.widget,
          "openai/toolInvocation/invoking": `${t.title}…`,
          "openai/toolInvocation/invoked": `${t.title} done`,
          "openai/widgetAccessible": true,
        }
        : {}),
      "openai/securitySchemes": securitySchemes,
      "fuse/scope": t.scope,
      "fuse/resource_metadata": resourceMetadataUrl,
    },
  };
}

function resourceList(ctx: ToolContext) {
  const base = [
    { uri: "fuse://templates", name: "FUSE campaign templates", description: "Public template catalog (summaries).", mimeType: "application/json" },
    { uri: "fuse://pricing", name: "FUSE pricing", description: "Plans in campaigns per month.", mimeType: "application/json" },
    { uri: "fuse://docs/getting-started", name: "Getting started", description: "How to use FUSE.", mimeType: "text/markdown" },
    { uri: "fuse://docs/credits", name: "How credits work", description: "Plans, credits, refunds for failed outputs.", mimeType: "text/markdown" },
  ];
  const user = ctx.auth.userId ? [{ uri: "fuse://user/campaigns", name: "My campaigns", description: "Your recent runs.", mimeType: "application/json" }] : [];
  const widgets = Object.entries(WIDGETS).map(([uri, w]) => ({
    uri,
    name: w.name,
    description: w.description,
    mimeType: "text/html;profile=mcp-app",
    _meta: { ui: { prefersBorder: true, csp: WIDGET_CSP }, "openai/widgetPrefersBorder": true, "openai/widgetCSP": { connect_domains: WIDGET_CSP.connectDomains, resource_domains: WIDGET_CSP.resourceDomains } },
  }));
  return [...base, ...user, ...widgets];
}

async function readResource(uri: string, ctx: ToolContext) {
  const widget = WIDGETS[uri];
  if (widget) {
    return { contents: [{ uri, mimeType: "text/html;profile=mcp-app", text: widget.html, _meta: { ui: { prefersBorder: true, csp: WIDGET_CSP }, "openai/widgetPrefersBorder": true, "openai/widgetCSP": { connect_domains: WIDGET_CSP.connectDomains, resource_domains: WIDGET_CSP.resourceDomains } } }] };
  }
  const json = (data: unknown) => ({ contents: [{ uri, mimeType: "application/json", text: JSON.stringify(data, null, 2) }] });
  const md = (text: string) => ({ contents: [{ uri, mimeType: "text/markdown", text }] });
  if (uri === "fuse://templates") return json({ templates: await listPublicTemplates(ctx.admin, ctx.auth.isPrivileged) });
  const tm = uri.match(/^fuse:\/\/templates\/([a-z0-9-]+)$/i);
  if (tm) return json({ template: await getTemplateDetail(ctx.admin, { slug: tm[1] }, ctx.auth.isPrivileged) });
  if (uri === "fuse://pricing") return json(await getPricingSummary(ctx.admin, null));
  if (uri === "fuse://docs/getting-started") return md(["# Getting started with FUSE", "", getHelp("what is a campaign").answer, "", getHelp("how to run a template").answer, "", getHelp("what do i upload").answer].join("\n"));
  if (uri === "fuse://docs/credits") return md(["# How credits work", "", getHelp("how credits work").answer, "", getHelp("what if generation fails").answer].join("\n"));
  if (uri === "fuse://user/campaigns") {
    if (!ctx.auth.userId) throw new FuseError("AUTH_REQUIRED");
    return json(await getCampaignHistory(ctx.admin, ctx.auth, { limit: 20 }));
  }
  const rm = uri.match(/^fuse:\/\/runs\/([0-9a-f-]{36})$/i);
  if (rm) {
    if (!ctx.auth.userId) throw new FuseError("AUTH_REQUIRED");
    return json(await getRunStatus(ctx.admin, ctx.auth, rm[1]));
  }
  throw new FuseError("NOT_FOUND", `Unknown resource ${uri}`);
}

export type CallLog = (entry: { tool: string; ok: boolean; error_code?: string; latency_ms: number; template_slug?: string; run_id?: string; credits?: number; idempotency_key?: string }) => void;

export async function callTool(name: string, args: Record<string, unknown>, ctx: ToolContext, log: CallLog) {
  const tool = TOOL_BY_NAME.get(name);
  if (!tool) throw new FuseError("NOT_FOUND", `Unknown tool ${name}`, { nextAction: `Available: ${TOOLS.map((t) => t.name).join(", ")}` });
  const started = Date.now();
  const safeArgs = args && typeof args === "object" ? args : {};
  try {
    const result = await tool.handler(safeArgs as Record<string, any>, ctx);
    log({
      tool: name,
      ok: true,
      latency_ms: Date.now() - started,
      template_slug: String((safeArgs as any).template_slug ?? (result as any)?.template_slug ?? (result as any)?.template?.slug ?? "") || undefined,
      run_id: String((safeArgs as any).run_id ?? (result as any)?.run_id ?? "") || undefined,
      credits: typeof (result as any)?.estimated_credits === "number" ? (result as any).estimated_credits : typeof (result as any)?.credits_reserved === "number" ? (result as any).credits_reserved : undefined,
      idempotency_key: String((safeArgs as any).idempotency_key ?? "") || undefined,
    });
    return { result, tool };
  } catch (error) {
    const fe = asFuseError(error);
    log({ tool: name, ok: false, error_code: fe.code, latency_ms: Date.now() - started, template_slug: String((safeArgs as any).template_slug ?? "") || undefined, run_id: String((safeArgs as any).run_id ?? "") || undefined });
    throw fe;
  }
}

export async function handleRpc(message: Rpc, ctx: ToolContext, log: CallLog): Promise<Rpc | null> {
  const { id, method, params } = message;
  if (!method) return null; // a response from the client — nothing to do
  const isNotification = id === undefined;
  try {
    switch (method) {
      case "initialize": {
        const requested = String(params?.protocolVersion ?? "");
        const negotiated = PROTOCOL_VERSIONS.includes(requested) ? requested : PROTOCOL_VERSIONS[0];
        return rpcResult(id, {
          protocolVersion: negotiated,
          capabilities: { tools: { listChanged: false }, prompts: { listChanged: false }, resources: { subscribe: false, listChanged: false } },
          serverInfo: SERVER_INFO,
          instructions: "FUSE turns a product photo into a campaign: search templates (public), then upload → attach → start → poll status → outputs. When the user asks for a campaign, you may start the run directly with fuse_start_campaign_run (template_slug + attached inputs). Runs charge credits from the user's balance and start immediately. You may optionally call fuse_prepare_campaign_run first to show cost. Speak in campaigns, images and clips. FUSE can also generate standalone images and videos from a prompt in chat via fuse_generate_image and fuse_generate_video — these charge credits and start immediately; poll fuse_get_generation_status.",
        });
      }
      case "ping":
        return rpcResult(id, {});
      case "notifications/initialized":
      case "notifications/cancelled":
      case "notifications/roots/list_changed":
        return null;
      case "tools/list":
        return rpcResult(id, { tools: TOOLS.map((t) => toolDescriptor(t, ctx.resourceMetadataUrl)) });
      case "tools/call": {
        const name = String(params?.name ?? "");
        try {
          const { result, tool } = await callTool(name, params?.arguments ?? {}, ctx, log);
          const text = tool.summarize ? tool.summarize(result) : JSON.stringify(result);
          return rpcResult(id, { content: [{ type: "text", text }], structuredContent: result, isError: false });
        } catch (error) {
          const fe = asFuseError(error);
          const meta: Record<string, unknown> = {};
          if (fe.code === "AUTH_REQUIRED" || fe.code === "INVALID_TOKEN") {
            meta["mcp/www_authenticate"] = `Bearer resource_metadata="${ctx.resourceMetadataUrl}", error="invalid_token", error_description="${fe.userMessage}"`;
          }
          return rpcResult(id, { content: [{ type: "text", text: `${fe.userMessage}${fe.nextAction ? ` ${fe.nextAction}` : ""}` }], structuredContent: { error: fe.toJSON() }, isError: true, _meta: meta });
        }
      }
      case "prompts/list":
        return rpcResult(id, { prompts: PROMPTS.map((p) => ({ name: p.name, title: p.title, description: p.description, arguments: p.arguments })) });
      case "prompts/get": {
        const p = PROMPTS.find((x) => x.name === params?.name);
        if (!p) return rpcError(id, -32602, `Unknown prompt ${params?.name}`);
        return rpcResult(id, { description: p.description, messages: [{ role: "user", content: { type: "text", text: p.render(params?.arguments ?? {}) } }] });
      }
      case "resources/list":
        return rpcResult(id, { resources: resourceList(ctx) });
      case "resources/templates/list":
        return rpcResult(id, { resourceTemplates: [
          { uriTemplate: "fuse://templates/{slug}", name: "Template detail", mimeType: "application/json" },
          { uriTemplate: "fuse://runs/{run_id}", name: "Run status (own runs)", mimeType: "application/json" },
        ] });
      case "resources/read": {
        try {
          return rpcResult(id, await readResource(String(params?.uri ?? ""), ctx));
        } catch (error) {
          const fe = asFuseError(error);
          return rpcError(id, fe.code === "NOT_FOUND" ? -32002 : -32603, fe.userMessage, fe.toJSON());
        }
      }
      case "completion/complete":
        return rpcResult(id, { completion: { values: [], hasMore: false } });
      case "logging/setLevel":
        return rpcResult(id, {});
      default:
        return isNotification ? null : rpcError(id, -32601, `Method not found: ${method}`);
    }
  } catch (error) {
    const fe = asFuseError(error);
    return isNotification ? null : rpcError(id, -32603, fe.userMessage, fe.toJSON());
  }
}
