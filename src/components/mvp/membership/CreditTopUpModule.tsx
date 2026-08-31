import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Coins, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { useAuth } from "@/contexts/AuthContext";
import {
  CREDIT_TOPUP_MAX,
  CREDIT_TOPUP_MIN,
  CREDIT_TOPUP_STEP,
  normalizeCreditAmount,
  quoteCreditTopUp,
  validateCreditTopUpAmount,
} from "@/lib/creditPricing";
import {
  BEST_PLAN_COST_PER_1K,
  DEFAULT_TOP_UP_AMOUNT,
  QUICK_TOP_UP_AMOUNTS,
  topUpChipLabel,
} from "@/lib/topUpLadder";

type Props = {
  /** Currently loading key (any truthy value disables the buy button). */
  loading?: string | null;
  isAdmin?: boolean;
  /** Receives ONLY the credits integer — the server is the sole price authority. */
  onCheckout: (credits: number) => void;
  /** Reports the selected amount (used by the credit mix calculator). */
  onAmountChange?: (amount: number) => void;
  /** Hides the "view plans" note in tight surfaces (e.g. the quick-buy dialog). */
  hidePlanNote?: boolean;
  /**
   * Shows the smallest entry tier ($10 / 200 credits) as a clearly gated
   * "coming soon" chip. It never maps to a checkout price — display only.
   */
  showEntryTierPreview?: boolean;
};


const usd = (dollars: number) =>
  dollars.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });

/**
 * ONE top-up module (no card wall, no gated sizes). Quick chips + forgiving custom
 * input + slider, all synced. The quote is mirrored client-side purely for instant
 * display; checkout receives the credits integer only.
 */
