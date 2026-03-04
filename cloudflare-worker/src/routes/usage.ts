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

  // Fire all queries in parallel
  const [creditsRes, runsRes, ledgerRes] = await Promise.all([
    supabaseFetch(env, `/users?id=eq.${userId}&select=credits`, {
      headers: { Accept: "application/vnd.pgrst.object+json" },
    }),
    supabaseFetch(
      env,
      `/projects?user_id=eq.${userId}&select=id,template_id,status,created_at&order=created_at.desc`,
    ),
    supabaseFetch(
      env,
      `/credit_ledger?user_id=eq.${userId}&type=in.(run_template,rerun_step)&select=amount`,
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

  // ── Guard runs response (Supabase may return an error object) ──
  const runsData = runsRes.ok ? await runsRes.json() : [];
  const runs = Array.isArray(runsData) ? runsData as { id: string; template_id: string; status: string; created_at: string }[] : [];

  const totalRuns = runs.length;
  const completed = runs.filter(r => r.status === "complete").length;
  const failed = runs.filter(r => r.status === "failed").length;
  const running = runs.filter(r => r.status === "running" || r.status === "queued").length;

  // ── Credits used (sum from credit_ledger debits) ──
  const ledgerData = ledgerRes.ok ? await ledgerRes.json() : [];
  const ledgerRows = Array.isArray(ledgerData) ? ledgerData as { amount: number }[] : [];
  let creditsUsed = 0;
  for (const row of ledgerRows) {
    creditsUsed += Math.abs(row.amount);
  }

  return Response.json({
    credits,
    totalRuns,
    completed,
    failed,
    running,
    creditsUsed,
    recentRuns: runs.slice(0, 25),
  });
}
