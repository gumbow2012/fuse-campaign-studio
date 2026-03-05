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
      project_id: project.id,
      description: `Run template: ${template.name}`,
    });

    // ── Enqueue to CF Worker for execution ──
    const cfWorkerUrl = Deno.env.get("VITE_CF_WORKER_URL") || "https://shiny-rice-e95bfuse-api.kade-fc1.workers.dev";
    try {
      const enqueueRes = await fetch(`${cfWorkerUrl}/api/enqueue`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          "X-Service-Call": "true",
        },
        body: JSON.stringify({ projectId: project.id }),
      });
      if (!enqueueRes.ok) {
        const txt = await enqueueRes.text();
        console.error(`[run-template] enqueue failed: ${txt}`);
        // Don't fail — job is queued in DB, runner can pick it up
      }
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
