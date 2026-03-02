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

    // Get template (with new Weavy columns)
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

    // ── Call Weavy API ──
    const WEAVY_API_KEY = Deno.env.get("WEAVY_API_KEY");
    const WEAVY_BASE = Deno.env.get("WEAVY_API_BASE_URL") || "https://api.weavy.io";

    if (!WEAVY_API_KEY || !template.weavy_recipe_id) {
      // No Weavy config — mark complete immediately (dev mode)
      await supabase.from("projects").update({ status: "running", started_at: new Date().toISOString() }).eq("id", project.id);
      console.log("No Weavy config, running in dev/mock mode");
      return new Response(
        JSON.stringify({ projectId: project.id, mode: "mock" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Build Weavy inputs from input_schema + provided signed URLs
    const inputSchema: Array<{ key: string; nodeId: string; type: string }> = template.input_schema || [];
    const weavyInputs = inputSchema
      .filter((s: any) => inputs[s.key])
      .map((s: any) => ({
        nodeId: s.nodeId,
        fieldName: "image",
        file: { url: inputs[s.key], name: `${s.key}.png` },
      }));

    const weavyPayload = {
      recipeVersion: template.weavy_recipe_version || 1,
      numberOfRuns: 1,
      inputs: weavyInputs,
    };

    console.log("Calling Weavy RUN:", `${WEAVY_BASE}/api/v1/recipe-runs/recipes/${template.weavy_recipe_id}/run`);

    const weavyRes = await fetch(
      `${WEAVY_BASE}/api/v1/recipe-runs/recipes/${template.weavy_recipe_id}/run`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${WEAVY_API_KEY}`,
        },
        body: JSON.stringify(weavyPayload),
      },
    );

    if (!weavyRes.ok) {
      const errText = await weavyRes.text();
      console.error("Weavy RUN failed:", weavyRes.status, errText);
      await supabase.from("projects").update({ status: "failed", failed_at: new Date().toISOString() }).eq("id", project.id);
      throw new Error(`Weavy API error ${weavyRes.status}: ${errText}`);
    }

    const weavyData = await weavyRes.json();
    const weavyRunId = weavyData.runId || weavyData.id || weavyData.runIds?.[0];

    console.log("Weavy run created:", weavyRunId);

    // Save weavy_run_id and mark running
    await supabase
      .from("projects")
      .update({
        status: "running",
        started_at: new Date().toISOString(),
        weavy_run_id: weavyRunId || null,
      })
      .eq("id", project.id);

    return new Response(
      JSON.stringify({ projectId: project.id, weavyRunId }),
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
