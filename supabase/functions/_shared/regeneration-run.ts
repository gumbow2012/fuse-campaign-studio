/**
 * TR7 — per-output regeneration EXECUTION + revision history.
 *
 * Mechanism (verified): `runGraphJob` only executes steps whose status is
 * "pending" and feeds `resolved` from already-complete upstream steps. So
 * resetting ONLY the resolver's to-run steps back to "pending" and calling
 * runGraphJob re-runs exactly that subgraph while reusing every completed
 * intermediate. The executor's core loop is NOT modified here.
 *
 * Credit isolation: regen debits use credit type `rerun_step` with a
 * description shaped `... (regen <jobId> rev <n>)`. The original-run refund
 * matches type `run_template` + description `%(<jobId>)`, so the two paths can
 * never refund each other.
 */
import type { RegenerationEstimate } from "./regeneration.ts";

export const REGEN_DEBIT_TYPE = "rerun_step";

export function regenDebitDescription(args: {
  jobId: string;
  outputNumber: number | null;
  revision: number;
}) {
  const label = args.outputNumber == null ? "output" : `output #${args.outputNumber}`;
  return `Regenerate ${label} (regen ${args.jobId} rev ${args.revision})`;
}

export function regenRefundDescription(args: {
  jobId: string;
  outputNumber: number | null;
  revision: number;
}) {
  const debit = regenDebitDescription(args);
  return `Refund ${debit.charAt(0).toLowerCase()}${debit.slice(1)}`;
}

export function regenDebitPattern(jobId: string) {
  return `%(regen ${jobId} rev %`;
}

export class RegenerationError extends Error {
  code: string;
  constructor(code: string, message?: string) {
    super(message ?? code);
    this.code = code;
  }
}

type AnyClient = {
  from: (table: string) => any;
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: any; error: any }>;
};

export type RegenerationResult = {
  jobId: string;
  outputNumber: number | null;
  revision: number;
  toRunNodeIds: string[];
  estimatedCredits: number;
  ledgerId: string | null;
  idempotent?: boolean;
};

function ledgerIdOf(rows: unknown) {
  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row || typeof row !== "object") return null;
  const record = row as Record<string, unknown>;
  const value = record.ledger_id ?? record.id ?? null;
  return value ? String(value) : null;
}

/**
 * Refunds any regen debit for this job that has not been refunded yet.
 * Deliberately scoped to `rerun_step` debits carrying the regen marker, so the
 * original run's `run_template` debit is never touched.
 */
export async function refundRegenCreditsIfNeeded(
  admin: AnyClient,
  args: { jobId: string; reason?: string },
) {
  const { data: job, error: jobError } = await admin
    .from("execution_jobs")
    .select("id, user_id, template_id")
    .eq("id", args.jobId)
    .maybeSingle();
  if (jobError) throw new Error(jobError.message);
  if (!job?.user_id) return { refunded: 0 };

  const { data: debits, error: debitError } = await admin
    .from("credit_ledger")
    .select("id, amount, description")
    .eq("user_id", job.user_id)
    .eq("type", REGEN_DEBIT_TYPE)
    .lt("amount", 0)
    .ilike("description", regenDebitPattern(args.jobId));
  if (debitError) throw new Error(debitError.message);
  if (!debits?.length) return { refunded: 0 };

  const { data: refunds, error: refundLookupError } = await admin
    .from("credit_ledger")
    .select("id, description")
    .eq("user_id", job.user_id)
    .eq("type", "refund")
    .ilike("description", `%${regenDebitPattern(args.jobId).slice(1)}`);
  if (refundLookupError) throw new Error(refundLookupError.message);

  const alreadyRefunded = new Set(
    (refunds ?? []).map((row: any) => String(row.description ?? "").toLowerCase()),
  );

  let refunded = 0;
  for (const debit of debits) {
    const description = String(debit.description ?? "");
    const refundDesc = `Refund ${description.charAt(0).toLowerCase()}${description.slice(1)}`;
    if (alreadyRefunded.has(refundDesc.toLowerCase())) continue;

    const amount = Math.abs(Number(debit.amount ?? 0));
    if (!amount) continue;

    const { error } = await admin.rpc("apply_credit_transaction", {
      p_user_id: job.user_id,
      p_amount: amount,
      p_type: "refund",
      p_description: refundDesc,
      p_template_id: job.template_id ?? null,
      p_project_id: null,
      p_step_id: null,
    });
    if (error) throw new Error(error.message);
    refunded += 1;
  }

  return { refunded };
}

/**
 * Executes a per-output regeneration: idempotency check, balance check, debit,
 * revision snapshot, targeted step reset, then re-run of the subgraph.
 */
