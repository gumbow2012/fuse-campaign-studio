import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMp4, box, concat, traks, inTrak, find, dv } from './mp4-fixtures.mjs';
import { finishSourceEditMp4, shouldFinishSourceEdit, Mp4FinishError } from '../../supabase/functions/_shared/mp4-source-audio-finish.ts';

// Mirrors the measured Jerry files: source video 298x512 @12288, edit 12417/1024;
// source AAC 269x2048+1x1922 @44100, edit 12536/5058; generated video 297x512, edit 12375/2048.
const srcVideo = { id: 1, handler: 'vide', entry: 'avc1', ts: 12288, stts: [[298, 512]], sizes: new Array(298).fill(9), perChunk: 10, edit: [[12417, 1024]], w: 720, h: 1280, fill: 10 };
const srcAudio = { id: 2, handler: 'soun', entry: 'mp4a', ts: 44100, stts: [[269, 2048], [1, 1922]], sizes: new Array(270).fill(6), perChunk: 21, edit: [[12536, 5058]], fill: 200 };
const source = (extra = {}) => buildMp4({ movieDur: 12536, tracks: [{ ...srcVideo, ...extra.video }, ...(extra.noAudio ? [] : [srcAudio])], ...extra.file });
const genVideo = { id: 2, handler: 'vide', entry: 'avc1', ts: 12288, stts: [[297, 512]], sizes: new Array(297).fill(11), perChunk: 7, edit: [[12375, 2048]], w: 720, h: 1280, fill: 50 };
const genAudio = { id: 1, handler: 'soun', entry: 'mp4a', ts: 44100, stts: [[268, 1024]], sizes: new Array(268).fill(4), perChunk: 30, edit: [[43, -1], [12353, 0]], fill: 120 };
const generated = (video = {}, file = {}) => buildMp4({ movieDur: 12396, tracks: [{ ...genVideo, ...video }, genAudio], ...file });
const expected = { duration: 12.535918, width: 720, height: 1280 };

function chunkBytes(buf, trak) {
  const stco = dv(inTrak(buf, trak, ['mdia', 'minf', 'stbl', 'stco']));
  const stsz = dv(inTrak(buf, trak, ['mdia', 'minf', 'stbl', 'stsz']));
  const per = dv(inTrak(buf, trak, ['mdia', 'minf', 'stbl', 'stsc'])).getUint32(12);
  const n = stsz.getUint32(8);
  const out = [];
  for (let c = 0; c < stco.getUint32(4); c++) {
    let size = 0;
    for (let s = c * per; s < Math.min(n, (c + 1) * per); s++) size += stsz.getUint32(12 + s * 4); // last chunk short
    const off = stco.getUint32(8 + c * 4);
    out.push(buf.subarray(off, off + size));
  }
  return concat(out);
}
const byHandler = (buf, h) => traks(buf).find((t) => String.fromCharCode(...inTrak(buf, t, ['mdia', 'hdlr']).body.subarray(8, 12)) === h);

test('finishes Jerry-shaped files: source audio verbatim, one-frame hold, consistent headers', () => {
  const src = source();
  const gen = generated();
  const { bytes, report } = finishSourceEditMp4({ generated: gen, source: src, expected });
  assert.equal(report.status, 'finished');
  assert.equal(report.videoHoldTicks, 512);
  assert.ok(Math.abs(report.videoHoldSeconds - 0.041667) < 1e-5);
  assert.equal(traks(bytes).length, 2, 'generated audio dropped');
  assert.equal(report.droppedGeneratedAudioTracks, 1);

  const mv = dv(find(bytes, ['moov', 'mvhd']));
  assert.equal(mv.getUint32(12), 1000);
  assert.equal(mv.getUint32(16), 12536, 'movie keeps exact source max duration');

  const v = byHandler(bytes, 'vide');
  const stts = dv(inTrak(bytes, v, ['mdia', 'minf', 'stbl', 'stts']));
  assert.deepEqual([stts.getUint32(4), stts.getUint32(8), stts.getUint32(12), stts.getUint32(16), stts.getUint32(20)], [2, 296, 512, 1, 1024]);
  assert.equal(dv(inTrak(bytes, v, ['mdia', 'mdhd'])).getUint32(16), 152576);
  const vElst = dv(inTrak(bytes, v, ['edts', 'elst']));
  assert.equal(vElst.getUint32(8), 12417);
  assert.equal(vElst.getInt32(12), 2048, 'generated edit media_time preserved');
  assert.equal(dv(inTrak(bytes, v, ['tkhd'])).getUint32(20), 12417);

  const a = byHandler(bytes, 'soun');
  const aElst = dv(inTrak(bytes, a, ['edts', 'elst']));
  assert.equal(aElst.getUint32(8), 12536);
  assert.equal(aElst.getInt32(12), 5058, 'source audio edit-list media_time preserved');
  assert.equal(dv(inTrak(bytes, a, ['mdia', 'mdhd'])).getUint32(16), 552834);
  assert.deepEqual(inTrak(bytes, a, ['mdia', 'minf', 'stbl', 'stts']).body, inTrak(src, byHandler(src, 'soun'), ['mdia', 'minf', 'stbl', 'stts']).body);
});

