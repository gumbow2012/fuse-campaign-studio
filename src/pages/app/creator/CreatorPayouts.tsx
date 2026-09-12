/**
 * CREATOR PAYOUTS — the payout setup landing page.
 *
 * This is the page Stripe returns creators to after hosted onboarding
 * (`?connect=return`) or when a setup link expires (`?connect=refresh`).
 * Read-only: it only asks the existing `creator-connect` edge function for
 * status / hosted links. No billing or credit logic here.
 */

import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, ExternalLink, Loader2, RefreshCw, ShieldAlert } from "lucide-react";
import SiteShell from "@/components/mvp/SiteShell";
import PageMeta from "@/components/mvp/PageMeta";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  loadConnectStatus,
  requestConnectLink,
  type ConnectStatus,
} from "@/services/creatorEarnings";

const panelClass = "rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-sm";

type View = {
  heading: string;
  body: string;
  cta: "onboard" | "dashboard" | null;
  ctaLabel: string;
  ready?: boolean;
  warn?: boolean;
};

function viewFor(connect: ConnectStatus): View {
  if (connect.payouts_enabled && connect.status === "ready") {
    return {
      heading: "You're all set to get paid",
      body: "Your bank details are confirmed. Earnings are sent to you automatically once they clear the 7-day hold.",
      cta: "dashboard",
      ctaLabel: "Manage payouts",
      ready: true,
    };
  }
  switch (connect.status) {
    case "verification_pending":
      return {
        heading: "Verification in progress",
        body: "Your details are being checked. Nothing to do right now — we'll turn on payouts as soon as it clears. Earnings keep adding up safely meanwhile.",
        cta: "onboard",
        ctaLabel: "Continue setup",
        warn: true,
      };
    case "action_required":
      return {
        heading: "A few more details are needed",
        body: "Payout setup was started but isn't finished. Pick up where you left off — it usually takes a couple of minutes.",
        cta: "onboard",
        ctaLabel: "Continue setup",
        warn: true,
      };
    case "restricted":
      return {
        heading: "Your account needs attention",
        body: "Payouts are on hold until some information is confirmed. Open setup to see exactly what's missing.",
        cta: "onboard",
        ctaLabel: "Continue setup",
        warn: true,
      };
    default:
      return {
        heading: "Set up payouts",
        body: "Connect a bank account so we can send you real money when customers run your templates. You only need to do this once.",
        cta: "onboard",
        ctaLabel: "Set up payouts",
      };
  }
}

export default function CreatorPayouts() {
  const [params, setParams] = useSearchParams();
  const returned = params.get("connect") === "return";
  const expired = params.get("connect") === "refresh";

  const [connect, setConnect] = useState<ConnectStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [finishing, setFinishing] = useState(returned);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"onboard" | "dashboard" | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setConnect(await loadConnectStatus());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not check your payout setup");
    } finally {
      setLoading(false);
      setFinishing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const go = useCallback(
    async (action: "onboard" | "dashboard") => {
      setBusy(action);
      setError(null);
      try {
        const url = await requestConnectLink(
          action,
          action === "onboard" ? "/app/creator/payouts" : undefined,
        );
        window.location.href = url;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not open payout setup");
        setBusy(null);
      }
    },
    [],
  );

  const view = connect ? viewFor(connect) : null;

  return (
    <SiteShell>
      <PageMeta
        title="Creator Payouts | FUSE"
        description="Connect your bank account to receive your FUSE creator earnings."
        path="/app/creator/payouts"
        noindex
      />
      <div className="mx-auto w-full max-w-2xl px-4 py-12 sm:px-6 sm:py-16">
        <Link
          to="/app/creator"
          className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-cyan-200/80 transition hover:text-cyan-200"
          onClick={() => {
            if (params.get("connect")) setParams({}, { replace: true });
          }}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Earnings
        </Link>

        <h1 className="mt-5 font-display text-3xl font-black text-foreground sm:text-4xl">Payouts</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Real money in US dollars — kept separate from your FUSE credits.
        </p>

        <div className="mt-8 space-y-4">
          {expired ? (
            <div className={cn(panelClass, "border-amber-200/25 bg-amber-200/[0.05]")}>
              <p className="font-display text-base font-bold text-foreground">
                Your setup link expired
              </p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                Pick up where you left off — nothing you entered was lost.
              </p>
            </div>
          ) : null}

          {finishing || (loading && !connect) ? (
            <div className={panelClass}>
              <div className="flex items-center gap-3">
                <Loader2 className="h-4 w-4 animate-spin text-cyan-200" />
                <p className="text-sm text-muted-foreground">
                  {finishing ? "Finishing setup…" : "Checking your payout setup…"}
                </p>
              </div>
              <div className="mt-4 h-3 w-2/3 animate-pulse rounded-full bg-white/[0.06]" />
              <div className="mt-2 h-3 w-1/2 animate-pulse rounded-full bg-white/[0.06]" />
            </div>
          ) : null}

          {!loading && !connect && error ? (
            <div className={panelClass}>
              <p className="font-display text-base font-bold text-foreground">
                We couldn't check your payout setup
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

          {view && !finishing ? (
            <div
              className={cn(
                panelClass,
                view.ready
                  ? "border-emerald-300/25 bg-emerald-300/[0.05]"
                  : view.warn
                    ? "border-amber-200/25"
                    : "border-cyan-200/25 bg-cyan-200/[0.05]",
              )}
            >
              <div className="flex items-start gap-3">
                {view.ready ? (
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
                ) : view.warn ? (
                  <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-200" />
                ) : null}
                <div className="min-w-0">
                  <h2 className="font-display text-xl font-bold text-foreground">{view.heading}</h2>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{view.body}</p>
                </div>
              </div>

              {view.cta ? (
                <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <Button
                    type="button"
                    onClick={() => void go(view.cta as "onboard" | "dashboard")}
                    disabled={busy !== null}
                    variant={view.ready ? "outline" : "default"}
                    className={cn(
                      "w-full rounded-full font-semibold sm:w-auto",
                      view.ready
                        ? "border-white/15 bg-white/5 text-foreground hover:bg-white/10"
                        : "bg-cyan-300 text-black hover:bg-cyan-200",
                    )}
                  >
                    {busy ? (
                      <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                    ) : view.ready ? (
                      <ExternalLink className="mr-2 h-3.5 w-3.5" />
                    ) : null}
                    {expired && view.cta === "onboard" ? "Continue setup" : view.ctaLabel}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => void load()}
                    disabled={loading}
                    className="w-full rounded-full text-muted-foreground hover:text-foreground sm:w-auto"
                  >
                    <RefreshCw className={cn("mr-2 h-3.5 w-3.5", loading && "animate-spin")} />
                    Refresh status
                  </Button>
                </div>
              ) : null}

              {error && connect ? <p className="mt-4 text-sm text-amber-200">{error}</p> : null}
            </div>
          ) : null}

          <div className={panelClass}>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Payouts land in the bank account on file.{" "}
              <Link
                to="/app/creator/bank"
                className="text-cyan-200 underline-offset-4 hover:underline"
              >
                Check your bank account
              </Link>{" "}
              or{" "}
              <Link to="/app/creator" className="text-cyan-200 underline-offset-4 hover:underline">
                open your Earnings screen
              </Link>
              .
            </p>
          </div>
        </div>
      </div>
    </SiteShell>
  );
}
