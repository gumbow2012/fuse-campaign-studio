import './harness.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {database,source} from './harness.mjs';
const {startReconstruction} = await import('../../supabase/functions/outfit-swap/index.ts');
const args={userId:'user-1',sourceVideo:source,frameUrls:['https://image.test/approved.png'],garments:[],model:'seedance-2.0',duration:13,resolution:'720p',generateAudio:false,webhookBase:'https://callback.test/?id='};

test('direct Outfit Swap reconstruction includes the uploaded source and an approved still',async()=>{
  const admin=database();globalThis.providerCalls.length=0;
  const result=await startReconstruction(admin,args);
  assert.equal(result.status,'running');
  assert.equal(globalThis.providerCalls.length,1);
  const {input}=globalThis.providerCalls[0];
  assert.deepEqual(input.image_urls,args.frameUrls);
  assert.match(input.video_urls[0],/source.mp4\?token=fresh/);
  assert.equal(input.generate_audio,false);
  assert.match(input.prompt,/@Video1/);
  assert.deepEqual(admin.tables.studio_generations[0].input_payload.source_video,source);
});
test('missing source blocks reconstruction before writing a generation record',async()=>{
  const admin=database();globalThis.providerCalls.length=0;
  await assert.rejects(startReconstruction(admin,{...args,sourceVideo:null}),/Upload a source/);
  assert.equal(admin.writes.length,0);
  assert.equal(globalThis.providerCalls.length,0);
});
