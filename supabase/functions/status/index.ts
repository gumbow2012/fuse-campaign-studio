import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  const url = new URL(req.url);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // health
  if (url.pathname.endsWith("/status") && url.searchParams.get("health") === "1") {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  const projectId = url.searchParams.get("projectId");
  if (!projectId) {
    return new Response(JSON.stringify({ error: "Missing projectId" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  const uuidRe = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;
  if (!uuidRe.test(projectId)) {
    return new Response(JSON.stringify({ error: "Invalid projectId (must be UUID)", projectId }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const { data, error } = await supabase
    .from("projects")
    .select("id,status,outputs,error,progress,logs,attempts,max_attempts")
    .eq("id", projectId)
    .maybeSingle();

  if (error) {
    return new Response(JSON.stringify({ error: "DB read failed", details: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  if (!data) {
    return new Response(JSON.stringify({ error: "Project not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  // Build result_url from outputs
  const outputs = (data as any).outputs as { items?: { type: string; url: string }[] } | null;
  const resultUrl = outputs?.items?.[0]?.url ?? null;

  return new Response(
    JSON.stringify({
      projectId: data.id,
      status: data.status,
      progress: (data as any).progress ?? 0,
      logs: (data as any).logs ?? [],
      attempts: (data as any).attempts ?? 0,
      maxAttempts: (data as any).max_attempts ?? 3,
      result_url: resultUrl,
      outputs: data.outputs ?? null,
      error: data.error ?? null,
    }),
    { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
  );
});
