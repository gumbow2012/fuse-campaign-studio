// FUSE CINEMA — credit accounting.
//
// This is the SAME math generate-studio uses, character-for-character:
//   USD_PER_CREDIT = 0.098, credits = max(1, ceil(usd / USD_PER_CREDIT)),
//   USD estimated from live fal pricing with a per-second fallback.
// generate-studio keeps these helpers module-private (nothing is exported from
// its index.ts), so they are mirrored here rather than imported — no pricing
// value, rounding rule or fallback is changed, and generate-studio itself is
// left untouched.

import { getFalPricing, videoFallbackUsdPerSecond, type VideoModelDefinition } from "../_shared/fal.ts";

const USD_PER_CREDIT = 0.098;

export function creditsFromUsd(usd: number | null | undefined) {
  if (!usd || !Number.isFinite(usd) || usd <= 0) return null;
  return Math.max(1, Math.ceil(usd / USD_PER_CREDIT));
}

export async function estimateUsd(args: {
  endpointId: string;
  seconds?: number | null;
  fallbackUsdPerSecond?: number | null;
  fallbackFlatUsd?: number | null;
}) {
  try {
    const pricing = await getFalPricing(args.endpointId);
    if (pricing) {
      const unit = String(pricing.unit ?? "").toLowerCase();
      const quantity = unit.includes("second") ? Math.max(1, Number(args.seconds ?? 5)) : 1;
      return Number((pricing.unit_price * quantity).toFixed(6));
    }
  } catch (_error) {
    // fall through to static fallbacks below
  }

  if (args.fallbackUsdPerSecond && args.seconds) {
    return Number((args.fallbackUsdPerSecond * args.seconds).toFixed(6));
  }
  return args.fallbackFlatUsd ?? null;
}

export function videoUsdPerSecond(model: VideoModelDefinition, generateAudio: boolean | null) {
  return videoFallbackUsdPerSecond(model, generateAudio === true);
}
