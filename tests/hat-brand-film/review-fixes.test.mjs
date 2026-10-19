// Regression tests for the consolidated review at 46899031 (interior QA,
// superseded callbacks, concurrent QA state, assembly lease resume, ready count,
// shot 06 brand placement, visible cost disclosure).
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { HAT_FILM_SHOTS, HAT_FILM_MAX_AUTO_RETRIES } from '../../supabase/functions/_shared/hat-film-recipe.ts';
import * as qaMod from '../../supabase/functions/_shared/hat-film-qa.ts';
import { compileHatFilmRun } from '../../supabase/functions/_shared/hat-film-prompts.ts';
import { validateHatFilmInputs } from '../../supabase/functions/_shared/hat-film-recipe.ts';

const { judgeStill, parseQa } = qaMod;
const shot = (n) => HAT_FILM_SHOTS[n - 1];
const profile = { top_brim_color: 'black', under_brim_color: 'light gray', front_text: 'THE WORKING GENTLEMEN', back_text: 'Paper Chaser',
  right_side_identity: 'embroidered skull wearing yellow construction helmet', left_side_identity: 'white text NOBODY CARES WORK HARDER',
  inside_identity: 'gray underside with black taped seams and a printed size label', confidence: 0.9 };
const interior = { hat_present: true, hat_count: 1, side_shown: 'inside', top_brim_visible: false, top_brim_color: null, under_brim_visible: true,
  under_brim_color: 'light gray', visible_text: '', text_legible: false, side_identity: 'gray underside, black taped seams, printed size label', any_text_or_logo: false, confidence: 0.9 };

/* 1. shot-specific visibility */
test('interior shot 08 with correct underside and no visible upper bill passes', () => {
  assert.deepEqual(judgeStill(shot(8), profile, interior), { verdict: 'pass', issues: [] });
});
test('lining macro shot 10 without any bill visible passes when the lining matches', () => {
  assert.equal(judgeStill(shot(10), profile, { ...interior, under_brim_visible: false, under_brim_color: null }).verdict, 'pass');
});
test('interior shot fails on wrong underside color', () => {
  const v = judgeStill(shot(8), profile, { ...interior, under_brim_color: 'black' });
  assert.equal(v.verdict, 'fail'); assert.match(v.issues.join(), /underside/);
});
test('interior shot fails when underside is not visible (required on 08)', () => {
  assert.match(judgeStill(shot(8), profile, { ...interior, under_brim_visible: false, under_brim_color: null }).issues.join(), /underside .*not visible/);
});
test('interior shot fails when the lining does not match the inside reference', () => {
  assert.match(judgeStill(shot(8), profile, { ...interior, side_identity: 'red satin lining with floral pattern' }).issues.join(), /inside reference/);
});
test('interior shot fails when the outside is shown instead', () => {
  assert.equal(judgeStill(shot(8), profile, { ...interior, side_shown: 'front' }).verdict, 'fail');
});
test('front hero still requires the upper bill; back shot does not', () => {
  const front = { ...interior, side_shown: 'front', top_brim_visible: false, under_brim_visible: false, visible_text: 'THE WORKING GENTLEMEN', text_legible: true, side_identity: '' };
  assert.match(judgeStill(shot(1), profile, front).issues.join(), /top of the brim/);
  const back = { ...front, side_shown: 'back', visible_text: 'Paper Chaser' };
  assert.equal(judgeStill(shot(7), profile, back).verdict, 'pass');
  assert.equal(judgeStill(shot(7), profile, { ...back, top_brim_visible: true, top_brim_color: 'gray' }).verdict, 'fail');
});
test('reference analysis must describe the interior', () => {
  assert.equal(qaMod.normalizeReferenceProfile({ ...profile, inside_identity: '' }).ok, false);
});

/* 3. concurrent QA state + bounded retry */
function memoryStore(initial = {}) {
  let doc = { result: { other_key: 'keep', ...initial }, rev: 0 };
  return {
    writes: 0,
    get doc() { return doc; },
    async read() { await new Promise((r) => setTimeout(r, 1)); const qa = parseQa(doc.result.hat_film_qa); return { qa: structuredClone(qa), rev: qa.rev ?? 0 }; },
    async write(qa, expectedRev) {
      await new Promise((r) => setTimeout(r, 1));
      if ((parseQa(doc.result.hat_film_qa).rev ?? 0) !== expectedRev) return false;
      doc = { result: { ...doc.result, hat_film_qa: qa } }; this.writes++; return true;
    },
  };
}
const goodFor = (n) => ({ ...interior, side_shown: n === 8 ? 'inside' : 'back', visible_text: 'Paper Chaser', text_legible: true });
const deps = (store, calls, report) => ({
  store,
  analyzeReference: async () => { calls.ref++; await new Promise((r) => setTimeout(r, 5)); return profile; },
  inspectStill: async (url) => { calls.still++; return report(url); },
  locks: {}, now: () => Date.parse('2026-10-19T00:00:00Z'), newId: (() => { let i = 0; return () => `c${++i}`; })(),
});

