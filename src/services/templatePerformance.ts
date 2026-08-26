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
