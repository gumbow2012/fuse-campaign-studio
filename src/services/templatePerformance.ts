/**
 * Read-only reader for public.template_performance.
 *
 * HONESTY RULES (hard):
 *  - Only `verification_status === "META_VERIFIED"` may ever render as verified.
 *  - Rows with `verification_status === "DEMO"` MUST render a visible "DEMO DATA" chip.
 *  - No value is ever computed, estimated or fabricated here — we only format
 *    what the row actually contains.
 */
import { looseTable } from "@/services/looseTable";

export type PerformanceSource = "META" | "UPLOAD" | "USER_REPORTED" | "FUSE" | "DEMO";
export type VerificationStatus =
  | "META_VERIFIED"
  | "VERIFIED_UPLOAD"
  | "USER_REPORTED"
  | "FUSE_INTERNAL"
  | "DEMO"
  | "NONE";

export interface TemplatePerformanceRow {
  template_id: string;
  source: PerformanceSource | string | null;
  verification_status: VerificationStatus | string | null;
  spend: number | null;
  revenue: number | null;
  purchases: number | null;
  landing_page_views: number | null;
  roas: number | null;
  aov: number | null;
  purchase_cvr_lpv: number | null;
  cpa: number | null;
  campaign_count: number | null;
  account_count: number | null;
  date_start: string | null;
  date_end: string | null;
  last_verified_at: string | null;
}

export type TemplatePerformanceMap = Record<string, TemplatePerformanceRow>;

export const PERFORMANCE_DISCLAIMER =
  "Historical performance. Results vary by brand, offer, audience, budget and media buying.";

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalize(raw: Record<string, unknown>): TemplatePerformanceRow | null {
  const templateId = raw.template_id ? String(raw.template_id) : "";
  if (!templateId) return null;
  return {
    template_id: templateId,
    source: (raw.source as string) ?? null,
    verification_status: (raw.verification_status as string) ?? null,
    spend: toNumber(raw.spend),
    revenue: toNumber(raw.revenue),
    purchases: toNumber(raw.purchases),
    landing_page_views: toNumber(raw.landing_page_views),
    roas: toNumber(raw.roas),
    aov: toNumber(raw.aov),
    purchase_cvr_lpv: toNumber(raw.purchase_cvr_lpv),
    cpa: toNumber(raw.cpa),
    campaign_count: toNumber(raw.campaign_count),
    account_count: toNumber(raw.account_count),
    date_start: (raw.date_start as string) ?? null,
    date_end: (raw.date_end as string) ?? null,
    last_verified_at: (raw.last_verified_at as string) ?? null,
  };
}

function rowTime(row: TemplatePerformanceRow) {
  const stamp = row.last_verified_at ?? row.date_end ?? row.date_start;
  if (!stamp) return 0;
  const time = new Date(stamp).getTime();
  return Number.isNaN(time) ? 0 : time;
}

/**
 * Loads the latest performance row per template. Missing table / blocked read
 * resolves to an empty map so the UI simply falls back to normal cards.
 */
export async function loadTemplatePerformance(
  templateIds: string[],
): Promise<TemplatePerformanceMap> {
  const ids = Array.from(new Set(templateIds.filter(Boolean).map(String)));
  if (!ids.length) return {};

  try {
    const { data, error } = await looseTable("template_performance")
      .select("*")
      .in("template_id", ids);
    if (error || !Array.isArray(data)) return {};

    const map: TemplatePerformanceMap = {};
    for (const raw of data as Array<Record<string, unknown>>) {
      const row = normalize(raw);
      if (!row) continue;
      const existing = map[row.template_id];
      if (!existing || rowTime(row) >= rowTime(existing)) map[row.template_id] = row;
    }
    return map;
  } catch {
    return {};
  }
}

/** ONLY META_VERIFIED counts as verified. */
export function isVerified(row: TemplatePerformanceRow | null | undefined) {
  return row?.verification_status === "META_VERIFIED";
}

export function isDemo(row: TemplatePerformanceRow | null | undefined) {
  return row?.verification_status === "DEMO" || row?.source === "DEMO";
}

/** A row is worth surfacing only when it carries at least one real metric. */
export function hasMetrics(row: TemplatePerformanceRow | null | undefined) {
  if (!row) return false;
  return [row.roas, row.aov, row.purchase_cvr_lpv, row.spend].some(
    (value) => value !== null && value !== undefined,
  );
}

export function formatRoas(value: number | null | undefined) {
  if (value === null || value === undefined) return null;
  return `${value >= 10 ? Math.round(value) : value.toFixed(1)}×`;
}

