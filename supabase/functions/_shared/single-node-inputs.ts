/**
 * Shared input resolution for SINGLE-STEP previews (run-node).
 *
 * Root cause this module fixes: single-step previews used to read only
 * `default_asset_id` or the newest completed `node_runs` row, so the customer
 * uploads selected in the test panel were ignored, an old generated output
 * could silently stand in for a user upload, and any unresolved reference was
 * dropped from the middle of the ordered list — renumbering every later
 * `Ref N` and feeding a six-reference prompt the wrong pictures.
 *
 * The rules here mirror the full-run executor:
 *   1. user_input nodes take the CURRENTLY selected upload first, then their
 *      hidden/built-in asset. A generated output never substitutes for one.
 *   2. Generative nodes take their newest completed single-node output.
 *   3. Required references that are absent fail BEFORE any charge or submit.
 *   4. The ordered list is never compacted in the middle: only trailing
 *      optional references may be omitted, so `Ref N` keeps its meaning.
 */
import { sortEdgesByExecutionOrder } from "./edge-order.ts";
import { referenceMediaType } from "./video-reference.ts";
import { buildTemplateInputPlan } from "./template-inputs.ts";

export type SingleNodeRow = {
  id: string;
  name: string;
  node_type: string;
  prompt_config: Record<string, unknown> | null;
  default_asset_id: string | null;
};

export type SingleNodeEdgeRow = {
  id?: string | null;
  source_node_id: string;
  target_node_id: string;
  mapping_logic: Record<string, unknown> | null;
};

export type SingleNodeAsset = {
  id?: string;
  supabase_storage_url: string | null;
  asset_type?: string | null;
};

export type ResolvedReference = {
  /** 1-based position in the ordered reference list (the prompt's `Ref N`). */
  refIndex: number;
  param: string;
  url: string;
  type: "image" | "video";
  sourceNodeId: string;
  sourceName: string;
  /** Where the value came from — used for auditing and error messages. */
  origin: "upload" | "asset" | "step_output";
};

export type SingleNodeResolution = {
  refs: ResolvedReference[];
  ownReference: { url: string; type: "image" | "video" } | null;
  /** Optional references intentionally left empty at the END of the list. */
  omittedTrailingOptional: string[];
};

function isPromptNodeRow(node: SingleNodeRow | undefined) {
  return node?.node_type === "prompt" || node?.node_type === "prompt_node";
}

function label(node: SingleNodeRow) {
  const editorLabel = node.prompt_config?.editor_label ?? node.prompt_config?.display_label;
  return String(editorLabel ?? node.name ?? "Input").trim() || "Input";
}

function isSourceVideoRole(node: SingleNodeRow) {
  return node.prompt_config?.outfit_swap_role === "source_video";
}

/** An upload slot is required unless it is explicitly marked optional. */
export function isReferenceRequired(node: SingleNodeRow) {
  const config = node.prompt_config ?? {};
  if (config.required === true) return true;
  if (config.required === false || config.optional === true) return false;
  if (node.node_type !== "user_input") return true;
  return config.editor_mode === "upload";
}

/**
 * Expand the test panel's slot-keyed uploads into node-keyed values, exactly as
 * the full runner does, so a slot shared by several nodes feeds all of them.
 */
export function expandSuppliedSlotInputs(
  templateName: string,
  nodes: SingleNodeRow[],
  supplied: Record<string, string>,
): Record<string, string> {
  const inputNodes = nodes.filter((node) => node.node_type === "user_input");
  const expanded: Record<string, string> = {};

  const plan = buildTemplateInputPlan(templateName, inputNodes as never);
  for (const slot of plan.slots) {
    const value = supplied[slot.id] ?? supplied[slot.name];
    if (!value) continue;
    for (const nodeId of slot.nodeIds) expanded[nodeId] = value;
  }

  for (const node of inputNodes) {
    const direct = supplied[node.id] ?? supplied[node.name];
    if (direct) expanded[node.id] = direct;
  }

  return expanded;
}

