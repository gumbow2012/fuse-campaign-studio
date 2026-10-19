/**
 * Hat Brand Film — runtime for automatic product checks. Same provider
 * pattern as analyze-campaign-photography (GoogleGenAI + GEMINI_API_KEY,
 * structured JSON, temperature 0). Opt-in: only called for Hat Brand Film
 * clip nodes. Jewelry/photography analyzers are untouched.
 *
 * Never passes on doubt: a missing key, network error, invalid JSON or low
 * confidence returns needs_review (or a retry), never "animate".
 */
import { GoogleGenAI } from "https://esm.sh/@google/genai@1.29.0";
import { HAT_FILM_SHOTS } from "./hat-film-recipe.ts";
import type { HatFilmRunContext } from "./hat-film-prompts.ts";
import {
  applyCheck, brimConflicts, decideAfterCheck, emptyShotQa, HAT_FILM_QA_KEY, judgeStill, normalizeReferenceProfile, parseQa,
  REFERENCE_PROMPT, REFERENCE_SCHEMA, STILL_PROMPT, STILL_SCHEMA, type HatFilmQaState, type StillReport, type Verdict,
} from "./hat-film-qa.ts";
import { resolveExecutionUrls } from "./asset-access.ts";

// deno-lint-ignore no-explicit-any
type Admin = any;
const MODEL = Deno.env.get("GEMINI_ANALYSIS_MODEL")?.trim() || "gemini-3.6-flash";
const FETCH_TIMEOUT_MS = 20_000;

function b64(bytes: Uint8Array) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

async function inline(url: string) {
  const abort = new AbortController();
  const t = setTimeout(() => abort.abort(), FETCH_TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: abort.signal });
    if (!r.ok) throw new Error(`image fetch ${r.status}`);
    const mimeType = (r.headers.get("content-type") ?? "image/jpeg").split(";")[0].trim();
    if (!/^image\//.test(mimeType)) throw new Error("not an image");
    return { inlineData: { mimeType, data: b64(new Uint8Array(await r.arrayBuffer())) } };
  } finally { clearTimeout(t); }
}

async function ask(admin: Admin, prompt: string, schema: unknown, urls: string[]): Promise<unknown> {
  const apiKey = Deno.env.get("GEMINI_API_KEY")?.trim();
  if (!apiKey) throw Object.assign(new Error("analysis key not configured"), { unavailable: true });
  const signed = (await resolveExecutionUrls(admin, urls)) as string[];
  const parts = await Promise.all(signed.map(inline));
  const ai = new GoogleGenAI({ apiKey });
  const res = await ai.models.generateContent({
    model: MODEL,
    // deno-lint-ignore no-explicit-any
    contents: [{ role: "user", parts: [{ text: prompt }, ...parts] }] as any,
    // deno-lint-ignore no-explicit-any
    config: { responseMimeType: "application/json", responseSchema: schema as any, maxOutputTokens: 1024, temperature: 0 },
  });
  return JSON.parse((res.text ?? "").trim());
}

const refUrls = (ctx: HatFilmRunContext) => {
  const byShot = (id: string, slot: string) => ctx.shots.find((s) => s.shot_id === id)?.references.find((r) => r.slot === slot)?.url;
  // Pull each required angle from the compiled references (single source of truth).
  const all = ctx.shots.flatMap((s) => s.references);
  const pick = (slot: string) => all.find((r) => r.slot === slot)?.url ?? byShot("shot_01", slot);
  return ["front", "right", "left", "back", "inside"].map(pick).filter((u): u is string => !!u);
};

export async function loadQa(admin: Admin, jobId: string): Promise<{ qa: HatFilmQaState; result: Record<string, unknown> }> {
  const { data } = await admin.from("execution_jobs").select("result_payload").eq("id", jobId).maybeSingle();
  const result = (data?.result_payload ?? {}) as Record<string, unknown>;
  return { qa: parseQa(result[HAT_FILM_QA_KEY]), result };
}

