/**
 * Multi-step generation plans ("Supercomputer"-style): steps run in parallel where they can,
 * a step can build on an earlier image step's outputs (image -> variations, image -> video),
 * the whole plan is approved once, and one step can be re-run without redoing the rest.
 * Every generation is a normal generate-studio call, so charging/refunds stay there.
 * Plans advance when their status is checked (no background worker).
 */
import type { Admin, AuthContext } from "../auth.ts";
import { FuseError } from "../errors.ts";
import { issueConfirmationToken, sha256Hex, verifyConfirmationToken, type RunPlan } from "../confirm.ts";
import { newConfirmationCode, saveCode } from "./confirm-codes.ts";
import { getAccountCredits } from "./credits.ts";
import { signingSecret } from "./runs.ts";
import { estimateGenerationCredits, type GenKind } from "./prepare-generation.ts";
import { getStandaloneGenerationStatus, startStandaloneGeneration } from "./generate.ts";
import { inChunks } from "./batch.ts";

export const MAX_STEPS = 8;
export const MAX_PLAN_GENERATIONS = 20;
const MAX_STEP_COUNT = 10;

type StepStatus = "pending" | "running" | "complete" | "failed";
export type PlanStep = {
  id: string;
  kind: GenKind;
  prompt: string;
  count: number;
  from_step?: string;
  model?: string;
  duration?: number;
  aspect_ratio?: string;
  reference_image_urls?: string[];
  resolution?: string;
  quality?: string;
  image_size?: string;
  generate_audio?: boolean;
  status: StepStatus;
  generation_ids: string[];
  outputs: string[];
  error?: string;
};

/** Validates and normalizes steps; a step may only build on an EARLIER image step. */
export function normalizeSteps(raw: unknown): PlanStep[] {
  if (!Array.isArray(raw) || raw.length === 0) throw new FuseError("MISSING_INPUT", "steps required", { userMessage: "Describe the steps you want." });
  if (raw.length > MAX_STEPS) throw new FuseError("INVALID_INPUT", `At most ${MAX_STEPS} steps per plan`);
  const seen = new Map<string, PlanStep>();
  const steps = raw.map((r: any, i): PlanStep => {
    const id = String(r?.id ?? `s${i + 1}`).trim() || `s${i + 1}`;
    if (seen.has(id)) throw new FuseError("INVALID_INPUT", `Duplicate step id ${id}`);
    const kind = r?.kind === "video" ? "video" : r?.kind === "image" ? "image" : null;
    const prompt = String(r?.prompt ?? "").trim();
    if (!kind || !prompt) throw new FuseError("INVALID_INPUT", `Step ${id} needs kind (image or video) and a prompt`);
    const from = r?.from_step ? String(r.from_step) : undefined;
    if (from) {
      const up = seen.get(from);
      if (!up) throw new FuseError("INVALID_INPUT", `Step ${id} builds on ${from}, which must be an earlier step`);
      if (up.kind !== "image") throw new FuseError("INVALID_INPUT", `Step ${id} can only build on an image step`);
    }
    const upCount = from ? seen.get(from)!.count : 0;
    const count = Math.min(MAX_STEP_COUNT, Math.max(1, Math.floor(Number(r?.count ?? (upCount || 1))) || 1));
    const step: PlanStep = {
      id, kind, prompt, count, from_step: from,
      model: r?.model, duration: r?.duration, aspect_ratio: r?.aspect_ratio,
      reference_image_urls: Array.isArray(r?.reference_image_urls) ? r.reference_image_urls.map(String) : undefined,
      resolution: r?.resolution, quality: r?.quality, image_size: r?.image_size, generate_audio: r?.generate_audio,
      status: "pending", generation_ids: [], outputs: [],
    };
    seen.set(id, step);
    return step;
  });
  const total = steps.reduce((a, s) => a + s.count, 0);
  if (total > MAX_PLAN_GENERATIONS) throw new FuseError("INVALID_INPUT", `A plan can make at most ${MAX_PLAN_GENERATIONS} images and videos in total (this one makes ${total})`);
  return steps;
}

const stepCredits = (s: PlanStep, privileged: boolean) => (privileged ? 0 : s.count * estimateGenerationCredits(s.kind, s.duration, s.model));

async function issueCode(admin: Admin, auth: AuthContext, binding: string, estimated: number) {
  const plan: RunPlan = {
    user_id: auth.userId!, template_id: "standalone", version_id: "plan", template_slug: "standalone-plan",
    inputs: { prompt_hash: await sha256Hex(binding) }, output_mode: "full_campaign", estimated_credits: estimated, campaign_name: null,
  };
  const token = await issueConfirmationToken(await signingSecret(admin), plan);
  const code = newConfirmationCode();
  await saveCode(admin, { userId: auth.userId!, kind: "generation", code, token: token.token, expiresAt: token.expires_at });
  return { confirmation_token: token.token, confirmation_code: code, confirmation_expires_at: token.expires_at };
}

