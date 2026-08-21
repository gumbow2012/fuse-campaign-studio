import type { JewelryValidationReport } from "@/services/jewelrySwap";

/**
 * PRODUCT FIDELITY (§35) — presentation mapping only.
 *
 * Turns the EXISTING `mode: "validate"` report into a compact per-attribute
 * read-out. It does not validate anything itself and never triggers a
 * generation: the user decides whether to regenerate.
 */

export type FidelityVerdict = "PASS" | "WARNING" | "FAIL";

export type FidelityRow = {
  dimension: string;
  verdict: FidelityVerdict;
  note: string | null;
};

export type FidelityAudit = {
  verdict: JewelryValidationReport["verdict"];
  summary: string | null;
  confidence: number | null;
  rows: FidelityRow[];
  /** Lock version this audit was compared against, when known. */
  lockVersion: string | null;
  checkedAt: string;
};

export type FidelityDimension = { dimension: string; match: RegExp };

/** Fixed, product-agnostic dimensions with the words a violation may use. */
const DIMENSIONS: FidelityDimension[] = [
  {
    dimension: "Geometry",
    match: /geometr|silhouette|proportion|shape|dimension|ratio|thickness|topolog|architecture|sidewall|relief|outline/i,
  },
  {
    dimension: "Stone Layout",
    match: /stone|diamond|gem|cut|size|count|pav|layout|placement|orientation|module|repeat/i,
  },
  {
    dimension: "Setting",
    match: /setting|prong|bezel|channel|retention|bead|gallery|metal|finish|border|engrav|letter/i,
  },
  {
    dimension: "Bail / Clasp",
    match: /bail|clasp|hinge|connector|chain|loop|jump ?ring|closure|mechanic/i,
  },
  {
    dimension: "Context",
    match: /context|scene|background|pose|light|crop|camera|composition|invented|extra component/i,
  },
];

/**
 * CANONICAL MASTER VALIDATION (§23) dimensions. Same product-agnostic idea as
 * above, split finer because a master must be checked attribute by attribute
 * before anything downstream may trust it.
 */
export const MASTER_DIMENSIONS: FidelityDimension[] = [
  { dimension: "Silhouette", match: /silhouette|outline|shape|contour/i },
  {
    dimension: "Proportions",
    match: /proportion|ratio|dimension|thickness|width|height|depth|scale|geometr/i,
  },
  {
    dimension: "Component count",
    match: /component|count|topolog|architecture|part|element|extra|missing|invented/i,
  },
  { dimension: "Repeated modules", match: /module|repeat|link|row|pattern|sequence/i },
  { dimension: "Stones", match: /stone|diamond|gem|cut|pav|placement|orientation/i },
  {
    dimension: "Settings",
    match: /setting|prong|bezel|channel|retention|bead|gallery|seat/i,
  },
  {
    dimension: "Bail / Clasp",
    match: /bail|clasp|hinge|connector|chain|loop|jump ?ring|closure|mechanic/i,
  },
  {
    dimension: "Material",
    match: /material|metal|gold|silver|platinum|finish|polish|colour|color|texture|plating/i,
  },
];


const severityVerdict = (severity: string): FidelityVerdict =>
  /high/i.test(severity) ? "FAIL" : "WARNING";

const worse = (a: FidelityVerdict, b: FidelityVerdict): FidelityVerdict => {
  const rank = { PASS: 0, WARNING: 1, FAIL: 2 } as const;
  return rank[a] >= rank[b] ? a : b;
};

const trim = (value: unknown, max = 120): string | null => {
  const text = String(value ?? "").trim();
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

export function buildFidelityAudit(args: {
  report: JewelryValidationReport;
  lockVersion?: string | null;
}): FidelityAudit {
  const report = args.report;
  const rows: FidelityRow[] = DIMENSIONS.map((entry) => ({
    dimension: entry.dimension,
    verdict: "PASS" as FidelityVerdict,
    note: null as string | null,
  }));

  for (const violation of report.violations ?? []) {
    const label = `${violation.attribute ?? ""} ${violation.regionId ?? ""} ${violation.expected ?? ""}`;
    const hit = DIMENSIONS.findIndex((entry) => entry.match.test(label));
    // Unmatched attributes fall into Geometry — the broadest physical bucket.
    const at = hit >= 0 ? hit : 0;
    const verdict = severityVerdict(violation.severity ?? "medium");
    rows[at].verdict = worse(rows[at].verdict, verdict);
    const note = trim(
      violation.observed
        ? `${violation.attribute}: ${violation.observed}`
        : violation.attribute,
    );
    if (note && (!rows[at].note || verdict === "FAIL")) rows[at].note = note;
  }

  return {
    verdict: report.verdict,
    summary: trim(report.summary, 220),
    confidence: Number.isFinite(Number(report.confidence)) ? Number(report.confidence) : null,
    rows,
    lockVersion: trim(args.lockVersion, 60),
    checkedAt: new Date().toISOString(),
  };
}
