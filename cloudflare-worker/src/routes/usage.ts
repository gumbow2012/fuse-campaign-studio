import { Env } from "../types";
import { verifyToken } from "../auth";
import { supabaseFetch } from "../supabase";

/**
 * GET /api/usage
 * Returns the authenticated user's credit balance, aggregate run stats,
 * and the 20 most-recent project runs.
 */
export async function handleUsage(
  request: Request,
  env: Env,
): Promise<Response> {
  const userId = await verifyToken(request, env);

  // ── Fetch runs ──
  const runsRes = await supabaseFetch(
    env,
    `/projects?select=id,template_id,status,created_at&user_id=eq.${userId}&order=created_at.desc&limit=20`,
  );
  const runsRaw = await runsRes.text();

  if (!runsRes.ok) {
    throw new Error(`Supabase runs query failed (${runsRes.status}): ${runsRaw}`);
  }

  let runs: any;
  try {
    runs = JSON.parse(runsRaw);
  } catch {
    throw new Error(`Supabase runs returned non-JSON: ${runsRaw}`);
  }

  if (!Array.isArray(runs)) {
    throw new Error(`Supabase runs returned non-array: ${runsRaw}`);
  }

  const totalRuns = runs.length;
  const completed = runs.filter((r: any) => r.status === "complete").length;
  const failed = runs.filter((r: any) => r.status === "failed").length;
  const running = runs.filter((r: any) => r.status === "running" || r.status === "queued").length;

  // ── Credits used (sum from credit_ledger debits) ──
  const ledgerRes = await supabaseFetch(
    env,
    `/credit_ledger?user_id=eq.${userId}&type=in.(run_template,rerun_step)&select=amount`,
  );
  const ledgerRaw = await ledgerRes.text();
  let creditsUsed = 0;

  if (ledgerRes.ok) {
    try {
      const ledgerRows = JSON.parse(ledgerRaw);
      if (Array.isArray(ledgerRows)) {
        for (const row of ledgerRows) {
          creditsUsed += Math.abs(row.amount);
        }
      }
    } catch {
      // non-critical — default to 0
    }
  }

  // ── Fetch credits from users table ──
  const userRes = await supabaseFetch(
    env,
    `/users?select=credits&id=eq.${userId}&limit=1`,
  );
  const userRaw = await userRes.text();

  if (!userRes.ok) {
    throw new Error(`Supabase users query failed (${userRes.status}): ${userRaw}`);
  }

  const userRows = JSON.parse(userRaw);
  const credits =
    Array.isArray(userRows) && userRows[0]?.credits != null
      ? userRows[0].credits
      : 0;

  return Response.json({
    credits,
    totalRuns,
    completed,
    failed,
    running,
    creditsUsed,
    recentRuns: runs,
  });
}
