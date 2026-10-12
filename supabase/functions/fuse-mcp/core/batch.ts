/**
 * Batch generation: many images/videos from one request, one confirmation.
 * Each item is a normal generate-studio call (charge, refund and storage stay there);
 * this file only fans out, totals the estimate and binds the confirmation to the item list.
 */
import type { Admin, AuthContext } from "../auth.ts";
import { FuseError } from "../errors.ts";
import { issueConfirmationToken, sha256Hex, verifyConfirmationToken, type RunPlan } from "../confirm.ts";
import { newConfirmationCode, saveCode } from "./confirm-codes.ts";
import { getAccountCredits } from "./credits.ts";
import { signingSecret } from "./runs.ts";
import { estimateGenerationCredits, type GenKind } from "./prepare-generation.ts";
import { getStandaloneGenerationStatus, startStandaloneGeneration } from "./generate.ts";

export const MAX_BATCH = 10;
const PARALLEL = 5; // ponytail: fixed fan-out width; raise if fal/generate-studio throughput allows

export type BatchItem = {
  kind: GenKind;
  prompt: string;
  model?: string;
  duration?: number;
  aspect_ratio?: string;
  reference_image_urls?: string[];
  start_image_url?: string;
  end_image_url?: string;
  resolution?: string;
  quality?: string;
  image_size?: string;
  generate_audio?: boolean;
};

export function normalizeItems(raw: unknown): BatchItem[] {
  if (!Array.isArray(raw) || raw.length === 0) throw new FuseError("MISSING_INPUT", "items required", { userMessage: "List what you want to generate." });
  if (raw.length > MAX_BATCH) throw new FuseError("INVALID_INPUT", `At most ${MAX_BATCH} items per batch`, { userMessage: `I can start up to ${MAX_BATCH} at once — split the rest into another batch.` });
  return raw.map((r: any, i) => {
    const kind = r?.kind === "video" ? "video" : r?.kind === "image" ? "image" : null;
    const prompt = String(r?.prompt ?? "").trim();
    if (!kind || !prompt) throw new FuseError("INVALID_INPUT", `Item ${i + 1} needs kind (image or video) and a prompt`);
    return { ...r, kind, prompt } as BatchItem;
  });
}

/** Binds a confirmation to the exact list (order, kind, prompt) — same strictness as the single-item flow. */
const itemsHash = (items: BatchItem[]) => sha256Hex(JSON.stringify(items.map((i) => [i.kind, i.prompt])));

export async function prepareBatch(admin: Admin, auth: AuthContext, rawItems: unknown) {
  if (!auth.userId) throw new FuseError("AUTH_REQUIRED");
  const items = normalizeItems(rawItems);
  const perItem = items.map((i) => (auth.isPrivileged ? 0 : estimateGenerationCredits(i.kind, i.duration, i.model)));
  const total = perItem.reduce((a, b) => a + b, 0);
  const account = await getAccountCredits(admin, auth);
  const can_run = account.privileged_no_charge || account.credit_balance >= total;
  const plan: RunPlan = {
    user_id: auth.userId,
    template_id: "standalone",
    version_id: "batch",
    template_slug: "standalone-batch",
    inputs: { prompt_hash: await itemsHash(items) },
    output_mode: "full_campaign",
    estimated_credits: total,
    campaign_name: null,
  };
  const token = await issueConfirmationToken(await signingSecret(admin), plan);
  const code = newConfirmationCode();
  await saveCode(admin, { userId: auth.userId, kind: "generation", code, token: token.token, expiresAt: token.expires_at });
  const images = items.filter((i) => i.kind === "image").length;
  const videos = items.length - images;
  const what = [images && `${images} image${images > 1 ? "s" : ""}`, videos && `${videos} video${videos > 1 ? "s" : ""}`].filter(Boolean).join(" and ");
  return {
    ready: can_run,
    count: items.length,
    items: items.map((i, n) => ({ index: n, kind: i.kind, prompt: i.prompt, model: i.model ?? null, estimated_credits: perItem[n] })),
    estimated_credits: total,
    credit_balance: account.credit_balance,
    can_run,
    confirmation_summary: `Generate ${what} at the same time for about ${total} credits in total (balance ${account.credit_balance}). Go ahead? Confirmation code: ${code}.`,
    confirmation_token: token.token,
    confirmation_code: code,
    confirmation_expires_at: token.expires_at,
  };
}

