/**
 * POST /functions/v1/sync-weavy-loras
 *
 * Admin-only edge function that:
 *   1. Fetches all templates that have a weavy_recipe_id
 *   2. Downloads each Weavy workflow definition via the Weavy API
 *   3. Extracts LoRA fine-tune configs from workflow nodes
 *   4. Stores the LoRAs + raw workflow JSON back into the templates row
 *
 * Body (optional):
 *   { "templateId": "<uuid>" }  — sync a single template only
 *   {}                          — sync all templates
 *
 * Requires: WEAVY_API_KEY + WEAVY_API_BASE_URL Supabase secrets.
 */

import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// ---------------------------------------------------------------------------
// LoRA extraction — handles multiple Weavy workflow data shapes
// ---------------------------------------------------------------------------

interface LoraConfig {
  path: string;
  scale: number;
  trigger_word?: string;
  /** which template step this LoRA belongs to (e.g. "image_edit") */
  step_id?: string;
}

/**
 * Walk every node/step in a Weavy workflow definition and collect LoRA configs.
 * Weavy may return data in several shapes depending on the API version.
 */
function extractLoras(flowData: any): LoraConfig[] {
  const loras: LoraConfig[] = [];

  // Helper: pull LoRAs out of a single node object
  function extractFromNode(node: any, stepId?: string) {
    const candidates: any[] = [];

    // Shape A: node.loras = [ { path, scale, trigger_word } ]
    if (Array.isArray(node.loras)) candidates.push(...node.loras);

    // Shape B: node.config?.loras
    if (Array.isArray(node.config?.loras)) candidates.push(...node.config.loras);

    // Shape C: node.settings?.loras
    if (Array.isArray(node.settings?.loras)) candidates.push(...node.settings.loras);

    // Shape D: node.parameters?.loras
    if (Array.isArray(node.parameters?.loras))
      candidates.push(...node.parameters.loras);

    // Shape E: node.data?.loras (React-flow style nodes)
    if (Array.isArray(node.data?.loras)) candidates.push(...node.data.loras);

    // Shape F: node.inputs contains a lora_path / lora_url field
    if (Array.isArray(node.inputs)) {
      for (const inp of node.inputs) {
        const loraUrl = inp.lora_path || inp.lora_url || inp.loraPath || inp.loraUrl;
        if (typeof loraUrl === "string" && loraUrl.startsWith("http")) {
          candidates.push({ path: loraUrl, scale: inp.scale ?? 1.0 });
        }
      }
    }

    for (const c of candidates) {
      const path = c.path || c.url || c.lora_path || c.loraPath;
      if (typeof path === "string" && path.length > 0) {
        loras.push({
          path,
          scale: typeof c.scale === "number" ? c.scale : 1.0,
          ...(c.trigger_word ? { trigger_word: c.trigger_word } : {}),
          ...(c.triggerWord ? { trigger_word: c.triggerWord } : {}),
          ...(stepId ? { step_id: stepId } : {}),
        });
      }
    }
  }

  // Walk top-level nodes array
  if (Array.isArray(flowData.nodes)) {
    for (const node of flowData.nodes) {
      const stepId =
        node.step_id || node.stepId || node.id || node.name || undefined;
      extractFromNode(node, stepId);
    }
  }

  // Walk steps array (our own template format uses "steps")
  if (Array.isArray(flowData.steps)) {
    for (const step of flowData.steps) {
      extractFromNode(step, step.id);
    }
  }

  // Top-level loras (some Weavy recipes expose them directly)
  if (Array.isArray(flowData.loras)) {
    for (const c of flowData.loras) {
      const path = c.path || c.url || c.lora_path;
      if (typeof path === "string" && path.length > 0) {
        loras.push({
          path,
          scale: typeof c.scale === "number" ? c.scale : 1.0,
          ...(c.trigger_word || c.triggerWord
            ? { trigger_word: c.trigger_word || c.triggerWord }
            : {}),
        });
      }
    }
  }

  // Deduplicate by path
  const seen = new Set<string>();
  return loras.filter((l) => {
    if (seen.has(l.path)) return false;
    seen.add(l.path);
    return true;
  });
}

// ---------------------------------------------------------------------------
// Weavy API: try multiple endpoint patterns to fetch a flow definition
// ---------------------------------------------------------------------------

