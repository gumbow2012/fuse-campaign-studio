/**
 * CREATOR BANK ACCOUNT — the bank account on file that payouts land in.
 *
 * Read-only view of the connected account's bank details (via the existing
 * `creator-connect` edge function). Adding or changing bank details always
 * happens in Stripe's own hosted flow — we never collect bank numbers here.
 */

import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Banknote,
  CheckCircle2,
  ExternalLink,
  Loader2,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import SiteShell from "@/components/mvp/SiteShell";
import PageMeta from "@/components/mvp/PageMeta";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { loadBankStatus, requestConnectLink, type BankStatus } from "@/services/creatorEarnings";

const panelClass = "rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-sm";

export default function CreatorBankAccount() {
  const [params, setParams] = useSearchParams();
  const returned = params.get("connect") === "return";
  const expired = params.get("connect") === "refresh";

  const [bank, setBank] = useState<BankStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [finishing, setFinishing] = useState(returned);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"onboard" | "dashboard" | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setBank(await loadBankStatus());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not check your bank details");
    } finally {
      setLoading(false);
      setFinishing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const go = useCallback(async (action: "onboard" | "dashboard") => {
    setBusy(action);
    setError(null);
    try {
      const url = await requestConnectLink(
        action,
        action === "onboard" ? "/app/creator/bank" : undefined,
      );
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open bank setup");
      setBusy(null);
    }
  }, []);

  const accounts = bank?.bank_accounts ?? [];
  const hasBank = accounts.length > 0;
  const ready = !!bank?.payouts_enabled && hasBank;

  return (
    <SiteShell>
      <PageMeta
        title="Bank Account | FUSE Creator Payouts"
        description="See the bank account your FUSE creator earnings are paid into."
        path="/app/creator/bank"
        noindex
      />
      <div className="mx-auto w-full max-w-2xl px-4 py-12 sm:px-6 sm:py-16">
        <Link
          to="/app/creator/payouts"
          className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-cyan-200/80 transition hover:text-cyan-200"
          onClick={() => {
            if (params.get("connect")) setParams({}, { replace: true });
          }}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Payouts
        </Link>

        <h1 className="mt-5 font-display text-3xl font-black text-foreground sm:text-4xl">
          Bank account
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          This is where your earnings actually land. Without a bank account on file, money can only
          sit in your payout balance.
        </p>

        <div className="mt-8 space-y-4">
          {expired ? (
            <div className={cn(panelClass, "border-amber-200/25 bg-amber-200/[0.05]")}>
              <p className="font-display text-base font-bold text-foreground">
                Your setup link expired
              </p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                Start again below — nothing you entered was lost.
              </p>
            </div>
          ) : null}

          {finishing || (loading && !bank) ? (
            <div className={panelClass}>
              <div className="flex items-center gap-3">
                <Loader2 className="h-4 w-4 animate-spin text-cyan-200" />
                <p className="text-sm text-muted-foreground">
                  {finishing ? "Finishing setup…" : "Checking your bank details…"}
                </p>
              </div>
              <div className="mt-4 h-3 w-2/3 animate-pulse rounded-full bg-white/[0.06]" />
              <div className="mt-2 h-3 w-1/2 animate-pulse rounded-full bg-white/[0.06]" />
            </div>
          ) : null}

          {!loading && !bank && error ? (
            <div className={panelClass}>
              <p className="font-display text-base font-bold text-foreground">
                We couldn't check your bank details
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{error}</p>
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
          ) : null}

          {bank && !finishing ? (
            <div
              className={cn(
                panelClass,
                ready
                  ? "border-emerald-300/25 bg-emerald-300/[0.05]"
                  : "border-amber-200/25 bg-amber-200/[0.04]",
              )}
            >
              <div className="flex items-start gap-3">
                {ready ? (
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
                ) : (
                  <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-200" />
                )}
                <div className="min-w-0">
                  <h2 className="font-display text-xl font-bold text-foreground">
                    {ready
                      ? "Bank account on file ✓"
                      : hasBank
                        ? "Bank added — verification in progress"
                        : "No bank account on file yet"}
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {ready
                      ? "Earnings are sent to this account automatically once they clear the 7-day hold."
                      : hasBank
                        ? "Your bank details are being checked. Nothing to do right now — payouts start as soon as it clears."
                        : "Add your bank details in Stripe's secure form so your earnings can be sent to you. FUSE never sees or stores your account numbers."}
                  </p>
                </div>
              </div>

              {hasBank ? (
                <div className="mt-5 space-y-2">
                  {accounts.map((acct, index) => (
                    <div
                      key={acct.id ?? index}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/30 px-4 py-3"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <Banknote className="h-4 w-4 shrink-0 text-cyan-200" />
                        <div className="min-w-0">
                          <p className="truncate font-display text-sm font-semibold text-foreground">
                            {acct.bank_name ?? "Bank account"}
                            {acct.last4 ? ` •••• ${acct.last4}` : ""}
                          </p>
                          <p className="mt-0.5 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                            {[acct.country, acct.currency].filter(Boolean).join(" · ") || "—"}
                          </p>
                        </div>
                      </div>
                      {acct.default_for_currency ? (
                        <Badge
                          variant="outline"
                          className="whitespace-nowrap border-cyan-200/30 text-[11px] text-cyan-200"
                        >
                          Payouts go here
                        </Badge>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Button
                  type="button"
                  onClick={() => void go(hasBank && bank.connected ? "dashboard" : "onboard")}
                  disabled={busy !== null}
                  variant={ready ? "outline" : "default"}
                  className={cn(
                    "w-full rounded-full font-semibold sm:w-auto",
                    ready
                      ? "border-white/15 bg-white/5 text-foreground hover:bg-white/10"
                      : "bg-cyan-300 text-black hover:bg-cyan-200",
                  )}
                >
                  {busy ? (
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <ExternalLink className="mr-2 h-3.5 w-3.5" />
                  )}
                  {hasBank ? "Update bank details" : "Add bank account"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => void load()}
                  disabled={loading}
                  className="w-full rounded-full text-muted-foreground hover:text-foreground sm:w-auto"
                >
                  <RefreshCw className={cn("mr-2 h-3.5 w-3.5", loading && "animate-spin")} />
                  Refresh
                </Button>
              </div>

              {error && bank ? <p className="mt-4 text-sm text-amber-200">{error}</p> : null}
            </div>
          ) : null}

          <div className={panelClass}>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Bank details are entered and stored by Stripe, our payments partner — FUSE only sees
              the bank name and last four digits.{" "}
              <Link to="/app/creator" className="text-cyan-200 underline-offset-4 hover:underline">
                Open your Earnings screen
              </Link>
              .
            </p>
          </div>
        </div>
      </div>
    </SiteShell>
  );
}