export function formatAov(value: number | null | undefined) {
  if (value === null || value === undefined) return null;
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

/** Stored as a ratio (0.046) or a percentage (4.6) — render both honestly. */
export function formatCvr(value: number | null | undefined) {
  if (value === null || value === undefined) return null;
  const percent = value <= 1 ? value * 100 : value;
  return `${percent >= 10 ? percent.toFixed(0) : percent.toFixed(1)}%`;
}

export function formatSpend(value: number | null | undefined) {
  if (value === null || value === undefined) return null;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}m`;
  if (value >= 1_000) return `$${Math.round(value / 1_000)}k`;
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

/* ------------------------------------------------------------------ */
/* Part 2 — detail rows, earned badges, marketplace filter predicates  */
/* ------------------------------------------------------------------ */

export function formatCpa(value: number | null | undefined) {
  if (value === null || value === undefined) return null;
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

export function formatRevenue(value: number | null | undefined) {
  if (value === null || value === undefined) return null;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}m`;
  if (value >= 10_000) return `$${Math.round(value / 1_000)}k`;
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

export function formatVerifiedDate(value: string | null | undefined) {
  if (!value) return null;
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return null;
  return new Date(time).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Purchase CVR computed from the row's own counts — never estimated. */
export function computeCvrFromCounts(row: TemplatePerformanceRow) {
  if (!row.purchases || !row.landing_page_views) return null;
  if (row.landing_page_views <= 0) return null;
  return row.purchases / row.landing_page_views;
}

export function formatAttributionWindow(row: TemplatePerformanceRow) {
  const start = row.date_start ? new Date(row.date_start) : null;
  const end = row.date_end ? new Date(row.date_end) : null;
  const fmt = (date: Date) =>
    date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  if (start && !Number.isNaN(start.getTime()) && end && !Number.isNaN(end.getTime())) {
    return `${fmt(start)} – ${fmt(end)}`;
  }
  if (start && !Number.isNaN(start.getTime())) return `From ${fmt(start)}`;
  if (end && !Number.isNaN(end.getTime())) return `Through ${fmt(end)}`;
  return null;
}

export type PerformanceBadgeKey =
  | "META_VERIFIED"
  | "SPEND_10K"
  | "REVENUE_100K"
  | "MEDIAN_ROAS_3X"
  | "HIGH_AOV"
  | "HIGH_CONVERSION";

export interface PerformanceBadge {
  key: PerformanceBadgeKey;
  label: string;
  tone: "verified" | "performance" | "neutral";
}

/** Every badge is derived from the stored row. Nothing here can be set by hand. */
export function earnedBadges(row: TemplatePerformanceRow | null | undefined): PerformanceBadge[] {
  if (!row) return [];
  const badges: PerformanceBadge[] = [];
  if (isVerified(row)) badges.push({ key: "META_VERIFIED", label: "Meta verified", tone: "verified" });
  if ((row.spend ?? 0) >= 10_000) badges.push({ key: "SPEND_10K", label: "$10k+ tested", tone: "neutral" });
  if ((row.revenue ?? 0) >= 100_000)
    badges.push({ key: "REVENUE_100K", label: "$100k+ revenue tracked", tone: "neutral" });
  if ((row.roas ?? 0) >= 3)
    badges.push({ key: "MEDIAN_ROAS_3X", label: "3×+ median ROAS", tone: "performance" });
  if ((row.aov ?? 0) >= 150) badges.push({ key: "HIGH_AOV", label: "High AOV", tone: "neutral" });
  const cvr = row.purchase_cvr_lpv ?? computeCvrFromCounts(row);
  const cvrRatio = cvr === null || cvr === undefined ? null : cvr > 1 ? cvr / 100 : cvr;
  if (cvrRatio !== null && cvrRatio >= 0.05)
    badges.push({ key: "HIGH_CONVERSION", label: "High conversion", tone: "performance" });
  return badges;
}

export interface PerformanceRange {
  bestRoas: number;
  medianRoas: number;
  campaignsMeasured: number;
}

/**
 * A range is only shown when the underlying data genuinely supports it:
 * two or more measured rows, or a single row covering 3+ campaigns.
 */
export function computePerformanceRange(rows: TemplatePerformanceRow[]): PerformanceRange | null {
  const roasValues = rows
    .map((row) => row.roas)
    .filter((value): value is number => value !== null && value !== undefined);
  const campaigns = rows.reduce((total, row) => total + (row.campaign_count ?? 0), 0);
  const enough = roasValues.length >= 2 || (roasValues.length === 1 && campaigns >= 3);
  if (!enough || !roasValues.length) return null;
  const sorted = [...roasValues].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
  return {
    bestRoas: sorted[sorted.length - 1],
    medianRoas: median,
    campaignsMeasured: campaigns || roasValues.length,
  };
}

/** All rows for a single template, newest first. Empty on missing/blocked table. */
export async function loadTemplatePerformanceRows(
  templateId: string,
): Promise<TemplatePerformanceRow[]> {
  if (!templateId) return [];
  try {
    const { data, error } = await looseTable("template_performance")
      .select("*")
      .eq("template_id", templateId);
    if (error || !Array.isArray(data)) return [];
    return (data as Array<Record<string, unknown>>)
      .map(normalize)
      .filter((row): row is TemplatePerformanceRow => !!row)
      .sort((a, b) => rowTime(b) - rowTime(a));
  } catch {
    return [];
  }
}

/* ---------------------------- filters ---------------------------- */

export const ROAS_FILTERS = ["2×+", "3×+", "4×+", "5×+"] as const;
export const AOV_FILTERS = ["<$50", "$50–100", "$100–200", "$200+"] as const;
export const SPEND_FILTERS = ["$1K+", "$5K+", "$10K+", "$25K+"] as const;

export function matchesRoasFilter(row: TemplatePerformanceRow | null | undefined, filter: string) {
  const value = row?.roas;
  if (value === null || value === undefined) return false;
  const threshold = Number(filter.replace(/[^\d.]/g, ""));
  return Number.isFinite(threshold) ? value >= threshold : true;
}

export function matchesAovFilter(row: TemplatePerformanceRow | null | undefined, filter: string) {
  const value = row?.aov;
  if (value === null || value === undefined) return false;
  if (filter === "<$50") return value < 50;
  if (filter === "$50–100") return value >= 50 && value < 100;
  if (filter === "$100–200") return value >= 100 && value < 200;
  if (filter === "$200+") return value >= 200;
  return true;
}

export function matchesSpendFilter(row: TemplatePerformanceRow | null | undefined, filter: string) {
  const value = row?.spend;
  if (value === null || value === undefined) return false;
  const thousands = Number(filter.replace(/[^\d.]/g, ""));
  return Number.isFinite(thousands) ? value >= thousands * 1_000 : true;
}
