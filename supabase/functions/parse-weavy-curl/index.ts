import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

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

function parseCurl(curlString: string): ParsedRecipe | null {
  // Extract URL from cURL
  const urlMatch = curlString.match(
    /(?:curl\s+)?['"]?(https?:\/\/[^\s'"]+)['"]?/i
  );
  if (!urlMatch) return null;

  const url = urlMatch[1];

  // Extract recipe ID from URL pattern: /recipes/{recipeId}/run
  const recipeMatch = url.match(
    /\/recipe-runs\/recipes\/([a-zA-Z0-9_-]+)\/run/
  );
  if (!recipeMatch) return null;

  const recipeId = recipeMatch[1];

  // Extract base URL
  const baseUrlMatch = url.match(/(https?:\/\/[^/]+)/);
  const baseUrl = baseUrlMatch ? baseUrlMatch[1] : "";

  // Extract request body - handle both -d and --data variants
  let body = "";
  const dataMatch = curlString.match(
    /(?:--data-raw|--data|-d)\s+['"](.+?)['"]\s*(?:\\?\n|$|--)/s
  );
  if (dataMatch) {
    body = dataMatch[1];
  } else {
    // Try to find JSON body with $' syntax
    const dollarMatch = curlString.match(
      /(?:--data-raw|--data|-d)\s+\$'(.+?)'/s
    );
    if (dollarMatch) {
      body = dollarMatch[1].replace(/\\'/g, "'");
    }
  }

  let parsed: any = {};
  try {
    // Clean up escaped characters
    const cleaned = body
      .replace(/\\n/g, "")
      .replace(/\\\\/g, "\\")
      .replace(/\\"/g, '"');
    parsed = JSON.parse(cleaned);
  } catch {
    // Try raw JSON extraction as fallback
    const jsonMatch = curlString.match(/\{[\s\S]*"recipeVersion"[\s\S]*\}/);
    if (jsonMatch) {
      try {
        parsed = JSON.parse(jsonMatch[0]);
      } catch {
        return null;
      }
    }
  }

  const recipeVersion = parsed.recipeVersion || 1;

  // Extract inputs: each has nodeId, fieldName, and file info
  const inputs: ParsedRecipe["inputs"] = [];
  if (Array.isArray(parsed.inputs)) {
    parsed.inputs.forEach((input: any, i: number) => {
      const nodeId = input.nodeId || `unknown_node_${i}`;
      const fieldName = input.fieldName || "image";
      const fileName =
        input.file?.name || input.fileName || `input_${i + 1}`;

      // Generate a readable key from the filename
      const key = fileName
        .replace(/\.[^.]+$/, "") // remove extension
        .replace(/[^a-zA-Z0-9]/g, "_") // replace special chars
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
  }

  return { recipeId, recipeVersion, inputs, baseUrl };
}

function parseRawJson(jsonString: string): ParsedRecipe | null {
  try {
    const parsed = JSON.parse(jsonString);
    const recipeVersion = parsed.recipeVersion || 1;

    const inputs: ParsedRecipe["inputs"] = [];
    if (Array.isArray(parsed.inputs)) {
      parsed.inputs.forEach((input: any, i: number) => {
        const nodeId = input.nodeId || `unknown_node_${i}`;
        const fieldName = input.fieldName || "image";
        const fileName =
          input.file?.name || input.fileName || `input_${i + 1}`;
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
    }

    // We don't have recipeId from the body alone, user needs to provide it
    return {
      recipeId: parsed.recipeId || "",
      recipeVersion,
      inputs,
      baseUrl: "",
    };
  } catch {
    return null;
  }
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

    const { rawInput } = await req.json();
    if (!rawInput) {
      return new Response(
        JSON.stringify({ error: "No input provided" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const trimmed = rawInput.trim();

    // Detect if it's a cURL command or raw JSON
    let result: ParsedRecipe | null = null;
    if (
      trimmed.startsWith("curl") ||
      trimmed.includes("--data") ||
      trimmed.includes("-d ")
    ) {
      result = parseCurl(trimmed);
    } else if (trimmed.startsWith("{")) {
      result = parseRawJson(trimmed);
    } else {
      // Try as cURL anyway
      result = parseCurl(trimmed);
    }

    if (!result) {
      return new Response(
        JSON.stringify({
          error:
            "Could not parse input. Paste either a cURL command or the JSON request body from the Weavy run request.",
          hint: "In Chrome DevTools → Network tab, find the POST to /recipe-runs/recipes/.../run, right-click → Copy as cURL",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(JSON.stringify({ success: true, parsed: result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
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
