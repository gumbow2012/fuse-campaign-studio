import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const WEAVY_API_KEY = Deno.env.get("WEAVY_API_KEY");
    const WEAVY_API_BASE_URL = Deno.env.get("WEAVY_API_BASE_URL");

    if (!WEAVY_API_KEY || !WEAVY_API_BASE_URL) {
      return new Response(
        JSON.stringify({ error: "Weavy API credentials not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate admin role
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check admin
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { flowUrl, recipeId: providedRecipeId } = await req.json();

    const headers = {
      Authorization: `Bearer ${WEAVY_API_KEY}`,
      "Content-Type": "application/json",
    };

    const results: Record<string, unknown> = {
      flowUrl,
      discoveredEndpoints: [],
      recipe: null,
      error: null,
    };

    // Strategy 1: If recipeId is provided directly, try to fetch its details
    let recipeId = providedRecipeId;

    // Strategy 2: Try to extract recipe ID from flow URL
    if (!recipeId && flowUrl) {
      // Common URL patterns: /canvas/<id>, /flow/<id>, /recipe/<id>
      const urlPatterns = [
        /\/canvas\/([a-zA-Z0-9_-]+)/,
        /\/flow\/([a-zA-Z0-9_-]+)/,
        /\/recipe\/([a-zA-Z0-9_-]+)/,
        /\/recipes\/([a-zA-Z0-9_-]+)/,
      ];

      for (const pattern of urlPatterns) {
        const match = flowUrl.match(pattern);
        if (match) {
          recipeId = match[1];
          break;
        }
      }
    }

    // Try multiple API endpoints to discover recipe metadata
    const endpointsToTry = [
      // Try recipe details
      ...(recipeId
        ? [
            `/api/v1/recipes/${recipeId}`,
            `/api/v1/recipe-runs/recipes/${recipeId}`,
            `/api/v1/flows/${recipeId}`,
            `/api/v1/workflows/${recipeId}`,
          ]
        : []),
      // Try listing endpoints
      `/api/v1/recipes`,
      `/api/v1/recipe-runs/recipes`,
      `/api/v1/flows`,
      `/api/v1/workflows`,
    ];

    for (const endpoint of endpointsToTry) {
      try {
        const url = `${WEAVY_API_BASE_URL}${endpoint}`;
        console.log(`Trying: ${url}`);

        const res = await fetch(url, { method: "GET", headers });
        const status = res.status;

        if (status === 200) {
          const data = await res.json();
          (results.discoveredEndpoints as unknown[]).push({
            endpoint,
            status,
            data,
          });

          // If this looks like recipe data, store it
          if (data && (data.recipeId || data.id || data.inputs || data.nodes)) {
            results.recipe = data;
          }
        } else {
          const text = await res.text().catch(() => "");
          (results.discoveredEndpoints as unknown[]).push({
            endpoint,
            status,
            body: text.slice(0, 500),
          });
        }
      } catch (e) {
        (results.discoveredEndpoints as unknown[]).push({
          endpoint,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    // If we got a flow URL, also try to fetch the page itself to extract metadata
    if (flowUrl) {
      try {
        const pageRes = await fetch(flowUrl, {
          headers: {
            Cookie: `token=${WEAVY_API_KEY}`,
            Authorization: `Bearer ${WEAVY_API_KEY}`,
          },
        });
        const html = await pageRes.text();

        // Try to extract JSON config from the page
        const jsonMatches = html.match(
          /(?:window\.__NEXT_DATA__|__NUXT__|window\.__CONFIG__|"recipeId"|"recipe_id").*?({[^}]+})/gs
        );
        if (jsonMatches) {
          results.pageExtracted = jsonMatches.map((m) => m.slice(0, 1000));
        }

        // Extract any recipe IDs from the page
        const recipeIdMatches = html.match(
          /["'](?:recipeId|recipe_id|recipe-id)["']\s*[:=]\s*["']([^"']+)["']/g
        );
        if (recipeIdMatches) {
          results.pageRecipeIds = recipeIdMatches;
        }

        // Try to find input/node definitions
        const nodeMatches = html.match(
          /["'](?:nodeId|node_id)["']\s*[:=]\s*["']([^"']+)["']/g
        );
        if (nodeMatches) {
          results.pageNodeIds = nodeMatches;
        }

        results.pageStatus = pageRes.status;
        results.pageLength = html.length;
      } catch (e) {
        results.pageFetchError = e instanceof Error ? e.message : String(e);
      }
    }

    return new Response(JSON.stringify(results, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
