/**
 * CREATOR EARNINGS — real cash earnings, payout setup and history.
 *
 * Cash only: every figure here is US dollars from `creator_earnings` /
 * `creator_payouts`. FUSE credits are never mixed in. Read-only — payout setup
 * links come from the existing `creator-connect` edge function.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Banknote, Clock3, ExternalLink, Loader2, RefreshCw, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  formatUsd,
  loadConnectStatus,
  loadCreatorEarnings,
  requestConnectLink,
  type ConnectStatus,
  type CreatorEarningsData,
} from "@/services/creatorEarnings";

const panelClass = "rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm";

function MoneyTile({
  label,
  cents,
  hint,
  icon: Icon,
  accent,
}: {
  label: string;
  cents: number;
  hint: string;
  icon: typeof Wallet;
  accent?: boolean;
}) {
  return (
    <div className={cn(panelClass, accent && "border-cyan-200/25 bg-cyan-200/[0.06]")}>
      <div className="flex items-center gap-2">
        <Icon className={cn("h-3.5 w-3.5", accent ? "text-cyan-200" : "text-muted-foreground")} />
        <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">{label}</p>
      </div>
      <p
        className={cn(
          "mt-2 font-display text-3xl font-black",
          accent ? "text-cyan-200" : "text-foreground",
        )}
      >
        {formatUsd(cents)}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function StatusBadge({ label, tone }: { label: string; tone: "good" | "warn" | "bad" | "muted" }) {
  const toneClass =
    tone === "good"
      ? "border-cyan-200/30 text-cyan-200"
      : tone === "warn"
        ? "border-amber-200/30 text-amber-200"
        : tone === "bad"
          ? "border-red-300/30 text-red-300"
          : "border-white/15 text-muted-foreground";
  return (
    <Badge variant="outline" className={cn("text-[11px] whitespace-nowrap", toneClass)}>
      {label}
    </Badge>
  );
}

function payoutPresentation(status: string): { label: string; tone: "good" | "warn" | "bad" | "muted" } {
  switch (status) {
    case "paid":
      return { label: "Paid to your bank", tone: "good" };
    case "transferred":
      return { label: "In progress", tone: "warn" };
    case "failed":
      return { label: "Failed", tone: "bad" };
    case "pending":
      return { label: "Queued", tone: "muted" };
    default:
      return { label: status || "Unknown", tone: "muted" };
  }
}

function earningPresentation(status: string): { label: string; tone: "good" | "warn" | "bad" | "muted" } {
  switch (status) {
    case "paid":
      return { label: "Paid out", tone: "good" };
    case "available":
      return { label: "Available", tone: "warn" };
    case "pending":
      return { label: "Pending", tone: "muted" };
    case "reversed":
    case "cancelled":
      return { label: "Reversed", tone: "bad" };
    default:
      return { label: status || "Unknown", tone: "muted" };
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return "—";
  return new Date(time).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-xl bg-white/[0.06]", className)} />;
}

function PayoutSetupCard({
  connect,
  onError,
}: {
  connect: ConnectStatus | null;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState<"onboard" | "dashboard" | null>(null);

  const go = useCallback(
    async (action: "onboard" | "dashboard") => {
      setBusy(action);
      try {
        const url = await requestConnectLink(action);
        window.location.href = url;
      } catch (err) {
        onError(err instanceof Error ? err.message : "Could not open payout setup");
        setBusy(null);
      }
    },
    [onError],
  );

  if (!connect) {
    return (
      <div className={panelClass}>
        <Skeleton className="h-4 w-40" />
        <Skeleton className="mt-3 h-3 w-full max-w-md" />
      </div>
    );
  }

  const ready = connect.payouts_enabled && connect.status === "ready";
  const verifying = connect.status === "verification_pending";

  return (
    <div className={cn(panelClass, ready ? "border-cyan-200/25" : "border-amber-200/20")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-base font-bold text-foreground">
            {ready ? "Payouts enabled ✓" : verifying ? "Verification pending" : "Payout setup"}
          </h3>
          <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted-foreground">
            {ready
              ? "Your bank details are set up, so available earnings can be sent to you."
              : verifying
                ? "Your details are being checked. Nothing to do right now — we'll enable payouts as soon as the check clears."
                : "Add your details once so we can send your earnings to your bank. Until then, earnings keep adding up safely."}
          </p>
        </div>
        {ready ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => go("dashboard")}
            disabled={busy !== null}
            className="rounded-full border-white/15 bg-white/5 text-foreground hover:bg-white/10"
          >
            {busy === "dashboard" ? (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            ) : (
              <ExternalLink className="mr-2 h-3.5 w-3.5" />
            )}
            Manage payouts
          </Button>
        ) : verifying ? null : (
          <Button
            asChild
            className="rounded-full bg-cyan-300 font-semibold text-black hover:bg-cyan-200"
          >
            <Link to="/app/creator/payouts">Complete payout setup</Link>
          </Button>
        )}
      </div>
    </div>
  );
}

export default function CreatorEarningsPanel({ userId }: { userId: string }) {
  const [data, setData] = useState<CreatorEarningsData | null>(null);
  const [connect, setConnect] = useState<ConnectStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const earnings = await loadCreatorEarnings(userId);
      setData(earnings);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your earnings");
    } finally {
      setLoading(false);
    }
    try {
      setConnect(await loadConnectStatus());
    } catch {
      setConnect({ connected: false, status: "not_started", payouts_enabled: false });
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const hasAnything = useMemo(
    () => !!data && (data.earnings.length > 0 || data.payouts.length > 0),
    [data],
  );

  if (loading && !data) {
    return (
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
        <Skeleton className="h-24" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className={panelClass}>
        <h2 className="font-display text-lg font-bold text-foreground">Earnings</h2>
        <p className="mt-2 text-sm text-muted-foreground">{error}</p>
        <Button
          type="button"
          variant="outline"
          onClick={() => void load()}
          className="mt-4 rounded-full border-white/15 bg-white/5 text-foreground hover:bg-white/10"
        >
          <RefreshCw className="mr-2 h-3.5 w-3.5" />
          Try again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold text-foreground">Earnings</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Real money in US dollars — separate from your FUSE credits.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void load()}
          disabled={loading}
          className="rounded-full border-white/15 bg-white/5 text-foreground hover:bg-white/10"
        >
          {loading ? (
            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-3.5 w-3.5" />
          )}
          Refresh
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <MoneyTile
          label="Pending"
          cents={data?.pendingCents ?? 0}
          hint="Pending — clears after a 7-day hold"
          icon={Clock3}
        />
        <MoneyTile
          label="Available"
          cents={data?.availableCents ?? 0}
          hint="Available for payout"
          icon={Wallet}
          accent
        />
        <MoneyTile
          label="Paid out"
          cents={data?.paidCents ?? 0}
          hint="Paid out — lifetime"
          icon={Banknote}
        />
      </div>

      <PayoutSetupCard connect={connect} onError={setError} />

      {error && data ? (
        <p className="text-sm text-amber-200">{error}</p>
      ) : null}

      {!hasAnything ? (
        <div className={panelClass}>
          <p className="text-sm text-muted-foreground">
            No earnings yet — publish a template and earn when customers run it.
          </p>
        </div>
      ) : (
        <>
          <div className={panelClass}>
            <h3 className="font-display text-base font-bold text-foreground">Payouts</h3>
            {data && data.payouts.length > 0 ? (
              <div className="mt-3 space-y-2">
                {data.payouts.map((payout) => {
                  const view = payoutPresentation(payout.status);
                  return (
                    <div
                      key={payout.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/30 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="font-display text-sm font-semibold text-foreground">
                          {formatUsd(payout.amount_cents)}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {formatDate(payout.created_at)}
                        </p>
                      </div>
                      <StatusBadge label={view.label} tone={view.tone} />
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                No payouts yet. Once earnings clear the hold, they're sent to your bank.
              </p>
            )}
          </div>

          <div className={panelClass}>
            <h3 className="font-display text-base font-bold text-foreground">Transactions</h3>
            {data && data.earnings.length > 0 ? (
              <div className="mt-3 -mx-2 overflow-x-auto px-2">
                <table className="w-full min-w-[560px] border-collapse text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                      <th className="py-2 pr-4 font-medium">Date</th>
                      <th className="py-2 pr-4 font-medium">Template</th>
                      <th className="py-2 pr-4 font-medium">You earned</th>
                      <th className="py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.earnings.map((row) => {
                      const view = earningPresentation(row.status);
                      return (
                        <tr key={row.id} className="border-t border-white/10">
                          <td className="py-3 pr-4 text-muted-foreground">
                            {formatDate(row.created_at)}
                          </td>
                          <td className="max-w-[220px] truncate py-3 pr-4 text-foreground">
                            {row.template_name ?? row.template_id ?? "—"}
                          </td>
                          <td className="py-3 pr-4 font-display font-semibold text-foreground">
                            {formatUsd(row.creator_earning_cents)}
                          </td>
                          <td className="py-3">
                            <StatusBadge label={view.label} tone={view.tone} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                No earnings yet — publish a template and earn when customers run it.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
