import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // Admin check
  const authHeader = req.headers.get("Authorization");
  if (!authHeader)
    return new Response(JSON.stringify({ error: "Missing auth" }), {
      status: 401,
      headers: corsHeaders,
    });
  const token = authHeader.replace("Bearer ", "");
  const {
    data: { user },
  } = await supabase.auth.getUser(token);
  if (!user)
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: corsHeaders,
    });
  const { data: roleData } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .maybeSingle();
  if (!roleData)
    return new Response(JSON.stringify({ error: "Admin only" }), {
      status: 403,
      headers: corsHeaders,
    });

  const WEAVY_API_KEY = Deno.env.get("WEAVY_API_KEY");
  const WEAVY_BASE = Deno.env.get("WEAVY_API_BASE_URL");
  if (!WEAVY_API_KEY || !WEAVY_BASE)
    return new Response(
      JSON.stringify({ error: "Missing WEAVY config" }),
      { status: 500, headers: corsHeaders },
    );

  // Get all templates
  const { data: templates } = await supabase
    .from("templates")
    .select("id, name, weavy_recipe_id");

  const results: Array<{
    id: string;
    recipeId: string;
    oldName: string;
    newName: string | null;
    error?: string;
  }> = [];

  const headers = {
    Authorization: `Bearer ${WEAVY_API_KEY}`,
    Accept: "application/json",
  };

  for (const t of templates || []) {
    if (!t.weavy_recipe_id) continue;

    // Skip PAPPARAZI — already named
    if (t.name === "PAPPARAZI") {
      results.push({
        id: t.id,
        recipeId: t.weavy_recipe_id,
        oldName: t.name,
        newName: null,
      });
      continue;
    }

    let recipeName: string | null = null;

    // Try multiple endpoints
    const paths = [
      `/api/v1/recipes/${t.weavy_recipe_id}`,
      `/api/v1/recipe-runs/recipes/${t.weavy_recipe_id}`,
      `/api/v1/flows/${t.weavy_recipe_id}`,
    ];

    for (const path of paths) {
      try {
        const res = await fetch(`${WEAVY_BASE}${path}`, {
          method: "GET",
          headers,
        });
        if (res.ok) {
          const data = await res.json();
          recipeName =
            data.name || data.title || data.label || data.displayName || null;
          if (recipeName) break;
        } else {
          await res.text();
        }
      } catch {
        // continue
      }
    }

    if (recipeName) {
      await supabase
        .from("templates")
        .update({ name: recipeName })
        .eq("id", t.id);
    }

    results.push({
      id: t.id,
      recipeId: t.weavy_recipe_id,
      oldName: t.name,
      newName: recipeName,
      ...(recipeName ? {} : { error: "Could not fetch name" }),
    });
  }

  return new Response(JSON.stringify({ results }, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
