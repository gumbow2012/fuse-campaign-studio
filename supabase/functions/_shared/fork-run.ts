/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * TR10 — fork execution with marketplace isolation.
 *
 * A fork run NEVER touches the marketplace template. It is executed through a
 * dedicated, per-fork "personal" template_versions row that is:
 *   - is_active      = false   (ALWAYS — lab-template-catalog only lists is_active=true)
 *   - review_status  = 'personal_fork'
 *   - fork_id        = the fork id
 * and can never be activated (see assertVersionActivatable).
 *
 * IP safety: for prompt-hidden forks the creator's base prompt is read from the
 * PINNED SOURCE version server-side and combined with the customer's
 * directionOverride here. It is never returned to a client.
 */

import { EDITABLE_SETTING_KEYS, isPromptableNode } from "./template-fork.ts";

export const PERSONAL_FORK_REVIEW_STATUS = "personal_fork";
export const FORK_RUN_MARKER_KEY = "__fork_run";

export type SourceNode = {
  id: string;
  name?: string | null;
  node_type?: string | null;
  prompt_config?: Record<string, unknown> | null;
  default_asset_id?: string | null;
  model_id?: string | null;
};

export type SourceEdge = {
  source_node_id: string;
  target_node_id: string;
  mapping_logic?: Record<string, unknown> | null;
};

export type CompiledForkNode = {
  id: string;
  source_node_id: string;
  name: string;
  node_type: string;
  prompt_config: Record<string, unknown>;
  default_asset_id: string | null;
  model_id: string | null;
};

export class ForkRunError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function hex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Deterministic node id per (fork, source node). Stable across
 * re-materializations so the fork's private version can be refreshed in place
 * without orphaning existing execution_steps rows.
 */
export async function deterministicForkNodeId(forkId: string, sourceNodeId: string) {
  const bytes = new TextEncoder().encode(`fuse-fork-node:${forkId}:${sourceNodeId}`);
  const digest = hex(await crypto.subtle.digest("SHA-256", bytes)).slice(0, 32);
  // RFC-4122-shaped (v5-ish) uuid from the digest.
  const v = `${digest.slice(0, 12)}5${digest.slice(13, 16)}8${digest.slice(17, 20)}${digest.slice(20, 32)}`;
  return `${v.slice(0, 8)}-${v.slice(8, 12)}-${v.slice(12, 16)}-${v.slice(16, 20)}-${v.slice(20, 32)}`;
}

function basePromptKey(config: Record<string, unknown>) {
  if (typeof config.prompt === "string") return "prompt";
  if (typeof config.text === "string") return "text";
  return "prompt";
}

function basePromptText(config: Record<string, unknown>) {
  const value = config.prompt ?? config.text ?? "";
  return typeof value === "string" ? value : "";
}

/**
 * Compile the fork's private nodes from the PINNED source nodes + the fork's
 * personal graph. Pure apart from the hash used for node ids.
 */
export async function compileForkNodes(args: {
  forkId: string;
  sourceNodes: SourceNode[];
  personalGraph: unknown;
  promptVisibility: boolean;
}): Promise<CompiledForkNode[]> {
  const graphNodes = Array.isArray((args.personalGraph as any)?.nodes)
    ? ((args.personalGraph as any).nodes as any[])
    : [];
  const overrides = new Map<string, any>();
  for (const node of graphNodes) {
    const id = String(node?.id ?? "");
    if (id) overrides.set(id, node);
  }

  const compiled: CompiledForkNode[] = [];
  for (const source of args.sourceNodes) {
    const override = overrides.get(String(source.id));
    const baseConfig = { ...(source.prompt_config ?? {}) } as Record<string, unknown>;

    if (override && isPromptableNode(source.node_type)) {
      const key = basePromptKey(baseConfig);
      if (args.promptVisibility) {
        // Prompt-visible fork: the customer owns the prompt text.
        if (typeof override.prompt === "string") baseConfig[key] = override.prompt;
      } else {
        // Prompt-hidden fork: hidden creator base prompt (server-side only)
        // + the customer's direction.
        const direction = typeof override.directionOverride === "string"
          ? override.directionOverride.trim()
          : "";
        const base = basePromptText(baseConfig);
        baseConfig[key] = direction ? `${base}\n\n${direction}` : base;
      }
    }

    if (override?.settings && typeof override.settings === "object") {
      for (const key of EDITABLE_SETTING_KEYS) {
        const value = (override.settings as Record<string, unknown>)[key];
        if (value === undefined) continue;
        if (
          typeof value === "string" || typeof value === "number" ||
          typeof value === "boolean" || value === null
        ) {
          baseConfig[key] = value;
        }
      }
    }

    compiled.push({
      id: await deterministicForkNodeId(args.forkId, String(source.id)),
      source_node_id: String(source.id),
      name: String(source.name ?? ""),
      node_type: String(source.node_type ?? ""),
      prompt_config: baseConfig,
      default_asset_id: source.default_asset_id ?? null,
      model_id: source.model_id ?? null,
    });
  }
  return compiled;
}

