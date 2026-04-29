import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import {
  corsHeaders,
  createAdminClient,
  errorMessage,
  getOptionalUser,
  hasValidRunnerCode,
  json,
  requireAdminUser,
} from "../_shared/supabase-admin.ts";
import { runGraphJob } from "../_shared/executor.ts";

declare const EdgeRuntime: {
  waitUntil(promise: Promise<unknown>): void;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const admin = createAdminClient();

  try {
    const runnerAccess = hasValidRunnerCode(req);
    if (runnerAccess) {
      await getOptionalUser(req, admin);
    } else {
      await requireAdminUser(req, admin);
    }

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const jobId = typeof body.jobId === "string" ? body.jobId.trim() : "";
    if (!jobId) throw new Error("jobId is required");

    const { data: job, error: jobError } = await admin
      .from("execution_jobs")
      .select("id, status")
      .eq("id", jobId)
      .single();
    if (jobError || !job) throw new Error(jobError?.message ?? "Job not found");

    if (job.status === "complete" || job.status === "failed") {
      return json({ jobId, status: job.status, resumed: false });
    }

    EdgeRuntime.waitUntil(runGraphJob(admin, jobId));
    return json({ jobId, status: job.status, resumed: true });
  } catch (error) {
    return json({ error: errorMessage(error) }, 400);
  }
});
