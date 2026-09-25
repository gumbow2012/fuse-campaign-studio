import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMp4, traks } from './mp4-fixtures.mjs';
import { applySourceEditFinishing } from '../../supabase/functions/_shared/source-edit-finishing.ts';

const video = (id, stts, edit, fill) => ({ id, handler: 'vide', entry: 'avc1', ts: 12288, stts, sizes: new Array(stts[0][0]).fill(5), perChunk: 10, edit, w: 720, h: 1280, fill });
const audio = { id: 2, handler: 'soun', entry: 'mp4a', ts: 44100, stts: [[269, 2048], [1, 1922]], sizes: new Array(270).fill(3), perChunk: 27, edit: [[12536, 5058]], fill: 9 };
const source = buildMp4({ movieDur: 12536, tracks: [video(1, [[298, 512]], [[12417, 1024]], 1), audio] });
const generated = buildMp4({ movieDur: 12375, tracks: [video(1, [[297, 512]], [[12375, 2048]], 7)] });

const admin = {
  storage: { from: () => ({ createSignedUrl: async (path) => ({ data: { signedUrl: `https://signed.test/${path}` } }) }) },
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { prompt_config: { source_video: { duration: 12.535918, width: 720, height: 1280 } } } }) }) }) }),
};
const on = { source_video_edit: true, keep_audio: true, video_model: 'kling-o3-pro-video-edit', video_url: 'fuse-assets:system/source.mp4' };

test('other models / keep_audio off pass through without any fetch', async () => {
  globalThis.fetch = async () => { throw new Error('no fetch expected'); };
  for (const inputPayload of [{ ...on, keep_audio: false }, { ...on, video_model: 'seedance-2.0' }, {}]) {
    const r = await applySourceEditFinishing(admin, { inputPayload, providerUrl: 'https://fal.test/o.mp4', generated });
    assert.equal(r.bytes, generated);
    assert.equal(r.finishing, null);
  }
});

test('gated completion finishes via the authenticated source resolver and records provider URL', async () => {
  const fetched = [];
  globalThis.fetch = async (url) => { fetched.push(url); return new Response(source); };
  const r = await applySourceEditFinishing(admin, { inputPayload: on, nodeId: 'n', providerUrl: 'https://fal.test/o.mp4', generated });
  assert.deepEqual(fetched, ['https://signed.test/system/source.mp4']);
  assert.equal(r.finishing.status, 'finished');
  assert.equal(r.finishing.provider_output_url, 'https://fal.test/o.mp4');
  assert.equal(traks(r.bytes).length, 2);
});

test('unsupported media keeps provider bytes and records the rejection', async () => {
  globalThis.fetch = async () => new Response(new Uint8Array([0, 0, 0, 4]));
  const r = await applySourceEditFinishing(admin, { inputPayload: on, nodeId: 'n', providerUrl: 'https://fal.test/o.mp4', generated });
  assert.equal(r.bytes, generated);
  assert.equal(r.finishing.status, 'rejected');
  assert.equal(r.finishing.code, 'invalid_box');
});
