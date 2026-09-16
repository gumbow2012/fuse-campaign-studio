import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';

// No credentials, network, storage writes or provider calls leave this process.
globalThis.Deno = { env: { get: () => 'test-only' }, serve: (handler) => { globalThis.handler = handler; } };
globalThis.providerCalls = [];
globalThis.fetch = async () => { throw new Error('Network disabled in source-video tests'); };
const stubs = {
  'npm:@fal-ai/client': `export const fal = { config() {}, queue: { submit: async (endpoint, request) => { globalThis.providerCalls.push({endpoint, ...request}); return {request_id: 'mock-request'}; } } };`,
  'supabase-admin.ts': `export const corsHeaders = {}; export const createAdminClient = () => globalThis.testAdmin; export const errorMessage = e => e.message; export const json = (data, status = 200) => new Response(JSON.stringify(data), {status}); export const requireBuilderUser = async () => ({user: {id: 'user-1'}}); export const logAuditEvent = async () => {};`,
  'template-scope.ts': `export const assertVersionAccess = async () => {}; export const FORBIDDEN_TEMPLATE_MESSAGE = 'Forbidden';`,
  'prompt-nodes.ts': `export const isPromptNode = n => n?.node_type === 'prompt'; export const resolveNodePrompt = n => n.prompt_config?.prompt ?? '';`,
  'regeneration-run.ts': `export const refundRegenCreditsIfNeeded = async () => {};`,
  'creatorSurcharge.ts': `export const readStoredRunEconomics = () => null;`,
  'free-video.ts': `export const consumeFreeVideoEntitlementForJob = async () => {}; export const isFreeFirstVideoPayload = () => false; export const restoreFreeVideoEntitlementForJob = async () => {};`,
  'edge-order.ts': `export const sortEdgesByExecutionOrder = es => [...es].sort((a,b) => (a.mapping_logic?.edge_order ?? 0) - (b.mapping_logic?.edge_order ?? 0)); export const targetParamOrder = () => 0;`,
  'identity-lock.ts': `export const buildIdentityLockedPrompt = p => p; export const IDENTITY_AUTHORITY_BLOCK = ''; export const identityReferencePack = () => []; export const readConsistencyProfile = () => ({});`,
  'cast.ts': `export const CAST_RUNTIME_KEY = 'cast'; export const castAuditMetadata = () => ({}); export const parseCastRuntime = () => null; export const resolveTemplateCast = ({inputs}) => ({inputs, applied: null});`,
};
registerHooks({
  resolve(specifier, context, nextResolve) {
    const stub = specifier.startsWith('jsr:') ? '' : stubs[specifier] ?? stubs[specifier.split('/').pop()];
    if (stub !== undefined) return { url: 'data:text/javascript,' + encodeURIComponent(stub), shortCircuit: true };
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    // Test private functions without changing the production module's public API.
    if (url.endsWith('/run-node/index.ts')) return { format: 'module-typescript', source: readFileSync(new URL(url), 'utf8') + '\nexport { startRun, resolveNodeInputs };', shortCircuit: true };
    if (url.endsWith('/outfit-swap/index.ts')) return { format: 'module-typescript', source: readFileSync(new URL(url), 'utf8') + '\nexport { startReconstruction };', shortCircuit: true };
    if (url.endsWith('/_shared/executor.ts')) return { format: 'module-typescript', source: readFileSync(new URL(url), 'utf8') + '\nexport { runSeedanceMultiReference, isSeedanceMultiReferenceRequest };', shortCircuit: true };
    return nextLoad(url, context);
  },
});

export const source = {path: 'system/outfit-swap/user-1/run-1/source.mp4', duration: 12.535918, width: 720, height: 1280};
export function storage({size = 2_000_000, mime = 'video/mp4', signError = false, missing = false} = {}) {
  return { from: () => ({
    list: async () => ({data: missing ? [] : [{name: 'source.mp4', metadata: {size, mimetype: mime}}], error: null}),
    createSignedUrl: async (path) => signError ? {error: new Error('sign failed')} : {data: {signedUrl: `https://storage.example.test/${path}?token=fresh`}},
  }) };
}
export function database(seed = {}, storageOptions) {
  const tables = structuredClone(seed);
  const writes = [];
  let serial = 0;
  const admin = {tables, writes, storage: storage(storageOptions), from(table) {
    let filters = [], action = null, values = null;
    const q = {
      select() {return q;}, order() {return q;}, limit() {return q;},
      eq(k, v) {filters.push(r => r[k] === v); return q;},
      neq(k, v) {filters.push(r => r[k] !== v); return q;},
      in(k, vs) {filters.push(r => vs.includes(r[k])); return q;},
      insert(v) {action = 'insert'; values = v; return q;},
      update(v) {action = 'update'; values = v; return q;},
      execute(single = false) {
        let rows = (tables[table] ?? []).filter(r => filters.every(f => f(r)));
        if (action === 'insert') {
          rows = (Array.isArray(values) ? values : [values]).map(v => ({id: `mock-${++serial}`, ...v}));
          (tables[table] ??= []).push(...rows); writes.push({table, action, rows}); action = null;
        } else if (action === 'update') {
          rows.forEach(r => Object.assign(r, values)); writes.push({table, action, values}); action = null;
        }
        return {data: single ? rows[0] ?? null : rows, error: null};
      },
      single() {return Promise.resolve(q.execute(true));},
      maybeSingle() {return Promise.resolve(q.execute(true));},
      then(resolve, reject) {return Promise.resolve(q.execute()).then(resolve, reject);},
    };
    return q;
  }};
  return admin;
}
export function fixture({video = true, images = 2, model = 'seedance-2.0', required = true, type = 'video_gen'} = {}) {
  const nodes = [{id:'final', version_id:'version', name:'Final', node_type:type, default_asset_id:null, prompt_config:{prompt:'Follow @Video1 and edit wardrobe.', video_mode:'multi_reference', requires_source_video:required, video_model:model, duration:13, resolution:'720p', generate_audio:false}}];
  const assets = [], edges = [];
  const add = (id, type, order) => {
    assets.push({id:`${id}-asset`, asset_type:type, supabase_storage_url: type === 'video' ? `fuse-assets:${source.path}` : `https://image.example.test/${id}.png`});
    nodes.push({id, version_id:'version', name:id, node_type:'user_input', default_asset_id:`${id}-asset`, prompt_config:{editor_expected:type, editor_mode:'reference', ...(type === 'video' ? {outfit_swap_role:'source_video', locked:true, required:true} : {})}});
    edges.push({id:`${id}-edge`,version_id:'version',source_node_id:id,target_node_id:'final',mapping_logic:{target_param: type === 'video' ? 'video_1' : `image_${order}`,edge_order:order}});
  };
  for (let i=1;i<=images;i++) add(`image${i}`, 'image', i);
  if(video) add('source', 'video', images+1);
  return database({nodes, edges, assets, node_runs:[], execution_jobs:[{id:'job', version_id:'version', input_payload:{}}], execution_steps:[{id:'step',job_id:'job',node_id:'final',status:'pending'}]});
}