export default function CreditTopUpModule({
  loading,
  isAdmin = false,
  onCheckout,
  onAmountChange,
  hidePlanNote = false,
}: Props) {
  const { profile } = useAuth();
  const [credits, setCredits] = useState<number>(DEFAULT_TOP_UP_AMOUNT);
  const [raw, setRaw] = useState<string>(String(DEFAULT_TOP_UP_AMOUNT));

  const parsed = normalizeCreditAmount(raw);
  const error = parsed === null ? "Enter a credit amount." : validateCreditTopUpAmount(parsed);
  const valid = !error && parsed !== null;

  useEffect(() => {
    if (valid && parsed !== null) onAmountChange?.(parsed);
  }, [valid, parsed, onAmountChange]);

  const quote = useMemo(() => {
    try {
      return quoteCreditTopUp(valid ? (parsed as number) : credits);
    } catch {
      return null;
    }
  }, [valid, parsed, credits]);

  const select = (next: number) => {
    setCredits(next);
    setRaw(String(next));
  };

  const balance = Number(profile?.credits_balance ?? 0);
  const effectiveCredits = valid ? (parsed as number) : null;
  const busy = Boolean(loading);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
      <div className="flex items-center gap-2">
        <Coins className="h-4 w-4 text-cyan-200" aria-hidden />
        <h3 className="font-display text-lg font-bold uppercase tracking-[0.16em] text-white sm:text-xl">
          Top up credits
        </h3>
      </div>
      <p className="mt-2 text-sm text-slate-300">Add credits anytime. Your plan stays the same.</p>

      {/* Quick amounts */}
      <div className="mt-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">Quick amounts</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {QUICK_TOP_UP_AMOUNTS.map((amount) => {
            const active = effectiveCredits === amount;
            return (
              <button
                key={amount}
                type="button"
                onClick={() => select(amount)}
                aria-pressed={active}
                className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors duration-150 motion-reduce:transition-none ${
                  active
                    ? "border-cyan-300 bg-cyan-300 text-slate-950"
                    : "border-white/15 bg-white/5 text-slate-200 hover:bg-white/10"
                }`}
              >
                {topUpChipLabel(amount)}
              </button>
            );
          })}
          {showEntryTierPreview ? (
            <button
              type="button"
              disabled
              aria-disabled="true"
              title="The $10 starter top-up isn't available yet."
              className="cursor-not-allowed rounded-full border border-dashed border-white/15 bg-white/[0.02] px-3.5 py-1.5 text-xs font-semibold text-slate-500"
            >
              $10 · 200 cr — coming soon
            </button>
          ) : null}
        </div>
        {showEntryTierPreview ? (
          <p className="mt-2 text-[11px] text-slate-500">
            The $10 / 200-credit tier isn't available yet. Pick any amount above to buy now.
          </p>
        ) : null}
      </div>


      {/* Custom amount */}
      <div className="mt-5">
        <label
          htmlFor="credit-topup-amount"
          className="text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground"
        >
          Custom amount
        </label>
        <div className="mt-2 flex items-center gap-2">
          <Input
            id="credit-topup-amount"
            inputMode="numeric"
            value={raw}
            onChange={(event) => {
              setRaw(event.target.value);
              const next = normalizeCreditAmount(event.target.value);
              if (next !== null && !validateCreditTopUpAmount(next)) setCredits(next);
            }}
            aria-invalid={!valid}
            aria-describedby="credit-topup-help"
            className="max-w-[10rem] border-white/15 bg-slate-950/60 text-white"
          />
          <span className="text-sm text-slate-400">credits</span>
        </div>
        <p id="credit-topup-help" className={`mt-2 text-xs ${valid ? "text-slate-500" : "text-rose-200"}`}>
          {valid
            ? `${CREDIT_TOPUP_MIN.toLocaleString()}–${CREDIT_TOPUP_MAX.toLocaleString()} credits, in steps of ${CREDIT_TOPUP_STEP}.`
            : error}
        </p>

        <div className="mt-4">
          <Slider
            value={[Math.min(Math.max(effectiveCredits ?? credits, CREDIT_TOPUP_MIN), CREDIT_TOPUP_MAX)]}
            min={CREDIT_TOPUP_MIN}
            max={CREDIT_TOPUP_MAX}
            step={CREDIT_TOPUP_STEP}
            onValueChange={([next]) => select(next)}
            aria-label="Credit amount"
          />
        </div>
      </div>

      {/* Live quote */}
      <div className="mt-5 rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.06] p-4">
        {quote && valid ? (
          <>
            <p className="font-display text-3xl font-black tracking-[-0.04em] text-white">
              {quote.credits.toLocaleString()}
              <span className="ml-2 text-sm font-medium text-slate-300">credits</span>
            </p>
            <p className="mt-1 text-sm text-cyan-100/90">
              {usd(quote.dollars)} one-time · {usd(quote.costPer1000)} per 1,000 credits
            </p>
            <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
              <div>
                <dt className="text-slate-400">Current balance</dt>
                <dd className="mt-0.5 font-semibold text-white">{balance.toLocaleString()}</dd>
              </div>
              <div>
                <dt className="text-slate-400">Purchase</dt>
                <dd className="mt-0.5 font-semibold text-cyan-200">+{quote.credits.toLocaleString()}</dd>
              </div>
              <div>
                <dt className="text-slate-400">Balance after</dt>
                <dd className="mt-0.5 font-semibold text-white">{(balance + quote.credits).toLocaleString()}</dd>
              </div>
            </dl>
          </>
        ) : (
          <p className="text-sm text-slate-300">Choose or enter a valid credit amount to see the price.</p>
        )}

        <Button
          onClick={() => {
            if (!valid || isAdmin || busy || effectiveCredits === null) return;
            onCheckout(effectiveCredits);
          }}
          disabled={!valid || isAdmin || busy}
          className="mt-4 w-full rounded-full bg-cyan-300 font-semibold text-slate-950 hover:bg-cyan-200"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          {isAdmin
            ? "Admin access"
            : busy
              ? "Loading..."
              : quote && valid
                ? `Buy ${quote.credits.toLocaleString()} credits · ${usd(quote.dollars)}`
                : "Buy credits"}
          {!isAdmin && !busy ? <ArrowRight className="h-4 w-4" aria-hidden /> : null}
        </Button>
      </div>

      {hidePlanNote ? null : (
        <p className="mt-3 text-xs text-slate-500">
          Need credits regularly? Your membership gives the lowest ongoing rate — from{" "}
          {usd(BEST_PLAN_COST_PER_1K)} per 1,000 credits.{" "}
          <Link to="/membership?tab=upgrade" className="text-cyan-200 underline-offset-4 hover:underline">
            View plans →
          </Link>
        </p>
      )}
    </div>
  );
}
