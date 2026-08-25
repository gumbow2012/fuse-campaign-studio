import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { loadCreditHistory, type CreditLedgerRow } from "@/services/creditHistory";

const typeLabel: Record<string, string> = {
  run_template: "Template run",
  rerun_step: "Rerun step",
  topup: "Top-up",
  monthly_grant: "Monthly credits",
  refund: "Refund",
  adjustment: "Adjustment",
  creator_reward: "Creator reward",
};

export default function CreditUsageHistory() {
  const { user } = useAuth();
  const [history, setHistory] = useState<CreditLedgerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    loadCreditHistory(user.id)
      .then((rows) => {
        if (!cancelled) setHistory(rows);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load credit history.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

  return (
    <section className="rounded-[2rem] border border-white/10 bg-slate-950/75 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl">
      <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Usage &amp; history</p>

      {loading ? (
        <p className="mt-5 text-sm text-slate-400">Loading activity...</p>
      ) : error ? (
        <p className="mt-5 text-sm text-red-300">{error}</p>
      ) : history.length === 0 ? (
        <p className="mt-5 text-sm text-slate-400">No credit activity yet.</p>
      ) : (
        <>
          <div className="mt-5 overflow-hidden rounded-2xl border border-white/10">
            <table className="w-full text-sm">
              <thead className="bg-white/[0.04] text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Date</th>
                  <th className="px-4 py-3 text-left font-medium">Type</th>
                  <th className="px-4 py-3 text-left font-medium">Description</th>
                  <th className="px-4 py-3 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {history.map((row) => {
                  const isNegative = row.amount < 0;
                  return (
                    <tr key={row.id} className="hover:bg-white/[0.02]">
                      <td className="px-4 py-3 text-slate-300">
                        {new Date(row.created_at).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </td>
                      <td className="px-4 py-3 text-slate-200">{typeLabel[row.type] ?? row.type}</td>
                      <td className="px-4 py-3 text-slate-400">{row.description ?? "—"}</td>
                      <td
                        className={`px-4 py-3 text-right font-medium ${isNegative ? "text-red-300" : "text-cyan-300"}`}
                      >
                        {isNegative ? "−" : "+"}
                        {Math.abs(row.amount).toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-slate-500">Showing recent activity</p>
        </>
      )}
    </section>
  );
}
