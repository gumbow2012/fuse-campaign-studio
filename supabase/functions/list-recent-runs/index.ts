import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import {
  corsHeaders,
  createAdminClient,
  errorMessage,
  getOptionalUser,
  getUserRoles,
  json,
} from "../_shared/supabase-admin.ts";
import { toPublicGenerationFailure } from "../_shared/generation-failure.ts";
import { signFuseAssetUrl } from "../_shared/signed-media.ts";

import {
  collectDeliverableOutputs,
  loadOutputExposureByNodeId,
  reconcileRunningSteps,
} from "../_shared/executor.ts";

function extractProviderDetail(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = extractProviderDetail(item);
      if (nested) return nested;
    }
    return null;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return extractProviderDetail(
      record.detail ??
        record.error ??
        record.message ??
        record.msg ??
        null,
    );
  }
  return String(value);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

  const admin = createAdminClient();

  try {
    const user = await getOptionalUser(req, admin);
    if (!user) {
      return json({ jobs: [] });
    }
    const roles = await getUserRoles(user.id, admin);
    const isPrivileged = roles.includes("admin") || roles.includes("dev");
    const url = new URL(req.url);
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 8), 1), 20);

    let { data: jobs, error } = await admin
      .from("execution_jobs")
      .select("id, status, started_at, completed_at, progress, error_log, result_payload, fuse_templates!execution_jobs_template_id_fkey(name), template_versions!execution_jobs_version_id_fkey(id, version_number, review_status)")
      .eq("user_id", user.id)
      .order("started_at", { ascending: false })
      .limit(limit);

    if (error) throw new Error(error.message);

    const activeJobs = (jobs ?? []).filter((job: any) => job.status === "running" || job.status === "queued");
    for (const job of activeJobs) {
      try {
        await reconcileRunningSteps(admin, job.id);
      } catch (err) {
        console.error(`list-recent-runs: reconcile skipped for job ${job.id}:`, err);
      }
    }

    if (activeJobs.length) {
      const refreshed = await admin
        .from("execution_jobs")
        .select("id, status, started_at, completed_at, progress, error_log, result_payload, fuse_templates!execution_jobs_template_id_fkey(name), template_versions!execution_jobs_version_id_fkey(id, version_number, review_status)")
        .eq("user_id", user.id)
        .order("started_at", { ascending: false })
        .limit(limit);
      if (refreshed.error) throw new Error(refreshed.error.message);
      jobs = refreshed.data ?? [];
    }

    const jobIds = (jobs ?? []).map((job: any) => job.id);
    const { data: steps, error: stepsError } = jobIds.length
      ? await admin
        .from("execution_steps")
        .select("id, job_id, node_id, output_asset_id, nodes!execution_steps_node_id_fkey(name, node_type, prompt_config), assets!execution_steps_output_asset_id_fkey(supabase_storage_url)")
        .in("job_id", jobIds)
        .order("created_at", { ascending: true })
      : { data: [], error: null };

    if (stepsError) throw new Error(stepsError.message);

    const outputExposureByNodeId = await loadOutputExposureByNodeId(
      admin,
      (steps ?? []).map((step: any) => step.node_id),
    );

    const { data: feedbackRows, error: feedbackError } = jobIds.length
      ? await admin
        .from("template_run_feedback")
        .select("job_id, vote, feedback, updated_at")
        .eq("user_id", user.id)
        .in("job_id", jobIds)
      : { data: [], error: null };

    if (feedbackError) throw new Error(feedbackError.message);

    const outputsByJobId = new Map<string, any[]>();
    for (const step of steps ?? []) {
      const existing = outputsByJobId.get((step as any).job_id) ?? [];
      existing.push(step);
      outputsByJobId.set((step as any).job_id, existing);
    }

    const feedbackByJobId = new Map<string, { vote: string | null; feedback: string | null; updatedAt: string | null }>();
    for (const row of feedbackRows ?? []) {
      feedbackByJobId.set((row as any).job_id, {
        vote: (row as any).vote ?? null,
        feedback: (row as any).feedback ?? null,
        updatedAt: (row as any).updated_at ?? null,
      });
    }

    const responseJobs = await Promise.all(
      (jobs ?? []).map(async (job: any) => {
        // P0 failure taxonomy: raw provider/moderation strings are assembled
        // ONLY for privileged (admin/dev) callers. Customers get polished copy.
        const rawError = extractProviderDetail(job.result_payload?.rawPayload?.detail) ?? job.error_log ?? null;
        const publicFailure = job.status === "failed"
          ? toPublicGenerationFailure({ rawError })
          : null;
        // Stage A asset isolation: deliver private media via signed URLs.
        const outputs = await Promise.all(
          collectDeliverableOutputs(outputsByJobId.get(job.id) ?? [], outputExposureByNodeId)
            .map(async (output: any) => ({
              ...output,
              url: await signFuseAssetUrl(admin, output.url ?? null),
            })),
        );
        return {
        id: job.id,
        status: job.status,
        startedAt: job.started_at,
        completedAt: job.completed_at,
        progress: job.progress ?? 0,
        publicFailure,
        ...(isPrivileged ? { error: rawError } : {}),
        templateName: job.fuse_templates?.name ?? "Template",
        templateId: job.template_versions?.id ?? null,
        versionNumber: job.template_versions?.version_number ?? null,
        reviewStatus: job.template_versions?.review_status ?? "Unreviewed",
        telemetry: job.result_payload?.telemetry ?? {},
        outputs,
        feedback: feedbackByJobId.get(job.id) ?? null,
        };
      }),
    );

    return json({ jobs: responseJobs });

  } catch (error) {
    return json({ error: errorMessage(error) }, 400);
  }
});
