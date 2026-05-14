export const MAX_TEMPLATE_INPUTS = 5;
export const MAX_TEMPLATE_BRANCHES = 8;

export type TemplateBuilderStep = "setup" | "branches";

function clampCount(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

export function clampTemplateInputCount(value: number) {
  return clampCount(value, 1, MAX_TEMPLATE_INPUTS);
}

export function clampTemplateBranchCount(value: number) {
  return clampCount(value, 1, MAX_TEMPLATE_BRANCHES);
}

export function canAdvanceTemplateBuilder(step: TemplateBuilderStep, templateName: string) {
  if (step === "setup") return templateName.trim().length > 0;
  return true;
}

export function resolveTemplateBranchInputIndex(
  inputSlotIds: string[],
  branchInputSlotId: string | null | undefined,
  branchIndex: number,
) {
  if (!inputSlotIds.length) return -1;
  const exactIndex = inputSlotIds.findIndex((slotId) => slotId === branchInputSlotId);
  if (exactIndex >= 0) return exactIndex;
  const safeIndex = Number.isFinite(branchIndex) ? Math.trunc(branchIndex) : 0;
  return ((safeIndex % inputSlotIds.length) + inputSlotIds.length) % inputSlotIds.length;
}
