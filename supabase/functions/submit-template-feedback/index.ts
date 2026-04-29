import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import {
  corsHeaders,
  createAdminClient,
  errorMessage,
  json,
  requireUser,
} from "../_shared/supabase-admin.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const admin = createAdminClient();

  try {
    const user = await requireUser(req, admin);
    const body = await req.json().catch(() => ({})) as {
      jobId?: string;
      vote?: string | null;
      feedback?: string | null;
    };

    const jobId = typeof body.jobId === "string" ? body.jobId : null;
    if (!jobId) throw new Error("jobId is required");

    const vote = body.vote === "up" || body.vote === "down" ? body.vote : null;
    const feedback = typeof body.feedback === "string"
      ? body.feedback.trim().slice(0, 1000)
      : "";

    if (!vote && !feedback) {
      throw new Error("Provide a thumb vote or written feedback.");
    }

    const { data: job, error: jobError } = await admin
      .from("execution_jobs")
      .select("id, user_id, template_id")
      .eq("id", jobId)
      .maybeSingle();
    if (jobError) throw new Error(jobError.message);
    if (!job || job.user_id !== user.id) {
      throw new Error("Run not found.");
    }

    const payload = {
      job_id: job.id,
      user_id: user.id,
      template_id: job.template_id ?? null,
      vote,
      feedback: feedback || null,
    };

    const { data, error } = await admin
      .from("template_run_feedback")
      .upsert(payload, { onConflict: "user_id,job_id" })
      .select("job_id, vote, feedback, updated_at")
      .single();
    if (error) throw new Error(error.message);

    return json({
      feedback: {
        jobId: data.job_id,
        vote: data.vote,
        feedback: data.feedback,
        updatedAt: data.updated_at,
      },
    });
  } catch (error) {
    return json({ error: errorMessage(error) }, 400);
  }
});
