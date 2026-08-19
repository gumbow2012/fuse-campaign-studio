/**
 * Shared cost preview helpers.
 *
 * Credits are the user-facing unit; the dollar figure is shown alongside so the
 * spend is legible before generating. Pricing mirrors the per-model rates the
 * backend uses when it stores estimated_cost_usd / estimated_credits.
 */

export const USD_PER_CREDIT = 0.098;

/** Flat per-image cost used for Nano Banana Pro passes. */
export const IMAGE_FLAT_USD = 0.15;

/** Quality multipliers applied on top of the base per-model rate. */
export const RESOLUTION_MULTIPLIER: Record<string, number> = {
  "480p": 0.5,
  "720p": 1,
  "1080p": 1.8,
  "1K": 1,
  "2K": 1.8,
  "4k": 3.5,
  "4K": 3.5,
};

export function resolutionMultiplier(resolution?: string | null) {
  if (!resolution) return 1;
  return RESOLUTION_MULTIPLIER[resolution] ?? RESOLUTION_MULTIPLIER[resolution.toUpperCase()] ?? 1;
}

export function creditsFromUsd(usd: number) {
  if (!Number.isFinite(usd) || usd <= 0) return 0;
  return Math.max(1, Math.ceil(usd / USD_PER_CREDIT));
}

export function usdFromCredits(credits: number) {
  if (!Number.isFinite(credits) || credits <= 0) return 0;
  return credits * USD_PER_CREDIT;
}

export function formatUsd(usd: number) {
  if (!Number.isFinite(usd) || usd <= 0) return "$0.00";
  return `$${usd.toFixed(2)}`;
}

/**
 * "≈ $0.30 · 3 credits" — the canonical cost preview string.
 * Pass the dollar figure when known; otherwise it is derived from the credits.
 */
export function costPreview(credits: number | null | undefined, usd?: number | null) {
  const creditCount = Number(credits ?? 0);
  const dollars = usd != null && Number(usd) > 0 ? Number(usd) : usdFromCredits(creditCount);
  if (!creditCount && !dollars) return "—";
  const resolvedCredits = creditCount || creditsFromUsd(dollars);
  return `≈ ${formatUsd(dollars)} · ${resolvedCredits} credit${resolvedCredits === 1 ? "" : "s"}`;
}
