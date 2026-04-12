const ADMIN_VISUAL_BUDGET_KEY = "fuse.admin.visualCreditsSpent";
export const ADMIN_VISUAL_BUDGET_TOTAL = 10000;

function readNumber(value: string | null) {
  if (!value) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export function getAdminVisualCreditsSpent() {
  if (typeof window === "undefined") return 0;
  return readNumber(window.localStorage.getItem(ADMIN_VISUAL_BUDGET_KEY));
}

export function getAdminVisualCreditsRemaining() {
  return Math.max(0, ADMIN_VISUAL_BUDGET_TOTAL - getAdminVisualCreditsSpent());
}

export function recordAdminVisualCreditUsage(amount: number) {
  if (typeof window === "undefined") return;
  const safeAmount = Number.isFinite(amount) && amount > 0 ? amount : 0;
  const nextSpent = getAdminVisualCreditsSpent() + safeAmount;
  window.localStorage.setItem(ADMIN_VISUAL_BUDGET_KEY, String(nextSpent));
}
