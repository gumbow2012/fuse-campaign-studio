const DEFAULT_TEMPLATE_CREDIT_COST = 50;

const TEMPLATE_CREDIT_COSTS: Record<string, number> = {
  "armored truck": 572,
};

function normalizeTemplateName(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function getTemplateCreditCost(templateName: string | null | undefined) {
  const normalized = normalizeTemplateName(templateName);
  return TEMPLATE_CREDIT_COSTS[normalized] ?? DEFAULT_TEMPLATE_CREDIT_COST;
}
