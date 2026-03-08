/**
 * GET /api/templates        — list all active templates from Supabase
 * GET /api/templates/:key   — serve a template JSON file from R2 (e.g. garage_template.json)
 */

import { Env } from "../types";
import { getTemplates } from "../supabase";

export async function handleListTemplates(_request: Request, env: Env): Promise<Response> {
  try {
    const templates = await getTemplates(env);
    return Response.json(templates);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("handleListTemplates error:", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}

export async function handleTemplateDetail(
  _request: Request,
  env: Env,
  key: string,
): Promise<Response> {
  // key is the R2 object key, e.g. "garage_template.json"
  // Normalise: if caller passed a raw name, build the key
  const normalised = key.endsWith(".json") ? key : key.toLowerCase().replace(/\s+/g, "_") + "_template.json";

  try {
    const obj = await env.FUSE_TEMPLATES?.get(normalised);
    if (!obj) {
      return Response.json({ error: `Template not found: ${normalised}` }, { status: 404 });
    }
    const text = await obj.text();
    return new Response(text, {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 500 });
  }
}
