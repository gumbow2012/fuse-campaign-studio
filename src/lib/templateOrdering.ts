export interface TemplateOrderable {
  name: string;
  estimated_credits_per_run?: number | null;
}

function isGrillzTemplate(template: TemplateOrderable) {
  return /\bgrillz+\b/i.test(template.name);
}

export function sortTemplatesForStudio<T extends TemplateOrderable>(templates: readonly T[]) {
  return [...templates].sort((left, right) => {
    const leftPinned = isGrillzTemplate(left);
    const rightPinned = isGrillzTemplate(right);

    if (leftPinned !== rightPinned) return leftPinned ? -1 : 1;

    const creditDelta = (right.estimated_credits_per_run ?? 0) - (left.estimated_credits_per_run ?? 0);
    if (creditDelta !== 0) return creditDelta;

    return left.name.localeCompare(right.name);
  });
}
