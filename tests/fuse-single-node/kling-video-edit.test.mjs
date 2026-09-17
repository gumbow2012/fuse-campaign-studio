/**
 * Source-video editing route (Kling O3 Pro video-to-video edit) contract tests.
 * No network, no credentials: the fal client is stubbed.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { registerHooks } from 'node:module';

globalThis.Deno = { env: { get: () => 'test-only' } };
globalThis.falSubmissions = [];
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'npm:@fal-ai/client') {
      return {
        url: 'data:text/javascript,' + encodeURIComponent(
          `export const fal = { config() {}, queue: { submit: async (endpoint, request) => {`
          + ` globalThis.falSubmissions.push({ endpoint, ...request }); return { request_id: 'req-1' }; } } };`,
        ),
        shortCircuit: true,
      };
    }
    return nextResolve(specifier, context);
  },
});

const {
  KLING_VIDEO_EDIT_ENDPOINT,
  buildKlingVideoEditInput,
  submitKlingVideoEditJob,
  getVideoModel,
} = await import('../../supabase/functions/_shared/fal.ts');

const base = {
  prompt: 'Replace the hoodie on @Video1.',
  videoUrl: 'https://storage.test/source.mp4?token=fresh',
  sourceDurationSec: 12.535918,
  sourceWidth: 720,
  sourceHeight: 1280,
};

test('the model registry exposes the route as its own model, not an alias of Kling 3.0', () => {
  const model = getVideoModel('kling-o3-pro-video-edit');
  assert.equal(model.key, 'kling-o3-pro-video-edit');
  assert.equal(model.family, 'kling_v2v');
  assert.equal(model.endpointId, 'fal-ai/kling-video/o3/pro/video-to-video/edit');
  assert.equal(model.requiresSourceVideo, true);
  assert.equal(model.maxReferences, 4);
  assert.notEqual(getVideoModel('kling-3.0-pro').endpointId, model.endpointId);
});

test('payload uses the official endpoint and omits duration, resolution and generate_audio', () => {
  const { endpointId, input } = buildKlingVideoEditInput({
    ...base,
    imageUrls: ['https://cdn.test/a.png', 'https://cdn.test/b.png'],
  });

  assert.equal(endpointId, KLING_VIDEO_EDIT_ENDPOINT);
  assert.equal(input.video_url, base.videoUrl);
  assert.deepEqual(input.image_urls, ['https://cdn.test/a.png', 'https://cdn.test/b.png']);
  assert.equal(input.shot_type, 'customize');
  assert.equal(input.keep_audio, true);
  for (const key of ['duration', 'resolution', 'generate_audio', 'aspect_ratio']) {
    assert.equal(key in input, false, `${key} must never be sent`);
  }
});

test('keep_audio follows the source-audio control', () => {
  assert.equal(buildKlingVideoEditInput({ ...base, keepAudio: false }).input.keep_audio, false);
  assert.equal(buildKlingVideoEditInput({ ...base, keepAudio: true }).input.keep_audio, true);
});

test('a missing source clip fails before submission', () => {
  assert.throws(() => buildKlingVideoEditInput({ ...base, videoUrl: '' }), /needs its source clip/);
  assert.throws(
    () => buildKlingVideoEditInput({ ...base, videoUrl: 'fuse-assets:system/outfit-swap/u/r/source.mp4' }),
    /reachable over HTTPS/,
  );
  assert.equal(globalThis.falSubmissions.length, 0);
});

test('out-of-range clips and too many references fail before submission', () => {
  assert.throws(() => buildKlingVideoEditInput({ ...base, sourceDurationSec: 30 }), /between 3 and 15 seconds/);
  assert.throws(() => buildKlingVideoEditInput({ ...base, sourceWidth: 480 }), /between 720 and 3840 pixels/);
  assert.throws(
    () => buildKlingVideoEditInput({
      ...base,
      imageUrls: ['a', 'b', 'c', 'd'].map((n) => `https://cdn.test/${n}.png`),
      elements: [{ type: 'garment' }],
    }),
    /at most 4 references in total — 5 were supplied/,
  );
  assert.equal(globalThis.falSubmissions.length, 0);
});

test('submission goes to the signed source URL through the queue with a webhook', async () => {
  const result = await submitKlingVideoEditJob({
    ...base,
    imageUrls: ['https://cdn.test/a.png'],
    webhookUrl: 'https://project.test/functions/v1/fal-webhook?jobId=job&stepId=step',
  });

  assert.equal(result.requestId, 'req-1');
  assert.equal(result.endpointId, KLING_VIDEO_EDIT_ENDPOINT);
  const submission = globalThis.falSubmissions.at(-1);
  assert.equal(submission.endpoint, KLING_VIDEO_EDIT_ENDPOINT);
  assert.equal(submission.input.video_url, base.videoUrl);
  assert.equal(submission.webhookUrl, 'https://project.test/functions/v1/fal-webhook?jobId=job&stepId=step');
});

test('duplicate image references are de-duplicated so Ref counts stay honest', () => {
  const { input } = buildKlingVideoEditInput({
    ...base,
    imageUrls: ['https://cdn.test/a.png', 'https://cdn.test/a.png', ' https://cdn.test/b.png '],
  });
  assert.deepEqual(input.image_urls, ['https://cdn.test/a.png', 'https://cdn.test/b.png']);
});
