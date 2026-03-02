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
    if (userError || !userData.user) throw new Error(userError?.message ?? "Not authenticated");
    const user = userData.user;

    const { templateId, inputs } = await req.json();
    if (!templateId) throw new Error("templateId is required");

    // Get template
    const { data: template, error: tplErr } = await supabase
      .from("templates")
      .select("*")
      .eq("id", templateId)
      .single();
    if (tplErr || !template) throw new Error("Template not found");

    const creditCost = template.estimated_credits_per_run;

    // Check credits
    const { data: profile, error: profErr } = await supabase
      .from("profiles")
      .select("credits_balance")
      .eq("user_id", user.id)
      .single();
    if (profErr || !profile) throw new Error("Profile not found");
    if (profile.credits_balance < creditCost) throw new Error("Insufficient credits");

    // Create project
    const { data: project, error: projErr } = await supabase
      .from("projects")
      .insert({
        user_id: user.id,
        template_id: templateId,
        status: "queued",
        inputs: inputs || {},
      })
      .select()
      .single();
    if (projErr) throw new Error(projErr.message);

    // Deduct credits
    await supabase
      .from("profiles")
      .update({ credits_balance: profile.credits_balance - creditCost })
      .eq("user_id", user.id);

    await supabase.from("credit_ledger").insert({
      user_id: user.id,
      type: "run_template",
      amount: -creditCost,
      template_id: templateId,
      project_id: project.id,
      description: `Run template: ${template.name}`,
    });

    // ── Trigger Weavy recipe run ──
    const WEAVY_API_KEY = Deno.env.get("WEAVY_API_KEY");
    const WEAVY_BASE = Deno.env.get("WEAVY_API_BASE_URL") || "https://api.weavy.io";
    const recipeId = template.weavy_recipe_id;

    if (!WEAVY_API_KEY || !recipeId) {
      // No Weavy config — leave as queued for manual admin fulfillment
      console.log("No Weavy API key or recipe ID — project stays queued for manual fulfillment");
      return new Response(
        JSON.stringify({ projectId: project.id, status: "queued", mode: "manual" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Build Weavy input payload from user-uploaded signed URLs
    const weavyInputs: Record<string, any> = {};
    const inputSchema: Array<{ key: string; nodeId?: string }> = template.input_schema || [];
    for (const field of inputSchema) {
      const value = inputs?.[field.key];
      if (value) {
        // Use nodeId as key if available (Weavy expects node-based keys), else use field key
        const weavyKey = field.nodeId || field.key;
        weavyInputs[weavyKey] = value;
      }
    }

    // Build webhook callback URL so Weavy notifies us on completion
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const webhookUrl = `${SUPABASE_URL}/functions/v1/weavy-webhook`;

    const runUrl = `${WEAVY_BASE}/api/v1/recipe-runs/recipes/${recipeId}/run`;
    console.log("Triggering Weavy run:", runUrl);

    const weavyRes = await fetch(runUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${WEAVY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inputs: weavyInputs,
        version: template.weavy_recipe_version || undefined,
        webhookUrl,
        metadata: {
          projectId: project.id,
          userId: user.id,
        },
      }),
    });

    if (!weavyRes.ok) {
      const errText = await weavyRes.text();
      console.error("Weavy run error:", weavyRes.status, errText);
      await supabase.from("projects").update({
        status: "failed",
        failed_at: new Date().toISOString(),
      }).eq("id", project.id);
      throw new Error(`Weavy run failed: ${weavyRes.status} — ${errText}`);
    }

    const weavyData = await weavyRes.json();
    const weavyRunId = weavyData.runId || weavyData.id || weavyData.run_id || null;
    console.log("Weavy run started:", JSON.stringify(weavyData));

    // Update project with Weavy run ID and mark as running
    await supabase.from("projects").update({
      status: "running",
      started_at: new Date().toISOString(),
      weavy_run_id: weavyRunId,
    }).eq("id", project.id);

    return new Response(
      JSON.stringify({
        projectId: project.id,
        status: "running",
        weavyRunId,
        mode: "weavy",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("run-template error:", msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 },
    );
  }
});
