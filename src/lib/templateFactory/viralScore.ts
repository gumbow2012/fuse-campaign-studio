/**
 * TEMPLATE FACTORY — TF3: transparent virality/quality heuristic.
 *
 * HONESTY CONTRACT:
 *   This is NOT a prediction and carries no guarantee. It is a deterministic,
 *   explainable heuristic computed purely from the reference's stored blueprint
 *   and its curator metadata. Same input → same score, always. No randomness,
 *   no model call, no fabricated statistics.
 */

export type ViralFactor = {
  key: string;
  label: string;
  points: number;
  note: string;
};

export type ViralScoreResult = {
  score: number;
  factors: ViralFactor[];
  maxScore: number;
  version: string;
};

export const VIRAL_SCORE_VERSION = "factory-viral-heuristic-v1";
export const VIRAL_SCORE_DISCLAIMER =
  "Virality heuristic — based on the analyzed blueprint. An explainable estimate, not a guarantee.";

/** Known streetwear-relevant trend categories the heuristic recognises. */
export const STREETWEAR_TREND_TAGS = [
  "streetwear",
  "campaign",
  "editorial",
  "lookbook",
  "drop",
  "hype",
  "sneaker",
  "denim",
  "hoodie",
  "outerwear",
  "techwear",
  "y2k",
  "archive",
  "runway",
  "studio",
  "flash",
  "grain",
  "night",
  "urban",
  "motion",
];

type BlueprintLike = Record<string, unknown> | null | undefined;
type ReferenceLike = {
  title?: string | null;
  category?: string | null;
  tags?: string[] | null;
  notes?: string | null;
  image_url?: string | null;
} | null | undefined;

function text(source: BlueprintLike, key: string): string {
  const value = source?.[key];
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  // "not visible" / "unknown" are explicit analyzer non-answers: treat as absent.
  if (/^(not visible|unknown|n\/a|none)\.?$/i.test(trimmed)) return "";
  return trimmed;
}

/** Depth tiers reward concrete, usable direction over one-word filler. */
function depthPoints(value: string, tiers: [number, number, number]): number {
  if (!value) return 0;
  const words = value.split(/\s+/).filter(Boolean).length;
  if (words >= 8) return tiers[2];
  if (words >= 4) return tiers[1];
  return tiers[0];
}

function readShots(blueprint: BlueprintLike): Record<string, unknown>[] {
  const raw = blueprint?.shot_list;
  if (!Array.isArray(raw)) return [];
  return raw.filter((shot): shot is Record<string, unknown> =>
    !!shot && typeof shot === "object"
  );
}

/**
 * Deterministic 0-100 heuristic. Every factor is visible and additive.
 * Weights (max 100):
 *   shot variety 20 · subject treatment 14 · garment focus 16 · composition 12
 *   lighting 10 · color grade 8 · motion/energy 8 · trend tags 8 · clarity 4
 */
export function scoreBlueprint(
  blueprint: BlueprintLike,
  reference?: ReferenceLike,
): ViralScoreResult {
  const factors: ViralFactor[] = [];
  const shots = readShots(blueprint);

  // --- Shot variety / count (max 20) ---
  const distinctFramings = new Set(
    shots
      .map((shot) => (typeof shot.framing === "string" ? shot.framing.trim().toLowerCase() : ""))
      .filter(Boolean),
  ).size;
  const countPoints = Math.min(12, shots.length * 3);
  const varietyPoints = Math.min(8, distinctFramings * 2);
  factors.push({
    key: "shot_variety",
    label: "Shot variety",
    points: countPoints + varietyPoints,
    note: shots.length
      ? `${shots.length} shot${shots.length === 1 ? "" : "s"}, ${distinctFramings} distinct framing${distinctFramings === 1 ? "" : "s"}`
      : "No shot list in the blueprint",
  });

  // --- Subject treatment (max 14) ---
  const subject = text(blueprint, "subject_treatment");
  factors.push({
    key: "subject_treatment",
    label: "Subject treatment",
    points: depthPoints(subject, [6, 10, 14]),
    note: subject ? "Clear, reusable subject direction" : "Subject direction missing",
  });

  // --- Garment focus (max 16) ---
  const garment = text(blueprint, "garment_focus");
  factors.push({
    key: "garment_focus",
    label: "Garment focus",
    points: depthPoints(garment, [7, 12, 16]),
    note: garment ? "Product is the visual hero" : "No garment focus described",
  });

  // --- Composition (max 12) ---
  const composition = text(blueprint, "composition");
  const camera = text(blueprint, "camera");
  let compositionPoints = depthPoints(composition, [4, 7, 9]);
  if (camera) compositionPoints = Math.min(12, compositionPoints + 3);
  factors.push({
    key: "composition",
    label: "Composition & camera",
    points: compositionPoints,
    note: [composition ? "composition defined" : "composition missing", camera ? "camera defined" : "camera missing"]
      .join(" · "),
  });

  // --- Lighting (max 10) ---
  const lighting = text(blueprint, "lighting");
  factors.push({
    key: "lighting",
    label: "Lighting",
    points: depthPoints(lighting, [5, 8, 10]),
    note: lighting ? "Lighting is reproducible" : "Lighting not described",
  });

  // --- Color grade (max 8) ---
  const colorGrade = text(blueprint, "color_grade");
  factors.push({
    key: "color_grade",
    label: "Color grade",
    points: depthPoints(colorGrade, [4, 6, 8]),
    note: colorGrade ? "Grade gives it a signature look" : "No grade described",
  });

  // --- Motion / energy (max 8) ---
  const motion = text(blueprint, "motion");
  const isStill = /^still\.?$/i.test(motion);
  const motionPoints = !motion ? 0 : isStill ? 3 : depthPoints(motion, [5, 7, 8]);
  factors.push({
    key: "motion",
    label: "Motion & energy",
    points: motionPoints,
    note: !motion ? "No motion described" : isStill ? "Still frame — no motion energy" : "Movement adds scroll-stopping energy",
  });

  // --- Trend tag match (max 8) ---
  const haystack = [
    reference?.category ?? "",
    ...(reference?.tags ?? []),
    reference?.title ?? "",
    text(blueprint, "mood"),
    text(blueprint, "setting"),
  ]
    .join(" ")
    .toLowerCase();
  const matched = STREETWEAR_TREND_TAGS.filter((tag) => haystack.includes(tag));
  factors.push({
    key: "trend_match",
    label: "Streetwear trend match",
    points: Math.min(8, matched.length * 2),
    note: matched.length ? `Matches: ${matched.slice(0, 5).join(", ")}` : "No known streetwear trend signals",
  });

  // --- Analyzer clarity (max 4) — fewer uncertain fields = more trustworthy ---
  const uncertain = Array.isArray(blueprint?.uncertain) ? (blueprint?.uncertain as unknown[]).length : 0;
  factors.push({
    key: "clarity",
    label: "Analyzer clarity",
    points: Math.max(0, 4 - uncertain),
    note: uncertain
      ? `${uncertain} field${uncertain === 1 ? "" : "s"} the analyzer could not read`
      : "Every blueprint field read cleanly",
  });

  const total = factors.reduce((sum, factor) => sum + factor.points, 0);
  const score = Math.max(0, Math.min(100, Math.round(total)));

  return { score, factors, maxScore: 100, version: VIRAL_SCORE_VERSION };
}

/** Simple label band for UI tone — still a heuristic, never a promise. */
export function viralScoreBand(score: number): "high" | "solid" | "thin" {
  if (score >= 75) return "high";
  if (score >= 50) return "solid";
  return "thin";
}
