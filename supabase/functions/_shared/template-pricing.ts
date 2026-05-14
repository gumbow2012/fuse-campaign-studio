const TEMPLATE_CREDIT_COST_BY_OUTPUT_COUNT = [
  { maxOutputs: 1, credits: 210 },
  { maxOutputs: 2, credits: 315 },
  { maxOutputs: 3, credits: 420 },
  { maxOutputs: 4, credits: 525 },
  { maxOutputs: 5, credits: 735 },
  { maxOutputs: Number.POSITIVE_INFINITY, credits: 945 },
] as const;

const TEMPLATE_CREDIT_COSTS: Record<string, number> = {
};

function normalizeTemplateName(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function parseOutputExposed(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value === "true";
  return null;
}

export function countTemplateDeliverables(
  nodes: Array<{ node_type?: string | null; prompt_config?: Record<string, unknown> | null }>,
) {
  const imageNodes = nodes.filter((node) => node.node_type === "image_gen");
  const videoNodes = nodes.filter((node) => node.node_type === "video_gen");
  const imageFlags = imageNodes.map((node) => parseOutputExposed(node.prompt_config?.output_exposed));
  const videoFlags = videoNodes.map((node) => parseOutputExposed(node.prompt_config?.output_exposed));
  const hasExplicitImageFlags = imageFlags.some((flag) => flag !== null);
  const hasExplicitVideoFlags = videoFlags.some((flag) => flag !== null);

  return {
    imageOutputs: hasExplicitImageFlags
      ? imageNodes.filter((node) => parseOutputExposed(node.prompt_config?.output_exposed) === true).length
      : imageNodes.length,
    videoOutputs: hasExplicitVideoFlags
      ? videoNodes.filter((node) => parseOutputExposed(node.prompt_config?.output_exposed) === true).length
      : videoNodes.length,
  };
}

export function estimateTemplateCreditCost(args: {
  imageOutputs?: number | null;
  videoOutputs?: number | null;
}) {
  const imageOutputs = Math.max(0, Number(args.imageOutputs ?? 0));
  const videoOutputs = Math.max(0, Number(args.videoOutputs ?? 0));
  return getTemplateCreditCostByOutputCount(imageOutputs + videoOutputs);
}

export function getTemplateCreditCostByOutputCount(outputCount: number | null | undefined) {
  const parsedOutputCount = Math.ceil(Number(outputCount ?? 0));
  if (!Number.isFinite(parsedOutputCount) || parsedOutputCount <= 0) return 0;

  const pricingTier = TEMPLATE_CREDIT_COST_BY_OUTPUT_COUNT.find(
    (tier) => parsedOutputCount <= tier.maxOutputs,
  );
  return pricingTier?.credits ?? 945;
}

export function getTemplateCreditCost(
  templateName: string | null | undefined,
  counts?: { imageOutputs?: number | null; videoOutputs?: number | null },
) {
  const normalized = normalizeTemplateName(templateName);
  return TEMPLATE_CREDIT_COSTS[normalized] ??
    estimateTemplateCreditCost({
      imageOutputs: counts?.imageOutputs,
      videoOutputs: counts?.videoOutputs,
    });
}
