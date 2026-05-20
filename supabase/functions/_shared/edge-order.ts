type EdgeLike = {
  id?: string | null;
  source_node_id?: string | null;
  mapping_logic?: Record<string, unknown> | null;
};

export function targetParamOrder(value: unknown) {
  const param = String(value ?? "");
  if (param.startsWith("image_")) {
    const index = Number(param.slice("image_".length));
    return Number.isFinite(index) ? index : 100;
  }
  if (param === "reference_image") return 10;
  if (param === "model_reference_image") return 11;
  if (param === "product_image") return 12;
  if (param.endsWith("_image")) return 15;
  if (param === "user_garment") return 20;
  if (param === "user_logo") return 21;
  if (param === "start_frame_image") return 30;
  if (param === "end_frame_image") return 31;
  if (param === "init_image") return 40;
  return 100;
}

export function readEdgeOrder(edge: EdgeLike, fallbackIndex = 0) {
  const raw = edge.mapping_logic?.edge_order ?? edge.mapping_logic?.sort_order;
  const parsed = typeof raw === "number" ? raw : Number.parseInt(String(raw ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallbackIndex + 1;
}

export function sortEdgesByExecutionOrder<T extends EdgeLike>(edges: T[]) {
  return edges
    .map((edge, index) => ({ edge, index }))
    .sort((a, b) => {
      const orderDelta = readEdgeOrder(a.edge, a.index) - readEdgeOrder(b.edge, b.index);
      if (orderDelta !== 0) return orderDelta;
      const paramDelta = targetParamOrder(a.edge.mapping_logic?.target_param) -
        targetParamOrder(b.edge.mapping_logic?.target_param);
      if (paramDelta !== 0) return paramDelta;
      return String(a.edge.source_node_id ?? a.edge.id ?? "").localeCompare(
        String(b.edge.source_node_id ?? b.edge.id ?? ""),
      );
    })
    .map((entry) => entry.edge);
}

export function nextEdgeOrder(edges: EdgeLike[]) {
  return edges.reduce((max, edge, index) => Math.max(max, readEdgeOrder(edge, index)), 0) + 1;
}
