import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function errText(e: unknown): string {
  try {
    if (e instanceof Error) return `${e.name}: ${e.message}\n${e.stack ?? ""}`;
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

function ts(): string {
  return new Date().toISOString();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  try {
    // ── Auth ──
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await sb.auth.getUser(token);
    if (userError || !userData.user) throw new Error(userError?.message ?? "Not authenticated");
    const user = userData.user;

    // ── Parse body ──
    const { templateId, inputs } = await req.json();
    if (!templateId) throw new Error("templateId is required");

    // ── Get template ──
    const { data: template, error: tplErr } = await sb
      .from("templates")
      .select("*")
      .eq("id", templateId)
      .single();
    if (tplErr || !template) throw new Error(`Template not found: ${tplErr?.message ?? templateId}`);

    const creditCost = template.estimated_credits_per_run;

    // ── Create project (job) row ──
    const { data: project, error: projErr } = await sb
      .from("projects")
      .insert({
        user_id: user.id,
        template_id: templateId,
        status: "queued",
        inputs: inputs || {},
        progress: 0,
        attempts: 0,
        max_attempts: 3,
        logs: [`[${ts()}] Job created — queued for execution`],
      } as any)
      .select()
      .single();
    if (projErr) throw new Error(`Project insert failed: ${projErr.message}`);

    const { error: creditError } = await sb.rpc("apply_credit_transaction", {
      p_user_id: user.id,
      p_amount: -creditCost,
      p_type: "run_template",
      p_description: `Run template: ${template.name}`,
      p_template_id: templateId,
      p_project_id: project.id,
      p_step_id: null,
    });
    if (creditError) {
      await sb.from("projects").delete().eq("id", project.id);
      throw new Error(`Credit charge failed: ${creditError.message}`);
    }

    // ── Enqueue to CF Worker for execution ──
    const WORKER_ORIGIN = "https://shiny-rice-e95bfuse-api.kade-fc1.workers.dev";
    const workerAuthToken = Deno.env.get("CF_WORKER_AUTH_TOKEN") || "";
    const enqueueUrl = `${WORKER_ORIGIN}/api/enqueue`;
    console.log(`[run-template] calling ${enqueueUrl} for project ${project.id}`);
    try {
      const enqueueRes = await fetch(enqueueUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": workerAuthToken,
          "X-User-Id": user.id,
        },
        body: JSON.stringify({ projectId: project.id }),
      });
      const txt = await enqueueRes.text();
      console.log(`[run-template] enqueue response (${enqueueRes.status}): ${txt}`);
    } catch (e) {
      console.error(`[run-template] enqueue call failed: ${errText(e)}`);
    }

    return new Response(
      JSON.stringify({ projectId: project.id, status: "queued" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    const msg = errText(error);
    console.error(`[run-template] FATAL: ${msg}`);
    return new Response(
      JSON.stringify({ error: msg }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 },
    );
  }
});
