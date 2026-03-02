import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ParsedRecipe {
  recipeId: string;
  recipeVersion: number;
  inputs: Array<{
    key: string;
    label: string;
    nodeId: string;
    type: string;
    required: boolean;
  }>;
  baseUrl: string;
}

function extractInputs(parsedBody: any): ParsedRecipe["inputs"] {
  const inputs: ParsedRecipe["inputs"] = [];
  if (!Array.isArray(parsedBody.inputs)) return inputs;

  parsedBody.inputs.forEach((input: any, i: number) => {
    const nodeId = input.nodeId || `unknown_node_${i}`;
    const fieldName = input.fieldName || "image";
    const fileName = input.file?.name || input.fileName || `input_${i + 1}`;
    const key = fileName
      .replace(/\.[^.]+$/, "")
      .replace(/[^a-zA-Z0-9]/g, "_")
      .toLowerCase();

    inputs.push({
      key: key || `input_${i + 1}`,
      label:
        fieldName.charAt(0).toUpperCase() +
        fieldName.slice(1) +
        ` (${fileName})`,
      nodeId,
      type: fieldName === "image" ? "image" : fieldName,
      required: true,
    });
  });
  return inputs;
}

function parseHar(harContent: any): ParsedRecipe[] {
  const recipes = new Map<string, ParsedRecipe>();

  const entries = harContent?.log?.entries;
  if (!Array.isArray(entries)) return [];

  for (const entry of entries) {
    const req = entry.request;
    if (!req) continue;

    const url = req.url || "";

    // Strategy 1: POST requests to .../run
    if (req.method === "POST") {
      const recipeMatch = url.match(
        /\/recipe-runs\/recipes\/([a-zA-Z0-9_-]+)\/run/
      );
      if (recipeMatch) {
        const recipeId = recipeMatch[1];
        if (!recipes.has(recipeId)) {
          const baseUrlMatch = url.match(/(https?:\/\/[^/]+)/);
          const baseUrl = baseUrlMatch ? baseUrlMatch[1] : "";
          let body: any = {};
          const postData = req.postData;
          if (postData?.text) {
            try { body = JSON.parse(postData.text); } catch { /* skip */ }
          }
          const recipeVersion = body.recipeVersion || 1;
          const inputs = extractInputs(body);
          recipes.set(recipeId, { recipeId, recipeVersion, inputs, baseUrl });
        }
        continue;
      }
    }

    // Strategy 2: GET status-polling requests like /recipe-runs/recipes/{id}/runs/status
    const statusMatch = url.match(
      /\/recipe-runs\/recipes\/([a-zA-Z0-9_-]+)\/runs\/status/
    );
    if (statusMatch) {
      const recipeId = statusMatch[1];
      if (!recipes.has(recipeId)) {
        const baseUrlMatch = url.match(/(https?:\/\/[^/]+)/);
        const baseUrl = baseUrlMatch ? baseUrlMatch[1] : "";
        recipes.set(recipeId, { recipeId, recipeVersion: 1, inputs: [], baseUrl });
      }
      continue;
    }

    // Strategy 3: X-App-Recipeid header on any api.weavy.ai request
    if (url.includes("weavy.ai") || url.includes("weavy")) {
      const headers = req.headers || [];
      const recipeHeader = headers.find(
        (h: any) => h.name.toLowerCase() === "x-app-recipeid"
      );
      if (recipeHeader?.value && !recipes.has(recipeHeader.value)) {
        const baseUrlMatch = url.match(/(https?:\/\/[^/]+)/);
        const baseUrl = baseUrlMatch ? baseUrlMatch[1] : "";
        recipes.set(recipeHeader.value, {
          recipeId: recipeHeader.value,
          recipeVersion: 1,
          inputs: [],
          baseUrl,
        });
      }
    }
  }

  return Array.from(recipes.values());
}

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );

  try {
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader)
      return new Response(JSON.stringify({ error: "Missing auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);
    if (authError || !user)
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    // Admin check
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData)
      return new Response(
        JSON.stringify({ error: "Admin access required" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );

    const { harContent } = await req.json();
    if (!harContent) {
      return new Response(
        JSON.stringify({ error: "No HAR content provided" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    let har: any;
    if (typeof harContent === "string") {
      try {
        har = JSON.parse(harContent);
      } catch {
        return new Response(
          JSON.stringify({ error: "Invalid HAR JSON" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    } else {
      har = harContent;
    }

    const recipes = parseHar(har);

    if (recipes.length === 0) {
      return new Response(
        JSON.stringify({
          error: "No Weavy recipe-run requests found in this HAR file.",
          hint: "Make sure you ran your flows before exporting the HAR. We look for POST requests to .../recipe-runs/recipes/.../run",
          totalEntries: har?.log?.entries?.length || 0,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        recipes,
        count: recipes.length,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("Error:", err);
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : String(err),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
