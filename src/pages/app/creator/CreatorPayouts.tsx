/**
 * CREATOR PAYOUTS — guided setup wizard.
 *
 * Three plain steps: link your Stripe account, file a bank account, get
 * verified. The wizard derives each step's state from the live
 * `creator-connect` status (`bank_status` returns both the account state and
 * the bank accounts on file), so it always reflects reality rather than local
 * progress. This is also the page Stripe returns creators to after hosted
 * onboarding (`?connect=return`) or when a link expires (`?connect=refresh`).
 * Read-only: no billing or credit logic here.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Banknote,
  Check,
  CheckCircle2,
  ExternalLink,
  Landmark,
  Loader2,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import SiteShell from "@/components/mvp/SiteShell";
import PageMeta from "@/components/mvp/PageMeta";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { loadBankStatus, requestConnectLink, type BankStatus } from "@/services/creatorEarnings";

const panelClass = "rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-sm";

type StepState = "done" | "current" | "waiting" | "todo";

type Step = {
  id: "account" | "bank" | "verified";
  title: string;
  short: string;
  body: string;
  state: StepState;
  icon: typeof Landmark;
  cta: "onboard" | "dashboard" | null;
  ctaLabel: string;
  detail?: string;
};

function buildSteps(bank: BankStatus): Step[] {
  const accounts = bank.bank_accounts ?? [];
  const hasBank = accounts.length > 0;
  const linked = bank.connected && bank.status !== "not_started";
  const verified = bank.payouts_enabled && bank.status === "ready";
  const pending = bank.status === "verification_pending";
  const primary = accounts.find((a) => a.default_for_currency) ?? accounts[0] ?? null;

  const account: Step = {
    id: "account",
    title: "Link your Stripe account",
    short: "Your details",
    body: linked
      ? "Your Stripe account is linked to FUSE. You can reopen it any time to update your details."
      : "We pay you through Stripe, so first we need your name, address and tax details. Stripe collects these on their own secure page — FUSE never sees them.",
    state: linked ? "done" : "current",
    icon: Landmark,
    cta: "onboard",
    ctaLabel: linked ? "Update my details" : "Start with Stripe",
  };

  const bankStep: Step = {
    id: "bank",
    title: "Add the bank account to be paid into",
    short: "Bank account",
    body: hasBank
      ? "A bank account is on file, so your money has somewhere to land."
      : "Tell Stripe which bank account your earnings should be sent to. Until this is on file, money can only sit in your payout balance.",
    state: hasBank ? "done" : linked ? "current" : "todo",
    icon: Banknote,
    cta: "onboard",
    ctaLabel: hasBank ? "Change bank account" : "Add bank account",
    detail:
      hasBank && primary
        ? [primary.bank_name ?? "Bank account", primary.last4 ? `•••• ${primary.last4}` : null]
            .filter(Boolean)
            .join(" ")
        : undefined,
  };

  const verifyStep: Step = {
    id: "verified",
    title: "Get approved for payouts",
    short: "Payouts on",
    body: verified
      ? "You're all set. Earnings are sent to you automatically once they clear the 7-day hold."
      : pending
        ? "Stripe is checking your details. Nothing to do right now — your earnings keep adding up safely meanwhile."
        : bank.status === "restricted"
          ? "Stripe needs something confirmed before payouts can be switched on. Open your setup to see exactly what's missing."
          : "Once your details and bank account are in, Stripe switches payouts on — usually within a few minutes.",
    state: verified ? "done" : pending ? "waiting" : hasBank && linked ? "current" : "todo",
    icon: ShieldCheck,
    cta: verified ? "dashboard" : linked ? "onboard" : null,
    ctaLabel: verified ? "Manage payouts" : "Finish setup",
  };

  return [account, bankStep, verifyStep];
}

export default function CreatorPayouts() {
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
      setError(err instanceof Error ? err.message : "Could not check your payout setup");
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
        action === "onboard" ? "/app/creator/payouts" : undefined,
      );
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open payout setup");
      setBusy(null);
    }
  }, []);

  const steps = useMemo(() => (bank ? buildSteps(bank) : null), [bank]);
  const doneCount = steps ? steps.filter((s) => s.state === "done").length : 0;
  const allDone = !!steps && doneCount === steps.length;
  const activeStep = steps?.find((s) => s.state === "current" || s.state === "waiting") ?? null;

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
          Real money in US dollars — kept separate from your FUSE credits. Three short steps, then
          you're paid automatically.
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

          {finishing || (loading && !bank) ? (
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

          {!loading && !bank && error ? (
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

          {steps && !finishing ? (
            <>
              <div
                className={cn(
                  panelClass,
                  allDone ? "border-emerald-300/25 bg-emerald-300/[0.05]" : "border-cyan-200/25",
                )}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="font-display text-xl font-bold text-foreground">
                      {allDone
                        ? "You're all set to get paid"
                        : activeStep
                          ? activeStep.title
                          : "Finish your payout setup"}
                    </h2>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {allDone
                        ? "Earnings are sent to your bank automatically once they clear the 7-day hold."
                        : (activeStep?.body ?? "Work through the steps below to switch payouts on.")}
                    </p>
                  </div>
                  <span className="shrink-0 font-display text-sm font-bold tabular-nums text-cyan-200">
                    {doneCount}/{steps.length}
                  </span>
                </div>

                <div className="mt-5 flex gap-1.5" aria-hidden>
                  {steps.map((step) => (
                    <span
                      key={step.id}
                      className={cn(
                        "h-1.5 flex-1 rounded-full",
                        step.state === "done"
                          ? "bg-emerald-300"
                          : step.state === "current"
                            ? "bg-cyan-300"
                            : step.state === "waiting"
                              ? "bg-amber-200"
                              : "bg-white/10",
                      )}
                    />
                  ))}
                </div>

                <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
                  {activeStep?.cta ? (
                    <Button
                      type="button"
                      onClick={() => void go(activeStep.cta as "onboard" | "dashboard")}
                      disabled={busy !== null}
                      className="w-full rounded-full bg-cyan-300 font-semibold text-black hover:bg-cyan-200 sm:w-auto"
                    >
                      {busy ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
                      {expired ? "Continue setup" : activeStep.ctaLabel}
                    </Button>
                  ) : allDone ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void go("dashboard")}
                      disabled={busy !== null}
                      className="w-full rounded-full border-white/15 bg-white/5 font-semibold text-foreground hover:bg-white/10 sm:w-auto"
                    >
                      {busy ? (
                        <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <ExternalLink className="mr-2 h-3.5 w-3.5" />
                      )}
                      Manage payouts
                    </Button>
                  ) : null}
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

                {error && bank ? <p className="mt-4 text-sm text-amber-200">{error}</p> : null}
              </div>

              <ol className="space-y-3">
                {steps.map((step, index) => {
                  const Icon = step.icon;
                  const isActive = step.state === "current" || step.state === "waiting";
                  return (
                    <li
                      key={step.id}
                      className={cn(
                        panelClass,
                        "flex items-start gap-4",
                        step.state === "done" && "border-emerald-300/20",
                        step.state === "current" && "border-cyan-200/30 bg-cyan-200/[0.04]",
                        step.state === "waiting" && "border-amber-200/25 bg-amber-200/[0.04]",
                        step.state === "todo" && "opacity-70",
                      )}
                      aria-current={isActive ? "step" : undefined}
                    >
                      <span
                        className={cn(
                          "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border font-display text-xs font-bold",
                          step.state === "done"
                            ? "border-emerald-300/40 bg-emerald-300/10 text-emerald-200"
                            : step.state === "waiting"
                              ? "border-amber-200/40 bg-amber-200/10 text-amber-200"
                              : step.state === "current"
                                ? "border-cyan-200/40 bg-cyan-200/10 text-cyan-100"
                                : "border-white/15 bg-white/[0.04] text-muted-foreground",
                        )}
                      >
                        {step.state === "done" ? (
                          <Check className="h-4 w-4" />
                        ) : step.state === "waiting" ? (
                          <ShieldAlert className="h-4 w-4" />
                        ) : (
                          index + 1
                        )}
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-display text-base font-bold text-foreground">
                            {step.title}
                          </p>
                          {step.state === "done" ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300/30 bg-emerald-300/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-emerald-200">
                              <CheckCircle2 className="h-3 w-3" />
                              Done
                            </span>
                          ) : step.state === "waiting" ? (
                            <span className="rounded-full border border-amber-200/30 bg-amber-200/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-amber-200">
                              In review
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                          {step.body}
                        </p>
                        {step.detail ? (
                          <p className="mt-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-foreground">
                            <Icon className="h-3.5 w-3.5 text-cyan-200" />
                            {step.detail}
                          </p>
                        ) : null}

                        {step.cta && step.state !== "todo" ? (
                          <Button
                            type="button"
                            variant={step.state === "done" ? "ghost" : "outline"}
                            onClick={() => void go(step.cta as "onboard" | "dashboard")}
                            disabled={busy !== null}
                            className={cn(
                              "mt-3 rounded-full text-sm",
                              step.state === "done"
                                ? "px-0 text-cyan-200 hover:bg-transparent hover:text-cyan-100"
                                : "border-white/15 bg-white/5 text-foreground hover:bg-white/10",
                            )}
                          >
                            {step.ctaLabel}
                          </Button>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </>
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
