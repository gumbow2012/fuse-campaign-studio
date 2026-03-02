import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  try {
    // Auth — admin only
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing auth" }, 401);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleData) return json({ error: "Admin access required" }, 403);

    const WEAVY_API_KEY = Deno.env.get("WEAVY_API_KEY");
    const WEAVY_BASE = Deno.env.get("WEAVY_API_BASE_URL");
    if (!WEAVY_API_KEY || !WEAVY_BASE) {
      return json({ error: "WEAVY_API_KEY / WEAVY_API_BASE_URL not configured" }, 500);
    }

    const { recipeId } = await req.json();
    if (!recipeId) return json({ error: "recipeId is required" }, 400);

    const headers = {
      Authorization: `Bearer ${WEAVY_API_KEY}`,
      Accept: "application/json",
    };

    // Try multiple known Weavy API path patterns to find the recipe
    const pathPatterns = [
      `/api/v1/recipes/${recipeId}`,
      `/api/v1/recipe-runs/recipes/${recipeId}`,
      `/api/v1/flows/${recipeId}`,
      `/api/v1/workflows/${recipeId}`,
      `/api/v2/recipes/${recipeId}`,
    ];

    let recipeData: any = null;
    let workingEndpoint: string | null = null;
    const tried: { endpoint: string; status: number }[] = [];

    for (const path of pathPatterns) {
      const url = `${WEAVY_BASE}${path}`;
      console.log(`Trying: ${url}`);
      try {
        const res = await fetch(url, { method: "GET", headers });
        tried.push({ endpoint: path, status: res.status });
        if (res.ok) {
          recipeData = await res.json();
          workingEndpoint = path;
          break;
        } else {
          await res.text(); // consume body
        }
      } catch (e) {
        tried.push({ endpoint: path, status: 0 });
      }
    }

    if (!recipeData) {
      // Also try listing all recipes and finding by ID
      const listPaths = [`/api/v1/recipes`, `/api/v1/recipe-runs/recipes`];
      for (const path of listPaths) {
        const url = `${WEAVY_BASE}${path}`;
        console.log(`Trying list: ${url}`);
        try {
          const res = await fetch(url, { method: "GET", headers });
          tried.push({ endpoint: path, status: res.status });
          if (res.ok) {
            const list = await res.json();
            const items = Array.isArray(list) ? list : list?.data || list?.recipes || list?.items || [];
            const match = items.find((r: any) =>
              r.id === recipeId || r.recipeId === recipeId || r._id === recipeId
            );
            if (match) {
              recipeData = match;
              workingEndpoint = `${path} (from list)`;
              break;
            }
          } else {
            await res.text();
          }
        } catch (e) {
          tried.push({ endpoint: path, status: 0 });
        }
      }
    }

    if (!recipeData) {
      return json({
        error: "Could not find recipe via any known Weavy API endpoint",
        recipeId,
        tried,
        hint: "The recipe ID may be wrong, or the Weavy API base URL may be incorrect. Check your Weavy dashboard.",
      }, 404);
    }

    // Extract input schema from the recipe metadata
    const inputSchema = extractInputSchema(recipeData);

    return json({
      success: true,
      recipeId,
      workingEndpoint,
      inputSchema,
      rawRecipe: recipeData,
      tried,
    });
  } catch (err) {
    console.error("Error:", err);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

/**
 * Extract a normalized input_schema array from various Weavy recipe data shapes.
 */
function extractInputSchema(recipe: any): Array<{
  key: string;
  label: string;
  nodeId: string;
  type: string;
  required: boolean;
}> {
  const inputs: any[] = [];

  // Shape 1: recipe.inputs array
  if (Array.isArray(recipe.inputs)) {
    for (const inp of recipe.inputs) {
      inputs.push(normalizeInput(inp));
    }
  }

  // Shape 2: recipe.nodes with input-type nodes
  if (Array.isArray(recipe.nodes)) {
    for (const node of recipe.nodes) {
      if (
        node.type === "input" ||
        node.type === "file_input" ||
        node.type === "image_input" ||
        node.category === "input"
      ) {
        inputs.push({
          key: node.id || node.nodeId || `node_${inputs.length}`,
          label: node.label || node.name || node.title || node.id || "Input",
          nodeId: node.id || node.nodeId || "",
          type: inferType(node),
          required: node.required !== false,
        });
      }
    }
  }

  // Shape 3: recipe.inputNodes
  if (Array.isArray(recipe.inputNodes)) {
    for (const node of recipe.inputNodes) {
      inputs.push({
        key: node.nodeId || node.id || `input_${inputs.length}`,
        label: node.label || node.name || "Input",
        nodeId: node.nodeId || node.id || "",
        type: inferType(node),
        required: node.required !== false,
      });
    }
  }

  // Shape 4: recipe.parameters
  if (Array.isArray(recipe.parameters)) {
    for (const p of recipe.parameters) {
      inputs.push({
        key: p.name || p.key || `param_${inputs.length}`,
        label: p.label || p.name || "Parameter",
        nodeId: p.nodeId || "",
        type: p.type === "file" || p.type === "image" ? "image" : p.type || "text",
        required: p.required !== false,
      });
    }
  }

  // Deduplicate by key
  const seen = new Set<string>();
  return inputs.filter((i) => {
    if (seen.has(i.key)) return false;
    seen.add(i.key);
    return true;
  });
}

function normalizeInput(inp: any) {
  return {
    key: inp.key || inp.name || inp.nodeId || inp.id || `input_${Math.random().toString(36).slice(2, 6)}`,
    label: inp.label || inp.name || inp.key || "Input",
    nodeId: inp.nodeId || inp.id || "",
    type: inferType(inp),
    required: inp.required !== false,
  };
}

function inferType(node: any): string {
  const t = (node.type || node.inputType || node.fieldType || "").toLowerCase();
  if (t.includes("image") || t.includes("file") || t.includes("upload")) return "image";
  if (t.includes("video")) return "video";
  if (t.includes("text") || t.includes("string")) return "text";
  if (t.includes("number") || t.includes("int") || t.includes("float")) return "number";
  return "image"; // default to image for workflow tools
}
