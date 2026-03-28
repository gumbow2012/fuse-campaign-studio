import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import {
  corsHeaders,
  createAdminClient,
  errorMessage,
  getOptionalUser,
  hasValidRunnerCode,
  json,
  requireTesterUser,
} from "../_shared/supabase-admin.ts";
import {
  collectDeliverableOutputs,
  loadOutputExposureByNodeId,
  reconcileRunningSteps,
} from "../_shared/executor.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

    const admin = createAdminClient();

  try {
    const runnerAccess = hasValidRunnerCode(req);
    const user = runnerAccess ? await getOptionalUser(req, admin) : await requireTesterUser(req, admin);
    if (!user && !runnerAccess) throw new Error("Authentication required");

    const url = new URL(req.url);
    const jobId = url.searchParams.get("jobId");
    if (!jobId) throw new Error("jobId is required");

    const { data: job, error: jobError } = await admin
      .from("execution_jobs")
      .select("id, user_id, template_id, version_id, status, progress, started_at, completed_at, input_payload, result_payload, error_log")
      .eq("id", jobId)
      .single();
    if (jobError || !job) throw new Error(jobError?.message ?? "Job not found");
    if (!runnerAccess && job.user_id !== user?.id) return json({ error: "Forbidden" }, 403);

    if (job.status === "running" || job.status === "queued") {
      await reconcileRunningSteps(admin, job.id);
    }

    const { data: steps, error: stepsError } = await admin
      .from("execution_steps")
      .select("id, node_id, status, provider, provider_model, provider_request_id, output_asset_id, output_payload, error_log, execution_time_ms, started_at, completed_at, nodes!execution_steps_node_id_fkey(name, node_type), assets!execution_steps_output_asset_id_fkey(supabase_storage_url)")
      .eq("job_id", job.id)
      .order("created_at", { ascending: true });
    if (stepsError) throw new Error(stepsError.message);

    const outputExposureByNodeId = await loadOutputExposureByNodeId(
      admin,
      (steps ?? []).map((step: any) => step.node_id),
    );
    const outputs = collectDeliverableOutputs(steps ?? [], outputExposureByNodeId);
    const failedStep = (steps ?? []).find((step: any) => step.status === "failed");
    const resolvedJobError =
      failedStep?.output_payload?.rawPayload?.detail?.[0]?.msg ??
      failedStep?.error_log ??
      job.error_log ??
      null;

    return json({
      jobId: job.id,
      status: job.status,
      progress: job.progress ?? 0,
      error: resolvedJobError,
      telemetry: job.result_payload?.telemetry ?? {},
      outputs,
      steps: (steps ?? []).map((step: any) => ({
        id: step.id,
        nodeId: step.node_id,
        label: step.nodes?.name ?? "Step",
        type: step.nodes?.node_type ?? "unknown",
        status: step.status,
        provider: step.provider,
        providerModel: step.provider_model,
        providerRequestId: step.provider_request_id,
        outputUrl: step.assets?.supabase_storage_url ?? null,
        error: step.output_payload?.rawPayload?.detail?.[0]?.msg ?? step.error_log ?? null,
        startedAt: step.started_at ?? null,
        completedAt: step.completed_at ?? null,
        executionTimeMs: step.execution_time_ms ?? step.output_payload?.telemetry?.executionTimeMs ?? null,
        telemetry: step.output_payload?.telemetry ?? null,
      })),
    });
  } catch (error) {
    return json({ error: errorMessage(error) }, 400);
  }
});