async function verifyCode(admin: Admin, auth: AuthContext, binding: string, token: unknown, retryTool: string) {
  if (!token) throw new FuseError("CONFIRMATION_REQUIRED", "Confirm the cost before starting", { nextAction: `Call ${retryTool} without a code, show the summary, and continue only after the user approves.` });
  const v = await verifyConfirmationToken(await signingSecret(admin), String(token));
  if (!v.ok) throw new FuseError(v.reason === "expired" ? "CONFIRMATION_EXPIRED" : "CONFIRMATION_MISMATCH");
  if (v.plan.user_id !== auth.userId || v.plan.version_id !== "plan" || v.plan.inputs?.prompt_hash !== (await sha256Hex(binding))) {
    throw new FuseError("CONFIRMATION_MISMATCH", "That code was for a different plan or step");
  }
}

async function loadPlan(admin: Admin, auth: AuthContext, planId: string) {
  if (!auth.userId) throw new FuseError("AUTH_REQUIRED");
  const { data } = await admin.from("mcp_plans").select("*").eq("id", String(planId ?? "")).eq("user_id", auth.userId).maybeSingle();
  if (!data) throw new FuseError("NOT_FOUND", "Plan not found");
  return data as { id: string; title: string; status: string; steps: PlanStep[]; rev: number };
}

/** Optimistic save: returns false if someone else advanced the plan first. */
async function savePlan(admin: Admin, plan: { id: string; rev: number; steps: PlanStep[]; status: string }) {
  const { data } = await admin.from("mcp_plans")
    .update({ steps: plan.steps, status: plan.status, rev: plan.rev + 1, updated_at: new Date().toISOString() })
    .eq("id", plan.id).eq("rev", plan.rev).select("rev").maybeSingle();
  if (data) plan.rev = data.rev;
  return !!data;
}

export async function createPlan(admin: Admin, auth: AuthContext, args: { title?: string; steps: unknown }) {
  if (!auth.userId) throw new FuseError("AUTH_REQUIRED");
  const steps = normalizeSteps(args.steps);
  const title = String(args.title ?? "").trim().slice(0, 120) || "Untitled plan";
  const { data, error } = await admin.from("mcp_plans").insert({ user_id: auth.userId, title, steps }).select("id").single();
  if (error || !data) throw new FuseError("INTERNAL", error?.message ?? "Could not save the plan");
  const perStep = steps.map((s) => stepCredits(s, auth.isPrivileged));
  const total = perStep.reduce((a, b) => a + b, 0);
  const account = await getAccountCredits(admin, auth);
  const code = await issueCode(admin, auth, `run:${data.id}`, total);
  const lines = steps.map((s, i) => `${s.id}: ${s.count} ${s.kind}${s.count > 1 ? "s" : ""}${s.from_step ? ` from ${s.from_step}` : ""} (~${perStep[i]} credits)`);
  return {
    plan_id: data.id,
    title,
    steps: steps.map((s, i) => ({ id: s.id, kind: s.kind, count: s.count, from_step: s.from_step ?? null, prompt: s.prompt, model: s.model ?? null, estimated_credits: perStep[i] })),
    total_generations: steps.reduce((a, s) => a + s.count, 0),
    estimated_credits: total,
    credit_balance: account.credit_balance,
    can_run: account.privileged_no_charge || account.credit_balance >= total,
    confirmation_summary: `Plan "${title}": ${lines.join("; ")}. About ${total} credits in total (balance ${account.credit_balance}). Steps run at the same time where they can. Go ahead? Confirmation code: ${code.confirmation_code}.`,
    ...code,
  };
}

async function startStep(admin: Admin, auth: AuthContext, step: PlanStep, upstream?: PlanStep) {
  const sources = upstream?.outputs ?? [];
  const items = Array.from({ length: step.count }, (_, i) => sources.length ? sources[i % sources.length] : undefined);
  const settled = await inChunks(items, (src) =>
    startStandaloneGeneration(admin, auth, {
      kind: step.kind,
      prompt: step.prompt,
      model: step.model,
      duration: step.duration,
      aspectRatio: step.aspect_ratio,
      resolution: step.resolution,
      quality: step.quality,
      imageSize: step.image_size,
      generateAudio: step.generate_audio,
      imageUrls: step.kind === "image" ? [...(src ? [src] : []), ...(step.reference_image_urls ?? [])] : undefined,
      startImageUrl: step.kind === "video" ? src : undefined,
    }));
  const ids = settled.flatMap((r) => (r.status === "fulfilled" ? [r.value.generation_id] : []));
  const firstErr = settled.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
  return { ids, error: firstErr ? (firstErr.reason instanceof FuseError ? firstErr.reason.code : String(firstErr.reason?.message ?? firstErr.reason)) : undefined };
}

