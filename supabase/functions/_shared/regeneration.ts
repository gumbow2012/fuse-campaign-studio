/**
 * TR6 — per-output regeneration resolver (DRY-RUN ONLY).
 *
 * Computes the MINIMUM execution subgraph needed to recreate a single output:
 * which upstream intermediates can be safely reused, which nodes must re-run,
 * what downstream becomes stale, and the real credit cost of just that subgraph.
 *
 * This module is pure/read-only. It NEVER creates jobs or steps, never calls a
 * provider and never charges credits. Actual execution + revision history is TR7.
 *
 * Pricing is NOT reinvented here: the to-run generation nodes are priced with
 * `estimateTemplateCreditCost` from `template-pricing.ts` — the exact same tier
 * table used when a run is charged at start time.
 */
import { estimateTemplateCreditCost, parseOutputExposed } from "./template-pricing.ts";

export type RegenNode = {
  id: string;
  name?: string | null;
  node_type?: string | null;
  prompt_config?: Record<string, unknown> | null;
  default_asset_id?: string | null;
};

export type RegenEdge = {
  source_node_id: string;
  target_node_id: string;
};

export type RegenStep = {
  node_id: string;
  status?: string | null;
  output_asset_id?: string | null;
};

export type RegenTarget = { nodeId?: string | null; outputNumber?: number | null };

export type NodeDisposition = {
  nodeId: string;
  nodeType: string;
  disposition: "MUST_RERUN" | "REUSABLE";
  reason:
    | "target"
    | "missing_output"
    | "completed_output"
    | "user_input"
    | "reference_asset"
    | "no_cost_node";
};

export type RegenerationEstimate = {
  targetNodeId: string;
  outputNumber: number | null;
  toRunNodeIds: string[];
  reusedNodeIds: string[];
  staleDownstreamOutputNumbers: number[];
  staleDownstreamNodeIds: string[];
  estimatedCredits: number;
  breakdown: {
    imageNodes: number;
    videoNodes: number;
    dispositions: NodeDisposition[];
  };
};

/** Nodes that produce billable generations. Everything else is free. */
const GENERATION_NODE_TYPES = new Set(["image_gen", "video_gen"]);
/** Nodes that are inputs/prep — always reused, never charged. */
const FREE_REUSE_NODE_TYPES = new Set(["user_input", "prompt", "reference"]);

function nodeType(node: RegenNode | undefined) {
  return String(node?.node_type ?? "unknown");
}

/**
 * Mirrors `collectDeliverableOutputs` numbering (exposure flags, then
 * output_order/sort_order, then node id) without needing the asset join.
 */
export function buildOutputNumberByNodeId(nodes: RegenNode[], steps: RegenStep[]) {
  const nodeById = new Map(nodes.map((node) => [String(node.id), node]));
  const completed = steps.filter((step) => step.status === "complete" && !!step.output_asset_id);
  const exposureOf = (nodeId: string) =>
    parseOutputExposed(nodeById.get(nodeId)?.prompt_config?.output_exposed);
  const hasExplicitFlags = completed.some((step) => exposureOf(String(step.node_id)) !== null);

  const deliverables = completed
    .filter((step) => !hasExplicitFlags || exposureOf(String(step.node_id)) === true)
    .sort((a, b) => {
      const orderOf = (step: RegenStep) => {
        const config = nodeById.get(String(step.node_id))?.prompt_config ?? {};
        return Number(config.output_order ?? config.sort_order ?? Number.MAX_SAFE_INTEGER);
      };
      const delta = orderOf(a) - orderOf(b);
      if (delta !== 0) return delta;
      return String(a.node_id).localeCompare(String(b.node_id));
    });

  const map: Record<string, number> = {};
  deliverables.forEach((step, index) => {
    map[String(step.node_id)] = index + 1;
  });
  return map;
}

/**
 * Pure resolver over an already-loaded graph. Ancestors are traced by walking
 * the REVERSE edge index (target -> sources) breadth-first from the target
 * node, so only true transitive predecessors are included; cycle-safe via a
 * visited set. Descendants use the forward index the same way.
 */
