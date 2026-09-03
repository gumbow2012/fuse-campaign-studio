import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import {
  corsHeaders,
  createAdminClient,
  errorMessage,
  getOptionalUser,
  getUserRoles,
  json,
} from "../_shared/supabase-admin.ts";
import { signFuseAssetUrl } from "../_shared/signed-media.ts";
import { collectDeliverableOutputs, loadOutputExposureByNodeId } from "../_shared/executor.ts";

/**
 * READ-ONLY recovery endpoint.
 *
 * Returns every DURABLE successful output of a run — regardless of the job's status —
 * with short-lived SIGNED URLs that download from the private assets bucket. This
 * rescues customers whose job was marked `failed` while most outputs succeeded.
 *
 * No generation, no billing, no credit writes, no mutations of any kind.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

  const admin = createAdminClient();

  try {
    const user = await getOptionalUser(req, admin);
    if (!user) return json({ error: "Authentication required" }, 401);

    const body = await req.json().catch(() => ({}));
    const jobId = typeof body?.job_id === "string" ? body.job_id.trim() : "";
    if (!jobId) return json({ error: "job_id is required" }, 400);

    const roles = await getUserRoles(user.id, admin);
    const isPrivileged = roles.includes("admin") || roles.includes("dev");

    const { data: job, error: jobError } = await admin
      .from("execution_jobs")
      .select("id, user_id, status")
      .eq("id", jobId)
      .maybeSingle();

    if (jobError) throw new Error(jobError.message);
    if (!job) return json({ error: "Campaign not found" }, 404);
    if (job.user_id !== user.id && !isPrivileged) {
      return json({ error: "Campaign not found" }, 404);
    }

    const { data: steps, error: stepsError } = await admin
      .from("execution_steps")
      .select(
        "id, job_id, node_id, status, output_asset_id, nodes!execution_steps_node_id_fkey(name, node_type, prompt_config), assets!execution_steps_output_asset_id_fkey(supabase_storage_url)",
      )
      .eq("job_id", jobId)
      .order("created_at", { ascending: true });

    if (stepsError) throw new Error(stepsError.message);

    const rows = steps ?? [];
    const exposure = await loadOutputExposureByNodeId(
      admin,
      rows.map((step: any) => step.node_id),
    );

    const deliverables = collectDeliverableOutputs(rows as any, exposure);

    const readyOutputs = [];
    for (const item of deliverables) {
      const signed = await signFuseAssetUrl(admin, item.url, 3600);
      readyOutputs.push({
        node_id: String(item.nodeId),
        type: item.type === "video" ? "video" : "image",
        url: signed ?? item.url,
        label: item.label ?? "Output",
        outputNumber: item.outputNumber,
      });
    }

    const readyNodeIds = new Set(readyOutputs.map((output) => output.node_id));
    const failedOutputs = rows
      .filter((step: any) => {
        if (readyNodeIds.has(String(step.node_id))) return false;
        const status = String(step.status ?? "").toLowerCase();
        return status === "failed" || status === "error";
      })
      .map((step: any) => ({
        node_id: String(step.node_id),
        // Customer-safe category only — never provider text or stack traces.
        error_category: String(step.nodes?.node_type ?? "").includes("video")
          ? "video_generation"
          : "image_generation",
      }));

    const jobStatus = String(job.status ?? "").toLowerCase();
    const running = jobStatus === "running" || jobStatus === "queued" || jobStatus === "video_pending";

    const status = running
      ? "running"
      : readyOutputs.length === 0
        ? "failed"
        : failedOutputs.length > 0
          ? "partial"
          : "complete";

    return json({
      status,
      ready_outputs: readyOutputs,
      failed_outputs: failedOutputs,
      ready_count: readyOutputs.length,
      failed_count: failedOutputs.length,
    });
  } catch (error) {
    console.error("recover-campaign-outputs failed:", errorMessage(error));
    return json({ error: "Could not load your campaign outputs" }, 500);
  }
});
