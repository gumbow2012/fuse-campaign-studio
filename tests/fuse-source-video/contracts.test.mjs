import './harness.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { source, storage } from './harness.mjs';
const {readSourceVideo, referenceMediaType, assertVideoReferenceRoute, sourceMotionPrompt} = await import('../../supabase/functions/_shared/video-reference.ts');
const {resolveOwnedSourceVideo} = await import('../../supabase/functions/_shared/source-video.ts');
const {resolveRequiredVideoUrls} = await import('../../supabase/functions/_shared/asset-access.ts');
const {buildSeedanceReferenceInput, submitSeedanceReferenceVideoJob} = await import('../../supabase/functions/_shared/fal.ts');

test('source contract accepts Jerry clip metadata and only the current uploader namespace', () => {
  assert.deepEqual(readSourceVideo(source, 'user-1'), source);
  for (const patch of [{path:source.path.replace('user-1','user-2')}, {path:source.path.replace('run-1','..')}, {path:source.path.replace('run-1','%2e%2e')}, {duration:15.1}, {duration:0}, {width:0}, {path:'https://external.test/clip.mp4'}]) {
    assert.throws(() => readSourceVideo({...source,...patch}, 'user-1'));
  }
});
test('source persistence stores no access token and mints a fresh provider URL', async () => {
  const value = await resolveOwnedSourceVideo({storage:storage()}, 'user-1', source);
  assert.equal(value.canonicalUrl, `fuse-assets:${source.path}`);
  assert.match(value.executionUrl,/token=fresh/);
});
test('storage errors, incorrect MIME, missing file and size limit fail before submission', async () => {
  for(const options of [{missing:true},{size:50_000_000},{size:0},{mime:'image/png'},{signError:true}]) {
    await assert.rejects(resolveOwnedSourceVideo({storage:storage(options)},'user-1',source));
  }
  await assert.rejects(resolveRequiredVideoUrls({storage:storage({signError:true})},[`fuse-assets:${source.path}`]),/Could not access/);
});
test('video is typed from asset metadata or explicit input configuration', () => {
  assert.equal(referenceMediaType('generated_video'), 'video');
  assert.equal(referenceMediaType('reference_image',{editor_expected:'video'}), 'video');
  assert.equal(referenceMediaType('reference_image'), 'image');
});
test('missing and incompatible source reference routes fail closed', () => {
  assert.throws(() => assertVideoReferenceRoute({requires_source_video:true},0,true),/missing/);
  assert.throws(() => assertVideoReferenceRoute({video_mode:'multi_reference'},1,false),/Seedance/);
  assert.throws(() => assertVideoReferenceRoute({},1,true),/Seedance/);
});
test('actual fal builder separates image and video conditioning; supports one image or video only', () => {
  for (const imageUrls of [[],['https://image.test/1.png']]) {
    const result=buildSeedanceReferenceInput({modelKey:'seedance-2.0',prompt:sourceMotionPrompt('Wardrobe'),imageUrls,videoUrls:['https://video.test/source.mp4'],duration:13,resolution:'720p',generateAudio:false});
    assert.equal(result.endpointId,'bytedance/seedance-2.0/reference-to-video');
    assert.deepEqual(result.input.image_urls,imageUrls);
    assert.deepEqual(result.input.video_urls,['https://video.test/source.mp4']);
    assert.equal(result.input.generate_audio,false);
    assert.match(result.input.prompt,/@Video1/);
  }
});
test('legacy images-only input remains supported, with no video_urls field', () => {
  const result=buildSeedanceReferenceInput({modelKey:'seedance-2.0-fast',prompt:'Legacy',imageUrls:['https://image.test/a','https://image.test/b'],resolution:'720p'});
  assert.equal(result.endpointId,'bytedance/seedance-2.0/fast/reference-to-video');
  assert.equal(Object.hasOwn(result.input,'video_urls'),false);
  assert.throws(() => buildSeedanceReferenceInput({modelKey:'seedance-2.0',prompt:'One',imageUrls:['a']}),/two images/);
});
test('reference caps and temporary video URLs reject before mock queue submission', async () => {
  globalThis.providerCalls.length=0;
  const base={modelKey:'seedance-2.0',prompt:'Test',imageUrls:[],videoUrls:['https://video.test/source.mp4'],webhookUrl:'https://callback.test'};
  for(const patch of [{imageUrls:Array.from({length:10},(_,i)=>`https://image.test/${i}`)}, {videoUrls:Array.from({length:4},(_,i)=>`https://video.test/${i}`)}, {videoUrls:['blob:local']}, {modelKey:'kling-2.5'}, {modelKey:'seedance-2.0-fast',resolution:'1080p'}]) {
    await assert.rejects(submitSeedanceReferenceVideoJob({...base,...patch}));
  }
  assert.equal(globalThis.providerCalls.length,0);
});