test('track-ID collision: source audio ID2 vs generated video ID2', () => {
  const { bytes, report } = finishSourceEditMp4({ generated: generated(), source: source(), expected });
  const ids = traks(bytes).map((t) => dv(inTrak(bytes, t, ['tkhd'])).getUint32(12));
  assert.deepEqual(ids.sort(), [2, 3]);
  assert.equal(report.audioTrackId, 3);
  assert.equal(report.sourceAudioTrackIdOriginal, 2);
  const mv = find(bytes, ['moov', 'mvhd']).body;
  assert.equal(new DataView(mv.buffer, mv.byteOffset).getUint32(mv.length - 4), 4, 'next_track_ID');
});

test('chunk offsets are rewritten to the relocated sample bytes', () => {
  const src = source();
  const gen = generated();
  const { bytes } = finishSourceEditMp4({ generated: gen, source: src, expected });
  assert.deepEqual(chunkBytes(bytes, byHandler(bytes, 'soun')), chunkBytes(src, byHandler(src, 'soun')));
  assert.deepEqual(chunkBytes(bytes, byHandler(bytes, 'vide')), chunkBytes(gen, byHandler(gen, 'vide')));
  const mdat = find(bytes, ['mdat']);
  assert.equal(mdat.end, bytes.length);
});

test('no hold when durations already match', () => {
  const { report } = finishSourceEditMp4({ generated: generated({ stts: [[298, 512]], sizes: new Array(298).fill(11), edit: [[12417, 2048]] }), source: source(), expected });
  assert.equal(report.videoHoldTicks, 0);
});

test('rejects timeline differences over two source frames', () => {
  assert.throws(() => finishSourceEditMp4({ generated: generated({ stts: [[295, 512]], sizes: new Array(295).fill(11) }), source: source(), expected }),
    (e) => e instanceof Mp4FinishError && e.code === 'timeline_difference');
  assert.throws(() => finishSourceEditMp4({ generated: generated({ stts: [[299, 512]], sizes: new Array(299).fill(11) }), source: source(), expected }),
    (e) => e.code === 'timeline_difference', 'generated longer is never trimmed silently');
});

test('rejects malformed, fragmented and encrypted input', () => {
  const gen = generated();
  assert.throws(() => finishSourceEditMp4({ generated: gen.subarray(0, gen.length - 40), source: source(), expected }), (e) => e.code === 'invalid_box');
  const moof = box('moof', box('mfhd', new Uint8Array(8)));
  assert.throws(() => finishSourceEditMp4({ generated: concat([gen, moof]), source: source(), expected }), (e) => e.code === 'fragmented');
  assert.throws(() => finishSourceEditMp4({ generated: generated({ entry: 'encv' }), source: source(), expected }), (e) => e.code === 'encrypted');
  const bad = generated().slice();
  new DataView(bad.buffer).setUint32(0, 0xffffff); // ftyp overruns file
  assert.throws(() => finishSourceEditMp4({ generated: bad, source: source(), expected }), (e) => e.code === 'invalid_box');
});

