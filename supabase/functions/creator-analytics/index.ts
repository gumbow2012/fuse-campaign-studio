/**
 * creator-analytics (ADDITIVE, READ-ONLY)
 *
 * Aggregates REAL run counts for the authenticated creator's templates:
 *   - public.fuse_templates (created_by = author's auth user id)
 *   - public.execution_jobs (template_id, status, started_at, completed_at)
 *
 * execution_jobs is RLS-scoped per user, so aggregation runs with the service
 * role. Zeroed/empty structures are returned when the creator owns no
 * templates or has no runs — nothing is ever fabricated.
 *
 * No generation, executor, Stripe, billing or credit logic is touched.
 */

import {
  corsHeaders,
  createAdminClient,
  errorMessage,
  json,
  requireUser,
} from "../_shared/supabase-admin.ts";

type PerTemplate = {
  template_id: string;
  name: string | null;
  runs: number;
  successfulRuns: number;
  lastRunAt: string | null;
};

type DailyPoint = { date: string; runs: number };

const DAY_MS = 24 * 60 * 60 * 1000;

function dayKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function emptyPayload() {
  return {
    totalRuns: 0,
    runsLast30d: 0,
    runsLast7d: 0,
    successfulRuns: 0,
    failedRuns: 0,
    successRate: 0,
    perTemplate: [] as PerTemplate[],
    daily: buildDailySeries([]),
    templateCount: 0,
  };
}

function buildDailySeries(stamps: string[]): DailyPoint[] {
  const now = Date.now();
  const counts = new Map<string, number>();
  const series: DailyPoint[] = [];

  for (let i = 29; i >= 0; i -= 1) {
    const key = dayKey(new Date(now - i * DAY_MS));
    counts.set(key, 0);
    series.push({ date: key, runs: 0 });
  }

  for (const stamp of stamps) {
    if (!stamp) continue;
    const key = stamp.slice(0, 10);
    if (counts.has(key)) counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return series.map((point) => ({ date: point.date, runs: counts.get(point.date) ?? 0 }));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const admin = createAdminClient();
    const user = await requireUser(req, admin);

    const { data: templateRows, error: templateError } = await admin
      .from("fuse_templates")
      .select("id,name")
      .eq("created_by", user.id);

    if (templateError) throw new Error(templateError.message);

    const templates = (templateRows ?? []) as Array<Record<string, unknown>>;
    if (!templates.length) return json(emptyPayload());

    const names = new Map<string, string | null>();
    for (const row of templates) {
      names.set(String(row.id), row.name ? String(row.name) : null);
    }
    const ids = [...names.keys()];

    const { data: jobRows, error: jobError } = await admin
      .from("execution_jobs")
      .select("template_id,status,started_at,completed_at")
      .in("template_id", ids);

    if (jobError) throw new Error(jobError.message);

    const jobs = (jobRows ?? []) as Array<Record<string, unknown>>;

    const now = Date.now();
    const cutoff30 = now - 30 * DAY_MS;
    const cutoff7 = now - 7 * DAY_MS;

    let totalRuns = 0;
    let runsLast30d = 0;
    let runsLast7d = 0;
    let successfulRuns = 0;
    let failedRuns = 0;
    const stamps: string[] = [];

    const perTemplate = new Map<string, PerTemplate>();
    for (const [id, name] of names) {
      perTemplate.set(id, { template_id: id, name, runs: 0, successfulRuns: 0, lastRunAt: null });
    }

    for (const job of jobs) {
      const templateId = job.template_id ? String(job.template_id) : null;
      if (!templateId) continue;
      const entry = perTemplate.get(templateId);
      if (!entry) continue;

      const status = String(job.status ?? "").toLowerCase();
      const stamp = job.started_at
        ? String(job.started_at)
        : job.completed_at
          ? String(job.completed_at)
          : null;

      totalRuns += 1;
      entry.runs += 1;
      if (status === "complete") {
        successfulRuns += 1;
        entry.successfulRuns += 1;
      } else if (status === "failed") {
        failedRuns += 1;
      }

      if (stamp) {
        stamps.push(stamp);
        const time = Date.parse(stamp);
        if (!Number.isNaN(time)) {
          if (time >= cutoff30) runsLast30d += 1;
          if (time >= cutoff7) runsLast7d += 1;
        }
        if (!entry.lastRunAt || stamp > entry.lastRunAt) entry.lastRunAt = stamp;
      }
    }

    const list = [...perTemplate.values()].sort((a, b) => b.runs - a.runs);

    return json({
      totalRuns,
      runsLast30d,
      runsLast7d,
      successfulRuns,
      failedRuns,
      successRate: totalRuns > 0 ? successfulRuns / totalRuns : 0,
      perTemplate: list,
      daily: buildDailySeries(stamps),
      templateCount: ids.length,
    });
  } catch (error) {
    return json({ error: errorMessage(error) }, 400);
  }
});