test('concurrent checks of different shots keep both results; reference analyzed once', async () => {
  const store = memoryStore(); const calls = { ref: 0, still: 0 };
  const d = deps(store, calls, (url) => goodFor(url.includes('08') ? 8 : 7));
  const [a, b] = await Promise.all([
    qaMod.runHatFilmGate(d, { shot: shot(8), stillUrl: 'u/08', stillRequestId: 'r8' }),
    qaMod.runHatFilmGate(d, { shot: shot(7), stillUrl: 'u/07', stillRequestId: 'r7' }),
  ]);
  const results = [a.action, b.action].sort();
  // One may have waited for the in-flight reference analysis; it never re-analyzes.
  assert.equal(calls.ref, 1);
  const qa = parseQa(store.doc.result.hat_film_qa);
  assert.equal(store.doc.result.other_key, 'keep');
  for (const [id, r] of [['shot_08', a], ['shot_07', b]]) if (r.action === 'animate') assert.equal(qa.shots[id].status, 'passed');
  if (results.includes('wait')) {
    const again = await qaMod.runHatFilmGate(d, { shot: shot(a.action === 'wait' ? 8 : 7), stillUrl: a.action === 'wait' ? 'u/08' : 'u/07', stillRequestId: 'x' });
    assert.equal(again.action, 'animate');
  }
  const final = parseQa(store.doc.result.hat_film_qa);
  assert.equal(final.shots.shot_08.status, 'passed'); assert.equal(final.shots.shot_07.status, 'passed');
  assert.equal(calls.ref, 1);
});

test('duplicate concurrent checks of the same shot run one paid inspection', async () => {
  const store = memoryStore(); const calls = { ref: 0, still: 0 };
  const d = deps(store, calls, () => goodFor(8));
  await qaMod.runHatFilmGate(d, { shot: shot(7), stillUrl: 'u/07', stillRequestId: 'r7' }); // warm reference
  calls.still = 0;
  const out = await Promise.all([1, 2, 3].map(() => qaMod.runHatFilmGate(d, { shot: shot(8), stillUrl: 'u/08', stillRequestId: 'r8' })));
  assert.equal(calls.still, 1);
  assert.equal(out.filter((o) => o.action === 'animate').length, 1);
  assert.ok(out.every((o) => o.action === 'animate' || o.action === 'wait'));
});

test('retry is bounded: fail → one retry (old request superseded) → needs review', async () => {
  const store = memoryStore(); const calls = { ref: 0, still: 0 };
  const d = deps(store, calls, () => ({ ...goodFor(8), under_brim_color: 'black' }));
  const first = await qaMod.runHatFilmGate(d, { shot: shot(8), stillUrl: 'u/08', stillRequestId: 'req-1' });
  assert.equal(first.action, 'retry');
  assert.deepEqual(qaMod.supersededRequestIds(store.doc.result.hat_film_qa), ['req-1']);
  const second = await qaMod.runHatFilmGate(d, { shot: shot(8), stillUrl: 'u/08b', stillRequestId: 'req-2' });
  assert.equal(second.action, 'needs_review');
  const s = parseQa(store.doc.result.hat_film_qa).shots.shot_08;
  assert.equal(s.retries, HAT_FILM_MAX_AUTO_RETRIES); assert.equal(s.status, 'needs_review');
  assert.equal((await qaMod.runHatFilmGate(d, { shot: shot(8), stillUrl: 'u/08c', stillRequestId: 'req-3' })).action, 'needs_review');
  assert.equal(calls.still, 2);
});

test('database write errors surface; they never become a pass', async () => {
  const store = memoryStore(); store.write = async () => { throw new Error('db down'); };
  await assert.rejects(qaMod.runHatFilmGate(deps(store, { ref: 0, still: 0 }, () => goodFor(8)), { shot: shot(8), stillUrl: 'u', stillRequestId: 'r' }), /db down/);
});

test('missing analyzer key → needs review, and the next check may retry the free key lookup', async () => {
  const store = memoryStore(); const calls = { ref: 0, still: 0 };
  const d = { ...deps(store, calls, () => goodFor(8)), analyzeReference: async () => { throw Object.assign(new Error('no key'), { unavailable: true }); } };
  assert.equal((await qaMod.runHatFilmGate(d, { shot: shot(8), stillUrl: 'u', stillRequestId: 'r' })).action, 'needs_review');
  assert.equal(calls.still, 0);
});

