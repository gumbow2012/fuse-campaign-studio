/** OpenAPI 3.1 document generated from the tool registry (Custom GPT Actions fallback). */
import { TOOLS } from "./tools.ts";
import { SCOPES } from "./auth.ts";

const ERROR_SCHEMA = {
  type: "object",
  properties: {
    error: {
      type: "object",
      properties: {
        code: { type: "string", enum: ["AUTH_REQUIRED", "INVALID_TOKEN", "FORBIDDEN_SCOPE", "FORBIDDEN", "NOT_FOUND", "TEMPLATE_NOT_FOUND", "TEMPLATE_LOCKED", "MISSING_INPUT", "INVALID_INPUT", "UNSUPPORTED_FILE_TYPE", "FILE_TOO_LARGE", "INSUFFICIENT_CREDITS", "CONFIRMATION_REQUIRED", "CONFIRMATION_EXPIRED", "CONFIRMATION_MISMATCH", "RATE_LIMITED", "GENERATION_FAILED", "NOT_SUPPORTED", "CONFLICT", "INTERNAL"] },
        message: { type: "string" },
        user_safe_message: { type: "string" },
        retryable: { type: "boolean" },
        next_action: { type: ["string", "null"] },
      },
      required: ["code", "message", "user_safe_message", "retryable"],
    },
  },
  required: ["error"],
};

export function buildOpenApi(origin: string, authServer: string) {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const t of TOOLS) {
    const method = t.rest.method.toLowerCase();
    const pathParams = [...t.rest.path.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
    const schema = t.inputSchema as any;
    const props = { ...(schema.properties ?? {}) } as Record<string, any>;
    const required = ((schema.required ?? []) as string[]).filter((r) => !pathParams.includes(r));
    for (const p of pathParams) delete props[p];
    const op: Record<string, unknown> = {
      operationId: t.rest.operationId,
      summary: t.rest.summary,
      description: t.description,
      tags: [t.scope ? "Account" : "Public"],
      parameters: [
        ...pathParams.map((p) => ({ name: p, in: "path", required: true, schema: { type: "string" }, description: (schema.properties?.[p]?.description) ?? p })),
        ...(method === "get"
          ? Object.entries(props).map(([name, s]) => ({ name, in: "query", required: required.includes(name), schema: s.type === "array" ? { type: "string", description: "comma separated" } : s, description: s.description ?? name }))
          : []),
      ],
      ...(method !== "get" && Object.keys(props).length
        ? { requestBody: { required: required.length > 0, content: { "application/json": { schema: { type: "object", properties: props, required, additionalProperties: false } } } } }
        : {}),
      responses: {
        "200": { description: "OK", content: { "application/json": { schema: { type: "object", additionalProperties: true } } } },
        "400": { description: "Invalid input / missing input / confirmation problem", content: { "application/json": { schema: ERROR_SCHEMA } } },
        "401": { description: "Connect your FUSE account (AUTH_REQUIRED / INVALID_TOKEN)", content: { "application/json": { schema: ERROR_SCHEMA } } },
        "402": { description: "INSUFFICIENT_CREDITS", content: { "application/json": { schema: ERROR_SCHEMA } } },
        "403": { description: "FORBIDDEN / FORBIDDEN_SCOPE", content: { "application/json": { schema: ERROR_SCHEMA } } },
        "404": { description: "NOT_FOUND", content: { "application/json": { schema: ERROR_SCHEMA } } },
        "429": { description: "RATE_LIMITED", content: { "application/json": { schema: ERROR_SCHEMA } } },
      },
      security: t.scope ? [{ bearerAuth: [] }, { oauth2: [] }] : [],
      "x-fuse-scope": t.scope,
      "x-fuse-mcp-tool": t.name,
    };
    paths[t.rest.path] = { ...(paths[t.rest.path] ?? {}), [method]: op };
  }
  return {
    openapi: "3.1.0",
    info: {
      title: "FUSE Campaign API",
      version: "1.0.0",
      description: "Search FUSE campaign templates, upload a product photo, prepare and run a campaign (with explicit confirmation), poll status, download outputs, edit clips and export a final video. Public read endpoints need no auth; account endpoints need a FUSE developer API key (Bearer fuse_live_…) or an OAuth token from the FUSE authorization server. Every run that consumes credits requires a confirmation_token from /api/runs/prepare and an idempotency_key.",
      termsOfService: "https://fuse-us.com/terms",
      contact: { name: "FUSE", url: "https://fuse-us.com" },
      "x-privacy-policy-url": "https://fuse-us.com/privacy",
    },
    servers: [{ url: origin }],
    tags: [{ name: "Public" }, { name: "Account" }],
    paths,
    components: {
      schemas: { Error: ERROR_SCHEMA },
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", description: "FUSE developer API key from https://fuse-us.com/account/developer (fuse_live_…)" },
        oauth2: {
          type: "oauth2",
          flows: {
            authorizationCode: {
              authorizationUrl: `${authServer}/oauth/authorize`,
              tokenUrl: `${authServer}/oauth/token`,
              scopes: Object.fromEntries(SCOPES.map((s) => [s, s])),
            },
          },
        },
      },
    },
  };
}
