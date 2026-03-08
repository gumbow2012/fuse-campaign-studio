import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

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

    const { projectId, stepId } = await req.json();
    if (!projectId || !stepId) throw new Error("projectId and stepId required");

    // Get step
    const { data: step, error: stepErr } = await supabaseClient
      .from("project_steps")
      .select("*")
      .eq("id", stepId)
      .eq("project_id", projectId)
      .single();
    if (stepErr || !step) throw new Error("Step not found");

    const creditCost = step.last_run_cost_credits || 5;

    // Check credits
    const { data: profile } = await supabaseClient
      .from("profiles")
      .select("credits_balance")
      .eq("user_id", user.id)
      .single();
    if (!profile || profile.credits_balance < creditCost) throw new Error("Insufficient credits");

    // Deduct credits
    await supabaseClient
      .from("profiles")
      .update({ credits_balance: profile.credits_balance - creditCost })
      .eq("user_id", user.id);

    // Log
    await supabaseClient.from("credit_ledger").insert({
      user_id: user.id,
      type: "rerun_step",
      amount: -creditCost,
      project_id: projectId,
      step_id: stepId,
      description: `Rerun step: ${step.step_key}`,
    });

    // Mark running
    await supabaseClient
      .from("project_steps")
      .update({ status: "running" })
      .eq("id", stepId);

    // Simulate completion (placeholder)
    setTimeout(async () => {
      try {
        await supabaseClient
          .from("project_steps")
          .update({ status: "complete" })
          .eq("id", stepId);
      } catch (e) {
        console.error("Rerun simulation error:", e);
      }
    }, 10000);

    return new Response(JSON.stringify({ success: true }), {
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
