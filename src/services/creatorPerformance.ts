/**
 * Creator-level performance aggregation (ADDITIVE, READ-ONLY, frontend only).
 *
 * Authorship comes from `fuse_templates.created_by` via the existing
 * `creator-portfolio` edge function; metrics come from the part-1 reader for
 * `public.template_performance`. Nothing is computed that the rows don't
 * support and nothing is fabricated.
 *
 * HONESTY RULES (same as part 1):
 *  - only `verification_status === "META_VERIFIED"` counts as verified;
 *  - if every underlying row is DEMO, `demoOnly` is true so the UI can label it
 *    (public surfaces must not present DEMO as verified).
 */

import { supabase } from "@/integrations/supabase/client";
import {
  hasMetrics,
  isDemo,
  isVerified,
  loadTemplatePerformance,
  type TemplatePerformanceRow,
} from "@/services/templatePerformance";

export type CreatorPerformanceTemplate = {
  templateId: string;
  name: string | null;
  row: TemplatePerformanceRow;
  /** Real run count when a caller supplies one (analytics), else null. */
  uses: number | null;
};

export type CreatorPerformanceAggregate = {
  templates: CreatorPerformanceTemplate[];
  medianRoas: number | null;
  totalTrackedSpend: number | null;
  totalTrackedRevenue: number | null;
  totalUses: number | null;
  performanceVerifiedTemplateCount: number;
  /** True when at least one contributing row is DEMO. */
  hasDemoData: boolean;
  /** True when every contributing row is DEMO. */
  demoOnly: boolean;
};

export const EMPTY_CREATOR_PERFORMANCE: CreatorPerformanceAggregate = {
  templates: [],
  medianRoas: null,
  totalTrackedSpend: null,
  totalTrackedRevenue: null,
  totalUses: null,
  performanceVerifiedTemplateCount: 0,
  hasDemoData: false,
  demoOnly: false,
};

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function sum(values: Array<number | null | undefined>): number | null {
  const real = values.filter((value): value is number => value !== null && value !== undefined);
  if (!real.length) return null;
  return real.reduce((total, value) => total + value, 0);
}

type PortfolioTemplate = { id?: unknown; name?: unknown };

async function loadCreatorTemplateIndex(input: {
  userId?: string;
  handle?: string;
  mode: "own" | "public";
}): Promise<Array<{ id: string; name: string | null }>> {
  const { data, error } = await supabase.functions.invoke("creator-portfolio", {
    body:
      input.mode === "own"
        ? { mode: "own" }
        : { mode: "public", handle: input.handle, user_id: input.userId },
  });
  if (error) return [];
  const templates = (data as { templates?: unknown } | null)?.templates;
  if (!Array.isArray(templates)) return [];
  return (templates as PortfolioTemplate[])
    .map((template) => ({
      id: template.id ? String(template.id) : "",
      name: template.name ? String(template.name) : null,
    }))
    .filter((template) => template.id.length > 0);
}

/** Aggregates the real performance rows for the templates a creator authored. */
export async function aggregateCreatorPerformance(
  templates: Array<{ id: string; name: string | null }>,
  usesByTemplate?: Record<string, number>,
): Promise<CreatorPerformanceAggregate> {
  const ids = templates.map((template) => template.id);
  if (!ids.length) return { ...EMPTY_CREATOR_PERFORMANCE };

  const map = await loadTemplatePerformance(ids);

  const rows: CreatorPerformanceTemplate[] = [];
  for (const template of templates) {
    const row = map[template.id];
    if (!row || !hasMetrics(row)) continue;
    const uses = usesByTemplate?.[template.id];
    rows.push({
      templateId: template.id,
      name: template.name,
      row,
      uses: typeof uses === "number" ? uses : null,
    });
  }

  if (!rows.length) return { ...EMPTY_CREATOR_PERFORMANCE };

  const roasValues = rows
    .map((entry) => entry.row.roas)
    .filter((value): value is number => value !== null && value !== undefined);

  const usesValues = rows
    .map((entry) => entry.uses)
    .filter((value): value is number => value !== null);

  return {
    templates: rows,
    medianRoas: median(roasValues),
    totalTrackedSpend: sum(rows.map((entry) => entry.row.spend)),
    totalTrackedRevenue: sum(rows.map((entry) => entry.row.revenue)),
    totalUses: usesValues.length ? usesValues.reduce((total, value) => total + value, 0) : null,
    performanceVerifiedTemplateCount: rows.filter((entry) => isVerified(entry.row)).length,
    hasDemoData: rows.some((entry) => isDemo(entry.row)),
    demoOnly: rows.every((entry) => isDemo(entry.row)),
  };
}

/** Own-dashboard aggregate. `usesByTemplate` should come from real run analytics. */
export async function loadCreatorPerformance(
  _userId: string,
  usesByTemplate?: Record<string, number>,
): Promise<CreatorPerformanceAggregate> {
  try {
    const templates = await loadCreatorTemplateIndex({ mode: "own" });
    return await aggregateCreatorPerformance(templates, usesByTemplate);
  } catch {
    return { ...EMPTY_CREATOR_PERFORMANCE };
  }
}

/** Public-profile aggregate — public-safe template rows only, no PII. */
export async function loadPublicCreatorPerformance(input: {
  handle?: string;
  userId?: string;
}): Promise<CreatorPerformanceAggregate> {
  try {
    const templates = await loadCreatorTemplateIndex({
      mode: "public",
      handle: input.handle,
      userId: input.userId,
    });
    return await aggregateCreatorPerformance(templates);
  } catch {
    return { ...EMPTY_CREATOR_PERFORMANCE };
  }
}

export type CreatorPerformanceBadge = { key: string; label: string };

/** Auto-derived from the aggregate only — never set by hand. */
export function creatorPerformanceBadges(
  aggregate: CreatorPerformanceAggregate,
): CreatorPerformanceBadge[] {
  const badges: CreatorPerformanceBadge[] = [];
  if ((aggregate.totalTrackedRevenue ?? 0) >= 100_000)
    badges.push({ key: "REVENUE_100K", label: "$100k+ revenue tracked" });
  if ((aggregate.medianRoas ?? 0) >= 3)
    badges.push({ key: "MEDIAN_ROAS_3X", label: "3×+ median ROAS" });
  if ((aggregate.totalTrackedSpend ?? 0) >= 10_000)
    badges.push({ key: "SPEND_10K", label: "$10k+ tested" });
  return badges;
}
