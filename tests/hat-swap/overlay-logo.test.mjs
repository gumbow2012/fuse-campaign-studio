import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { buildOverlayLogoPrompt, cleanPlateInstruction, normalizeOverlayLogo } from '../../supabase/functions/_shared/overlay-logo.ts';

const frames = [{ frameId: 'frame-0', timestamp: 0 }, { frameId: 'frame-1', timestamp: 1 }];

test('overlay logo: box_2d (0-1000, ymin/xmin/ymax/xmax) becomes a normalized x/y/w/h box', () => {
  const out = normalizeOverlayLogo({ present: true, description: 'white crest monogram', box_2d: [850, 450, 950, 550], frame_ids: ['frame-0', 'frame-9', 'frame-0'] }, frames);
  assert.equal(out.present, true);
  assert.deepEqual(Object.fromEntries(Object.entries(out.box).map(([k, v]) => [k, Math.round(v * 100) / 100])), { x: 0.45, y: 0.85, w: 0.1, h: 0.1 });
  assert.deepEqual(out.frameIds, ['frame-0'], 'unknown frames dropped, deduped');
});

test('overlay logo: absent or degenerate box means no logo', () => {
  assert.equal(normalizeOverlayLogo({ present: false, box_2d: [0, 0, 0, 0] }, frames).present, false);
  assert.equal(normalizeOverlayLogo({ present: true, box_2d: [500, 500, 500, 500] }, frames).present, false);
  assert.equal(normalizeOverlayLogo(null, frames).box, null);
});

test('clean plate instruction names the spot and never asks the model to draw a logo', () => {
  const s = cleanPlateInstruction({ present: true, description: 'white crest', box: { x: 0.45, y: 0.85, w: 0.1, h: 0.1 } });
  assert.match(s, /near the bottom center/);
  assert.match(s, /45%–55% across, 85%–95% down/);
  assert.match(s, /Add no logo, watermark or text anywhere/);
  assert.equal(cleanPlateInstruction({ present: false, description: '', box: null }), '');
  assert.match(buildOverlayLogoPrompt(frames), /not overlays/);
});

test('withCleanPlate appends to the user prompt only when a valid source logo is sent', async () => {
  const { withCleanPlate } = await import('../../supabase/functions/_shared/overlay-logo.ts');
  assert.equal(withCleanPlate('golden hour', null), 'golden hour');
  assert.equal(withCleanPlate(undefined, { box: { x: 'a' } }), '');
  const s = withCleanPlate('golden hour', { description: 'crest', box: { x: 0.45, y: 0.85, w: 0.1, h: 0.1 } });
  assert.match(s, /^golden hour The source has an overlaid logo\/watermark \(crest\)/);
});

test('outfit-swap applies the clean plate to frame swaps and the video rebuild', async () => {
  const { readFileSync } = await import('node:fs');
  const s = readFileSync(new URL('../../supabase/functions/outfit-swap/index.ts', import.meta.url), 'utf8');
  assert.equal((s.match(/extraPrompt: withCleanPlate\(body\.extraPrompt, body\.removeSourceLogo\),/g) ?? []).length, 2);
});

test('export engine: image layers force a re-encode, are drawn after text, and are part of the cache key', async () => {
  const { readFileSync } = await import('node:fs');
  const w = readFileSync(new URL('../../src/workers/campaignExport.worker.ts', import.meta.url), 'utf8');
  const t = readFileSync(new URL('../../src/services/videoExport/types.ts', import.meta.url), 'utf8');
  assert.match(w, /if \(target\.imageLayers\?\.length\) return false;/);
  assert.match(w, /drawTextLayers\(ctx, target\.textLayers[^\n]*\n  \}\n  drawImageLayers\(ctx, target\);/);
  assert.match(w, /await loadImageLayers\(target\);/);
  assert.match(t, /: "i0",/);
});

test('Outfit Swap page: logo removal travels with swaps and the rebuild; my logo is only ever composited', async () => {
  const { readFileSync } = await import('node:fs');
  const page = readFileSync(new URL('../../src/pages/OutfitSwap.tsx', import.meta.url), 'utf8');
  assert.equal((page.match(/\.\.\.\(removeSourceLogo \? \{ removeSourceLogo \} : \{\}\),/g) ?? []).length, 2);
  assert.match(page, /logo: \{ id: "customer-logo", url: myLogoUrl, \.\.\.logoBox \}/);
  assert.doesNotMatch(page, /myLogoUrl[^\n]*garments/, 'the customer logo is never sent to generation');
});
