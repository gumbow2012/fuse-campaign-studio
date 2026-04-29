export const ADMIN_AUDIT_VERDICTS = [
  "approved",
  "needs_work",
  "blocked",
  "critical",
] as const;

export const ADMIN_AUDIT_FAILURE_TAGS = [
  "prompt_drift",
  "scene_changed",
  "garment_mapping_wrong",
  "logo_missing",
  "composition_broken",
  "low_realism",
  "off_brand",
  "incomplete_output",
  "provider_failure",
  "slow_run",
  "needs_more_inputs",
] as const;

export const ADMIN_AUDIT_AUTOMATION_FLAGS = [
  "review_user_feedback",
  "needs_prompt_revision",
  "needs_input_mapping_review",
  "needs_reference_lock",
  "investigate_provider",
  "retry_run",
  "ready_to_promote",
] as const;

type AdminAuditVerdict = typeof ADMIN_AUDIT_VERDICTS[number];

export function normalizeStringList(
  values: unknown,
  allowed: readonly string[],
) {
  if (!Array.isArray(values)) return [];

  const allowedSet = new Set(allowed);
  return [...new Set(
    values
      .map((value) => String(value).trim())
      .filter((value) => value.length > 0 && allowedSet.has(value)),
  )];
}

export function clampScore(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 3;
  return Math.min(5, Math.max(1, Math.round(numeric)));
}

export function computeOverallScore(scores: number[]) {
  if (!scores.length) return 0;
  const average = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  return Math.round((average / 5) * 100);
}

export function deriveAutomationFlags(args: {
  verdict: AdminAuditVerdict;
  failureTags: string[];
  existingFlags?: string[];
  hasUserDownvote?: boolean;
  jobStatus?: string | null;
}) {
  const next = new Set<string>(args.existingFlags ?? []);

  if (args.hasUserDownvote) next.add("review_user_feedback");
  if (args.verdict === "approved") next.add("ready_to_promote");
  if (args.verdict === "blocked" || args.verdict === "critical") {
    next.add("retry_run");
  }

  if (args.failureTags.includes("prompt_drift")) next.add("needs_prompt_revision");
  if (
    args.failureTags.includes("garment_mapping_wrong") ||
    args.failureTags.includes("needs_more_inputs")
  ) {
    next.add("needs_input_mapping_review");
  }
  if (
    args.failureTags.includes("scene_changed") ||
    args.failureTags.includes("composition_broken")
  ) {
    next.add("needs_reference_lock");
  }
  if (
    args.failureTags.includes("provider_failure") ||
    args.jobStatus === "failed"
  ) {
    next.add("investigate_provider");
  }

  if (args.verdict !== "approved") {
    next.delete("ready_to_promote");
  }

  return normalizeStringList([...next], ADMIN_AUDIT_AUTOMATION_FLAGS);
}

export function deriveSuggestedAudit(args: {
  jobStatus: string | null | undefined;
  outputCount: number;
  jobError?: string | null;
  quickFeedback: Array<{ vote?: string | null; feedback?: string | null }>;
}) {
  const hasDownvote = args.quickFeedback.some((item) => item.vote === "down");
  const latestComment = args.quickFeedback.find((item) => item.feedback)?.feedback ?? null;
  const failureTags = new Set<string>();
  let verdict: AdminAuditVerdict = "approved";
  let summary = "Output looks healthy. Validate brand fit and scene lock before promoting.";

  if (args.jobStatus === "failed") {
    verdict = "blocked";
    summary = args.jobError
      ? `Run failed before final delivery: ${args.jobError}`
      : "Run failed before final delivery.";
    failureTags.add("provider_failure");
    failureTags.add("incomplete_output");
  } else if (!args.outputCount) {
    verdict = "blocked";
    summary = "Run completed without deliverable outputs. Inspect the internal steps before re-running.";
    failureTags.add("incomplete_output");
  } else if (hasDownvote) {
    verdict = "needs_work";
    summary = latestComment
      ? `Tester flagged this run: ${latestComment}`
      : "Tester flagged this run for follow-up.";
  }

  const automationFlags = deriveAutomationFlags({
    verdict,
    failureTags: [...failureTags],
    hasUserDownvote: hasDownvote,
    jobStatus: args.jobStatus ?? null,
  });

  return {
    verdict,
    failureTags: [...failureTags],
    automationFlags,
    summary,
  };
}
