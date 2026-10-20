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
  const text = typeof config.text === "string" ? config.text.trim() : "";
  const prompt = typeof config.prompt === "string" ? config.prompt.trim() : "";
  return text || prompt;
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

/**
 * Fills customer text into a model prompt at run time:
 *   {{input:<nodeId>}} → the run's text for that input node (or its sample_text)
 *   {{spell:<nodeId>}} → the same text spelled letter by letter (T-H-E-/-W-O-R-K)
 * Prompts without placeholders are returned unchanged.
 */
export function fillInputPlaceholders(
  prompt: string,
  inputs: Record<string, unknown>,
  nodeById: Map<string, { prompt_config?: Record<string, unknown> | null }>,
): string {
  if (!prompt.includes("{{")) return prompt;
  const value = (id: string) =>
    String(inputs[id] ?? nodeById.get(id)?.prompt_config?.sample_text ?? "").trim();
  return prompt
    .replace(/\{\{spell:([0-9a-f-]{36})\}\}/g, (_m, id: string) => [...value(id)].map((c) => (c === " " ? "/" : c)).join("-"))
    .replace(/\{\{input:([0-9a-f-]{36})\}\}/g, (_m, id: string) => value(id));
}