/** Topology is read-only in v1: source edges remapped onto the fork node ids. */
export function compileForkEdges(sourceEdges: SourceEdge[], nodes: CompiledForkNode[]) {
  const map = new Map(nodes.map((node) => [node.source_node_id, node.id]));
  return sourceEdges
    .map((edge) => ({
      source_node_id: map.get(String(edge.source_node_id)) ?? null,
      target_node_id: map.get(String(edge.target_node_id)) ?? null,
      mapping_logic: edge.mapping_logic ?? null,
    }))
    .filter((edge) => edge.source_node_id && edge.target_node_id) as Array<{
      source_node_id: string;
      target_node_id: string;
      mapping_logic: Record<string, unknown> | null;
    }>;
}

/**
 * ACTIVATION GUARD — a personal fork version must never become the
 * marketplace-active version.
 */
export function isPersonalForkVersion(version: {
  review_status?: string | null;
  fork_id?: string | null;
} | null | undefined) {
  if (!version) return false;
  if (version.fork_id != null && String(version.fork_id).length > 0) return true;
  return String(version.review_status ?? "").toLowerCase() === PERSONAL_FORK_REVIEW_STATUS;
}

export function assertVersionActivatable(version: {
  review_status?: string | null;
  fork_id?: string | null;
} | null | undefined) {
  if (isPersonalForkVersion(version)) {
    throw new ForkRunError(
      "PERSONAL_FORK_NOT_ACTIVATABLE",
      "A personal fork version can never be published or activated.",
      403,
    );
  }
}

export function buildForkRunMarker(args: {
  forkId: string;
  versionId: string;
  sourceTemplateId: string;
  idempotencyKey?: string | null;
  credits: number;
}) {
  return {
    fork_id: args.forkId,
    fork_version_id: args.versionId,
    source_template_id: args.sourceTemplateId,
    idempotency_key: args.idempotencyKey ?? null,
    credits: args.credits,
    is_fork_run: true,
  };
}

/** Idempotency: find a prior job for this fork carrying the same key. */
export function findForkRunJob(
  jobs: Array<{ id: string; input_payload?: unknown }>,
  args: { forkId: string; idempotencyKey: string },
) {
  if (!args.idempotencyKey) return null;
  for (const job of jobs) {
    const marker = (job.input_payload as any)?.[FORK_RUN_MARKER_KEY];
    if (!marker) continue;
    if (String(marker.fork_id ?? "") !== args.forkId) continue;
    if (String(marker.idempotency_key ?? "") === args.idempotencyKey) return job;
  }
  return null;
}

/**
 * TR10b — pick the connected execution nodes of a compiled fork graph.
 * Same rule the runner uses for cost: no user_input / prompt nodes, must be a
 * target of at least one edge.
 */
export function selectForkExecutionNodes(
  nodes: CompiledForkNode[],
  edges: Array<{ target_node_id: string }>,
) {
  const targetNodeIds = new Set(edges.map((edge) => edge.target_node_id));
  return nodes.filter((node) =>
    node.node_type !== "user_input" && node.node_type !== "prompt" && targetNodeIds.has(node.id)
  );
}

/**
 * TR10b — default a fork run's inputs from the ORIGINATING run's payload.
 *
 * Only string values survive, and the internal fork-run marker (plus any other
 * private `__`-prefixed bookkeeping keys) is stripped. The caller MUST have
 * loaded the source job scoped to the fork owner's user_id.
 */
export function forkInputsFromSourceJob(payload: unknown): Record<string, string> {
  if (!payload || typeof payload !== "object") return {};
  const inputs: Record<string, string> = {};
  for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
    if (key.startsWith("__")) continue;
    if (typeof value === "string" && value.length) inputs[key] = value;
  }
  return inputs;
}