export function resolveRegenerationSubgraphFromGraph(args: {
  nodes: RegenNode[];
  edges: RegenEdge[];
  steps: RegenStep[];
  target: RegenTarget;
}): RegenerationEstimate {
  const nodes = args.nodes ?? [];
  const nodeById = new Map(nodes.map((node) => [String(node.id), node]));
  const nodeIds = new Set(nodeById.keys());

  const sourcesByTarget = new Map<string, string[]>();
  const targetsBySource = new Map<string, string[]>();
  for (const edge of args.edges ?? []) {
    const source = String(edge.source_node_id);
    const target = String(edge.target_node_id);
    if (!nodeIds.has(source) || !nodeIds.has(target)) continue;
    sourcesByTarget.set(target, [...(sourcesByTarget.get(target) ?? []), source]);
    targetsBySource.set(source, [...(targetsBySource.get(source) ?? []), target]);
  }

  const outputNumberByNodeId = buildOutputNumberByNodeId(nodes, args.steps ?? []);

  let targetNodeId = args.target?.nodeId ? String(args.target.nodeId) : null;
  if (!targetNodeId && Number.isFinite(Number(args.target?.outputNumber))) {
    const wanted = Number(args.target?.outputNumber);
    targetNodeId = Object.entries(outputNumberByNodeId)
      .find(([, number]) => number === wanted)?.[0] ?? null;
  }
  if (!targetNodeId || !nodeIds.has(targetNodeId)) {
    throw new Error("Target output not found for this job");
  }

  // Latest step per node wins (retries supersede earlier attempts).
  const stepByNodeId = new Map<string, RegenStep>();
  for (const step of args.steps ?? []) stepByNodeId.set(String(step.node_id), step);

  const hasValidOutput = (nodeId: string) => {
    const step = stepByNodeId.get(nodeId);
    return step?.status === "complete" && !!step.output_asset_id;
  };

  // ---- ancestors (transitive predecessors, reverse BFS) -------------------
  const ancestors: string[] = [];
  const seen = new Set<string>([targetNodeId]);
  const queue = [...(sourcesByTarget.get(targetNodeId) ?? [])];
  while (queue.length) {
    const current = queue.shift()!;
    if (seen.has(current)) continue;
    seen.add(current);
    ancestors.push(current);
    queue.push(...(sourcesByTarget.get(current) ?? []));
  }

  const dispositions: NodeDisposition[] = [
    {
      nodeId: targetNodeId,
      nodeType: nodeType(nodeById.get(targetNodeId)),
      disposition: "MUST_RERUN",
      reason: "target",
    },
  ];

  const toRun = new Set<string>([targetNodeId]);
  const reused: string[] = [];

  for (const nodeId of ancestors) {
    const node = nodeById.get(nodeId);
    const type = nodeType(node);

    if (FREE_REUSE_NODE_TYPES.has(type) || !!node?.default_asset_id) {
      reused.push(nodeId);
      dispositions.push({
        nodeId,
        nodeType: type,
        disposition: "REUSABLE",
        reason: type === "user_input" ? "user_input" : node?.default_asset_id ? "reference_asset" : "no_cost_node",
      });
      continue;
    }

    if (hasValidOutput(nodeId)) {
      reused.push(nodeId);
      dispositions.push({ nodeId, nodeType: type, disposition: "REUSABLE", reason: "completed_output" });
      continue;
    }

    toRun.add(nodeId);
    dispositions.push({ nodeId, nodeType: type, disposition: "MUST_RERUN", reason: "missing_output" });
  }

  // ---- downstream staleness (forward BFS, warning only) -------------------
  const staleDownstreamNodeIds: string[] = [];
  const seenDown = new Set<string>([targetNodeId]);
  const downQueue = [...(targetsBySource.get(targetNodeId) ?? [])];
  while (downQueue.length) {
    const current = downQueue.shift()!;
    if (seenDown.has(current)) continue;
    seenDown.add(current);
    staleDownstreamNodeIds.push(current);
    downQueue.push(...(targetsBySource.get(current) ?? []));
  }

  const staleDownstreamOutputNumbers = [
    ...new Set(
      staleDownstreamNodeIds
        .map((nodeId) => outputNumberByNodeId[nodeId])
        .filter((value): value is number => Number.isFinite(value)),
    ),
  ].sort((a, b) => a - b);

  // ---- cost: existing tier pricing, to-run generation nodes only ---------
  const toRunNodeIds = [...toRun];
  const billable = toRunNodeIds
    .map((nodeId) => nodeType(nodeById.get(nodeId)))
    .filter((type) => GENERATION_NODE_TYPES.has(type));
  const imageNodes = billable.filter((type) => type === "image_gen").length;
  const videoNodes = billable.filter((type) => type === "video_gen").length;
  const estimatedCredits = estimateTemplateCreditCost({ imageOutputs: imageNodes, videoOutputs: videoNodes });

  return {
    targetNodeId,
    outputNumber: outputNumberByNodeId[targetNodeId] ?? null,
    toRunNodeIds,
    reusedNodeIds: reused,
    staleDownstreamOutputNumbers,
    staleDownstreamNodeIds,
    estimatedCredits,
    breakdown: { imageNodes, videoNodes, dispositions },
  };
}

/** Ownership gate for the dry-run estimate. Owner, admin or dev only. */
export function assertRegenerationAccess(args: {
  jobUserId: string | null | undefined;
  userId: string | null | undefined;
  roles?: string[] | null;
}) {
  const roles = args.roles ?? [];
  const privileged = roles.includes("admin") || roles.includes("dev");
  if (privileged) return true;
  if (!args.userId || !args.jobUserId || args.jobUserId !== args.userId) {
    throw new Error("Forbidden");
  }
  return true;
}

type AdminClient = {
  from: (table: string) => any;
};

/**
 * DB-backed resolver: loads the job's version-pinned nodes/edges plus its
 * execution steps (read-only SELECTs only) and delegates to the pure resolver.
 */
export async function resolveRegenerationSubgraph(
  admin: AdminClient,
  jobId: string,
  target: RegenTarget,
) {
  const { data: job, error: jobError } = await admin
    .from("execution_jobs")
    .select("id, user_id, template_id, version_id, status")
    .eq("id", jobId)
    .single();
  if (jobError || !job) throw new Error(jobError?.message ?? "Job not found");

  const [nodesResult, edgesResult, stepsResult] = await Promise.all([
    admin.from("nodes").select("id, name, node_type, prompt_config, default_asset_id").eq("version_id", job.version_id),
    admin.from("edges").select("source_node_id, target_node_id").eq("version_id", job.version_id),
    admin.from("execution_steps").select("node_id, status, output_asset_id, created_at").eq("job_id", job.id)
      .order("created_at", { ascending: true }),
  ]);
  if (nodesResult.error) throw new Error(nodesResult.error.message);
  if (edgesResult.error) throw new Error(edgesResult.error.message);
  if (stepsResult.error) throw new Error(stepsResult.error.message);

  const estimate = resolveRegenerationSubgraphFromGraph({
    nodes: nodesResult.data ?? [],
    edges: edgesResult.data ?? [],
    steps: stepsResult.data ?? [],
    target,
  });

  return { job, estimate };
}
