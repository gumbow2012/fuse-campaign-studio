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
    const body = await req.json();
    console.log("Weavy webhook received:", JSON.stringify(body));

    // Extract project context — Weavy should echo back our metadata
    const projectId = body.metadata?.projectId || body.projectId;
    const runId = body.runId || body.run_id || body.id;
    const status = (body.status || "").toLowerCase();

    if (!projectId && !runId) {
      // Try to find by runId in our projects table
      throw new Error("No projectId or runId in webhook payload");
    }

    // Find the project
    let project;
    if (projectId) {
      const { data, error } = await supabase
        .from("projects")
        .select("*, templates(*)")
        .eq("id", projectId)
        .single();
      if (error || !data) throw new Error(`Project ${projectId} not found`);
      project = data;
    } else if (runId) {
      const { data, error } = await supabase
        .from("projects")
        .select("*, templates(*)")
        .eq("weavy_run_id", runId)
        .single();
      if (error || !data) throw new Error(`Project with weavy_run_id ${runId} not found`);
      project = data;
    }

    if (!project) throw new Error("Could not resolve project");

    // Already terminal — ignore duplicate webhooks
    if (project.status === "complete" || project.status === "failed") {
      console.log(`Project ${project.id} already ${project.status}, ignoring webhook`);
      return new Response(JSON.stringify({ ok: true, skipped: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Handle failure ──
    if (status === "failed" || status === "error") {
      const errorMsg = body.error || body.message || "Weavy run failed";
      console.log(`Weavy run failed for project ${project.id}: ${errorMsg}`);

      await supabase.from("projects").update({
        status: "failed",
        failed_at: new Date().toISOString(),
      }).eq("id", project.id);

      return new Response(JSON.stringify({ ok: true, status: "failed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Handle success ──
    if (status === "completed" || status === "complete" || status === "succeeded") {
      console.log(`Weavy run completed for project ${project.id}`);

      // Extract output URLs from webhook payload
      const results = body.results || body.outputs || body.output || [];
      const resultArray = Array.isArray(results) ? results : [results];
      const outputType = project.templates?.output_type || "video";

      const outputItems: Array<{ type: string; url: string; label: string }> = [];

      for (let i = 0; i < resultArray.length; i++) {
        const result = resultArray[i];
        const outputUrl = result.url || result.downloadUrl || result.output_url || (typeof result === "string" ? result : null);

        if (!outputUrl) continue;

        try {
          // Download the output from Weavy and re-upload to our storage
          console.log(`Downloading output ${i + 1} from: ${outputUrl}`);
          const res = await fetch(outputUrl);
          if (!res.ok) {
            console.error(`Failed to download output ${i}: ${res.status}`);
            continue;
          }

          const blob = await res.arrayBuffer();
          const contentType = res.headers.get("content-type") || (outputType === "video" ? "video/mp4" : "image/png");
          const ext = contentType.includes("mp4") ? "mp4" : contentType.includes("webm") ? "webm" : contentType.includes("png") ? "png" : contentType.includes("jpg") || contentType.includes("jpeg") ? "jpg" : "bin";
          const storagePath = `${project.user_id}/${project.id}/output-${i}.${ext}`;

          const { error: upErr } = await supabase.storage
            .from("project-assets")
            .upload(storagePath, new Uint8Array(blob), { contentType, upsert: true });

          if (upErr) {
            console.error(`Storage upload failed for output ${i}:`, upErr);
            // Still include the direct Weavy URL as fallback
            outputItems.push({
              type: result.type || outputType,
              url: outputUrl,
              label: `Output ${i + 1}`,
            });
            continue;
          }

          // Create signed URL (24h)
          const { data: signedData } = await supabase.storage
            .from("project-assets")
            .createSignedUrl(storagePath, 86400);

          outputItems.push({
            type: result.type || outputType,
            url: signedData?.signedUrl || outputUrl,
            label: `Output ${i + 1}`,
          });

          console.log(`Stored output ${i + 1} at ${storagePath}`);
        } catch (dlErr) {
          console.error(`Error processing output ${i}:`, dlErr);
          // Fallback to direct URL
          outputItems.push({
            type: result.type || outputType,
            url: outputUrl,
            label: `Output ${i + 1}`,
          });
        }
      }

      await supabase.from("projects").update({
        status: "complete",
        completed_at: new Date().toISOString(),
        outputs: { items: outputItems },
      }).eq("id", project.id);

      console.log(`Project ${project.id} marked complete with ${outputItems.length} outputs`);

      return new Response(
        JSON.stringify({ ok: true, status: "complete", outputCount: outputItems.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Still running / unknown status ──
    console.log(`Weavy webhook with status "${status}" for project ${project.id} — no action taken`);
    return new Response(
      JSON.stringify({ ok: true, status: "acknowledged" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("weavy-webhook error:", msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 },
    );
  }
});
