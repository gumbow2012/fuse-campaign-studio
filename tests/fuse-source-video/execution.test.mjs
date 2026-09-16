import './harness.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './harness.mjs';
const {startRun, resolveNodeInputs} = await import('../../supabase/functions/run-node/index.ts');
const {runGraphJob, runSeedanceMultiReference} = await import('../../supabase/functions/_shared/executor.ts');
const args={versionId:'version',nodeId:'final',userId:'user-1'};

test('single-node run sends the signed source plus only image references', async () => {
  const admin=fixture(); globalThis.providerCalls.length=0;
  const result=await startRun(admin,args);
  assert.equal(result.status,'running');
  assert.equal(globalThis.providerCalls.length,1);
  const request=globalThis.providerCalls[0];
  assert.equal(request.endpoint,'bytedance/seedance-2.0/reference-to-video');
  assert.equal(request.input.image_urls.length,2);
  assert.equal(request.input.video_urls.length,1);
  assert.match(request.input.video_urls[0],/source.mp4\?token=fresh/);
  assert.equal(request.input.image_urls.some(url=>url.includes('mp4')),false);
  assert.deepEqual(admin.tables.node_runs[0].input_payload.video_urls,request.input.video_urls);
});
test('an asset-backed video keeps its type even when stale upstream output says image', async () => {
  const admin=fixture();
  admin.tables.node_runs.push({node_id:'source',status:'complete',output_url:'https://image.test/stale.png',output_type:'image'});
  const result=await resolveNodeInputs(admin,{...args,node:admin.tables.nodes[0],nodes:admin.tables.nodes,edges:admin.tables.edges});
  assert.equal(result.params.find(p=>p.param==='video_1').type,'video');
});
test('single-node missing source, missing image, wrong model and image-step video fail without a queue call', async () => {
  const missingImage=fixture(); missingImage.tables.assets=missingImage.tables.assets.filter(a=>a.id!=='image1-asset');
  for(const admin of [fixture({video:false}),fixture({model:'kling-2.5'}),fixture({type:'image_gen'}),missingImage]) {
    globalThis.providerCalls.length=0;
    await assert.rejects(startRun(admin,args));
    assert.equal(globalThis.providerCalls.length,0);
  }
});
test('legacy single-image route still uses image-to-video', async () => {
  const admin=fixture({video:false,images:1,required:false});globalThis.providerCalls.length=0;
  await startRun(admin,args);
  assert.match(globalThis.providerCalls[0].endpoint,/image-to-video/);
  assert.equal(Object.hasOwn(globalThis.providerCalls[0].input,'video_urls'),false);
});
test('full graph rejects missing required source before any step is queued', async () => {
  const admin=fixture({video:false});globalThis.providerCalls.length=0;
  await assert.rejects(runGraphJob(admin,'job'),/source video is missing/);
  assert.equal(globalThis.providerCalls.length,0);
  assert.equal(admin.writes.some(w=>w.table==='execution_steps'),false);
});
test('full graph source signing failure blocks all paid work', async () => {
  const admin=fixture();globalThis.providerCalls.length=0;
  admin.storage.from=()=>({createSignedUrl:async()=>({error:new Error('denied')})});
  await assert.rejects(runGraphJob(admin,'job'),/Could not access required source/);
  assert.equal(globalThis.providerCalls.length,0);
});
test('full graph ignores an attempted override of the locked creator clip', async () => {
  const admin=fixture();globalThis.providerCalls.length=0;
  admin.tables.execution_jobs[0].input_payload={source:'https://unrelated.test/changed.mp4'};
  await runGraphJob(admin,'job');
  assert.equal(globalThis.providerCalls.length,1);
  assert.match(globalThis.providerCalls[0].input.video_urls[0],/storage.example.test/);
});
test('full graph reference submission forwards both modalities and logs the count', async () => {
  const admin=fixture();globalThis.providerCalls.length=0;
  await runSeedanceMultiReference(admin,{jobId:'job',step:admin.tables.execution_steps[0],node:admin.tables.nodes[0],prompt:'Follow @Video1',imageUrls:['https://image.test/approved.png'],videoUrls:['https://video.test/source.mp4']});
  assert.deepEqual(globalThis.providerCalls[0].input.video_urls,['https://video.test/source.mp4']);
  assert.equal(admin.tables.execution_steps[0].input_payload.reference_video_count,1);
});