export async function performOutputRegeneration(
  admin: AnyClient,
  opts: {
    jobId: string;
    estimate: RegenerationEstimate;
    userId: string | null;
    privileged: boolean;
    idempotencyKey?: string | null;
    runGraphJob: (admin: AnyClient, jobId: string) => Promise<unknown>;
  },
): Promise<RegenerationResult> {
  const { data: job, error: jobError } = await admin
    .from("execution_jobs")
    .select("id, user_id, template_id, status, result_payload")
    .eq("id", opts.jobId)
    .maybeSingle();
  if (jobError) throw new Error(jobError.message);
  if (!job) throw new RegenerationError("JOB_NOT_FOUND", "Job not found");

  const resultPayload = (job.result_payload ?? {}) as Record<string, unknown>;
  const receipts = (resultPayload.regen_receipts ?? {}) as Record<string, RegenerationResult>;
  const key = opts.idempotencyKey ? String(opts.idempotencyKey).trim() : "";

  // 3) IDEMPOTENCY — a retry never charges or resets twice.
  if (key && receipts[key]) {
    return { ...receipts[key], idempotent: true };
  }

  const estimate = opts.estimate;
  const outputNumber = estimate.outputNumber ?? null;
  const credits = Math.max(0, Math.round(Number(estimate.estimatedCredits ?? 0)));
  const mustCharge = !opts.privileged && !!job.user_id && credits > 0;

  // 4) CREDITS — balance check before anything mutates.
  if (mustCharge) {
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("credits_balance")
      .eq("user_id", job.user_id)
      .maybeSingle();
    if (profileError) throw new Error(profileError.message);
    const balance = Number(profile?.credits_balance ?? 0);
    if (balance < credits) {
      throw new RegenerationError(
        "INSUFFICIENT_CREDITS",
        `Not enough credits: this regeneration costs ${credits}, balance is ${balance}.`,
      );
    }
  }

  // revision numbering for this output
  const { data: priorRevisions, error: priorError } = await admin
    .from("output_revisions")
    .select("id, revision, output_number")
    .eq("job_id", opts.jobId)
    .order("revision", { ascending: false })
    .limit(100);
  if (priorError) throw new Error(priorError.message);
  const priorForOutput = (priorRevisions ?? [])
    .filter((row: any) =>
      outputNumber == null
        ? row.output_number == null
        : Number(row.output_number) === Number(outputNumber)
    )
    .sort((a: any, b: any) => Number(b.revision ?? 0) - Number(a.revision ?? 0));
  const prior = priorForOutput[0] ?? null;
  const revision = Number(prior?.revision ?? 0) + 1;
  const parentRevisionId = prior?.id ? String(prior.id) : null;

  let ledgerId: string | null = null;
  if (mustCharge) {
    const { data: ledgerRows, error: creditError } = await admin.rpc("apply_credit_transaction", {
      p_user_id: job.user_id,
      p_amount: -credits,
      p_type: REGEN_DEBIT_TYPE,
      p_description: regenDebitDescription({ jobId: opts.jobId, outputNumber, revision }),
      p_template_id: job.template_id ?? null,
      p_project_id: null,
      p_step_id: null,
    });
    if (creditError) throw new Error(creditError.message);
    ledgerId = ledgerIdOf(ledgerRows);
  }

  try {
    // 5) SNAPSHOT then RESET.
    const { data: steps, error: stepsError } = await admin
      .from("execution_steps")
      .select("id, node_id, status, output_asset_id")
      .eq("job_id", opts.jobId)
      .in("node_id", estimate.toRunNodeIds);
    if (stepsError) throw new Error(stepsError.message);

    const targetSteps = steps ?? [];
    const assetIds = targetSteps
      .map((step: any) => step.output_asset_id)
      .filter(Boolean)
      .map(String);

    const assetsById = new Map<string, any>();
    if (assetIds.length) {
      const { data: assets, error: assetsError } = await admin
        .from("assets")
        .select("id, supabase_storage_url, asset_type")
        .in("id", assetIds);
      if (assetsError) throw new Error(assetsError.message);
      for (const asset of assets ?? []) assetsById.set(String(asset.id), asset);
    }

    for (const step of targetSteps) {
      if (step.status !== "complete" || !step.output_asset_id) continue;
      const asset = assetsById.get(String(step.output_asset_id));
      const isTarget = String(step.node_id) === String(estimate.targetNodeId);

      const { error: revisionError } = await admin.from("output_revisions").insert({
        job_id: opts.jobId,
        output_number: isTarget ? outputNumber : null,
        node_id: step.node_id,
        step_id: step.id,
        asset_id: step.output_asset_id,
        output_url: asset?.supabase_storage_url ?? null,
        output_type: asset?.asset_type ?? null,
        revision,
        parent_revision_id: isTarget ? parentRevisionId : null,
        credits_charged: credits,
      });
      if (revisionError) throw new Error(revisionError.message);
    }

    const stepIds = targetSteps.map((step: any) => String(step.id));
    if (stepIds.length) {
      const { error: resetError } = await admin
        .from("execution_steps")
        .update({
          status: "pending",
          provider_request_id: null,
          output_asset_id: null,
          started_at: null,
          completed_at: null,
          error_log: null,
          output_payload: {},
        })
        .in("id", stepIds);
      if (resetError) throw new Error(resetError.message);
    }

    // 6) job back to running + persist the idempotency receipt BEFORE the run.
    const result: RegenerationResult = {
      jobId: opts.jobId,
      outputNumber,
      revision,
      toRunNodeIds: estimate.toRunNodeIds,
      estimatedCredits: credits,
      ledgerId,
    };

    const nextReceipts = key ? { ...receipts, [key]: result } : receipts;
    const { error: jobUpdateError } = await admin
      .from("execution_jobs")
      .update({
        status: "running",
        progress: 0,
        error_log: null,
        completed_at: null,
        result_payload: { ...resultPayload, regen_receipts: nextReceipts },
      })
      .eq("id", opts.jobId);
    if (jobUpdateError) throw new Error(jobUpdateError.message);

    await opts.runGraphJob(admin, opts.jobId);

    return result;
  } catch (error) {
    // 7) REFUND ON FAILURE — only this regen's debit.
    if (mustCharge) {
      try {
        await refundRegenCreditsIfNeeded(admin, { jobId: opts.jobId });
      } catch {
        // refund failure must not mask the original error
      }
    }
    throw error;
  }
}
