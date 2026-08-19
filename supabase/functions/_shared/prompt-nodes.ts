// Shared helpers for "prompt" nodes (text blocks wired into a model node's prompt port).
// Additive: templates without prompt nodes behave exactly as before.

export const PROMPT_NODE_TYPE = "prompt";

type PromptNodeLike = {
  id: string;
  node_type: string;
  prompt_config?: Record<string, unknown> | null;
};

type PromptEdgeLike = {
  source_node_id: string;
  target_node_id?: string;
  mapping_logic?: Record<string, unknown> | null;
};

export function isPromptNode(node?: { node_type?: string } | null): boolean {
  return node?.node_type === PROMPT_NODE_TYPE;
}

export function promptNodeText(node?: PromptNodeLike | null): string {
  const config = node?.prompt_config ?? {};
  const text = typeof config.text === "string" ? config.text : null;
  const prompt = typeof config.prompt === "string" ? config.prompt : null;
  return String(text ?? prompt ?? "").trim();
}

/**
 * Resolve the effective prompt for a model node.
 * If an incoming edge comes from a prompt node with text, use that text.
 * Otherwise fall back to the node's own prompt_config.prompt (legacy behaviour).
 */
export function resolveNodePrompt(
  node: PromptNodeLike,
  incomingEdges: PromptEdgeLike[],
  nodeById: Map<string, PromptNodeLike>,
): string {
  const ownPrompt = String(node.prompt_config?.prompt ?? "").trim();

  const promptEdges = incomingEdges.filter((edge) => isPromptNode(nodeById.get(edge.source_node_id)));
  if (!promptEdges.length) return ownPrompt;

  const preferred = promptEdges.find((edge) =>
    String(edge.mapping_logic?.target_param ?? "").toLowerCase().includes("prompt")
  ) ?? promptEdges[0];

  const connected = promptNodeText(nodeById.get(preferred.source_node_id));
  return connected || ownPrompt;
}
