/**
 * Regression for the early locked-source preflight in _shared/executor.ts.
 *
 * A real complete run of a connected Kling source-edit graph failed at progress
 * 0 with "Video references require a Seedance multi-reference step", because the
 * early preflight omitted the supportsSourceVideoEdit argument and judged the
 * source-edit route by the multi-reference rule. These cases drive runGraphJob
 * end to end — the helper is never called in isolation — so the wiring itself
 * is what is proven.
 */
import './harness.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture, source} from './harness.mjs';

const {runGraphJob} = await import('../../supabase/functions/_shared/executor.ts');

const SOURCE_EDIT_MODEL = 'kling-o3-pro-video-edit';

/** A connected source-edit graph: four image references plus one source clip. */
function sourceEditGraph({video = true, extraSource = false} = {}) {
  const admin = fixture({video, images: 4, model: SOURCE_EDIT_MODEL});
  const final = admin.tables.nodes.find((node) => node.id === 'final');
  final.name = 'Kling O3 Pro · Final Video';
  final.prompt_config = {
    prompt: 'Edit @Video1 and keep its exact duration, cuts and soundtrack.',
    video_model: SOURCE_EDIT_MODEL,
    video_mode: 'source_video_edit',
    requires_source_video: true,
    keep_source_audio: true,
    output_exposed: true,
    source_video: {duration: source.duration, width: source.width, height: source.height},
  };

  if (extraSource) {
    admin.tables.assets.push({
      id: 'source2-asset',
      asset_type: 'video',
      supabase_storage_url: `fuse-assets:${source.path}`,
    });
    admin.tables.nodes.push({
      id: 'source2',
      version_id: 'version',
      name: 'source2',
      node_type: 'user_input',
      default_asset_id: 'source2-asset',
      prompt_config: {editor_expected: 'video', editor_mode: 'reference', outfit_swap_role: 'source_video', locked: true, required: true},
    });
    admin.tables.edges.push({
      id: 'source2-edge',
      version_id: 'version',
      source_node_id: 'source2',
      target_node_id: 'final',
      mapping_logic: {target_param: 'video_2', edge_order: 6},
    });
  }

  return admin;
}

test('a connected Kling source-edit graph clears the early preflight and reaches its own route', async () => {
  const admin = sourceEditGraph();
  globalThis.providerCalls.length = 0;

  await runGraphJob(admin, 'job');

  assert.equal(globalThis.providerCalls.length, 1, 'the run must reach exactly one provider submission');
  const call = globalThis.providerCalls[0];
  assert.match(call.endpoint, /kling-video\/o3\/pro\/video-to-video\/edit/);
  assert.match(call.input.video_url, /storage\.example\.test/, 'the source clip is signed, not raw');
  assert.equal(Object.hasOwn(call.input, 'duration'), false);
  assert.equal(Object.hasOwn(call.input, 'resolution'), false);
  assert.equal(Object.hasOwn(call.input, 'generate_audio'), false);
});

test('the early preflight no longer misroutes a source-edit graph to the multi-reference rule', async () => {
  const admin = sourceEditGraph();
  globalThis.providerCalls.length = 0;

  // The exact failure observed on run bed1f512-aa04-4cc3-83e5-cf68638b314f.
  await assert.doesNotReject(
    runGraphJob(admin, 'job'),
    /Seedance multi-reference/,
  );
  const job = admin.tables.execution_jobs[0];
  assert.notEqual(job.status, 'failed');
  assert.notMatch(String(job.error ?? ''), /Seedance multi-reference/);
});

test('a missing source clip still rejects before any paid work', async () => {
  const admin = sourceEditGraph({video: false});
  globalThis.providerCalls.length = 0;

  await assert.rejects(runGraphJob(admin, 'job'), /source video is missing/);
  assert.equal(globalThis.providerCalls.length, 0);
  assert.equal(admin.writes.some((write) => write.table === 'execution_steps'), false);
});

test('more than one source clip still rejects before any paid work', async () => {
  const admin = sourceEditGraph({extraSource: true});
  globalThis.providerCalls.length = 0;

  await assert.rejects(runGraphJob(admin, 'job'), /exactly one source clip/);
  assert.equal(globalThis.providerCalls.length, 0);
});
