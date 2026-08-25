/**
 * CLIENT-SIDE COST REGISTRY — estimates only.
 *
 * ============================================================================
 * MUST stay in sync with supabase/functions/_shared/fal.ts
 * ============================================================================
 * These rates MIRROR the real provider rates the backend charges with. If a rate
 * changes in _shared/fal.ts (or src/lib/costEstimate.ts), it MUST be mirrored here.
 * Nothing in this file is used for billing — it only powers "approx" UI estimates.
 *
 * Sources:
 *   - USD_PER_CREDIT + IMAGE_FLAT_USD          → src/lib/costEstimate.ts
 *   - KLING3_USD_PER_SECOND / _AUDIO           → _shared/fal.ts (0.112 / 0.168)
 *   - seedance-2.0 fallbackUsdPerSecond        → _shared/fal.ts (0.3024)
 *   - seedance-2.0-fast fallbackUsdPerSecond   → _shared/fal.ts (0.2419)
 *   - kling-2.5                                → priced per 5s clip ($0.417),
 *       expressed here as $0.0834/s. UNCERTAIN at sub-5s granularity: the live
 *       endpoint only accepts 5s or 10s durations, so per-second math is an
 *       approximation of the clip price.
 *
 * Resolution multipliers are intentionally NOT applied to video here: fal prices
 * these video endpoints per second (not per resolution), so a resolution factor
 * would be invented. Where a rate is uncertain, the conservative (higher) value
 * is used.
 */

import { USD_PER_CREDIT, IMAGE_FLAT_USD, creditsFromUsd } from "@/lib/costEstimate";

export { USD_PER_CREDIT, IMAGE_FLAT_USD };

/** Credits are billed in whole units, rounded up. */
export function usdToCredits(usd: number) {
  return creditsFromUsd(usd);
}

/* ------------------------------- Image rates ------------------------------- */

/** nano-banana-pro flat per-image rate. */
export const IMAGE_MODEL_USD: Record<string, number> = {
  "nano-banana-pro": IMAGE_FLAT_USD,
};

export function creditsForImage(model = "nano-banana-pro") {
  return usdToCredits(IMAGE_MODEL_USD[model] ?? IMAGE_FLAT_USD);
}

/* ------------------------------- Video rates ------------------------------- */

export type VideoCostModelKey =
  | "kling-2.5"
  | "kling-3.0-pro"
  | "kling-3.0-standard"
  | "seedance-2.0"
  | "seedance-2.0-fast";

type VideoRate = {
  key: VideoCostModelKey;
  label: string;
  usdPerSecond: number;
  /** Only set when the provider charges a different rate with audio enabled. */
  usdPerSecondAudio?: number;
  supportsAudio: boolean;
  /** Duration options / bounds mirrored from the live endpoint schemas. */
  durations?: number[];
  durationRange?: { min: number; max: number };
  note?: string;
};

export const VIDEO_COST_RATES: Record<VideoCostModelKey, VideoRate> = {
  "kling-2.5": {
    key: "kling-2.5",
    label: "Kling 2.5",
    // $0.417 per 5s clip → $0.0834/s (approximate at sub-clip granularity).
    usdPerSecond: 0.0834,
    supportsAudio: false,
    durations: [5, 10],
    note: "Priced per 5s clip; per-second figure is an approximation.",
  },
  "kling-3.0-pro": {
    key: "kling-3.0-pro",
    label: "Kling 3.0 Pro",
    usdPerSecond: 0.112,
    usdPerSecondAudio: 0.168,
    supportsAudio: true,
    durationRange: { min: 3, max: 15 },
  },
  "kling-3.0-standard": {
    key: "kling-3.0-standard",
    label: "Kling 3.0 Standard",
    usdPerSecond: 0.112,
    usdPerSecondAudio: 0.168,
    supportsAudio: true,
    durationRange: { min: 3, max: 15 },
  },
  "seedance-2.0": {
    key: "seedance-2.0",
    label: "Seedance 2.0",
    usdPerSecond: 0.3024,
    supportsAudio: true,
    durationRange: { min: 4, max: 15 },
  },
  "seedance-2.0-fast": {
    key: "seedance-2.0-fast",
    label: "Seedance 2.0 Fast",
    usdPerSecond: 0.2419,
    supportsAudio: true,
    durationRange: { min: 4, max: 15 },
  },
};

export const VIDEO_COST_MODEL_LIST = Object.values(VIDEO_COST_RATES);

export function videoUsdPerSecond(model: VideoCostModelKey, audio = false) {
  const rate = VIDEO_COST_RATES[model];
  if (!rate) return VIDEO_COST_RATES["kling-2.5"].usdPerSecond;
  if (audio && rate.supportsAudio && rate.usdPerSecondAudio) return rate.usdPerSecondAudio;
  return rate.usdPerSecond;
}

export function creditsForVideo({
  model,
  seconds,
  audio = false,
}: {
  model: VideoCostModelKey;
  seconds: number;
  audio?: boolean;
}) {
  const duration = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  if (!duration) return 0;
  return usdToCredits(videoUsdPerSecond(model, audio) * duration);
}
