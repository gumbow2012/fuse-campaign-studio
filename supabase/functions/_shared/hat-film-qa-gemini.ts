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
  HAT_FILM_QA_KEY, parseQa, REFERENCE_PROMPT, REFERENCE_SCHEMA, runHatFilmGate, STILL_PROMPT, STILL_SCHEMA,
  type GateResult, type HatFilmQaState, type QaStore,
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

function jobStore(admin: Admin, jobId: string): QaStore {
  return {
    async read() {
      const { data, error } = await admin.from("execution_jobs").select("result_payload").eq("id", jobId).maybeSingle();
      if (error) throw new Error(`QA state read failed: ${error.message}`);
      if (!data) throw new Error("QA state read failed: run not found");
      const qa = parseQa(((data.result_payload ?? {}) as Record<string, unknown>)[HAT_FILM_QA_KEY]);
      return { qa, rev: qa.rev ?? 0 };
    },
    async write(qa, expectedRev) {
      // Atomic, key-scoped: merges ONLY the QA key into the current payload under the
      // revision guard, so concurrent outputs/assembly writes are never overwritten.
      const { data, error } = await admin.rpc("patch_job_result_payload", {
        p_job_id: jobId,
        p_patch: { [HAT_FILM_QA_KEY]: qa },
        p_guard_key: HAT_FILM_QA_KEY,
        p_guards: [{ field: "rev", op: expectedRev === 0 ? "null_or_eq" : "eq", value: String(expectedRev) }],
      });
      if (error) throw new Error(`QA state write failed: ${error.message}`);
      return data === true;
    },
  };
}

export async function loadQa(admin: Admin, jobId: string): Promise<{ qa: HatFilmQaState }> {
  const { qa } = await jobStore(admin, jobId).read();
  return { qa };
}

export type { GateResult };

/** Runs before a Hat clip is submitted. Only "animate" lets the clip start. */
export function hatFilmGateBeforeClip(admin: Admin, args: { jobId: string; ctx: HatFilmRunContext; shotId: string; stillUrl: string | undefined; stillRequestId: string | null }): Promise<GateResult> {
  const shot = HAT_FILM_SHOTS.find((s) => s.id === args.shotId);
  if (!shot) return Promise.resolve({ action: "needs_review", reason: `unknown shot ${args.shotId}` });
  return runHatFilmGate({
    store: jobStore(admin, args.jobId),
    analyzeReference: () => ask(admin, REFERENCE_PROMPT, REFERENCE_SCHEMA, refUrls(args.ctx)),
    inspectStill: (url) => ask(admin, STILL_PROMPT, STILL_SCHEMA, [url, ...refUrls(args.ctx)]),
    locks: args.ctx.locks,
    now: () => Date.now(),
    newId: () => crypto.randomUUID(),
  }, { shot, stillUrl: args.stillUrl, stillRequestId: args.stillRequestId });
}

/** Correction text to append to a still prompt on its single retry. */
export async function hatFilmCorrection(admin: Admin, jobId: string, shotId: string | undefined) {
  if (!shotId) return null;
  const { qa } = await loadQa(admin, jobId);
  const s = qa.shots[shotId];
  return s?.status === "retrying" ? s.correction : null;
}
