/**
 * Credit → approximate output helpers.
 *
 * Everything here derives from the app's REAL cost basis in src/lib/costEstimate.ts
 * (USD_PER_CREDIT + the per-image flat rate the backend charges for Nano image passes).
 * No marketing numbers are hardcoded. Image generations are used as the single
 * conservative, unambiguous example — video costs vary by model/resolution/duration,
 * so they are intentionally not turned into a headline count.
 */

import { IMAGE_FLAT_USD, creditsFromUsd } from "@/lib/costEstimate";
import {
  VIDEO_COST_MODEL_LIST,
  creditsForImage,
  usdToCredits,
  videoUsdPerSecond,
} from "@/lib/creditCosts";

/** Real credit charge for one Nano Banana Pro image pass. */
export const CREDITS_PER_IMAGE = creditsFromUsd(IMAGE_FLAT_USD);

/** Approximate image generations a credit balance covers. */
export function approxImagesFromCredits(credits: number | null | undefined) {
  const value = Number(credits ?? 0);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(value / CREDITS_PER_IMAGE);
}

/** "approx 1,530 images / mo" — label always says approx, never a promise. */
export function approxOutputLabel(credits: number | null | undefined) {
  const images = approxImagesFromCredits(credits);
  if (!images) return null;
  return `approx ${images.toLocaleString()} images / mo`;
}

/* ------------------------- Campaign capacity (tangible) ------------------------- */

/**
 * A FUSE campaign is a MULTI-OUTPUT graph, not a single generation. This constant is the
 * real MEDIAN credit charge across published template runs — derived from actual run
 * charges, not from a single-generation price. Refresh it periodically as the published
 * template mix changes.
 */
export const MEDIAN_CAMPAIGN_COST = 945;

export const MEDIAN_CAMPAIGN_TOOLTIP =
  "Based on the current median published FUSE campaign cost of 945 credits. Actual usage varies by template.";

/** Typical number of full campaigns a monthly credit allowance covers. */
export function typicalCampaigns(credits: number | null | undefined) {
  const value = Number(credits ?? 0);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(value / MEDIAN_CAMPAIGN_COST);
}

/** "≈ 8 full campaigns" — a single truthful equivalent, never a wide range. */
export function typicalCapacityLabel(credits: number | null | undefined) {
  const count = typicalCampaigns(credits);
  if (count < 1) return null;
  return `≈ ${count.toLocaleString()} full campaign${count === 1 ? "" : "s"}`;
}

/** "≈ 1,530 image generations" — the unambiguous single-pass equivalent. */
export function approxImageGenerationsLabel(credits: number | null | undefined) {
  const images = approxImagesFromCredits(credits);
  if (!images) return null;
  return `≈ ${images.toLocaleString()} image generations`;
}

/* --------------------------- Short video equivalents --------------------------- */

/** Credit cost of one 5s clip on the cheapest / most expensive rate we run. */
export function shortVideoCreditRange() {
  const perSecond = VIDEO_COST_MODEL_LIST.map((rate) => videoUsdPerSecond(rate.key, false));
  const cheapest = usdToCredits(Math.min(...perSecond) * 5);
  const priciest = usdToCredits(Math.max(...perSecond) * 5);
  return { cheapest, priciest };
}

/** "≈ 12–46 short videos (5s)" — a truthful range, never a single model. */
export function approxShortVideosLabel(credits: number | null | undefined) {
  const value = Number(credits ?? 0);
  if (!Number.isFinite(value) || value <= 0) return null;
  const { cheapest, priciest } = shortVideoCreditRange();
  const most = Math.floor(value / cheapest);
  const fewest = Math.floor(value / priciest);
  if (most < 1) return null;
  if (fewest < 1) return `≈ up to ${most.toLocaleString()} short videos (5s)`;
  if (fewest === most) return `≈ ${most.toLocaleString()} short videos (5s)`;
  return `≈ ${fewest.toLocaleString()}–${most.toLocaleString()} short videos (5s)`;
}