async function saveQa(admin: Admin, jobId: string, qa: HatFilmQaState) {
  const { result } = await loadQa(admin, jobId); // re-read to keep other keys
  await admin.from("execution_jobs").update({ result_payload: { ...result, [HAT_FILM_QA_KEY]: qa } }).eq("id", jobId);
}

/** Reference analysis, once per run (stored; reused by every check). */
async function ensureReference(admin: Admin, jobId: string, ctx: HatFilmRunContext, qa: HatFilmQaState) {
  if (qa.reference?.status === "ok") return qa;
  const now = new Date().toISOString();
  try {
    const raw = await ask(admin, REFERENCE_PROMPT, REFERENCE_SCHEMA, refUrls(ctx));
    const n = normalizeReferenceProfile(raw);
    if (!n.ok) qa.reference = { status: "invalid", profile: null, error: n.reason, analyzed_at: now };
    else {
      const conflicts = brimConflicts(n.profile, ctx.locks);
      qa.reference = conflicts.length
        ? { status: "invalid", profile: n.profile, error: conflicts.join("; "), analyzed_at: now }
        : { status: "ok", profile: n.profile, error: null, analyzed_at: now };
    }
  } catch (e) {
    const unavailable = (e as { unavailable?: boolean }).unavailable;
    qa.reference = { status: unavailable ? "unavailable" : "invalid", profile: null, error: e instanceof Error ? e.message : String(e), analyzed_at: now };
  }
  await saveQa(admin, jobId, qa);
  return qa;
}

export type GateResult = { action: "animate" } | { action: "retry"; correction: string } | { action: "needs_review"; reason: string };

/** Runs before a Hat clip is submitted. Only "animate" lets the clip start. */
export async function hatFilmGateBeforeClip(admin: Admin, args: { jobId: string; ctx: HatFilmRunContext; shotId: string; stillUrl: string | undefined }): Promise<GateResult> {
  const shot = HAT_FILM_SHOTS.find((s) => s.id === args.shotId);
  if (!shot) return { action: "needs_review", reason: `unknown shot ${args.shotId}` };
  let { qa } = await loadQa(admin, args.jobId);
  const current = qa.shots[shot.id] ?? emptyShotQa();
  if (current.status === "passed") return { action: "animate" };
  if (current.status === "needs_review") return { action: "needs_review", reason: current.last?.issues.join("; ") || "needs review" };
  if (!args.stillUrl) return { action: "needs_review", reason: "still missing" };

  qa = await ensureReference(admin, args.jobId, args.ctx, qa);
  const ref = qa.reference;
  let verdict: Verdict | null = null;
  let analyzer = ref?.status === "ok";
  if (analyzer && ref?.profile) {
    try {
      const report = (await ask(admin, STILL_PROMPT, STILL_SCHEMA, [args.stillUrl, ...refUrls(args.ctx)])) as StillReport;
      verdict = judgeStill(shot, ref.profile, report);
    } catch (e) {
      if ((e as { unavailable?: boolean }).unavailable) analyzer = false;
      verdict = { verdict: "uncertain", issues: [`inspection failed: ${e instanceof Error ? e.message : String(e)}`] };
    }
  }
  const decision = decideAfterCheck(verdict, current, analyzer);
  const next = applyCheck(current, verdict ?? { verdict: "uncertain", issues: [`reference analysis ${ref?.status ?? "missing"}: ${ref?.error ?? ""}`] }, decision, new Date().toISOString());
  qa.shots[shot.id] = next;
  await saveQa(admin, args.jobId, qa);
  if (decision === "animate") return { action: "animate" };
  if (decision === "retry") return { action: "retry", correction: next.correction ?? "" };
  return { action: "needs_review", reason: next.last?.issues.join("; ") || "product check could not verify this shot" };
}

/** Correction text to append to a still prompt on its single retry. */
export async function hatFilmCorrection(admin: Admin, jobId: string, shotId: string | undefined) {
  if (!shotId) return null;
  const { qa } = await loadQa(admin, jobId);
  const s = qa.shots[shotId];
  return s?.status === "retrying" ? s.correction : null;
}
