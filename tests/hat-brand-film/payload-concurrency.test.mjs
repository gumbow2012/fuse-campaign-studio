// Hat Brand Film writers must patch result_payload atomically (key-scoped, in-row guards),
// never write a whole stale copy. DB-level interleave proof: payload-concurrency.sql.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

test("QA store writes only its key through the atomic RPC with a revision guard", () => {
  const s = src("supabase/functions/_shared/hat-film-qa-gemini.ts");
  assert.match(s, /rpc\("patch_job_result_payload"/);
  assert.match(s, /p_guard_key: HAT_FILM_QA_KEY/);
  assert.doesNotMatch(s, /update\(\{\s*result_payload/);
});

test("assembly CAS writes only its key through the atomic RPC with lock + not-ready guards", () => {
  const s = src("supabase/functions/hat-film-assembly/index.ts");
  assert.match(s, /rpc\("patch_job_result_payload"/);
  assert.match(s, /op: "not_eq_or_null", value: "ready"/);
  assert.doesNotMatch(s, /update\(\{\s*result_payload/);
});

test("executor finalize merges outputs for hat runs and seeds assembly only if absent", () => {
  const s = src("supabase/functions/_shared/executor.ts");
  assert.match(s, /p_patch: \{ outputs, telemetry \}/);
  assert.match(s, /op: "key_absent"/);
  assert.doesNotMatch(s, /result_payload: \{ outputs, telemetry, \.\.\.hatFilmExtra \}/);
});

test("migration defines every guard op the writers use", () => {
  const sql = src("docs/hat-brand-film/patch_job_result_payload.sql");
  for (const op of ["eq", "null_or_eq", "is_null", "not_eq_or_null", "lt", "key_absent"]) assert.match(sql, new RegExp(`'${op}'`));
  assert.match(sql, /for update/);
  assert.match(sql, /cur \|\| coalesce\(p_patch/);
});

test("every seeded node name fits the production nodes.name varchar(100)", async () => {
  const { buildHatFilmGraph } = await import("../../supabase/functions/_shared/hat-film-graph.ts");
  const g = buildHatFilmGraph();
  for (const n of g.nodes) assert.ok(n.name.length <= 100, `${n.name.length}: ${n.name}`);
  assert.ok(g.nodes.some((n) => n.name.endsWith(" (still)")));
});

test("product checks get enough output budget and retry malformed replies (prod truncation 2026-10-19)", () => {
  const s = src("supabase/functions/_shared/hat-film-qa-gemini.ts");
  assert.match(s, /maxOutputTokens: 8192/);
  assert.match(s, /thinkingLevel: "low"/);
  assert.match(s, /ASK_ATTEMPTS = 3/);
  assert.doesNotMatch(s, /maxOutputTokens: 1024/);
});

test("hat provider refusals are resubmitted (bounded, CAS on request id, old id superseded)", () => {
  const e = src("supabase/functions/_shared/executor.ts");
  assert.match(e, /HAT_PROVIDER_RETRIES = 2/);
  assert.match(e, /\.eq\("provider_request_id", requestId\)/);
  assert.match(e, /superseded_request_ids: \[\.\.\.new Set\(\[\.\.\.prior, requestId\]\)\]/);
  const w = src("supabase/functions/fal-webhook/index.ts");
  assert.match(w, /retryHatProviderRefusal\(admin, step as any, requestId, providerError\)/);
  assert.match(w, /output_payload as any\)\.superseded_request_ids/);
});

test("the reconciler retries Hat refusals and never resets a clip waiting on its product check", () => {
  const e = src("supabase/functions/_shared/executor.ts");
  const r = e.slice(e.indexOf("export async function reconcileRunningSteps"), e.indexOf("export async function finalizeJobIfTerminal"));
  assert.match(r, /const interruptedAfterMs = isHatFilm \? QA_CLAIM_MS : 20_000;/);
  assert.match(r, /stalledMs >= interruptedAfterMs/);
  assert.equal((r.match(/if \(await hatRefusal\(rawStep, /g) ?? []).length, 3, "status error, result error and FAILED status");
});

test("a provider-retried clip skips the single-submission gate and the executor loads output_payload", () => {
  const s = src("supabase/functions/_shared/executor.ts");
  assert.match(s, /hat_film_stage === "clip" && !hatProviderRetry/);
  assert.match(s, /provider_request_id, output_asset_id, output_payload, assets!execution_steps_output_asset_id_fkey/);
});

test("provider submits keep hat retry bookkeeping (counter + superseded ids) in output_payload", () => {
  const s = src("supabase/functions/_shared/executor.ts");
  assert.equal((s.match(/\.\.\.hatRetryState\(step\)/g) ?? []).length, 2);
  assert.match(s, /hat_provider_retries: p\.hat_provider_retries/);
});

test("executor re-checks readiness per step and stops paid submits once a Hat run has stopped", () => {
  const s = src("supabase/functions/_shared/executor.ts");
  assert.match(s, /if \(step\.status !== "pending" \|\| !isStepReady\(step, incomingByTarget\.get\(step\.node_id\) \?\? \[\], resolved\)\) continue;/);
  assert.match(s, /await hatJobStopped\(admin, job\.id\)\) return;/);
});

test("a Hat clip is only submitted when its current still passed the product check", () => {
  const s = src("supabase/functions/_shared/executor.ts");
  const i = s.indexOf("Hat Brand Film hard rule"), j = s.indexOf("const requestId = await submitVideoJob(");
  assert.ok(i > 0 && i < j, "hard rule sits right before the video submit");
  assert.match(s.slice(i, j), /shotQa\?\.status !== "passed"/);
  assert.match(s.slice(i, j), /superseded_requests \?\? \[\]\)\.includes\(stillId\)/);
});
