import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/* ── Helpers ── */

function errText(e: unknown): string {
  try {
    if (e instanceof Error) return `${e.name}: ${e.message}\n${e.stack ?? ""}`;
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

async function failProject(
  sb: ReturnType<typeof createClient>,
  projectId: string,
  error: string,
  source: string,
  trace: Record<string, unknown>,
) {
  await sb.from("projects").update({
    status: "failed",
    error: error.slice(0, 10000),
    failed_at: new Date().toISOString(),
    failed_source: source,
    debug_trace: trace,
  }).eq("id", projectId);
}

/** Exchange the long-lived Firebase refresh token for a fresh id_token. */
async function getWeavyIdToken(): Promise<string> {
  const firebaseApiKey = Deno.env.get("WEAVY_FIREBASE_API_KEY");
  const refreshToken = Deno.env.get("WEAVY_REFRESH_TOKEN");
  if (!firebaseApiKey || !refreshToken) {
    throw new Error("Missing WEAVY_FIREBASE_API_KEY or WEAVY_REFRESH_TOKEN");
  }

  const res = await fetch(
    `https://securetoken.googleapis.com/v1/token?key=${firebaseApiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ grant_type: "refresh_token", refresh_token: refreshToken }),
    },
  );

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Firebase token refresh failed (${res.status}): ${txt}`);
  }

  const data = await res.json();
  return data.id_token;
}

/* ── Main ── */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const traceId = crypto.randomUUID().slice(0, 8);
  const trace: Record<string, unknown> = { traceId, ts: new Date().toISOString() };

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  let projectId: string | null = null;

  try {
    // ── Auth ──
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await sb.auth.getUser(token);
    if (userError || !userData.user) throw new Error(userError?.message ?? "Not authenticated");
    const user = userData.user;
    trace.userId = user.id;
    trace.step = "auth_ok";
    console.log(`[${traceId}] auth ok user=${user.id}`);

    // ── Parse body ──
    const { templateId, inputs } = await req.json();
    if (!templateId) throw new Error("templateId is required");
    trace.templateId = templateId;
    trace.received_input_keys = Object.keys(inputs || {});
    trace.step = "body_parsed";
    console.log(`[${traceId}] templateId=${templateId} inputKeys=${trace.received_input_keys}`);

    // ── Get template ──
    const { data: template, error: tplErr } = await sb
      .from("templates")
      .select("*")
      .eq("id", templateId)
      .single();
    if (tplErr || !template) throw new Error(`Template not found: ${tplErr?.message ?? templateId}`);
    trace.weavy_recipe_id = template.weavy_recipe_id ?? null;
    trace.step = "template_loaded";

    const creditCost = template.estimated_credits_per_run;

    // ── Check credits ──
    const { data: profile, error: profErr } = await sb
      .from("profiles")
      .select("credits_balance")
      .eq("user_id", user.id)
      .single();
    if (profErr || !profile) throw new Error(`Profile not found: ${profErr?.message ?? user.id}`);
    if (profile.credits_balance < creditCost) {
      throw new Error(`Insufficient credits: have ${profile.credits_balance}, need ${creditCost}`);
    }
    trace.credits_before = profile.credits_balance;
    trace.credit_cost = creditCost;
    trace.step = "credits_ok";

    // ── Create project ──
    const { data: project, error: projErr } = await sb
      .from("projects")
      .insert({
        user_id: user.id,
        template_id: templateId,
        status: "queued",
        inputs: inputs || {},
      })
      .select()
      .single();
    if (projErr) throw new Error(`Project insert failed: ${projErr.message}`);
    projectId = project.id;
    trace.projectId = projectId;
    trace.step = "project_created";
    console.log(`[${traceId}] project=${projectId}`);

    // ── Deduct credits ──
    await sb
      .from("profiles")
      .update({ credits_balance: profile.credits_balance - creditCost })
      .eq("user_id", user.id);

    await sb.from("credit_ledger").insert({
      user_id: user.id,
      type: "run_template",
      amount: -creditCost,
      template_id: templateId,
      project_id: projectId,
      description: `Run template: ${template.name}`,
    });
    trace.step = "credits_deducted";

    // ── Trigger Weavy ──
    const recipeId = template.weavy_recipe_id;
    if (!recipeId) {
      trace.step = "no_recipe_queued";
      // Save trace even on success for debugging
      await sb.from("projects").update({ debug_trace: trace }).eq("id", projectId);
      return new Response(
        JSON.stringify({ projectId, status: "queued" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log(`[${traceId}] triggering Weavy recipe=${recipeId}`);
    trace.step = "weavy_token_start";

    const idToken = await getWeavyIdToken();
    trace.step = "weavy_token_ok";

    const weavyBase = Deno.env.get("WEAVY_API_BASE_URL") || "https://api.weavy.ai";
    const weavyUrl = `${weavyBase}/api/v1/recipe-runs/recipes/${recipeId}/run`;
    trace.weavy_url = weavyUrl;

    const runRes = await fetch(weavyUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ inputs: inputs || {} }),
    });

    trace.weavy_status = runRes.status;

    if (!runRes.ok) {
      const body = await runRes.text();
      trace.weavy_error_body = body.slice(0, 2000);
      trace.step = "weavy_trigger_failed";
      const msg = `Weavy trigger failed (${runRes.status}): ${body.slice(0, 500)}`;
      console.error(`[${traceId}] ${msg}`);
      await failProject(sb, projectId, msg, "weavy_trigger", trace);
      return new Response(
        JSON.stringify({ projectId, status: "failed", error: msg }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const runData = await runRes.json();
    const runId = runData.id || runData.runId;
    trace.weavy_run_id = runId;
    trace.step = "weavy_running";
    console.log(`[${traceId}] Weavy run=${runId}`);

    await sb.from("projects").update({
      weavy_run_id: runId,
      status: "running",
      started_at: new Date().toISOString(),
      debug_trace: trace,
    }).eq("id", projectId);

    return new Response(
      JSON.stringify({ projectId, status: "running", weavyRunId: runId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    const msg = errText(error);
    trace.fatal_error = msg;
    trace.step = `fatal_at_${trace.step ?? "unknown"}`;
    console.error(`[${traceId}] FATAL: ${msg}`);

    if (projectId) {
      await failProject(sb, projectId, msg, `exception_at_${trace.step}`, trace);
    }

    return new Response(
      JSON.stringify({ error: msg, projectId, traceId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 },
    );
  }
});
