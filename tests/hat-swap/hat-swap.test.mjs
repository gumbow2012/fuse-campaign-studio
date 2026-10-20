import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { assembleHatSwap, hatRefsForView, isHatRun, normalizeHatView, spellLettering } from '../../supabase/functions/_shared/hat-swap.ts';

const hatA = { id: 'A', frontUrl: 'a/front', backUrl: 'a/back', rightUrl: 'a/right', leftUrl: 'a/left', undersideUrl: 'a/under', detailUrl: 'a/detail', label: 'Archangel', lettering: 'ARCHANGEL' };
const hatB = { id: 'B', frontUrl: 'b/front' };

test('view-matched refs: matching angle first, front as anchor, deduped, capped', () => {
  assert.deepEqual(hatRefsForView(hatA, 'left'), ['a/left', 'a/front']);
  assert.deepEqual(hatRefsForView(hatA, 'underside'), ['a/under', 'a/front']);
  assert.deepEqual(hatRefsForView(hatA, 'macro'), ['a/detail', 'a/front']);
  assert.deepEqual(hatRefsForView(hatB, 'back'), ['b/front'], 'missing angle falls back to front only');
  assert.ok(hatRefsForView(hatA, 'multiple').length <= 3);
  assert.equal(normalizeHatView('SIDEWAYS'), 'uncertain');
});

test('one customer hat replaces every source hat (default mapping)', () => {
  const out = assembleHatSwap({
    sourceFrameUrl: 'frame',
    garments: [hatA],
    hatSwap: { hats: [{ hatId: 'h1', view: 'front' }, { hatId: 'h2', view: 'left' }], mapping: {}, defaultGarmentId: 'A' },
  });
  assert.equal(out.imageUrls[0], 'frame');
  assert.deepEqual(out.imageUrls.slice(1), ['a/front', 'a/detail', 'a/left', 'a/front']);
  assert.deepEqual(out.usedGarmentIds, ['A']);
  assert.match(out.prompt, /reference images 2-3/);
  assert.match(out.prompt, /reference images 4-5/);
  assert.match(out.prompt, /A-R-C-H-A-N-G-E-L/);
});

test('several customer hats: each source hat maps to its own hat', () => {
  const out = assembleHatSwap({
    sourceFrameUrl: 'frame',
    garments: [hatA, hatB],
    hatSwap: { hats: [{ hatId: 'h1', view: 'back' }, { hatId: 'h2', view: 'front' }], mapping: { h1: 'A', h2: 'B' }, defaultGarmentId: 'A' },
  });
  assert.deepEqual(out.imageUrls, ['frame', 'a/back', 'a/front', 'b/front']);
  assert.deepEqual(out.usedGarmentIds.sort(), ['A', 'B']);
});

test('no detected hats in the frame → every hat becomes the default hat; unknown mapping falls back', () => {
  const out = assembleHatSwap({ sourceFrameUrl: 'frame', garments: [hatB, hatA], hatSwap: { hats: [], mapping: { h9: 'nope' }, defaultGarmentId: 'B' } });
  assert.deepEqual(out.imageUrls, ['frame', 'b/front']);
  assert.match(out.prompt, /Every hat in image 1/);
});

test('guards and helpers', () => {
  assert.throws(() => assembleHatSwap({ sourceFrameUrl: '', garments: [hatA], hatSwap: {} }), /source frame/);
  assert.throws(() => assembleHatSwap({ sourceFrameUrl: 'f', garments: [{ id: 'x' }], hatSwap: {} }), /front photo/);
  assert.equal(spellLettering('THE WORK'), 'T-H-E-/-W-O-R-K');
  assert.equal(isHatRun([{ type: 'Hat' }, { type: 'hat' }]), true);
  assert.equal(isHatRun([{ type: 'Hat' }, { type: 'Shirt / Top' }]), false);
  assert.equal(isHatRun([]), false);
});