async function fetchWeavyFlow(
  base: string,
  apiKey: string,
  recipeId: string,
): Promise<{ data: any; endpoint: string } | null> {
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    Accept: "application/json",
  };

  const paths = [
    `/api/v1/flows/${recipeId}`,
    `/api/v1/recipes/${recipeId}`,
    `/api/v1/recipe-runs/recipes/${recipeId}`,
    `/api/v2/recipes/${recipeId}`,
    `/api/v1/workflows/${recipeId}`,
  ];

  for (const path of paths) {
    try {
      const res = await fetch(`${base}${path}`, { headers });
      if (res.ok) {
        const data = await res.json();
        return { data, endpoint: path };
      }
      // consume body to avoid leak
      await res.text().catch(() => {});
    } catch {
      // network error — try next
    }
  }

  // Fallback: list all recipes and find by ID
  const listPaths = [
    "/api/v1/recipes",
    "/api/v1/flows",
    "/api/v1/recipe-runs/recipes",
  ];
  for (const path of listPaths) {
    try {
      const res = await fetch(`${base}${path}`, { headers });
      if (res.ok) {
        const list = await res.json();
        const items: any[] = Array.isArray(list)
          ? list
          : list?.data ?? list?.recipes ?? list?.flows ?? list?.items ?? [];
        const match = items.find(
          (r: any) =>
            r.id === recipeId ||
            r.recipeId === recipeId ||
            r._id === recipeId ||
            r.flowId === recipeId,
        );
        if (match) return { data: match, endpoint: `${path} (list search)` };
      }
      await res.text().catch(() => {});
    } catch {
      /* skip */
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  try {
    // ── Auth: admin only ──────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing auth" }, 401);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await sb.auth.getUser(token);
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);

    const { data: roleData } = await sb
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleData) return json({ error: "Admin access required" }, 403);

    // ── Weavy credentials ─────────────────────────────────────────────────────
    const WEAVY_API_KEY = Deno.env.get("WEAVY_API_KEY");
    const WEAVY_BASE =
      Deno.env.get("WEAVY_API_BASE_URL") || "https://api.weavy.io";

    if (!WEAVY_API_KEY) {
      return json(
        { error: "WEAVY_API_KEY secret not configured. Set it in Supabase secrets." },
        500,
      );
    }

    // ── Determine which templates to sync ─────────────────────────────────────
    const body = req.method === "POST"
      ? await req.json().catch(() => ({}))
      : {};
    const singleId: string | undefined = body.templateId;

    let query = sb
      .from("templates")
      .select("id, name, weavy_recipe_id")
      .not("weavy_recipe_id", "is", null);

    if (singleId) query = query.eq("id", singleId) as typeof query;

    const { data: templates, error: tplErr } = await query;
    if (tplErr) return json({ error: tplErr.message }, 500);
    if (!templates?.length)
      return json({ message: "No templates with weavy_recipe_id found." });

    // ── Process each template ─────────────────────────────────────────────────
    const results: Array<{
      id: string;
      name: string;
      recipeId: string;
      endpoint: string | null;
      lorasFound: number;
      loras: LoraConfig[];
      error?: string;
    }> = [];

    for (const tpl of templates) {
      const recipeId = tpl.weavy_recipe_id as string;
      try {
        const result = await fetchWeavyFlow(WEAVY_BASE, WEAVY_API_KEY, recipeId);

        if (!result) {
          results.push({
            id: tpl.id,
            name: tpl.name,
            recipeId,
            endpoint: null,
            lorasFound: 0,
            loras: [],
            error: "Could not fetch workflow from any Weavy API endpoint",
          });
          continue;
        }

        const { data: flowData, endpoint } = result;
        const loras = extractLoras(flowData);

        // Store raw workflow JSON + extracted loras back in DB
        await sb
          .from("templates")
          .update({
            raw_json: flowData,
            loras,
            nodes_count: Array.isArray(flowData.nodes)
              ? flowData.nodes.length
              : Array.isArray(flowData.steps)
              ? flowData.steps.length
              : 0,
            edges_count: Array.isArray(flowData.edges)
              ? flowData.edges.length
              : 0,
            updated_at: new Date().toISOString(),
          })
          .eq("id", tpl.id);

        results.push({
          id: tpl.id,
          name: tpl.name,
          recipeId,
          endpoint,
          lorasFound: loras.length,
          loras,
        });
      } catch (e) {
        results.push({
          id: tpl.id,
          name: tpl.name,
          recipeId,
          endpoint: null,
          lorasFound: 0,
          loras: [],
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    const totalLoras = results.reduce((s, r) => s + r.lorasFound, 0);
    const errors = results.filter((r) => r.error);

    return json({
      success: true,
      synced: results.length,
      totalLorasExtracted: totalLoras,
      errors: errors.length,
      results,
    });
  } catch (err) {
    console.error("[sync-weavy-loras] fatal:", err);
    return json(
      { error: err instanceof Error ? err.message : String(err) },
      500,
    );
  }
});
