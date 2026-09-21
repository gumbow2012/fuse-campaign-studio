/**
 * Runs: prepare (dry run, no credits) → confirmation token → start (idempotent,
 * credits charged by the existing runner as the user) → status → history.
 * The paid path is the unchanged `start-template-run` function, called with the
 * user's own token. This layer never bypasses credits.
 */
import { buildJobStatusResponse } from "../../_shared/job-status.ts";
import { getTemplateCreditCost, countTemplateDeliverables } from "../../_shared/template-pricing.ts";
import { resolveRunEconomics } from "../../_shared/creatorSurcharge.ts";
import { resolveDisplayUrl } from "../../_shared/asset-access.ts";
import type { Admin, AuthContext } from "../auth.ts";
import { withUserToken } from "../auth.ts";
import { FuseError } from "../errors.ts";
import { issueConfirmationToken, planHash, verifyConfirmationToken, type RunPlan } from "../confirm.ts";
import { inputsFor, loadTemplate } from "./templates.ts";
import { canRun, getAccountCredits } from "./credits.ts";
import { draftInputs } from "./uploads.ts";
import { campaignName, requireOwnedJob } from "./outputs.ts";

const SITE = "https://fuse-us.com";
export type OutputMode = "images_only" | "video_only" | "full_campaign";

async function signingSecret(admin: Admin): Promise<string> {
  const { data } = await admin.from("service_config").select("value").eq("key", "mcp_signing_secret").maybeSingle();
  const v = (data as any)?.value;
  if (!v) throw new FuseError("INTERNAL", "mcp_signing_secret missing");
  return String(v);
}

function slugOf(t: Awaited<ReturnType<typeof loadTemplate>>) {
  return t.row.slug ?? t.row.id;
}

export type RunPlanArgs = {
  template_slug: string;
  campaign_draft_id?: string;
  inputs?: Record<string, string>;
  campaign_name?: string;
  output_mode?: OutputMode;
};

