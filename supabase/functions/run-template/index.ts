import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/** Exchange the long-lived Firebase refresh token for a fresh id_token. */
async function getWeavyIdToken(): Promise<string> {
  const firebaseApiKey = Deno.env.get("WEAVY_FIREBASE_API_KEY");
  const refreshToken = Deno.env.get("WEAVY_REFRESH_TOKEN");
  if (!firebaseApiKey || !refreshToken) {
    throw new Error("Missing FIREBASE_API_KEY or WEAVY_REFRESH_TOKEN");
  }

  const res = await fetch(
    `https://securetoken.googleapis.com/v1/token?key=${firebaseApiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    },
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Firebase token refresh failed (${res.status}): ${errText}`);
  }

  const data = await res.json();
  return data.id_token;
}

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

    // ── Trigger Weavy automation (if template has a recipe) ──
    const recipeId = template.weavy_recipe_id;
    if (recipeId) {
      try {
        const idToken = await getWeavyIdToken();
        const weavyBase = Deno.env.get("WEAVY_API_BASE_URL") || "https://api.weavy.ai";

        console.log(`Triggering Weavy recipe ${recipeId} for project ${project.id}`);

        const runRes = await fetch(
          `${weavyBase}/api/v1/recipe-runs/recipes/${recipeId}/run`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${idToken}`,
            },
            body: JSON.stringify({ inputs: inputs || {} }),
          },
        );

        if (!runRes.ok) {
          const errText = await runRes.text();
          console.error(`Weavy run trigger failed (${runRes.status}):`, errText);
          // Don't fail the whole request — project is created, admin can still fulfill
        } else {
          const runData = await runRes.json();
          const runId = runData.id || runData.runId;
          console.log(`Weavy run started: ${runId}`);

          // Save weavy_run_id and mark as running
          await supabase
            .from("projects")
            .update({
              weavy_run_id: runId,
              status: "running",
              started_at: new Date().toISOString(),
            })
            .eq("id", project.id);
        }
      } catch (weavyErr) {
        // Log but don't fail — falls back to admin fulfillment
        console.error("Weavy automation error:", weavyErr);
      }
    }

    return new Response(
      JSON.stringify({ projectId: project.id, status: recipeId ? "running" : "queued" }),
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
