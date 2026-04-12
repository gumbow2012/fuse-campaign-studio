const DEFAULT_TEMPLATE_CREDIT_COST = 50;
const BASE_IMAGE_OUTPUT_CREDITS = 50;
const ADDITIONAL_IMAGE_OUTPUT_CREDITS = 12;
const VIDEO_OUTPUT_CREDITS = 35;

const TEMPLATE_CREDIT_COSTS: Record<string, number> = {
  "armored truck": 572,
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

  let credits = 0;

  if (imageOutputs > 0) {
    credits += BASE_IMAGE_OUTPUT_CREDITS;
    credits += Math.max(0, imageOutputs - 1) * ADDITIONAL_IMAGE_OUTPUT_CREDITS;
  }

  if (videoOutputs > 0) {
    credits += videoOutputs * VIDEO_OUTPUT_CREDITS;
  }

  return Math.max(DEFAULT_TEMPLATE_CREDIT_COST, credits);
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
