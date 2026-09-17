/**
 * Regression tests for single-step preview input resolution (the Jerry
 * "Pass the Fit" root cause: the test-panel uploads were ignored, generated
 * stills stood in for customer uploads, and dropped refs renumbered Ref N).
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  resolveSingleNodeInputs,
} from '../../supabase/functions/_shared/single-node-inputs.ts';

const TEMPLATE = 'Pass the Fit';

function upload(id, { slot = id, optional = false, expected = 'image' } = {}) {
  return {
    id,
    name: id,
    node_type: 'user_input',
    default_asset_id: null,
    prompt_config: {
      editor_mode: 'upload',
      editor_slot_key: slot,
      editor_expected: expected,
      ...(optional ? { required: false } : { required: true }),
    },
  };
}

function hidden(id, assetId, { expected = 'image', extra = {} } = {}) {
  return {
    id,
    name: id,
    node_type: 'user_input',
    default_asset_id: assetId,
    prompt_config: { editor_mode: 'reference', editor_expected: expected, ...extra },
  };
}

const finalNode = {
  id: 'final',
  name: 'Final video',
  node_type: 'video_gen',
  default_asset_id: null,
  prompt_config: {},
};

function edge(sourceId, order, param = `image_${order}`) {
  return {
    id: `${sourceId}-edge`,
    source_node_id: sourceId,
    target_node_id: 'final',
    mapping_logic: { target_param: param, edge_order: order },
  };
}

function assets(entries) {
  return new Map(entries.map(([id, url, type]) => [id, { id, supabase_storage_url: url, asset_type: type ?? 'image' }]));
}

test('four garment uploads plus an optional identity resolve in order from the panel selection', () => {
  const nodes = [
    finalNode,
    upload('hoodie_front'),
    upload('hoodie_back'),
    upload('shorts_front'),
    upload('shorts_back'),
    upload('identity', { optional: true }),
  ];
  const edges = [
    edge('hoodie_front', 1),
    edge('hoodie_back', 2),
    edge('shorts_front', 3),
    edge('shorts_back', 4),
    edge('identity', 5),
  ];

  const resolved = resolveSingleNodeInputs({
    templateName: TEMPLATE,
    node: finalNode,
    nodes,
    edges,
    assets: assets([]),
    suppliedInputs: {
      hoodie_front: 'https://cdn.test/hf.png',
      hoodie_back: 'https://cdn.test/hb.png',
      shorts_front: 'https://cdn.test/sf.png',
      shorts_back: 'https://cdn.test/sb.png',
      identity: 'https://cdn.test/id.png',
    },
  });

  assert.deepEqual(resolved.refs.map((ref) => ref.url), [
    'https://cdn.test/hf.png',
    'https://cdn.test/hb.png',
    'https://cdn.test/sf.png',
    'https://cdn.test/sb.png',
    'https://cdn.test/id.png',
  ]);
  assert.deepEqual(resolved.refs.map((ref) => ref.refIndex), [1, 2, 3, 4, 5]);
  assert.ok(resolved.refs.every((ref) => ref.origin === 'upload'));
});

test('a missing required back view fails before any charge or submit', () => {
  const nodes = [finalNode, upload('hoodie_front'), upload('hoodie_back')];
  const edges = [edge('hoodie_front', 1), edge('hoodie_back', 2)];

  assert.throws(
    () => resolveSingleNodeInputs({
      templateName: TEMPLATE,
      node: finalNode,
      nodes,
      edges,
      assets: assets([]),
      suppliedInputs: { hoodie_front: 'https://cdn.test/hf.png' },
    }),
    /hoodie_back \(no file is selected for it\)[\s\S]*Nothing was charged\./,
  );
});

test('an empty optional reference in the MIDDLE fails instead of renumbering Ref N', () => {
  const nodes = [
    finalNode,
    upload('hoodie_front'),
    upload('identity', { optional: true }),
    upload('shorts_front'),
  ];
  const edges = [edge('hoodie_front', 1), edge('identity', 2), edge('shorts_front', 3)];

  assert.throws(
    () => resolveSingleNodeInputs({
      templateName: TEMPLATE,
      node: finalNode,
      nodes,
      edges,
      assets: assets([]),
      suppliedInputs: {
        hoodie_front: 'https://cdn.test/hf.png',
        shorts_front: 'https://cdn.test/sf.png',
      },
    }),
    /would shift position and change meaning/,
  );
});

test('a trailing optional identity may stay empty and keeps earlier Ref numbers', () => {
  const nodes = [finalNode, upload('hoodie_front'), upload('identity', { optional: true })];
  const edges = [edge('hoodie_front', 1), edge('identity', 2)];

  const resolved = resolveSingleNodeInputs({
    templateName: TEMPLATE,
    node: finalNode,
    nodes,
    edges,
    assets: assets([]),
    suppliedInputs: { hoodie_front: 'https://cdn.test/hf.png' },
  });

  assert.equal(resolved.refs.length, 1);
  assert.equal(resolved.refs[0].refIndex, 1);
  assert.deepEqual(resolved.omittedTrailingOptional, ['identity']);
});

test('a replaced hidden reference takes effect immediately (no stale generated still)', () => {
  const nodes = [finalNode, hidden('guide', 'guide-asset-v2')];
  const edges = [edge('guide', 1)];

  const resolved = resolveSingleNodeInputs({
    templateName: TEMPLATE,
    node: finalNode,
    nodes,
    edges,
    assets: assets([['guide-asset-v2', 'https://cdn.test/frame-1s-v2.png']]),
    // An old generated still for the same node must be ignored.
    upstreamOutputs: new Map([['guide', { url: 'https://cdn.test/OLD-generated.png', type: 'image' }]]),
  });

  assert.equal(resolved.refs[0].url, 'https://cdn.test/frame-1s-v2.png');
  assert.equal(resolved.refs[0].origin, 'asset');
});

test('an upload slot with no selection falls back to its built-in default identity, never to an old output', () => {
  const identity = upload('identity', { optional: true });
  identity.default_asset_id = 'default-identity';
  const nodes = [finalNode, identity];
  const edges = [edge('identity', 1)];

  const resolved = resolveSingleNodeInputs({
    templateName: TEMPLATE,
    node: finalNode,
    nodes,
    edges,
    assets: assets([['default-identity', 'https://cdn.test/original-woman.png']]),
    upstreamOutputs: new Map([['identity', { url: 'https://cdn.test/OLD-generated.png', type: 'image' }]]),
  });

  assert.equal(resolved.refs[0].url, 'https://cdn.test/original-woman.png');
  assert.equal(resolved.refs[0].origin, 'asset');
});

test('a locked source video always comes from its stored clip, and generative steps use their newest output', () => {
  const nodes = [
    finalNode,
    hidden('source', 'source-asset', {
      expected: 'video',
      extra: { outfit_swap_role: 'source_video', locked: true, required: true },
    }),
    { id: 'edit', name: 'Edited still', node_type: 'image_gen', default_asset_id: null, prompt_config: {} },
  ];
  const edges = [edge('edit', 1), edge('source', 2, 'video_1')];

  const resolved = resolveSingleNodeInputs({
    templateName: TEMPLATE,
    node: finalNode,
    nodes,
    edges,
    assets: assets([['source-asset', 'fuse-assets:system/outfit-swap/user-1/run-1/source.mp4', 'video']]),
    suppliedInputs: { source: 'https://cdn.test/should-be-ignored.mp4' },
    upstreamOutputs: new Map([['edit', { url: 'https://cdn.test/edited.png', type: 'image' }]]),
  });

  assert.equal(resolved.refs[0].url, 'https://cdn.test/edited.png');
  assert.equal(resolved.refs[0].origin, 'step_output');
  assert.equal(resolved.refs[1].url, 'fuse-assets:system/outfit-swap/user-1/run-1/source.mp4');
  assert.equal(resolved.refs[1].type, 'video');
});