/** Build and validate a run plan. No credits, no confirmation token. */
export async function buildRunPlan(admin: Admin, auth: AuthContext, args: RunPlanArgs) {
  if (!auth.userId) throw new FuseError("AUTH_REQUIRED");
  const t = await loadTemplate(admin, { slug: args.template_slug }, auth.isPrivileged);
  const { required, optional, slotKeys } = inputsFor(t);
  const issues: Array<{ code: string; message: string }> = [];

  let inputs: Record<string, string> = {};
  let draftName: string | null = null;
  if (args.campaign_draft_id) {
    const d = await draftInputs(admin, auth, args.campaign_draft_id);
    if (d.session.template_id !== t.row.id) throw new FuseError("INVALID_INPUT", "The draft belongs to a different campaign template");
    inputs = { ...d.inputs };
    draftName = d.session.campaign_name ?? null;
  }
  for (const [k, v] of Object.entries(args.inputs ?? {})) {
    if (!slotKeys.includes(k)) throw new FuseError("INVALID_INPUT", `Unknown input ${k}`, { nextAction: `Inputs: ${slotKeys.join(", ")}` });
    if (!/^https:\/\//.test(String(v))) throw new FuseError("INVALID_INPUT", `Input ${k} must be an https URL of an attached asset`);
    inputs[k] = String(v);
  }
  const missing = required.filter((i) => !inputs[i.key]);
  for (const m of missing) issues.push({ code: "MISSING_INPUT", message: `Upload ${m.label} (${m.key}) before running.` });

  const targets = new Set(t.edges.map((e: any) => e.target_node_id));
  const exec = t.nodes.filter((n: any) => n.node_type !== "user_input" && n.node_type !== "prompt" && targets.has(n.id));
  const counts = countTemplateDeliverables(exec);
  const mode: OutputMode = args.output_mode ?? "full_campaign";
  if (mode !== "full_campaign") {
    const effectivelyImages = mode === "images_only" && counts.videoOutputs === 0;
    const effectivelyVideo = mode === "video_only" && counts.imageOutputs === 0;
    if (!effectivelyImages && !effectivelyVideo) {
      issues.push({
        code: "NOT_SUPPORTED",
        message: `FUSE templates generate their images and clips together; ${mode.replace("_", "-")} runs aren't available yet. Prepare with output_mode "full_campaign" to get ${counts.imageOutputs} images + ${counts.videoOutputs} clips.`,
      });
    }
  }

  const base = getTemplateCreditCost(t.row.name, counts);
  const economics = await resolveRunEconomics(admin as any, t.row.id);
  const surcharge = economics.monetized && economics.creatorId !== auth.userId ? economics.surchargeCredits : 0;
  const estimated = auth.isPrivileged ? 0 : base + surcharge;
  const account = await getAccountCredits(admin, auth);
  const affordability = canRun(account, estimated);
  if (!affordability.can_run) issues.push({ code: "INSUFFICIENT_CREDITS", message: `This campaign needs ${estimated} credits and you have ${account.credit_balance}. ${affordability.recommended_action}` });

  const name = (args.campaign_name ?? draftName ?? null)?.replace(/[<>{}\\]/g, "").replace(/\s+/g, " ").trim().slice(0, 80) || null;
  const ready = issues.length === 0;
  const plan: RunPlan = {
    user_id: auth.userId,
    template_id: t.row.id,
    version_id: t.versionId,
    template_slug: slugOf(t),
    inputs,
    output_mode: "full_campaign",
    estimated_credits: estimated,
    campaign_name: name,
  };
  return { ready, issues, plan, counts, account, estimated, template: t, required, optional, base, surcharge, affordability, name };
}

/** Validate a run before consuming credits. Returns a confirmation token when ready. */
export async function prepareCampaignRun(admin: Admin, auth: AuthContext, args: RunPlanArgs) {
  const built = await buildRunPlan(admin, auth, args);
  const { ready, issues, plan, counts, account, estimated, template: t, required, optional, base, surcharge, affordability, name } = built;
  const confirmation = ready ? await issueConfirmationToken(await signingSecret(admin), plan) : null;
  const summary = ready
    ? `Template: ${t.meta?.public_name ?? t.row.name}. Uploads: ${Object.keys(plan.inputs).length} attached. You get: ${counts.imageOutputs} images + ${counts.videoOutputs} clips. Credits: ${estimated === 0 ? "none (no charge on your account)" : `${estimated} (about ${estimated >= 945 ? "one campaign" : "part of a campaign"} worth)`}. Balance: ${account.credit_balance}. Run this campaign?`
    : `Not ready: ${issues.map((i) => i.message).join(" ")}`;
  return {
    ready,
    template: { slug: slugOf(t), name: t.meta?.public_name ?? t.row.name, version_id: t.versionId },
    campaign_name: name,
    required_inputs_status: required.map((i) => ({ key: i.key, label: i.label, attached: !!plan.inputs[i.key] })),
    optional_inputs_status: optional.map((i) => ({ key: i.key, label: i.label, attached: !!plan.inputs[i.key] })),
    estimated_outputs: { images_count: counts.imageOutputs, clips_count: counts.videoOutputs },
    estimated_credits: estimated,
    credits_breakdown: { base, creator_surcharge: surcharge },
    plan: account.plan,
    credit_balance: account.credit_balance,
    can_run: affordability.can_run,
    issues,
    confirmation_summary: summary,
    confirmation_token: confirmation?.token ?? null,
    confirmation_expires_at: confirmation?.expires_at ?? null,
    credits_will_be_consumed: ready && estimated > 0,
  };
}


/** Start a prepared run. Same idempotency key or same token → the existing run, no second charge. */
export async function startCampaignRun(admin: Admin, auth: AuthContext, args: { confirmation_token: string; idempotency_key?: string; campaign_name?: string }) {
  if (!auth.userId) throw new FuseError("AUTH_REQUIRED");
  if (!args.confirmation_token) throw new FuseError("CONFIRMATION_REQUIRED");
  const verified = await verifyConfirmationToken(await signingSecret(admin), args.confirmation_token);
  if (!verified.ok) {
    if (verified.reason === "expired") throw new FuseError("CONFIRMATION_EXPIRED");
    throw new FuseError("CONFIRMATION_MISMATCH", `Token ${verified.reason}`);
  }
  const plan = verified.plan;
  if (plan.user_id !== auth.userId) throw new FuseError("CONFIRMATION_MISMATCH", "Token issued to another account");
  if ((await planHash(plan)) !== plan.h) throw new FuseError("CONFIRMATION_MISMATCH");

  const idem = args.idempotency_key?.trim() || plan.h;
  const { data: existing } = await admin.from("mcp_run_requests").select("job_id,response").eq("user_id", auth.userId).eq("idempotency_key", idem).maybeSingle();
  if ((existing as any)?.job_id) return { ...(existing as any).response, idempotent_replay: true };
  const { data: byToken } = await admin.from("mcp_run_requests").select("job_id,response").eq("confirmation_hash", plan.h).maybeSingle();
  if ((byToken as any)?.job_id) return { ...(byToken as any).response, idempotent_replay: true };

  // Claim the (user, key) and the token BEFORE calling the runner so a concurrent retry cannot double-charge.
  const { error: claimError } = await admin.from("mcp_run_requests").insert({ user_id: auth.userId, idempotency_key: idem, confirmation_hash: plan.h });
  if (claimError) {
    const { data: raced } = await admin.from("mcp_run_requests").select("job_id,response").eq("user_id", auth.userId).eq("idempotency_key", idem).maybeSingle();
    if ((raced as any)?.job_id) return { ...(raced as any).response, idempotent_replay: true };
    throw new FuseError("CONFLICT", "A run with this confirmation is already starting", { retryable: true, nextAction: "Wait a few seconds and call fuse_get_user_campaign_history." });
  }

  try {
    const result = await withUserToken(admin, auth, async (token) => {
      const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/start-template-run`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "" },
        body: JSON.stringify({ versionId: plan.version_id, inputs: plan.inputs, idempotencyKey: idem }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 402 || body?.code === "INSUFFICIENT_CREDITS") {
        throw new FuseError("INSUFFICIENT_CREDITS", "Runner refused: insufficient credits", { details: { required: body.required, balance: body.balance } });
      }
      if (!res.ok || !body?.jobId) throw new FuseError("GENERATION_FAILED", String(body?.error ?? `Runner HTTP ${res.status}`), { retryable: true });
      return body as { jobId: string; status: string };
    });
    const name = args.campaign_name?.trim() || plan.campaign_name;
    if (name) await admin.from("campaign_names").upsert({ job_id: result.jobId, user_id: auth.userId, name: name.slice(0, 80) });
    const response = {
      run_id: result.jobId,
      campaign_name: name ?? null,
      template_slug: plan.template_slug,
      status: "queued",
      estimated_outputs: await estimatedOutputs(admin, plan.version_id),
      credits_reserved: plan.estimated_credits,
      status_url: `${SITE}/app/templates?run=${result.jobId}`,
      editor_url: `${SITE}/app/templates?run=${result.jobId}`,
      next_poll_after_seconds: 20,
    };
    await admin.from("mcp_run_requests").update({ job_id: result.jobId, response }).eq("user_id", auth.userId).eq("idempotency_key", idem);
    return response;
  } catch (error) {
    // Free the claim so the user can retry after a real failure (nothing was started).
    await admin.from("mcp_run_requests").delete().eq("user_id", auth.userId).eq("idempotency_key", idem).is("job_id", null);
    throw error;
  }
}

async function estimatedOutputs(admin: Admin, versionId: string) {
  const [{ data: nodes }, { data: edges }] = await Promise.all([
    admin.from("nodes").select("id,node_type,prompt_config").eq("version_id", versionId),
    admin.from("edges").select("target_node_id").eq("version_id", versionId),
  ]);
  const targets = new Set((edges ?? []).map((e: any) => e.target_node_id));
  const counts = countTemplateDeliverables((nodes ?? []).filter((n: any) => n.node_type !== "user_input" && n.node_type !== "prompt" && targets.has(n.id)));
  return { images_count: counts.imageOutputs, clips_count: counts.videoOutputs };
}

const PUBLIC_STATUS: Record<string, string> = { queued: "queued", running: "running", complete: "complete", failed: "failed", cancelled: "cancelled" };

export async function getRunStatus(admin: Admin, auth: AuthContext, runId: string) {
  const job = await requireOwnedJob(admin, auth, runId);
  const detail: any = await buildJobStatusResponse(admin, runId, false, auth.isPrivileged ? job.user_id : auth.userId);
  const outputs = (detail.outputs ?? []) as any[];
  const expected = await estimatedOutputs(admin, job.version_id);
  const expectedCount = expected.images_count + expected.clips_count;
  const steps = (detail.steps ?? []) as any[];
  const failedCount = steps.filter((s) => s.status === "failed").length;
  const readyCount = outputs.filter((o) => o.url).length;
  const rawStatus = String(detail.status ?? job.status);
  const status = rawStatus === "complete" && failedCount > 0
    ? "partially_complete"
    : rawStatus === "failed" && readyCount > 0
      ? "partially_complete"
      : PUBLIC_STATUS[rawStatus] ?? rawStatus;
  const previews = [];
  for (const o of outputs.slice(0, 6)) {
    previews.push({ output_id: o.stepId ?? null, type: o.type, preview_url: await resolveDisplayUrl(admin, o.url, 1800) });
  }
  const { data: charged } = await admin.from("credit_ledger").select("amount").eq("user_id", job.user_id).eq("template_id", job.template_id).ilike("description", `%${runId}%`);
  const creditsCharged = (charged ?? []).reduce((acc: number, r: any) => acc + Number(r.amount ?? 0), 0);
  return {
    run_id: runId,
    campaign_name: await campaignName(admin, runId, job),
    template_slug: job.fuse_templates?.slug ?? null,
    status,
    progress_percent: Math.max(0, Math.min(100, Number(detail.progress ?? job.progress ?? 0))),
    current_stage: detail.statusMessage ?? detail.message ?? null,
    outputs_ready_count: readyCount,
    outputs_expected_count: expectedCount,
    failed_outputs_count: failedCount,
    credits_charged: Math.abs(creditsCharged),
    outputs_preview: previews,
    editor_url: `${SITE}/app/templates?run=${runId}`,
    download_all_url: null,
    issues: detail.failure?.title ? [{ code: "GENERATION_FAILED", message: `${detail.failure.title}. ${detail.failure.detail ?? ""}`.trim() }] : [],
    next_poll_after_seconds: status === "queued" || status === "running" ? 20 : null,
  };
}

export async function cancelRun(admin: Admin, auth: AuthContext, runId: string) {
  const job = await requireOwnedJob(admin, auth, runId);
  if (job.status !== "queued" && job.status !== "running") {
    return { run_id: runId, cancelled: false, refund_credits_status: "not_applicable", message: `This run is already ${job.status}.` };
  }
  return {
    run_id: runId,
    cancelled: false,
    refund_credits_status: "automatic_for_failed_outputs",
    message: "FUSE can't stop a campaign once generation has started — the providers are already rendering. Any output that fails to generate is refunded automatically, and completed outputs are yours.",
  };
}

export async function getCampaignHistory(admin: Admin, auth: AuthContext, args: { limit?: number; status?: string }) {
  if (!auth.userId) throw new FuseError("AUTH_REQUIRED");
  const limit = Math.max(1, Math.min(50, Number(args.limit ?? 10)));
  let q = admin
    .from("execution_jobs")
    .select("id,status,started_at,completed_at,progress,template_id,fuse_templates!execution_jobs_template_id_fkey(name,slug)")
    .eq("user_id", auth.userId)
    .order("started_at", { ascending: false })
    .limit(limit);
  if (args.status) q = q.eq("status", args.status);
  const { data: jobs } = await q;
  const ids = (jobs ?? []).map((j: any) => j.id);
  const thumbById = new Map<string, string>();
  const countById = new Map<string, number>();
  if (ids.length) {
    const { data: steps } = await admin
      .from("execution_steps")
      .select("job_id,status,output_asset_id,assets!execution_steps_output_asset_id_fkey(supabase_storage_url,asset_type)")
      .in("job_id", ids)
      .eq("status", "complete");
    for (const s of steps ?? []) {
      const st = s as any;
      countById.set(st.job_id, (countById.get(st.job_id) ?? 0) + 1);
      const url = st.assets?.supabase_storage_url;
      if (url && !thumbById.has(st.job_id) && !/\.(mp4|webm|mov)($|\?)/i.test(url)) thumbById.set(st.job_id, url);
    }
  }
  const campaigns = [];
  for (const j of jobs ?? []) {
    const job = j as any;
    campaigns.push({
      run_id: job.id,
      campaign_name: await campaignName(admin, job.id, job),
      template_slug: job.fuse_templates?.slug ?? null,
      created_at: job.started_at,
      status: PUBLIC_STATUS[job.status] ?? job.status,
      thumbnail_url: thumbById.has(job.id) ? await resolveDisplayUrl(admin, thumbById.get(job.id)!, 1800) : null,
      outputs_count: countById.get(job.id) ?? 0,
      editor_url: `${SITE}/app/templates?run=${job.id}`,
    });
  }
  return { campaigns, count: campaigns.length };
}
