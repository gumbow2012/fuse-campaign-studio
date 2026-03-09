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
  // key may be a raw name like "GARAGE" or a full R2 key like "garage_guy_template.json"
  const normalised = key.endsWith(".json")
    ? key
    : key.toLowerCase().replace(/[()]/g, "").replace(/\s+/g, "_").replace(/_+/g, "_") + "_template.json";
  const baseName = normalised.replace(/_template\.json$/, "");

  try {
    // Exact match first
    let obj = await env.FUSE_TEMPLATES?.get(normalised);

    // Fuzzy match: "garage" → finds "garage_guy_template.json"
    if (!obj && env.FUSE_TEMPLATES) {
      const list = await env.FUSE_TEMPLATES.list();
      const match = list.objects.find((o) => {
        const base = o.key.replace(/_template\.json$/, "");
        return base.startsWith(baseName + "_") || baseName.startsWith(base + "_") || base === baseName;
      });
      if (match) obj = await env.FUSE_TEMPLATES.get(match.key);
    }

    if (!obj) {
      return Response.json({ error: `Template not found: ${key}` }, { status: 404 });
    }
    const text = await obj.text();
    return new Response(text, { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 500 });
  }
}