/** One pass: refresh running steps, then start every step whose input is ready. */
async function advance(admin: Admin, auth: AuthContext, planId: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const plan = await loadPlan(admin, auth, planId);
    if (plan.status === "draft" || plan.status === "complete" || plan.status === "failed") return plan;
    const byId = new Map(plan.steps.map((s) => [s.id, s]));

    // 1) refresh running steps
    for (const s of plan.steps.filter((s) => s.status === "running" && s.generation_ids.length)) {
      const st = await inChunks(s.generation_ids, (id) => getStandaloneGenerationStatus(admin, auth, id));
      const gens = st.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
      if (gens.some((g) => g.status === "queued" || g.status === "running")) continue;
      s.outputs = gens.filter((g) => g.status === "complete" && g.output_url).map((g) => g.output_url as string);
      s.status = s.outputs.length ? "complete" : "failed";
      if (!s.outputs.length) s.error = gens.find((g) => g.public_failure)?.public_failure ?? "All generations in this step failed";
    }

    // 2) claim steps that can start now (claim is saved before spending, so two polls never double-start)
    const ready = plan.steps.filter((s) => {
      if (s.status !== "pending") return false;
      if (!s.from_step) return true;
      const up = byId.get(s.from_step)!;
      if (up.status === "failed") { s.status = "failed"; s.error = `Skipped: ${up.id} failed`; return false; }
      return up.status === "complete";
    });
    ready.forEach((s) => { s.status = "running"; s.generation_ids = []; });
    plan.status = plan.steps.every((s) => s.status === "complete" || s.status === "failed")
      ? (plan.steps.some((s) => s.status === "failed") ? "failed" : "complete")
      : "running";
    if (!(await savePlan(admin, plan))) continue; // someone else advanced it; retry on fresh state
    if (!ready.length) return plan;

    // 3) start claimed steps in parallel and record their generation ids
    const started = await Promise.all(ready.map((s) => startStep(admin, auth, s, s.from_step ? byId.get(s.from_step) : undefined)));
    for (let tries = 0; tries < 3; tries++) {
      const fresh = await loadPlan(admin, auth, planId);
      ready.forEach((s, i) => {
        const f = fresh.steps.find((x) => x.id === s.id)!;
        f.generation_ids = started[i].ids;
        if (!started[i].ids.length) { f.status = "failed"; f.error = started[i].error ?? "Could not start"; }
        else if (started[i].error) f.error = `${s.count - started[i].ids.length} of ${s.count} could not start (${started[i].error})`;
      });
      if (await savePlan(admin, fresh)) return fresh;
    }
    return await loadPlan(admin, auth, planId);
  }
  return await loadPlan(admin, auth, planId);
}

async function chargedSoFar(admin: Admin, auth: AuthContext, steps: PlanStep[]) {
  const ids = steps.flatMap((s) => s.generation_ids);
  if (!ids.length) return 0;
  const { data } = await admin.from("studio_generations").select("charged_credits, credits_refunded").eq("user_id", auth.userId!).in("id", ids);
  return (data ?? []).reduce((a: number, r: any) => a + (r.credits_refunded ? 0 : Number(r.charged_credits ?? 0)), 0);
}

async function view(admin: Admin, auth: AuthContext, plan: Awaited<ReturnType<typeof loadPlan>>) {
  const done = plan.steps.filter((s) => s.status === "complete").length;
  return {
    plan_id: plan.id,
    title: plan.title,
    status: plan.status,
    steps_complete: done,
    steps_total: plan.steps.length,
    credits_used_so_far: await chargedSoFar(admin, auth, plan.steps),
    steps: plan.steps.map((s) => ({ id: s.id, kind: s.kind, count: s.count, from_step: s.from_step ?? null, prompt: s.prompt, status: s.status, outputs: s.outputs, error: s.error ?? null })),
    next_poll_after_seconds: plan.status === "running" ? 15 : null,
  };
}

