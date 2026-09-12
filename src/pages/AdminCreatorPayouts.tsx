import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowLeft, ChevronDown, ChevronRight, Loader2, RefreshCw, Wallet } from "lucide-react";
import SiteShell from "@/components/mvp/SiteShell";
import PageMeta from "@/components/mvp/PageMeta";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  formatCents,
  formatDateTime,
  loadAdminPayoutsSnapshot,
  type AdminPayoutRow,
  type AdminPayoutsSnapshot,
  type CreatorMoneyRow,
} from "@/services/adminCreatorPayouts";

const panel = "rounded-3xl border border-white/10 bg-white/[0.04] p-5 shadow-sm backdrop-blur";

function payoutBadge(status: string) {
  const map: Record<string, string> = {
    paid: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    transferred: "bg-sky-500/15 text-sky-300 border-sky-500/30",
    pending: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    failed: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  };
  return map[status] ?? "bg-white/10 text-muted-foreground border-white/15";
}

function connectLabel(row: CreatorMoneyRow) {
  const connect = row.connect;
  if (!connect) return { label: "Not connected", tone: "bg-rose-500/15 text-rose-300 border-rose-500/30" };
  if (connect.payouts_enabled) return { label: "Payouts enabled", tone: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" };
  const status = connect.onboarding_status ?? "not_started";
  if (status === "verification_pending") return { label: "Verifying", tone: "bg-amber-500/15 text-amber-300 border-amber-500/30" };
  if (status === "action_required" || status === "restricted") return { label: "Action needed", tone: "bg-orange-500/15 text-orange-300 border-orange-500/30" };
  return { label: "Setup incomplete", tone: "bg-white/10 text-muted-foreground border-white/15" };
}

const StatCard = ({ label, value, hint }: { label: string; value: string; hint?: string }) => (
  <div className="rounded-2xl border border-sky-500/25 bg-gradient-to-br from-sky-500/10 via-background/60 to-background/40 p-4">
    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-sky-300/80">{label}</p>
    <p className="mt-2 font-display text-2xl font-black text-foreground">{value}</p>
    {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
  </div>
);

const PayoutHistoryTable = ({ rows }: { rows: AdminPayoutRow[] }) => {
  if (!rows.length) {
    return (
      <div className="rounded-2xl border border-white/10 bg-background/40 px-4 py-6 text-sm text-muted-foreground">
        No payouts sent yet.
      </div>
    );
  }
  return (
    <div className="-mx-2 overflow-x-auto px-2">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead>
          <tr className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
            <th className="py-2 pr-4">Date</th>
            <th className="py-2 pr-4">Creator</th>
            <th className="py-2 pr-4">Amount</th>
            <th className="py-2 pr-4">Status</th>
            <th className="py-2 pr-4">Earnings</th>
            <th className="py-2 pr-4">Stripe</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {rows.map((p) => (
            <tr key={p.id}>
              <td className="py-3 pr-4 text-muted-foreground">{formatDateTime(p.created_at)}</td>
              <td className="py-3 pr-4 font-mono text-xs text-muted-foreground">{p.creator_id.slice(0, 8)}</td>
              <td className="py-3 pr-4 font-display font-black text-foreground">{formatCents(p.amount_cents)}</td>
              <td className="py-3 pr-4">
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${payoutBadge(p.status)}`}>
                  {p.status}
                </span>
                {p.failure_reason ? (
                  <span className="ml-2 text-xs text-rose-300">{p.failure_reason}</span>
                ) : null}
              </td>
              <td className="py-3 pr-4 text-muted-foreground">{p.earning_count ?? 0}</td>
              <td className="py-3 pr-4 font-mono text-[11px] text-muted-foreground">
                {p.stripe_payout_id ?? p.stripe_transfer_id ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const AdminCreatorPayouts = () => {
  const [snapshot, setSnapshot] = useState<AdminPayoutsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSnapshot(await loadAdminPayoutsSnapshot());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load payout data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const creators = useMemo(() => {
    const rows = snapshot?.creators ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((c) =>
      [c.name, c.email, c.creatorId].filter(Boolean).some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [snapshot, query]);

  return (
    <SiteShell>
      <PageMeta
        title="Creator Payouts | FUSE Admin"
        description="All creator earnings, payout readiness and payout history in one place."
        path="/admin/creator-payouts"
      />
      <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link to="/admin" className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-[0.15em] text-muted-foreground hover:text-foreground">
              <ArrowLeft size={12} /> Admin
            </Link>
            <h1 className="mt-2 font-display text-3xl font-black text-foreground">Creator Payouts</h1>
            <p className="text-sm text-muted-foreground">Pending earnings, payout readiness and full payout history.</p>
          </div>
          <Button variant="outline" onClick={() => void load()} disabled={loading} className="border-white/15 bg-white/5">
            {loading ? <Loader2 size={14} className="mr-2 animate-spin" /> : <RefreshCw size={14} className="mr-2" />}
            Refresh
          </Button>
        </div>

        {error ? (
          <div className={`${panel} flex items-start gap-3 border-rose-500/30 bg-rose-500/5`}>
            <AlertTriangle size={16} className="mt-0.5 text-rose-300" />
            <div>
              <p className="text-sm font-semibold text-foreground">Couldn't load payout data</p>
              <p className="text-xs text-muted-foreground">{error}</p>
            </div>
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Held (pending)" value={formatCents(snapshot?.totals.pendingCents)} hint="Still inside the hold period" />
          <StatCard label="Ready to pay" value={formatCents(snapshot?.totals.availableCents)} hint={`${snapshot?.totals.payoutsReady ?? 0} creators`} />
          <StatCard label="Paid out" value={formatCents(snapshot?.totals.paidCents)} hint="Transfers completed" />
          <StatCard label="Creators earning" value={String(snapshot?.totals.creatorsWithMoney ?? 0)} />
        </div>

        <div className={panel}>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 font-display text-lg font-black text-foreground">
              <Wallet size={16} className="text-sky-300" /> Creators
            </h2>
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, email or id"
              className="h-9 w-full max-w-xs border-white/10 bg-background/60 text-sm"
            />
          </div>

          {loading && !snapshot ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-14 animate-pulse rounded-2xl bg-white/5" />
              ))}
            </div>
          ) : creators.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-background/40 px-4 py-8 text-center text-sm text-muted-foreground">
              No creator earnings recorded yet.
            </div>
          ) : (
            <div className="space-y-2">
              {creators.map((c) => {
                const badge = connectLabel(c);
                const open = expanded === c.creatorId;
                return (
                  <div key={c.creatorId} className="rounded-2xl border border-white/10 bg-background/40">
                    <button
                      type="button"
                      onClick={() => setExpanded(open ? null : c.creatorId)}
                      className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left"
                    >
                      {open ? <ChevronDown size={14} className="text-muted-foreground" /> : <ChevronRight size={14} className="text-muted-foreground" />}
                      <div className="min-w-[160px] flex-1">
                        <p className="text-sm font-semibold text-foreground">{c.name || c.email || "Unnamed creator"}</p>
                        <p className="font-mono text-[11px] text-muted-foreground">{c.email ?? c.creatorId}</p>
                      </div>
                      <div className="grid grid-cols-3 gap-4 text-right">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Held</p>
                          <p className="text-sm font-black text-foreground">{formatCents(c.pendingCents)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-sky-300/80">Ready</p>
                          <p className="text-sm font-black text-sky-200">{formatCents(c.availableCents)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Paid</p>
                          <p className="text-sm font-black text-foreground">{formatCents(c.paidCents)}</p>
                        </div>
                      </div>
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${badge.tone}`}>
                        {badge.label}
                      </span>
                    </button>

                    {open ? (
                      <div className="space-y-4 border-t border-white/5 px-4 py-4">
                        <div className="grid gap-3 sm:grid-cols-3">
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Stripe account</p>
                            <p className="font-mono text-xs text-foreground">{c.connect?.stripe_account_id ?? "—"}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Country</p>
                            <p className="text-xs text-foreground">{c.connect?.country?.toUpperCase() ?? "—"}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Last synced</p>
                            <p className="text-xs text-foreground">{formatDateTime(c.connect?.last_synced_at ?? null)}</p>
                          </div>
                        </div>
                        <div>
                          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
                            Payout history · {c.earningCount} earnings recorded
                          </p>
                          <PayoutHistoryTable rows={c.payouts} />
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className={panel}>
          <h2 className="mb-4 font-display text-lg font-black text-foreground">All payouts</h2>
          <PayoutHistoryTable rows={snapshot?.payouts ?? []} />
        </div>
      </div>
    </SiteShell>
  );
};

export default AdminCreatorPayouts;
