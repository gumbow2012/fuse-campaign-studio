/**
 * PRESENTATION ONLY — short, customer-facing campaign names.
 *
 * Never used for identity: `template.id` / `template.name` remain the canonical
 * identifiers for routes, deep links, execution and Stripe metadata. This helper
 * exists purely so feed tiles can show 1–2 word names ("AIRPORT", "BROKEN PLANET")
 * instead of internal naming ("Airport Tray Video", "GRILLZZZZ").
 */

/** Explicit overrides for names the heuristic cannot shorten well. */
const OVERRIDES: Record<string, string> = {
  grillzzzz: "GRILLZ",
  "airport tray video": "AIRPORT",
  "spider man": "SPIDER",
  "broken planet": "BROKEN PLANET",
};

/** Words that never add meaning to a short label. */
const DROP_WORDS = new Set([
  "the",
  "a",
  "an",
  "of",
  "and",
  "w",
  "with",
  "template",
  "templates",
  "campaign",
  "video",
  "videos",
  "clip",
  "clips",
  "original",
  "copy",
  "final",
  "version",
  "v1",
  "v2",
  "v3",
  "2",
  "20",
  "30",
  "pack",
]);

/** Generic second words that add nothing ("Spider Man" → SPIDER). */
const WEAK_SECOND_WORDS = new Set([
  "man",
  "guy",
  "girl",
  "tray",
  "park",
  "station",
  "truck",
  "room",
  "shot",
  "shots",
  "set",
  "mode",
  "style",
  "look",
  "scene",
]);

/**
 * Returns a clean 1–2 word uppercase label. Falls back to the raw name when
 * nothing meaningful survives — it never returns an empty string for a named
 * campaign and never blindly truncates mid-word.
 */
export function campaignDisplayName(rawName: string | null | undefined): string {
  const raw = String(rawName ?? "").trim();
  if (!raw) return "";

  const override = OVERRIDES[raw.toLowerCase()];
  if (override) return override;

  const words = raw
    .replace(/[_\-–—/]+/g, " ")
    .replace(/[^\p{L}\p{N} .]/gu, " ")
    .split(/\s+/)
    .map((word) => word.replace(/^\.+|\.+$/g, ""))
    .filter(Boolean);

  const kept = words.filter((word) => !DROP_WORDS.has(word.toLowerCase()));
  const source = kept.length ? kept : words;
  if (!source.length) return raw.toUpperCase();

  const first = source[0];
  const second = source[1];

  const takeSecond =
    !!second &&
    first.length <= 6 &&
    first.length + second.length <= 14 &&
    !WEAK_SECOND_WORDS.has(second.toLowerCase());

  return (takeSecond ? `${first} ${second}` : first).toUpperCase();
}

export default campaignDisplayName;
