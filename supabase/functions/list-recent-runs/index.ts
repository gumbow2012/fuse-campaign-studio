import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import {
  corsHeaders,
  createAdminClient,
  errorMessage,
  getOptionalUser,
  json,
} from "../_shared/supabase-admin.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

  const admin = createAdminClient();

  try {
    const user = await getOptionalUser(req, admin);
    if (!user) {
      return json({ jobs: [] });
    }
    const url = new URL(req.url);
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 8), 1), 20);

    const { data: jobs, error } = await admin
      .from("execution_jobs")
      .select("id, status, started_at, completed_at, progress, error_log, result_payload, fuse_templates!execution_jobs_template_id_fkey(name), template_versions!execution_jobs_version_id_fkey(version_number)")
      .eq("user_id", user.id)
      .order("started_at", { ascending: false })
      .limit(limit);

    if (error) throw new Error(error.message);

    return json({
      jobs: (jobs ?? []).map((job: any) => ({
        id: job.id,
        status: job.status,
        startedAt: job.started_at,
        completedAt: job.completed_at,
        progress: job.progress ?? 0,
        error: job.error_log ?? null,
        templateName: job.fuse_templates?.name ?? "Template",
        versionNumber: job.template_versions?.version_number ?? null,
        telemetry: job.result_payload?.telemetry ?? {},
        outputs: Array.isArray(job.result_payload?.outputs) ? job.result_payload.outputs : [],
      })),
    });
  } catch (error) {
    return json({ error: errorMessage(error) }, 400);
  }
});
