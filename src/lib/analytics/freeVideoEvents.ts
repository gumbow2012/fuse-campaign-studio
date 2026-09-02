/**
 * F7 — FREE FIRST VIDEO funnel analytics.
 *
 * Thin wrapper over the shared `track()` so every free-video event carries the
 * same safe descriptor props. NEVER pass tokens, signed URLs, emails, uploads
 * or prompts through here.
 */
import { track } from "@/lib/analytics/track";
import { readAcquisitionAttribution } from "@/services/freeVideoIntent";

const SAFE_ATTRIBUTION_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
] as const;

export type FreeVideoEventProps = {
  template_id?: string | null;
  campaign_slug?: string | null;
  [key: string]: unknown;
};

export function trackFreeVideo(eventName: string, props: FreeVideoEventProps = {}) {
  const attribution = readAcquisitionAttribution();
  const safe: Record<string, unknown> = {};
  for (const key of SAFE_ATTRIBUTION_KEYS) {
    if (attribution[key]) safe[key] = attribution[key];
  }
  const acquisitionSource =
    attribution.utm_source ||
    (attribution.fbclid ? "meta" : attribution.gclid ? "google" : attribution.ttclid ? "tiktok" : "direct");

  track(eventName, {
    ...safe,
    acquisition_source: acquisitionSource,
    ...props,
  });
}
