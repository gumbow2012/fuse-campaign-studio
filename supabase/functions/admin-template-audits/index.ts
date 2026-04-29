import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import {
  corsHeaders,
  createAdminClient,
  errorMessage,
  json,
  logAuditEvent,
  requireAdminUser,
} from "../_shared/supabase-admin.ts";
import { buildJobStatusResponse } from "../_shared/job-status.ts";
import {
  ADMIN_AUDIT_AUTOMATION_FLAGS,
  ADMIN_AUDIT_FAILURE_TAGS,
  ADMIN_AUDIT_VERDICTS,
  clampScore,
  computeOverallScore,
  deriveAutomationFlags,
  deriveSuggestedAudit,
  normalizeStringList,
} from "../_shared/template-audits.ts";
const MAX_LIMIT = 60;
const OUTPUT_REPORT_TAGS = [
  "wrong_product",
  "input_drift",
  "prompt_mismatch",
  "bad_motion",
  "bad_logo",
  "bad_scene",
  "low_quality",
  "artifacting",
  "unsafe_or_weird",
  "other",
] as const;

const OUTPUT_REPORT_SEVERITIES = ["low", "medium", "high", "blocking"] as const;
const OUTPUT_REPORT_STATUSES = ["open", "fixed", "wont_fix"] as const;
const OUTPUT_REPORT_VERDICTS = ["good", "iffy", "bad"] as const;

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
      record.detail ?? record.error ?? record.message ?? record.msg ?? null,
    );
  }
  return String(value);
}

function trimText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  const next = value.trim();
  if (!next) return null;
  return next.slice(0, maxLength);
}

function buildOptions() {
  return {
    verdicts: [...ADMIN_AUDIT_VERDICTS],
    failureTags: [...ADMIN_AUDIT_FAILURE_TAGS],
    automationFlags: [...ADMIN_AUDIT_AUTOMATION_FLAGS],
    outputReportTags: [...OUTPUT_REPORT_TAGS],
    outputReportSeverities: [...OUTPUT_REPORT_SEVERITIES],
    outputReportStatuses: [...OUTPUT_REPORT_STATUSES],
    outputReportVerdicts: [...OUTPUT_REPORT_VERDICTS],
  };
}

async function loadProfiles(admin: ReturnType<typeof createAdminClient>, userIds: string[]) {
  const uniqueUserIds = [...new Set(userIds.filter(Boolean))];
  if (!uniqueUserIds.length) {
    return new Map<string, {
      name: string | null;
      email: string | null;
      plan: string | null;
      subscriptionStatus: string | null;
    }>();
  }

  const { data, error } = await admin
    .from("profiles")
    .select("user_id, name, email, plan, subscription_status")
    .in("user_id", uniqueUserIds);
  if (error) throw new Error(error.message);

  return new Map(
    (data ?? []).map((profile: any) => [
      profile.user_id,
      {
        name: profile.name ?? null,
        email: profile.email ?? null,
        plan: profile.plan ?? null,
        subscriptionStatus: profile.subscription_status ?? null,
      },
    ]),
  );
}

