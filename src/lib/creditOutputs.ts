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
