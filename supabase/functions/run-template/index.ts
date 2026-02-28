import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(userError.message);
    const user = userData.user;
    if (!user) throw new Error("User not authenticated");

    const { templateId, inputs } = await req.json();
    if (!templateId) throw new Error("templateId is required");

    // Get template
    const { data: template, error: tplErr } = await supabaseClient
      .from("templates")
      .select("*")
      .eq("id", templateId)
      .single();
    if (tplErr || !template) throw new Error("Template not found");

    const creditCost = template.estimated_credits_per_run;

    // Get user profile and check credits
    const { data: profile, error: profErr } = await supabaseClient
      .from("profiles")
      .select("credits_balance")
      .eq("user_id", user.id)
      .single();
    if (profErr || !profile) throw new Error("Profile not found");
    if (profile.credits_balance < creditCost) throw new Error("Insufficient credits");

    // Create project
    const { data: project, error: projErr } = await supabaseClient
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

    // Create default steps
    const defaultSteps = ["hero_image", "clip_01", "clip_02", "thumbnail", "story_frame", "banner"];
    const stepInserts = defaultSteps.map(key => ({
      project_id: project.id,
      step_key: key,
      status: "queued" as const,
      last_run_cost_credits: Math.ceil(creditCost / defaultSteps.length),
    }));
    await supabaseClient.from("project_steps").insert(stepInserts);

    // Deduct credits
    await supabaseClient
      .from("profiles")
      .update({ credits_balance: profile.credits_balance - creditCost })
      .eq("user_id", user.id);

    // Log credit event
    await supabaseClient.from("credit_ledger").insert({
      user_id: user.id,
      type: "run_template",
      amount: -creditCost,
      template_id: templateId,
      project_id: project.id,
      description: `Run template: ${template.name}`,
    });

    // Mark project as running (placeholder — real backend would trigger AI pipeline)
    await supabaseClient
      .from("projects")
      .update({ status: "running" })
      .eq("id", project.id);

    // Simulate completion after delay (placeholder)
    // In production, this would be triggered by the AI pipeline callback
    setTimeout(async () => {
      try {
        await supabaseClient
          .from("project_steps")
          .update({ status: "complete" })
          .eq("project_id", project.id);
        await supabaseClient
          .from("projects")
          .update({ status: "complete" })
          .eq("id", project.id);
      } catch (e) {
        console.error("Simulation error:", e);
      }
    }, 15000);

    return new Response(JSON.stringify({ projectId: project.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