export async function runPlan(admin: Admin, auth: AuthContext, planId: string, token: unknown, requireConfirmation: boolean) {
  const plan = await loadPlan(admin, auth, planId);
  if (requireConfirmation) await verifyCode(admin, auth, `run:${plan.id}`, token, "fuse_create_plan");
  if (plan.status === "draft") {
    plan.status = "running";
    if (!(await savePlan(admin, plan))) throw new FuseError("CONFLICT", "The plan is already starting");
  }
  return await view(admin, auth, await advance(admin, auth, plan.id));
}

export async function getPlanStatus(admin: Admin, auth: AuthContext, planId: string) {
  return await view(admin, auth, await advance(admin, auth, planId));
}

/** Re-run one step (optionally with a new prompt/model) and, if asked, the steps built on it. */
export async function rerunStep(admin: Admin, auth: AuthContext, args: { plan_id: string; step_id: string; prompt?: string; model?: string; include_downstream?: boolean; confirmation_token?: unknown }, requireConfirmation: boolean) {
  const plan = await loadPlan(admin, auth, args.plan_id);
  if (plan.status === "draft") throw new FuseError("INVALID_INPUT", "Run the plan first with fuse_run_plan");
  const target = plan.steps.find((s) => s.id === String(args.step_id));
  if (!target) throw new FuseError("NOT_FOUND", `No step ${args.step_id} in this plan`);
  if (target.status === "running" || plan.steps.some((s) => s.status === "running" && s.from_step === target.id)) {
    throw new FuseError("INVALID_INPUT", "Wait for that step to finish before re-running it");
  }
  const affected = new Set([target.id]);
  if (args.include_downstream) for (const s of plan.steps) if (s.from_step && affected.has(s.from_step)) affected.add(s.id);
  const newPrompt = String(args.prompt ?? "").trim() || target.prompt;
  const newModel = args.model || target.model;
  const changed = plan.steps.filter((s) => affected.has(s.id)).map((s) => (s.id === target.id ? { ...s, prompt: newPrompt, model: newModel } : s));
  const estimated = changed.reduce((a, s) => a + stepCredits(s, auth.isPrivileged), 0);
  const binding = `rerun:${plan.id}:${[...affected].join(",")}:${newPrompt}:${newModel ?? ""}`;

  if (requireConfirmation && !args.confirmation_token) {
    const account = await getAccountCredits(admin, auth);
    const code = await issueCode(admin, auth, binding, estimated);
    return {
      needs_confirmation: true,
      plan_id: plan.id,
      steps_to_rerun: [...affected],
      estimated_credits: estimated,
      credit_balance: account.credit_balance,
      confirmation_summary: `Re-run ${[...affected].join(", ")} for about ${estimated} credits (balance ${account.credit_balance}). Go ahead? Confirmation code: ${code.confirmation_code}.`,
      ...code,
    };
  }
  if (requireConfirmation) await verifyCode(admin, auth, binding, args.confirmation_token, "fuse_rerun_plan_step");

  for (const s of plan.steps) {
    if (!affected.has(s.id)) continue;
    if (s.id === target.id) { s.prompt = newPrompt; s.model = newModel; }
    Object.assign(s, { status: "pending", generation_ids: [], outputs: [], error: undefined });
  }
  plan.status = "running";
  if (!(await savePlan(admin, plan))) throw new FuseError("CONFLICT", "The plan changed — check its status and try again");
  return await view(admin, auth, await advance(admin, auth, plan.id));
}

/** Self-check: deno run supabase/functions/fuse-mcp/core/plans.ts */
if (import.meta.main) {
  const s = normalizeSteps([
    { id: "shots", kind: "image", prompt: "hoodie on model", count: 4 },
    { id: "clips", kind: "video", prompt: "slow push in", from_step: "shots", count: 2 },
    { kind: "image", prompt: "flat lay" },
  ]);
  console.assert(s[1].count === 2 && s[1].from_step === "shots" && s[2].id === "s3" && s[2].count === 1, "normalize");
  const bad = (steps: unknown) => { try { normalizeSteps(steps); return false; } catch { return true; } };
  console.assert(bad([{ id: "a", kind: "video", prompt: "x", from_step: "b" }, { id: "b", kind: "image", prompt: "y" }]), "forward ref rejected");
  console.assert(bad([{ id: "v", kind: "video", prompt: "x" }, { kind: "video", prompt: "y", from_step: "v" }]), "video upstream rejected");
  console.assert(bad(Array.from({ length: 3 }, (_, i) => ({ id: `x${i}`, kind: "image", prompt: "p", count: 10 }))), "total cap");
  const inherit = normalizeSteps([{ id: "a", kind: "image", prompt: "p", count: 3 }, { kind: "video", prompt: "q", from_step: "a" }]);
  console.assert(inherit[1].count === 3, "count inherits from upstream");
  console.log("plans self-check ok");
}