/* 2. superseded provider callbacks */
import { classifyProviderCallback } from '../../supabase/functions/_shared/provider-callback-guard.ts';
test('old success/error callback while retry pending is rejected', () => {
  for (const _status of ['OK', 'ERROR']) {
    assert.equal(classifyProviderCallback({ matchedBy: 'step_id', stepRequestId: null, callbackRequestId: 'req-1', superseded: ['req-1'] }), 'superseded');
  }
});
test('old callback after retry was submitted (different current id) is rejected', () => {
  assert.equal(classifyProviderCallback({ matchedBy: 'step_id', stepRequestId: 'req-2', callbackRequestId: 'req-1', superseded: ['req-1'] }), 'superseded');
  assert.equal(classifyProviderCallback({ matchedBy: 'step_id', stepRequestId: 'req-2', callbackRequestId: 'req-x', superseded: [] }), 'superseded');
});
test('current callback is accepted; first callback for a step with no id is adopted', () => {
  assert.equal(classifyProviderCallback({ matchedBy: 'request_id', stepRequestId: 'req-2', callbackRequestId: 'req-2', superseded: ['req-1'] }), 'accept');
  assert.equal(classifyProviderCallback({ matchedBy: 'step_id', stepRequestId: null, callbackRequestId: 'req-9', superseded: ['req-1'] }), 'adopt');
});

/* 4. assembly lease */
import { lockView, emptyAssembly, claimed } from '../../supabase/functions/_shared/hat-film-assembly.ts';
import { hatFilmPanelMode, readyShotCount } from '../../src/lib/hatFilmPanel.ts';
const now = new Date('2026-10-19T00:00:00Z');
const held = claimed(emptyAssembly(), 'tok-A', now);
test('reload in the same browser session sees its own lease', () => {
  assert.deepEqual(lockView(held, 'tok-A', now.toISOString()), { locked: false, owned: true });
  assert.equal(hatFilmPanelMode({ phase: 'assembling_video', manifest: {}, assembly: { locked: false, owned: true } }, { busy: false, autoStarted: false, tabLockFree: true }), 'auto_start');
});
test('another tab is excluded', () => {
  assert.deepEqual(lockView(held, 'tok-B', now.toISOString()), { locked: true, owned: false });
  assert.deepEqual(lockView(held, null, now.toISOString()), { locked: true, owned: false });
  assert.equal(hatFilmPanelMode({ phase: 'assembling_video', manifest: {}, assembly: { locked: true, owned: false } }, { busy: false, autoStarted: false, tabLockFree: true }), 'other_tab');
  // Duplicated tab copies the session token, but the browser tab lock is still held by the original.
  assert.equal(hatFilmPanelMode({ phase: 'assembling_video', manifest: {}, assembly: { locked: false, owned: true } }, { busy: false, autoStarted: false, tabLockFree: false }), 'other_tab');
});
test('expired lease is claimable by anyone and no longer owned', () => {
  const later = new Date(now.getTime() + 24 * 3600e3).toISOString();
  assert.deepEqual(lockView(held, 'tok-B', later), { locked: false, owned: false });
  assert.deepEqual(lockView(held, 'tok-A', later), { locked: false, owned: false });
});
test('ready count uses the server status "ready"', () => {
  assert.equal(readyShotCount([{ status: 'ready' }, { status: 'ready' }, { status: 'animating' }, { status: 'complete' }]), 2);
});

/* shot 06 */
test('shot 06 never asks the generator for a sign or logo; logo is an intentional on-screen mark', () => {
  const r = validateHatFilmInputs({ front: 'a', right: 'b', left: 'c', back: 'd', inside: 'e', logo: 'f', brand_vibe: 'An unfinished construction site at dusk with excavators and work lights.' });
  const p = compileHatFilmRun(r.inputs).shots.find((s) => s.shot_id === 'shot_06').still_prompt;
  assert.doesNotMatch(p, /framed for the brand logo|blank sign or banner in the world/i);
  assert.match(p, /no sign/i);
  assert.match(shot(6).content, /on-screen/i);
});

/* pricing disclosure */
import { hatFilmCostDisclosure } from '../../src/lib/hatFilmCost.ts';
test('visible estimate includes bounded retries and unpriced product checks', () => {
  const d = hatFilmCostDisclosure(80);
  assert.equal(d.baseCredits, 80); assert.equal(d.maxCredits, 160); assert.equal(d.maxRetriesPerShot, 1);
  assert.deepEqual(d.checks, { base: 12, max: 23, priceAvailable: false });
  assert.equal(d.liveTotalVerified, false);
});