export async function verifyBatchToken(admin: Admin, auth: AuthContext, items: BatchItem[], token: unknown) {
  if (!token) {
    throw new FuseError("CONFIRMATION_REQUIRED", "Confirm the batch before starting", {
      nextAction: "Call fuse_prepare_batch, show the confirmation_summary to the user, and start only after they explicitly confirm.",
    });
  }
  const v = await verifyConfirmationToken(await signingSecret(admin), String(token));
  if (!v.ok) throw new FuseError(v.reason === "expired" ? "CONFIRMATION_EXPIRED" : "CONFIRMATION_MISMATCH");
  if (v.plan.user_id !== auth.userId || v.plan.version_id !== "batch" || v.plan.inputs?.prompt_hash !== (await itemsHash(items))) {
    throw new FuseError("CONFIRMATION_MISMATCH", "The batch changed after it was confirmed", { nextAction: "Call fuse_prepare_batch again with the exact list." });
  }
}

async function inChunks<T, R>(list: T[], fn: (t: T, i: number) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const out: PromiseSettledResult<R>[] = [];
  for (let i = 0; i < list.length; i += PARALLEL) {
    out.push(...(await Promise.allSettled(list.slice(i, i + PARALLEL).map((t, j) => fn(t, i + j)))));
  }
  return out;
}

const reason = (r: PromiseRejectedResult) => (r.reason instanceof FuseError ? r.reason.code : String(r.reason?.message ?? r.reason));

export async function startBatch(admin: Admin, auth: AuthContext, items: BatchItem[]) {
  const settled = await inChunks(items, (i) =>
    startStandaloneGeneration(admin, auth, {
      kind: i.kind,
      prompt: i.prompt,
      model: i.model,
      duration: i.duration,
      aspectRatio: i.aspect_ratio,
      imageUrls: i.reference_image_urls,
      startImageUrl: i.start_image_url,
      endImageUrl: i.end_image_url,
      resolution: i.resolution,
      quality: i.quality,
      imageSize: i.image_size,
      generateAudio: i.generate_audio,
    }));
  const results = settled.map((r, index) =>
    r.status === "fulfilled"
      ? { index, kind: items[index].kind, prompt: items[index].prompt, generation_id: r.value.generation_id, status: r.value.status }
      : { index, kind: items[index].kind, prompt: items[index].prompt, generation_id: null, status: "not_started", error: reason(r) });
  const started = results.filter((r) => r.generation_id);
  return {
    started: started.length,
    failed_to_start: results.length - started.length,
    generation_ids: started.map((r) => r.generation_id),
    results,
    next_poll_after_seconds: 15,
  };
}

export async function getBatchStatus(admin: Admin, auth: AuthContext, ids: unknown) {
  const list = (Array.isArray(ids) ? ids : []).map(String).filter(Boolean).slice(0, MAX_BATCH * 2);
  if (!list.length) throw new FuseError("MISSING_INPUT", "generation_ids required");
  const settled = await inChunks(list, (id) => getStandaloneGenerationStatus(admin, auth, id));
  const generations = settled.map((r, i) => (r.status === "fulfilled" ? r.value : { generation_id: list[i], status: "unknown", error: reason(r) }));
  const pending = generations.filter((g: any) => g.status === "queued" || g.status === "running").length;
  return {
    total: generations.length,
    complete: generations.filter((g: any) => g.status === "complete").length,
    pending,
    failed: generations.filter((g: any) => g.status === "failed" || g.status === "canceled").length,
    generations,
    next_poll_after_seconds: pending ? 15 : null,
  };
}

/** Self-check: deno run supabase/functions/fuse-mcp/core/batch.ts */
if (import.meta.main) {
  const items = normalizeItems([{ kind: "image", prompt: " a " }, { kind: "video", prompt: "b", duration: 5 }]);
  console.assert(items[0].prompt === "a" && items[1].kind === "video", "normalize");
  let threw = false;
  try { normalizeItems(Array.from({ length: MAX_BATCH + 1 }, () => ({ kind: "image", prompt: "x" }))); } catch { threw = true; }
  console.assert(threw, "cap");
  console.assert((await itemsHash(items)) !== (await itemsHash([...items].reverse())), "order-bound");
  console.log("batch self-check ok");
}
