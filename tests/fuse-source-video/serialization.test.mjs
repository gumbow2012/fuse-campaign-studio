import './harness.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {database,source} from './harness.mjs';
await import('../../supabase/functions/outfit-swap-to-template/index.ts');
const handler=globalThis.handler;
const body={name:'Creator draft',sourceVideo:source,frames:[{url:'https://image.test/approved.png'}],products:[{url:'https://image.test/hoodie.png',type:'top'}],videoModel:'seedance-2.0',resolution:'720p',duration:13};
const request=(data)=>new Request('https://fuse.test/create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});

test('serialization creates a hidden video asset, persistent path and a typed edge', async () => {
  globalThis.testAdmin=database();globalThis.providerCalls.length=0;
  const response=await handler(request(body));
  assert.equal(response.status,200,await response.clone().text());
  const {tables}=globalThis.testAdmin;
  const sourceNode=tables.nodes.find(n=>n.prompt_config.outfit_swap_role==='source_video');
  const asset=tables.assets.find(a=>a.id===sourceNode.default_asset_id);
  const final=tables.nodes.find(n=>n.prompt_config.outfit_swap_role==='reconstruction');
  assert.equal(asset.asset_type,'video');
  assert.equal(asset.supabase_storage_url,`fuse-assets:${source.path}`);
  assert.equal(sourceNode.prompt_config.weavy_exposed,false);
  assert.equal(sourceNode.prompt_config.locked,true);
  assert.equal(sourceNode.prompt_config.media_type,'video');
  assert.equal(final.prompt_config.requires_source_video,true);
  assert.equal(final.prompt_config.generate_audio,false);
  assert.match(final.prompt_config.prompt,/@Video1/);
  assert.equal(tables.edges.filter(e=>e.source_node_id===sourceNode.id&&e.target_node_id===final.id&&e.mapping_logic.target_param==='video_1').length,1);
  assert.equal(tables.template_versions[0].is_active,false);
  assert.equal(globalThis.providerCalls.length,0);
});
test('missing source rejects before any template or asset writes', async () => {
  globalThis.testAdmin=database();
  const response=await handler(request({...body,sourceVideo:null}));
  assert.ok(response.status>=400);
  assert.equal(globalThis.testAdmin.writes.length,0);
});
test('unsupported provider settings reject before template writes', async () => {
  globalThis.testAdmin=database();
  const response=await handler(request({...body,videoModel:'seedance-2.0-fast',resolution:'1080p'}));
  assert.ok(response.status>=400);
  assert.equal(globalThis.testAdmin.writes.length,0);
});
