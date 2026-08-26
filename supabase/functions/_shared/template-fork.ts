/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * TR8 — Pro private template forks.
 *
 * A fork is a per-user snapshot of a marketplace template's ACTIVE version.
 * It never modifies the source template, its versions, nodes or edges.
 *
 * IP safety: when the source template does not permit prompt visibility, the
 * creator's base prompt text is NEVER copied into the fork's personal_graph.
 * The fork only carries an empty per-node `directionOverride` the user can fill
 * in; the hidden base prompt stays server-side in the source version and is
 * combined at execution time (TR10).
 */

export const PRO_PLANS = ["pro", "studio", "team"] as const;

/** Node types whose prompt/direction the customer may influence. */
export const PROMPTABLE_NODE_TYPES = ["prompt", "image_gen", "video_gen"] as const;

/** Non-prompt settings a forking customer is allowed to change. */
export const EDITABLE_SETTING_KEYS = [
  "model",
  "aspect_ratio",
  "aspectRatio",
  "resolution",
  "duration",
  "duration_seconds",
] as const;

export type ForkNodeInput = {
  id: string;
  name?: string | null;
  node_type?: string | null;
  prompt_config?: Record<string, unknown> | null;
  default_asset_id?: string | null;
};

export type ForkEdgeInput = {
  source_node_id: string;
  target_node_id: string;
  mapping_logic?: Record<string, unknown> | null;
};

export type PersonalGraphNode = {
  id: string;
  name: string;
  node_type: string;
  default_asset_id: string | null;
  settings: Record<string, unknown>;
  /** Present only when prompt visibility is allowed. */
  prompt?: string;
  /** Present only when prompt visibility is NOT allowed. */
  directionOverride?: string;
};

export type PersonalGraph = {
  version: 1;
  promptVisibility: boolean;
  nodes: PersonalGraphNode[];
  edges: Array<{
    source_node_id: string;
    target_node_id: string;
    mapping_logic: Record<string, unknown> | null;
  }>;
};

export function normalizePlan(plan: unknown) {
  return String(plan ?? "").trim().toLowerCase();
}

export function isPrivilegedRole(roles: string[]) {
  return roles.some((role) => role === "admin" || role === "dev");
}

/** Pro entitlement: pro/studio/team plan OR admin/dev role. */
export function resolveForkEntitlement(args: { plan?: string | null; roles?: string[] }) {
  const roles = args.roles ?? [];
  if (isPrivilegedRole(roles)) return { allowed: true as const, code: null };
  const plan = normalizePlan(args.plan);
  if ((PRO_PLANS as readonly string[]).includes(plan)) return { allowed: true as const, code: null };
  return { allowed: false as const, code: "PRO_REQUIRED" as const };
}

/**
 * Customizable = template.allow_customer_edit === true OR the template is
 * FUSE-owned (created_by holds an admin or dev role).
 * Prompt visibility = template.allow_prompt_visibility === true OR FUSE-owned.
 */
export function resolveCustomizability(args: {
  allowCustomerEdit?: boolean | null;
  allowPromptVisibility?: boolean | null;
  createdByRoles?: string[] | null;
}) {
  const fuseOwned = isPrivilegedRole(args.createdByRoles ?? []);
  const customizable = args.allowCustomerEdit === true || fuseOwned;
  const promptVisibility = args.allowPromptVisibility === true || fuseOwned;
  return { fuseOwned, customizable, promptVisibility };
}

export function isPromptableNode(nodeType: string | null | undefined) {
  return (PROMPTABLE_NODE_TYPES as readonly string[]).includes(String(nodeType ?? ""));
}

function extractSettings(config: Record<string, unknown> | null | undefined) {
  const settings: Record<string, unknown> = {};
  if (!config) return settings;
  for (const key of EDITABLE_SETTING_KEYS) {
    if (config[key] !== undefined && config[key] !== null) settings[key] = config[key];
  }
  return settings;
}

function extractBasePrompt(config: Record<string, unknown> | null | undefined) {
  const text = config?.prompt ?? config?.text ?? "";
  return typeof text === "string" ? text : "";
}

/** Build the fork's personal graph snapshot. Pure. */
export function buildPersonalGraph(args: {
  nodes: ForkNodeInput[];
  edges: ForkEdgeInput[];
  promptVisibility: boolean;
}): PersonalGraph {
  const nodes: PersonalGraphNode[] = args.nodes.map((node) => {
    const base: PersonalGraphNode = {
      id: String(node.id),
      name: String(node.name ?? ""),
      node_type: String(node.node_type ?? ""),
      default_asset_id: node.default_asset_id ?? null,
      settings: extractSettings(node.prompt_config),
    };

    if (!isPromptableNode(node.node_type)) return base;

    if (args.promptVisibility) {
      base.prompt = extractBasePrompt(node.prompt_config);
    } else {
      // IP gate: hidden base prompt is intentionally not copied.
      base.directionOverride = "";
    }
    return base;
  });

  return {
    version: 1,
    promptVisibility: args.promptVisibility,
    nodes,
    edges: args.edges.map((edge) => ({
      source_node_id: String(edge.source_node_id),
      target_node_id: String(edge.target_node_id),
      mapping_logic: edge.mapping_logic ?? null,
    })),
  };
}

