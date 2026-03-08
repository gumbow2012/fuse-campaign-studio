import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  try {
    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) throw new Error("Not authenticated");
    const userId = userData.user.id;

    const url = new URL(req.url);
    const projectId = url.searchParams.get("projectId");
    if (!projectId) throw new Error("projectId query param required");

    // Get project (user must own it)
    const { data: project, error: projErr } = await supabase
      .from("projects")
      .select("*, templates(*)")
      .eq("id", projectId)
      .eq("user_id", userId)
      .single();
    if (projErr || !project) throw new Error("Project not found");

    // If already complete/failed, return current state
    if (project.status === "complete" || project.status === "failed") {
      return new Response(
        JSON.stringify({
          status: project.status,
          outputs: project.outputs || {},
          weavyRunId: project.weavy_run_id,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // If no weavy_run_id, it's in mock/dev mode
    if (!project.weavy_run_id) {
      return new Response(
        JSON.stringify({ status: project.status, outputs: project.outputs || {}, mode: "mock" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Poll Weavy status
    const WEAVY_API_KEY = Deno.env.get("WEAVY_API_KEY")!;
    const WEAVY_BASE = Deno.env.get("WEAVY_API_BASE_URL") || "https://api.weavy.io";
    const template = project.templates;
    const recipeId = template?.weavy_recipe_id;

    if (!recipeId) throw new Error("Template missing weavy_recipe_id");

    const statusUrl = `${WEAVY_BASE}/api/v1/recipe-runs/recipes/${recipeId}/runs/status?runIds=${project.weavy_run_id}`;
    console.log("Polling Weavy status:", statusUrl);

    const weavyRes = await fetch(statusUrl, {
      headers: { Authorization: `Bearer ${WEAVY_API_KEY}` },
    });

    if (!weavyRes.ok) {
      const errText = await weavyRes.text();
      console.error("Weavy status error:", weavyRes.status, errText);
      throw new Error(`Weavy status API error ${weavyRes.status}: ${errText}`);
    }

    const weavyData = await weavyRes.json();
    console.log("Weavy status response:", JSON.stringify(weavyData));

    // Parse Weavy response — adapt to actual Weavy API shape
    const runData = weavyData.runs?.[project.weavy_run_id] || weavyData[project.weavy_run_id] || weavyData;
    const weavyStatus = runData.status?.toLowerCase() || "running";

    if (weavyStatus === "completed" || weavyStatus === "complete" || weavyStatus === "succeeded") {
      // Extract results
      const results = runData.results || runData.outputs || [];
      const outputType = template?.output_type || "video";
      const outputs = Array.isArray(results)
        ? results.map((r: any, i: number) => ({
            type: r.type || outputType,
            url: r.url || r.downloadUrl || r.output_url || "",
            label: `Output ${i + 1}`,
          }))
        : [];

      await supabase
        .from("projects")
        .update({
          status: "complete",
          completed_at: new Date().toISOString(),
          outputs: { items: outputs },
        })
        .eq("id", projectId);

      return new Response(
        JSON.stringify({ status: "complete", outputs: { items: outputs } }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (weavyStatus === "failed" || weavyStatus === "error") {
      const errorMsg = runData.error || runData.message || "Weavy run failed";
      await supabase
        .from("projects")
        .update({ status: "failed", failed_at: new Date().toISOString() })
        .eq("id", projectId);

      return new Response(
        JSON.stringify({ status: "failed", error: errorMsg }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Still running
    const progress = runData.progress ?? 0;
    return new Response(
      JSON.stringify({ status: project.status, progress, weavyStatus }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ error: msg }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 },
    );
  }
});