test('hat video rebuild prompt keeps lettering and adds nothing', async () => {
  const { buildHatReconstructionPrompt } = await import('../../supabase/functions/_shared/hat-swap.ts');
  const p = buildHatReconstructionPrompt([hatA, hatB], 'slow');
  assert.match(p, /"ARCHANGEL"/);
  assert.match(p, /Same video, new hat\./);
  assert.match(p, /slow$/);
});

test('outfit-swap wires hat mode into frame swaps and the video rebuild only for all-hat runs', async () => {
  const { readFileSync } = await import('node:fs');
  const s = readFileSync(new URL('../../supabase/functions/outfit-swap/index.ts', import.meta.url), 'utf8');
  assert.match(s, /const hatMode = !!args\.hatSwap && isHatRun\(garments\);/);
  assert.match(s, /const needsFused = !hatMode && requiresFusedAssembly\(/);
  assert.match(s, /hatSwap: body\.hatSwap \?\? null,/);
  assert.match(s, /isHatRun\(videoGarments\) \? buildHatReconstructionPrompt/);
});

test('hat analysis normalization: stable tracks from frames only, deduped, unknown frames dropped', async () => {
  const { normalizeHatAnalysis, buildHatAnalysisPrompt } = await import('../../supabase/functions/_shared/hat-swap.ts');
  const frames = [{ frameId: 'frame-0', timestamp: 0 }, { frameId: 'frame-1', timestamp: 1 }];
  const out = normalizeHatAnalysis({
    hat_tracks: [{ hat_id: 'hat_1', description: 'cream front, pink star' }, { hat_id: 'hat_9', description: 'ghost' }],
    frames: [
      { frame_id: 'frame-0', hats: [{ hat_id: 'hat_1', view: 'front', confidence: 0.9 }, { hat_id: 'hat_1', view: 'left' }] },
      { frame_id: 'frame-1', hats: [{ hat_id: 'hat_2', view: 'WEIRD', confidence: 3 }] },
      { frame_id: 'frame-7', hats: [{ hat_id: 'hat_3', view: 'front' }] },
    ],
  }, frames);
  assert.equal(out.hatCount, 2, 'hat_9 never appears, hat_3 frame unknown');
  assert.deepEqual(out.hatTracks.map((t) => [t.hatId, t.firstFrameId, t.frameCount]), [['hat_1', 'frame-0', 1], ['hat_2', 'frame-1', 1]]);
  assert.equal(out.hatTracks[1].description, 'hat 2');
  assert.equal(out.frames[0].hats.length, 1);
  assert.equal(out.frames[1].hats[0].view, 'uncertain');
  assert.equal(out.frames[1].hats[0].confidence, 1);
  assert.match(buildHatAnalysisPrompt(frames), /frameId "frame-1"/);
});

test('Outfit Swap page: hat slots, no Apply-to for hats, source-hat mapping, hatSwap only in hat mode', async () => {
  const { readFileSync } = await import('node:fs');
  const page = readFileSync(new URL('../../src/pages/OutfitSwap.tsx', import.meta.url), 'utf8');
  const svc = readFileSync(new URL('../../src/services/outfitSwap.ts', import.meta.url), 'utf8');
  assert.match(page, /\{ slot: "underside", label: "Inside \/ underside", key: "undersideUrl" \}/);
  assert.match(page, /\{garment\.type !== "Hat" \? \(<div>/, 'Apply to hidden for hats');
  assert.match(page, /placeholder="Exact lettering on the hat \(optional\)"/);
  assert.match(page, /value=\{hatMapping\[track\.hatId\] \?\? garments\[0\]\.id\}/, 'one hat replaces all by default');
  assert.match(page, /\.\.\.\(hatSwap \? \{ hatSwap \} : \{\}\)/, 'non-hat requests unchanged');
  assert.match(page, /frames\.length && analysisStage !== "idle" && !hatMode/, 'no "0 SUBJECTS" chip in hat mode');
  assert.match(svc, /body: JSON\.stringify\(mode \? \{ frames, mode \} : \{ frames \}\)/);
});