/** Defensive sanitizer for anything returned to a client. */
export function sanitizePersonalGraphForClient(
  graph: unknown,
  promptVisibility: boolean,
): PersonalGraph | null {
  if (!graph || typeof graph !== "object") return null;
  const raw = graph as PersonalGraph;
  const nodes = Array.isArray(raw.nodes) ? raw.nodes : [];
  return {
    version: 1,
    promptVisibility,
    nodes: nodes.map((node) => {
      const clean: PersonalGraphNode = {
        id: String((node as any)?.id ?? ""),
        name: String((node as any)?.name ?? ""),
        node_type: String((node as any)?.node_type ?? ""),
        default_asset_id: (node as any)?.default_asset_id ?? null,
        settings: ((node as any)?.settings ?? {}) as Record<string, unknown>,
      };
      if (promptVisibility) {
        if (typeof (node as any)?.prompt === "string") clean.prompt = (node as any).prompt;
      } else if (isPromptableNode(clean.node_type)) {
        clean.directionOverride = typeof (node as any)?.directionOverride === "string"
          ? (node as any).directionOverride
          : "";
      }
      return clean;
    }),
    edges: (Array.isArray(raw.edges) ? raw.edges : []).map((edge) => ({
      source_node_id: String((edge as any)?.source_node_id ?? ""),
      target_node_id: String((edge as any)?.target_node_id ?? ""),
      mapping_logic: (edge as any)?.mapping_logic ?? null,
    })),
  };
}

/**
 * TR9 — merge ONLY allowed client edits into the stored personal graph.
 *
 * Whitelist enforced here:
 *  - node.prompt            → only when promptVisibility === true, only on promptable nodes
 *  - node.directionOverride → only when promptVisibility === false, only on promptable nodes
 *  - node.settings[k]       → only for k in EDITABLE_SETTING_KEYS
 * Everything else (topology, node ids/types/names, edges, default assets,
 * unknown settings) is ignored — the stored graph is authoritative.
 */
export function mergeForkEdits(args: {
  stored: unknown;
  incoming: unknown;
  promptVisibility: boolean;
}): PersonalGraph {
  const base = sanitizePersonalGraphForClient(args.stored, args.promptVisibility) ?? {
    version: 1,
    promptVisibility: args.promptVisibility,
    nodes: [],
    edges: [],
  };

  const incomingNodes = new Map<string, any>();
  const rawNodes = (args.incoming as any)?.nodes;
  if (Array.isArray(rawNodes)) {
    for (const node of rawNodes) {
      const id = String((node as any)?.id ?? "");
      if (id) incomingNodes.set(id, node);
    }
  }

  return {
    version: 1,
    promptVisibility: args.promptVisibility,
    // Topology is read-only: iterate the STORED nodes only.
    nodes: base.nodes.map((node) => {
      const edit = incomingNodes.get(node.id);
      if (!edit) return node;

      const next: PersonalGraphNode = { ...node, settings: { ...node.settings } };

      if (isPromptableNode(node.node_type)) {
        if (args.promptVisibility) {
          if (typeof edit.prompt === "string") next.prompt = edit.prompt;
        } else if (typeof edit.directionOverride === "string") {
          next.directionOverride = edit.directionOverride;
        }
      }

      const incomingSettings = edit.settings;
      if (incomingSettings && typeof incomingSettings === "object") {
        for (const key of EDITABLE_SETTING_KEYS) {
          const value = (incomingSettings as Record<string, unknown>)[key];
          if (value === undefined) continue;
          if (
            typeof value === "string" ||
            typeof value === "number" ||
            typeof value === "boolean" ||
            value === null
          ) {
            next.settings[key] = value;
          }
        }
      }

      return next;
    }),
    edges: base.edges,
  };
}

export function buildBasedOnLabel(templateName: string | null | undefined, versionNumber: unknown) {

  const name = String(templateName ?? "Template").trim() || "Template";
  const version = Number(versionNumber);
  return Number.isFinite(version) ? `Based on ${name} v${version}` : `Based on ${name}`;
}

export function defaultForkName(templateName: string | null | undefined) {
  const name = String(templateName ?? "Template").trim() || "Template";
  return `${name} (yours)`;
}

export function assertForkOwnership(args: { forkUserId: string; userId: string; roles: string[] }) {
  if (args.forkUserId === args.userId) return;
  if (args.roles.includes("admin")) return;
  throw new Error("Forbidden");
}
