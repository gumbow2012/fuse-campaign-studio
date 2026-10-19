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
  const sql = src("supabase/migrations/20261019120000_patch_job_result_payload.sql");
  for (const op of ["eq", "null_or_eq", "is_null", "not_eq_or_null", "lt", "key_absent"]) assert.match(sql, new RegExp(`'${op}'`));
  assert.match(sql, /for update/);
  assert.match(sql, /cur \|\| coalesce\(p_patch/);
});
