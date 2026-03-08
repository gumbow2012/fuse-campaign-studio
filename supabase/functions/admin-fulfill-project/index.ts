import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

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
    // Auth — admin only
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) throw new Error("Not authenticated");

    // Check admin role
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("role", "admin")
      .single();
    if (!roleData) throw new Error("Admin access required");

    const { projectId, action, outputUrls } = await req.json();
    if (!projectId) throw new Error("projectId is required");

    // Get the project
    const { data: project, error: projErr } = await supabase
      .from("projects")
      .select("*, templates(*)")
      .eq("id", projectId)
      .single();
    if (projErr || !project) throw new Error("Project not found");

    // Mark as failed
    if (action === "fail") {
      await supabase.from("projects").update({
        status: "failed",
        failed_at: new Date().toISOString(),
      }).eq("id", projectId);

      return new Response(
        JSON.stringify({ ok: true, status: "failed" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Mark as running (admin started working on it)
    if (action === "start") {
      await supabase.from("projects").update({
        status: "running",
        started_at: new Date().toISOString(),
      }).eq("id", projectId);

      return new Response(
        JSON.stringify({ ok: true, status: "running" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Complete with outputs
    if (action === "complete") {
      if (!outputUrls || !Array.isArray(outputUrls) || outputUrls.length === 0) {
        throw new Error("outputUrls array is required for completion");
      }

      const outputType = (project as any).templates?.output_type || "video";
      const outputItems = outputUrls.map((url: string, i: number) => ({
        type: outputType,
        url,
        label: `Output ${i + 1}`,
      }));

      await supabase.from("projects").update({
        status: "complete",
        completed_at: new Date().toISOString(),
        outputs: { items: outputItems },
      }).eq("id", projectId);

      return new Response(
        JSON.stringify({ ok: true, status: "complete", outputCount: outputItems.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("admin-fulfill-project error:", msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 },
    );
  }
});
