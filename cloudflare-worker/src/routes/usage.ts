import { Env } from "../types";
import { verifyToken } from "../auth";
import { supabaseFetch } from "../supabase";

/**
 * GET /api/usage
 * Returns the authenticated user's credit balance, aggregate run stats,
 * and the 25 most-recent project runs.
 */
export async function handleUsage(
  request: Request,
  env: Env,
): Promise<Response> {
  const userId = await verifyToken(request, env);

  // Fire all three queries in parallel
  const [creditsRes, statsRes, recentRes] = await Promise.all([
    // 1. Credit balance from the `users` table
    supabaseFetch(env, `/users?id=eq.${userId}&select=credits`, {
      headers: { Accept: "application/vnd.pgrst.object+json" },
    }),

    // 2. Aggregate stats: group projects by status
    supabaseFetch(env, `/projects?user_id=eq.${userId}&select=status`),

    // 3. Last 25 runs
    supabaseFetch(
      env,
      `/projects?user_id=eq.${userId}&select=id,template_id,status,created_at&order=created_at.desc&limit=25`,
    ),
  ]);

  // ── Parse credits ──
  let credits = 0;
  if (creditsRes.ok) {
    try {
      const row = (await creditsRes.json()) as { credits: number | null };
      credits = row.credits ?? 0;
    } catch {
      // user row might not exist yet
    }
  }

  // ── Compute aggregate stats ──
  let totalRuns = 0;
  let completed = 0;
  let failed = 0;
  let running = 0;

  if (statsRes.ok) {
    const rows = (await statsRes.json()) as { status: string }[];
    totalRuns = rows.length;
    for (const r of rows) {
      if (r.status === "complete") completed++;
      else if (r.status === "failed") failed++;
      else if (r.status === "running" || r.status === "queued") running++;
    }
  }

  // ── Credits used (sum from credit_ledger debits) ──
  const ledgerRes = await supabaseFetch(
    env,
    `/credit_ledger?user_id=eq.${userId}&type=in.(run_template,rerun_step)&select=amount`,
  );
  let creditsUsed = 0;
  if (ledgerRes.ok) {
    const ledgerRows = (await ledgerRes.json()) as { amount: number }[];
    for (const row of ledgerRows) {
      creditsUsed += Math.abs(row.amount);
    }
  }

  // ── Recent runs ──
  let recentRuns: unknown[] = [];
  if (recentRes.ok) {
    recentRuns = (await recentRes.json()) as unknown[];
  }

  return Response.json({
    credits,
    totalRuns,
    completed,
    failed,
    running,
    creditsUsed,
    recentRuns,
  });
}
