import { useEffect, useMemo, useRef, useState } from "react";
import { Minus, Plus, Wand2 } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import {
  VIDEO_COST_RATES,
  creditsForImage,
  creditsForVideo,
  type VideoCostModelKey,
} from "@/lib/creditCosts";

/**
 * "What can N credits make?" — presentation-only allocation calculator.
 * Every credit figure derives from src/lib/creditCosts.ts. Nothing here touches
 * pricing, credit values, checkout or generation. All outputs are labelled approx.
 */

type RowKind = "image" | "video";

type RowDef = {
  id: string;
  label: string;
  kind: RowKind;
  model?: VideoCostModelKey;
  defaultSeconds?: number;
  defaultShare: number;
};

const ROWS: RowDef[] = [
  { id: "nano", label: "Nano Pro images", kind: "image", defaultShare: 0.6 },
  {
    id: "kling",
    label: VIDEO_COST_RATES["kling-2.5"].label + " videos",
    kind: "video",
    model: "kling-2.5",
    defaultSeconds: 5,
    defaultShare: 0.3,
  },
  {
    id: "seedance",
    label: VIDEO_COST_RATES["seedance-2.0"].label + " videos",
    kind: "video",
    model: "seedance-2.0",
    defaultSeconds: 5,
    defaultShare: 0.1,
  },
];

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const listener = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener("change", listener);
    return () => query.removeEventListener("change", listener);
  }, []);
  return reduced;
}

function useAnimatedNumber(target: number, reduced: boolean) {
  const [value, setValue] = useState(target);
  const frame = useRef<number | null>(null);
  const current = useRef(target);
  current.current = value;

  useEffect(() => {
    if (reduced) {
      setValue(target);
      return;
    }
    const start = current.current;
    const startedAt = performance.now();
    const duration = 320;
    const step = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(start + (target - start) * eased));
      if (progress < 1) frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, reduced]);

  return value;
}

type Props = {
  /** Credit budget to allocate — the selected pack amount, else the live balance. */
  budget: number;
  /** Where the budget came from, for honest labelling. */
  budgetSource: "balance" | "pack";
};

export default function CreditMixCalculator({ budget, budgetSource }: Props) {
  const reduced = usePrefersReducedMotion();
  const [seconds, setSeconds] = useState<Record<string, number>>(
    Object.fromEntries(ROWS.map((row) => [row.id, row.defaultSeconds ?? 5])),
  );
  const [counts, setCounts] = useState<Record<string, number>>({});

  const unitCredits = useMemo(() => {
    const map: Record<string, number> = {};
    for (const row of ROWS) {
      map[row.id] =
        row.kind === "image"
          ? creditsForImage()
          : creditsForVideo({ model: row.model as VideoCostModelKey, seconds: seconds[row.id] ?? 5 });
    }
    return map;
  }, [seconds]);

  // Sensible populated default split, recomputed when the budget changes.
  useEffect(() => {
    setCounts(
      Object.fromEntries(
        ROWS.map((row) => {
          const unit = unitCredits[row.id] || 1;
          return [row.id, Math.max(0, Math.floor((budget * row.defaultShare) / unit))];
        }),
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [budget]);

  const used = ROWS.reduce((total, row) => total + (counts[row.id] ?? 0) * (unitCredits[row.id] ?? 0), 0);
  const remaining = budget - used;
  const overBudget = remaining < 0;
  const animatedRemaining = useAnimatedNumber(remaining, reduced);

  const setCount = (rowId: string, next: number) => {
    setCounts((prev) => ({ ...prev, [rowId]: Math.max(0, Math.round(next)) }));
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex items-center gap-2">
        <Wand2 className="h-4 w-4 text-cyan-200" />
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
          What can {budget.toLocaleString()} credits make?
        </p>
      </div>
      <p className="mt-2 text-xs text-slate-400">
        approx — based on {budgetSource === "pack" ? "the selected pack" : "your current balance"} and real per-model
        rates.
      </p>

      <div className="mt-5 space-y-5">
        {ROWS.map((row) => {
          const unit = unitCredits[row.id] ?? 0;
          const count = counts[row.id] ?? 0;
          const rowCredits = count * unit;
          const maxForRow = unit > 0 ? Math.max(1, Math.floor(budget / unit)) : 1;

          return (
            <div key={row.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">{row.label}</p>
                  <p className="text-xs text-slate-400">
                    approx {unit.toLocaleString()} credits each
                    {row.kind === "video" ? ` · ${seconds[row.id]}s` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label={`Decrease ${row.label}`}
                    onClick={() => setCount(row.id, count - 1)}
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className="min-w-[3.5rem] text-center font-display text-lg font-bold text-white">
                    {count.toLocaleString()}
                  </span>
                  <button
                    type="button"
                    aria-label={`Increase ${row.label}`}
                    onClick={() => setCount(row.id, count + 1)}
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <Slider
                className="mt-4"
                value={[Math.min(count, maxForRow)]}
                min={0}
                max={maxForRow}
                step={1}
                onValueChange={([next]) => setCount(row.id, next)}
                aria-label={`${row.label} count`}
              />

              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
                <span>approx {rowCredits.toLocaleString()} credits</span>
                {row.kind === "video" ? (
                  <label className="flex items-center gap-2">
                    Length
                    <select
                      value={seconds[row.id]}
                      onChange={(event) =>
                        setSeconds((prev) => ({ ...prev, [row.id]: Number(event.target.value) }))
                      }
                      className="rounded-lg border border-white/10 bg-slate-950/60 px-2 py-1 text-xs text-slate-100"
                    >
                      {(VIDEO_COST_RATES[row.model as VideoCostModelKey].durations ?? [5, 10]).map((option) => (
                        <option key={option} value={option}>
                          {option}s
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      <div
        className={`mt-5 rounded-2xl border p-4 ${
          overBudget ? "border-amber-300/30 bg-amber-300/[0.08]" : "border-cyan-300/20 bg-cyan-300/[0.06]"
        }`}
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-cyan-100/80">Remaining</p>
            <p className="mt-1 font-display text-3xl font-black tracking-[-0.04em] text-white">
              {animatedRemaining.toLocaleString()}
              <span className="ml-2 text-sm font-medium text-slate-300">credits</span>
            </p>
          </div>
          <p className="text-xs text-slate-400">
            approx {used.toLocaleString()} of {budget.toLocaleString()} credits allocated
          </p>
        </div>
        {overBudget ? (
          <p className="mt-2 text-xs text-amber-50/90">
            Over budget by approx {Math.abs(remaining).toLocaleString()} credits — reduce a row or top up.
          </p>
        ) : null}
      </div>
    </div>
  );
}