export function resolveSingleNodeInputs(args: {
  templateName: string;
  node: SingleNodeRow;
  nodes: SingleNodeRow[];
  edges: SingleNodeEdgeRow[];
  assets: Map<string, SingleNodeAsset>;
  /** Slot- or node-keyed uploads currently selected in the test panel. */
  suppliedInputs?: Record<string, string>;
  /** Newest completed single-node output per node id. */
  upstreamOutputs?: Map<string, { url: string; type: string | null }>;
}): SingleNodeResolution {
  const nodeMap = new Map(args.nodes.map((node) => [node.id, node]));
  const uploads = expandSuppliedSlotInputs(args.templateName, args.nodes, args.suppliedInputs ?? {});
  const upstream = args.upstreamOutputs ?? new Map();

  const incoming = sortEdgesByExecutionOrder(
    args.edges
      .filter((edge) => edge.target_node_id === args.node.id)
      .filter((edge) => !isPromptNodeRow(nodeMap.get(edge.source_node_id))),
  );

  type Slot =
    | { kind: "resolved"; ref: ResolvedReference }
    | { kind: "missing"; required: boolean; name: string; reason: string };

  const slots: Slot[] = [];

  incoming.forEach((edge, index) => {
    const source = nodeMap.get(edge.source_node_id);
    const refIndex = index + 1;
    if (!source) {
      slots.push({
        kind: "missing",
        required: true,
        name: `Ref ${refIndex}`,
        reason: "its source step no longer exists",
      });
      return;
    }

    const param = String(edge.mapping_logic?.target_param ?? "image").toLowerCase();
    const asset = source.default_asset_id ? args.assets.get(source.default_asset_id) : undefined;
    const assetUrl = asset?.supabase_storage_url ?? null;

    let url: string | null = null;
    let type: "image" | "video" = "image";
    let origin: ResolvedReference["origin"] = "asset";

    if (source.node_type === "user_input") {
      // A locked source video always comes from its stored asset, never from a
      // panel upload; every other upload slot prefers the current selection.
      const uploaded = isSourceVideoRole(source) ? null : uploads[source.id] ?? null;
      if (uploaded) {
        url = uploaded;
        type = referenceMediaType(undefined, source.prompt_config);
        origin = "upload";
      } else if (assetUrl) {
        url = assetUrl;
        type = referenceMediaType(asset?.asset_type, source.prompt_config);
        origin = "asset";
      }
      // Deliberately NO node_runs fallback: a generated still must never stand
      // in for a customer upload or a replaced hidden reference.
    } else {
      const output = upstream.get(source.id);
      if (output?.url) {
        url = output.url;
        type = output.type === "video" ? "video" : "image";
        origin = "step_output";
      } else if (assetUrl) {
        url = assetUrl;
        type = referenceMediaType(asset?.asset_type, source.prompt_config);
        origin = "asset";
      }
    }

    if (!url) {
      slots.push({
        kind: "missing",
        required: isReferenceRequired(source),
        name: label(source),
        reason: source.node_type === "user_input"
          ? "no file is selected for it"
          : "its upstream step has not produced an output yet",
      });
      return;
    }

    slots.push({
      kind: "resolved",
      ref: { refIndex, param, url, type, sourceNodeId: source.id, sourceName: label(source), origin },
    });
  });

  const requiredMissing = slots.filter((slot) => slot.kind === "missing" && slot.required) as Array<
    Extract<Slot, { kind: "missing" }>
  >;
  if (requiredMissing.length) {
    throw new Error(
      `This step cannot run yet — ${
        requiredMissing.map((slot) => `${slot.name} (${slot.reason})`).join("; ")
      }. Nothing was charged.`,
    );
  }

  // Only TRAILING optional gaps may be dropped; an internal gap would shift
  // every later Ref number and change what the prompt is describing.
  const lastResolved = slots.reduce(
    (last, slot, index) => (slot.kind === "resolved" ? index : last),
    -1,
  );
  const internalGap = slots.find((slot, index) => slot.kind === "missing" && index < lastResolved);
  if (internalGap && internalGap.kind === "missing") {
    throw new Error(
      `${internalGap.name} is empty, and later references would shift position and change meaning. ` +
        `Add it, or remove its connection first. Nothing was charged.`,
    );
  }

  const refs = slots
    .filter((slot): slot is Extract<Slot, { kind: "resolved" }> => slot.kind === "resolved")
    .map((slot, index) => ({ ...slot.ref, refIndex: index + 1 }));

  const ownAsset = args.node.default_asset_id ? args.assets.get(args.node.default_asset_id) : undefined;
  const ownReference = ownAsset?.supabase_storage_url
    ? {
      url: ownAsset.supabase_storage_url,
      type: referenceMediaType(ownAsset.asset_type, args.node.prompt_config),
    }
    : null;

  return {
    refs,
    ownReference,
    omittedTrailingOptional: slots
      .filter((slot): slot is Extract<Slot, { kind: "missing" }> => slot.kind === "missing")
      .map((slot) => slot.name),
  };
}