test('rejects source metadata that disagrees with the declared clip', () => {
  assert.throws(() => finishSourceEditMp4({ generated: generated(), source: source(), expected: { ...expected, width: 1080 } }), (e) => e.code === 'metadata_mismatch');
  assert.throws(() => finishSourceEditMp4({ generated: generated(), source: source(), expected: { ...expected, duration: 13 } }), (e) => e.code === 'metadata_mismatch');
});

test('source without audio is explicitly skipped, bytes untouched', () => {
  const gen = generated();
  const { bytes, report } = finishSourceEditMp4({ generated: gen, source: source({ noAudio: true }), expected });
  assert.equal(report.status, 'skipped');
  assert.equal(report.reason, 'source_has_no_audio');
  assert.equal(bytes, gen);
});

test('gate: only Kling O3 source edit with keep_audio=true', () => {
  const on = { source_video_edit: true, keep_audio: true, video_model: 'kling-o3-pro-video-edit' };
  assert.equal(shouldFinishSourceEdit(on), true);
  assert.equal(shouldFinishSourceEdit({ ...on, keep_audio: false }), false);
  assert.equal(shouldFinishSourceEdit({ ...on, video_model: 'seedance-2.0' }), false);
  assert.equal(shouldFinishSourceEdit({ ...on, source_video_edit: undefined }), false);
  assert.equal(shouldFinishSourceEdit(null), false);
});

/* ------------------------- hardening: malformed tables ------------------------- */
const rejects = (gen, code, src = source()) =>
  assert.throws(() => finishSourceEditMp4({ generated: gen, source: src, expected }), (e) => e instanceof Mp4FinishError && e.code === code);

test('stts sample count must match stsz', () => {
  rejects(generated({ stts: [[296, 512]], mdhdDur: 152064 }), 'invalid_table');
});
test('stts duration must match mdhd', () => {
  rejects(generated({ mdhdDur: 152000 }), 'invalid_table');
});
test('zero stts count or delta is rejected', () => {
  rejects(generated({ stts: [[296, 512], [1, 0]], mdhdDur: 151552 }), 'invalid_table');
  rejects(generated({ stts: [[0, 512], [297, 512]] }), 'invalid_table');
});
test('ctts must cover every sample; standard B-frame ctts passes', () => {
  rejects(generated({ ctts: [[296, 1024]] }), 'invalid_table');
  rejects(generated({ ctts: [[0, 1024], [297, 1024]] }), 'invalid_table');
  // Standard B-frame ctts covering every sample is accepted and copied unchanged.
  const { report } = finishSourceEditMp4({ generated: generated({ ctts: [[1, 1024], [1, 2560], [295, 1024]] }), source: source(), expected });
  assert.equal(report.status, 'finished');
});
test('zero samples-per-chunk and zero description index are rejected', () => {
  rejects(generated({ stscRows: [[1, 0, 1]] }), 'invalid_table');
  rejects(generated({ stscRows: [[1, 7, 0]] }), 'invalid_table');
});
test('chunks must lie inside an mdat payload, not elsewhere in the file', () => {
  rejects(generated({ offsetDelta: -200 }), 'chunk_outside_mdat');
});
test('non-unit edit rates and complex video edit lists are rejected', () => {
  rejects(generated({ edit: [[12375, 2048, 0x20000]] }), 'unsupported_edit');
  rejects(generated({ edit: [[40, -1], [12335, 2048]] }), 'unsupported_edit');
  rejects(generated({ edit: [[6000, 2048], [6375, 80000]] }), 'unsupported_edit');
  rejects(generated(), 'unsupported_edit', buildMp4({ movieDur: 12536, tracks: [srcVideo, { ...srcAudio, edit: [[12536, 5058, 0x8000]] }] }));
});
test('memory budget: combined inputs + output must stay under the budget', async () => {
  const mod = await import('../../supabase/functions/_shared/mp4-source-audio-finish.ts');
  assert.ok(mod.FINISH_MAX_INPUT_BYTES * 2 + mod.FINISH_MAX_INPUT_BYTES * 2 > mod.FINISH_MEMORY_BUDGET_BYTES, 'per-input limits alone would exceed it, so the budget check is needed');
  assert.ok(mod.FINISH_MEMORY_BUDGET_BYTES <= 128_000_000);
});