function serializeAuditRow(
  row: any,
  profilesByUserId: Map<string, {
    name: string | null;
    email: string | null;
    plan: string | null;
    subscriptionStatus: string | null;
  }>,
) {
  const profile = profilesByUserId.get(row.admin_user_id);
  return {
    id: row.id,
    jobId: row.job_id,
    adminUserId: row.admin_user_id,
    adminName: profile?.name ?? null,
    adminEmail: profile?.email ?? null,
    templateId: row.template_id ?? null,
    versionId: row.version_id ?? null,
    verdict: row.verdict,
    overallScore: row.overall_score,
    outputQualityScore: row.output_quality_score,
    brandAlignmentScore: row.brand_alignment_score,
    promptAdherenceScore: row.prompt_adherence_score,
    inputFidelityScore: row.input_fidelity_score,
    failureTags: row.failure_tags ?? [],
    automationFlags: row.automation_flags ?? [],
    summary: row.summary,
    keepers: row.keepers ?? null,
    changeRequest: row.change_request ?? null,
    promptToOutputNotes: row.prompt_to_output_notes ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializeQuickFeedbackRow(
  row: any,
  profilesByUserId: Map<string, {
    name: string | null;
    email: string | null;
    plan: string | null;
    subscriptionStatus: string | null;
  }>,
) {
  const profile = profilesByUserId.get(row.user_id);
  return {
    userId: row.user_id,
    userName: profile?.name ?? null,
    userEmail: profile?.email ?? null,
    vote: row.vote ?? null,
    feedback: row.feedback ?? null,
    updatedAt: row.updated_at ?? row.created_at ?? null,
  };
}

function serializeOutputReportRow(
  row: any,
  profilesByUserId: Map<string, {
    name: string | null;
    email: string | null;
    plan: string | null;
    subscriptionStatus: string | null;
  }>,
) {
  const profile = profilesByUserId.get(row.admin_user_id);
  return {
    id: row.id,
    jobId: row.job_id,
    adminUserId: row.admin_user_id,
    adminName: profile?.name ?? null,
    adminEmail: profile?.email ?? null,
    templateId: row.template_id ?? null,
    versionId: row.version_id ?? null,
    outputNumber: row.output_number,
    outputUrl: row.output_url ?? null,
    verdict: row.verdict ?? "iffy",
    issueTags: row.issue_tags ?? [],
    severity: row.severity,
    note: row.note,
    recommendedFix: row.recommended_fix ?? null,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function loadQuickFeedback(admin: ReturnType<typeof createAdminClient>, jobIds: string[]) {
  if (!jobIds.length) return [];

  const { data, error } = await admin
    .from("template_run_feedback")
    .select("job_id, user_id, vote, feedback, created_at, updated_at")
    .in("job_id", jobIds)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);

  return data ?? [];
}

async function loadAdminAudits(admin: ReturnType<typeof createAdminClient>, jobIds: string[]) {
  if (!jobIds.length) return [];

  const { data, error } = await admin
    .from("template_run_admin_audits")
    .select("*")
    .in("job_id", jobIds)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);

  return data ?? [];
}

async function loadOutputReports(admin: ReturnType<typeof createAdminClient>, jobIds: string[]) {
  if (!jobIds.length) return [];

  const { data, error } = await admin
    .from("template_output_reports")
    .select("*")
    .in("job_id", jobIds)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);

  return data ?? [];
}

function buildQueueState(args: {
  jobStatus: string | null;
  latestVerdict: string | null;
  adminAuditCount: number;
  avgScore: number | null;
  downvotes: number;
  openOutputReports?: number;
}) {
  if (!args.adminAuditCount && !Number(args.openOutputReports ?? 0)) return "pending";
  if (
    args.jobStatus === "failed" ||
    args.downvotes > 0 ||
    Number(args.openOutputReports ?? 0) > 0 ||
    args.latestVerdict === "needs_work" ||
    args.latestVerdict === "blocked" ||
    args.latestVerdict === "critical" ||
    (args.avgScore !== null && args.avgScore < 75)
  ) {
    return "needs_attention";
  }
  return "approved";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const admin = createAdminClient();

  try {
    const user = await requireAdminUser(req, admin);
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const action = String(body.action ?? "list");

    if (action === "list") {
      const limit = Math.min(Math.max(Number(body.limit ?? 40), 1), MAX_LIMIT);

      let { data: jobs, error } = await admin
        .from("execution_jobs")
        .select("id, user_id, status, progress, started_at, completed_at, error_log, result_payload, template_id, version_id, fuse_templates!execution_jobs_template_id_fkey(id, name), template_versions!execution_jobs_version_id_fkey(id, version_number, review_status)")
        .order("started_at", { ascending: false })
        .limit(limit);
      if (error) throw new Error(error.message);

      const jobIds = (jobs ?? []).map((job: any) => job.id);
      const quickFeedbackRows = await loadQuickFeedback(admin, jobIds);
      const adminAuditRows = await loadAdminAudits(admin, jobIds);
      const outputReportRows = await loadOutputReports(admin, jobIds);

      const profileMap = await loadProfiles(
        admin,
        [
          ...(jobs ?? []).map((job: any) => job.user_id),
          ...quickFeedbackRows.map((row: any) => row.user_id),
          ...adminAuditRows.map((row: any) => row.admin_user_id),
          ...outputReportRows.map((row: any) => row.admin_user_id),
        ],
      );

      const quickFeedbackByJobId = new Map<string, any[]>();
      for (const row of quickFeedbackRows) {
        const existing = quickFeedbackByJobId.get(row.job_id) ?? [];
        existing.push(serializeQuickFeedbackRow(row, profileMap));
        quickFeedbackByJobId.set(row.job_id, existing);
      }

      const auditsByJobId = new Map<string, any[]>();
      for (const row of adminAuditRows) {
        const existing = auditsByJobId.get(row.job_id) ?? [];
        existing.push(serializeAuditRow(row, profileMap));
        auditsByJobId.set(row.job_id, existing);
      }

      const outputReportsByJobId = new Map<string, any[]>();
      for (const row of outputReportRows) {
        const existing = outputReportsByJobId.get(row.job_id) ?? [];
        existing.push(serializeOutputReportRow(row, profileMap));
        outputReportsByJobId.set(row.job_id, existing);
      }

      const queueJobs = (jobs ?? []).map((job: any) => {
        const outputCount = Array.isArray(job.result_payload?.outputs)
          ? job.result_payload.outputs.length
          : 0;
        const quickFeedback = quickFeedbackByJobId.get(job.id) ?? [];
        const audits = auditsByJobId.get(job.id) ?? [];
        const outputReports = outputReportsByJobId.get(job.id) ?? [];
        const owner = profileMap.get(job.user_id ?? "");
        const downvotes = quickFeedback.filter((item: any) => item.vote === "down").length;
        const upvotes = quickFeedback.filter((item: any) => item.vote === "up").length;
        const openOutputReports = outputReports.filter((item: any) => item.status === "open").length;
        const avgScore = audits.length
          ? Math.round(audits.reduce((sum: number, audit: any) => sum + audit.overallScore, 0) / audits.length)
          : null;
        const latestAudit = audits[0] ?? null;
        const queueState = buildQueueState({
          jobStatus: job.status ?? null,
          latestVerdict: latestAudit?.verdict ?? null,
          adminAuditCount: audits.length,
          avgScore,
          downvotes,
          openOutputReports,
        });
        const suggested = deriveSuggestedAudit({
          jobStatus: job.status ?? null,
          outputCount,
          jobError: extractProviderDetail(job.result_payload?.rawPayload?.detail) ?? job.error_log ?? null,
          quickFeedback,
        });

        return {
          id: job.id,
          status: job.status ?? "queued",
          progress: job.progress ?? 0,
          runAt: job.started_at ?? job.completed_at ?? null,
          startedAt: job.started_at ?? null,
          completedAt: job.completed_at ?? null,
          error: extractProviderDetail(job.result_payload?.rawPayload?.detail) ?? job.error_log ?? null,
          userId: job.user_id ?? null,
          userName: owner?.name ?? null,
          userEmail: owner?.email ?? null,
          userPlan: owner?.plan ?? null,
          userSubscriptionStatus: owner?.subscriptionStatus ?? null,
          templateId: job.template_id ?? null,
          templateName: job.fuse_templates?.name ?? "Template",
          versionId: job.version_id ?? null,
          versionNumber: job.template_versions?.version_number ?? null,
          reviewStatus: job.template_versions?.review_status ?? "Unreviewed",
          outputCount,
          outputPreviewUrl: null,
          outputPreviewType: null,
          queueState,
          quickFeedback: {
            upvotes,
            downvotes,
            latestComment: quickFeedback.find((item: any) => item.feedback)?.feedback ?? null,
          },
          outputReports: {
            count: outputReports.length,
            openCount: openOutputReports,
            latestNote: outputReports.find((item: any) => item.note)?.note ?? null,
          },
          audits: {
            count: audits.length,
            avgScore,
            latestVerdict: latestAudit?.verdict ?? null,
            latestUpdatedAt: latestAudit?.updatedAt ?? null,
            latestSummary: latestAudit?.summary ?? null,
          },
          suggestedAudit: suggested,
        };
      });

      const summary = {
        totalRuns: queueJobs.length,
        pendingAudit: queueJobs.filter((job) => job.queueState === "pending").length,
        needsAttention: queueJobs.filter((job) => job.queueState === "needs_attention").length,
        approved: queueJobs.filter((job) => job.queueState === "approved").length,
        failedRuns: queueJobs.filter((job) => job.status === "failed").length,
        averageAuditScore: (() => {
          const scored = queueJobs.map((job) => job.audits.avgScore).filter((value): value is number => value !== null);
          if (!scored.length) return null;
          return Math.round(scored.reduce((sum, value) => sum + value, 0) / scored.length);
        })(),
      };

      return json({
        options: buildOptions(),
        summary,
        jobs: queueJobs,
      });
    }

    if (action === "detail") {
      const jobId = typeof body.jobId === "string" ? body.jobId : "";
      if (!jobId) throw new Error("jobId is required");

      const job = await buildJobStatusResponse(admin, jobId, true, user.id);
      const quickFeedbackRows = await loadQuickFeedback(admin, [jobId]);
      const adminAuditRows = await loadAdminAudits(admin, [jobId]);
      const outputReportRows = await loadOutputReports(admin, [jobId]);

      const profileMap = await loadProfiles(
        admin,
        [
          ...quickFeedbackRows.map((row: any) => row.user_id),
          ...adminAuditRows.map((row: any) => row.admin_user_id),
          ...outputReportRows.map((row: any) => row.admin_user_id),
        ],
      );

      const quickFeedback = quickFeedbackRows.map((row: any) => serializeQuickFeedbackRow(row, profileMap));
      const audits = adminAuditRows.map((row: any) => serializeAuditRow(row, profileMap));
      const outputReports = outputReportRows.map((row: any) => serializeOutputReportRow(row, profileMap));
      const suggestedAudit = deriveSuggestedAudit({
        jobStatus: job.status ?? null,
        outputCount: job.outputs?.length ?? 0,
        jobError: job.error ?? null,
        quickFeedback,
      });

      return json({
        options: buildOptions(),
        job,
        quickFeedback,
        audits,
        outputReports,
        currentUserAudit: audits.find((audit) => audit.adminUserId === user.id) ?? null,
        suggestedAudit,
      });
    }

    if (action === "save") {
      const jobId = typeof body.jobId === "string" ? body.jobId : "";
      if (!jobId) throw new Error("jobId is required");

      const verdict = ADMIN_AUDIT_VERDICTS.includes(body.verdict as any)
        ? String(body.verdict)
        : "needs_work";

      const outputQualityScore = clampScore(body.outputQualityScore);
      const brandAlignmentScore = clampScore(body.brandAlignmentScore);
      const promptAdherenceScore = clampScore(body.promptAdherenceScore);
      const inputFidelityScore = clampScore(body.inputFidelityScore);
      const summary = trimText(body.summary, 3000);
      if (!summary) throw new Error("summary is required");

      const keepers = trimText(body.keepers, 3000);
      const changeRequest = trimText(body.changeRequest, 3000);
      const promptToOutputNotes = trimText(body.promptToOutputNotes, 3000);
      const failureTags = normalizeStringList(body.failureTags, ADMIN_AUDIT_FAILURE_TAGS);

      const { data: jobRow, error: jobError } = await admin
        .from("execution_jobs")
        .select("id, template_id, version_id, status")
        .eq("id", jobId)
        .maybeSingle();
      if (jobError) throw new Error(jobError.message);
      if (!jobRow) throw new Error("Run not found");

      const quickFeedbackRows = await loadQuickFeedback(admin, [jobId]);
      const hasUserDownvote = quickFeedbackRows.some((row: any) => row.vote === "down");
      const automationFlags = deriveAutomationFlags({
        verdict: verdict as typeof ADMIN_AUDIT_VERDICTS[number],
        failureTags,
        existingFlags: normalizeStringList(body.automationFlags, ADMIN_AUDIT_AUTOMATION_FLAGS),
        hasUserDownvote,
        jobStatus: jobRow.status ?? null,
      });
      const overallScore = computeOverallScore([
        outputQualityScore,
        brandAlignmentScore,
        promptAdherenceScore,
        inputFidelityScore,
      ]);

      const payload = {
        job_id: jobRow.id,
        admin_user_id: user.id,
        template_id: jobRow.template_id ?? null,
        version_id: jobRow.version_id ?? null,
        verdict,
        overall_score: overallScore,
        output_quality_score: outputQualityScore,
        brand_alignment_score: brandAlignmentScore,
        prompt_adherence_score: promptAdherenceScore,
        input_fidelity_score: inputFidelityScore,
        failure_tags: failureTags,
        automation_flags: automationFlags,
        summary,
        keepers,
        change_request: changeRequest,
        prompt_to_output_notes: promptToOutputNotes,
      };

      const { data, error } = await admin
        .from("template_run_admin_audits")
        .upsert(payload, { onConflict: "admin_user_id,job_id" })
        .select("*")
        .single();
      if (error) throw new Error(error.message);

      const profileMap = await loadProfiles(admin, [user.id]);
      const serialized = serializeAuditRow(data, profileMap);

      await logAuditEvent({
        eventType: "template.run.audit.saved",
        message: `Saved admin audit (${verdict}) for template run ${jobRow.id}.`,
        source: "admin-template-audits",
        jobId: jobRow.id,
        templateId: jobRow.template_id ?? null,
        versionId: jobRow.version_id ?? null,
        metadata: {
          audit_id: data.id,
          verdict,
          overall_score: overallScore,
          failure_tags: failureTags,
          automation_flags: automationFlags,
        },
      }, admin);

      return json({
        options: buildOptions(),
        audit: serialized,
      });
    }

    if (action === "save_output_report") {
      const jobId = typeof body.jobId === "string" ? body.jobId : "";
      if (!jobId) throw new Error("jobId is required");

      const outputNumber = Number(body.outputNumber);
      if (!Number.isInteger(outputNumber) || outputNumber <= 0) {
        throw new Error("outputNumber is required");
      }

      const note = trimText(body.note, 2000);
      if (!note) throw new Error("note is required");

      const issueTags = normalizeStringList(body.issueTags, OUTPUT_REPORT_TAGS);
      const verdict = OUTPUT_REPORT_VERDICTS.includes(body.verdict as any)
        ? String(body.verdict)
        : "iffy";
      const severity = OUTPUT_REPORT_SEVERITIES.includes(body.severity as any)
        ? String(body.severity)
        : "medium";
      const status = OUTPUT_REPORT_STATUSES.includes(body.status as any)
        ? String(body.status)
        : "open";
      const recommendedFix = trimText(body.recommendedFix, 2000);
      const { data: jobRow, error: jobError } = await admin
        .from("execution_jobs")
        .select("id, template_id, version_id")
        .eq("id", jobId)
        .maybeSingle();
      if (jobError) throw new Error(jobError.message);
      if (!jobRow) throw new Error("Run not found");

      const canonicalStatus = await buildJobStatusResponse(admin, jobRow.id, true, null);
      const canonicalOutput = (canonicalStatus.outputs ?? []).find((output: any) =>
        Number(output.outputNumber) === outputNumber
      );
      if (!canonicalOutput?.url) {
        throw new Error(`Output ${outputNumber} is not a deliverable output for this run`);
      }

      const payload = {
        job_id: jobRow.id,
        admin_user_id: user.id,
        template_id: jobRow.template_id ?? null,
        version_id: jobRow.version_id ?? null,
        output_number: outputNumber,
        output_url: canonicalOutput.url,
        verdict,
        issue_tags: issueTags,
        severity,
        note,
        recommended_fix: recommendedFix,
        status,
      };

      const { data, error } = await admin
        .from("template_output_reports")
        .upsert(payload, { onConflict: "admin_user_id,job_id,output_number" })
        .select("*")
        .single();
      if (error) throw new Error(error.message);

      const profileMap = await loadProfiles(admin, [user.id]);
      const serialized = serializeOutputReportRow(data, profileMap);

      await logAuditEvent({
        eventType: "template.output.report.saved",
        message: `Saved output report for output ${outputNumber} on template run ${jobRow.id}.`,
        source: "admin-template-audits",
        jobId: jobRow.id,
        templateId: jobRow.template_id ?? null,
        versionId: jobRow.version_id ?? null,
        metadata: {
          output_report_id: data.id,
          output_number: outputNumber,
          verdict,
          issue_tags: issueTags,
          severity,
          status,
        },
      }, admin);

      return json({
        options: buildOptions(),
        outputReport: serialized,
      });
    }

    throw new Error("Unsupported action");
  } catch (error) {
    return json({ error: errorMessage(error) }, 400);
  }
});
