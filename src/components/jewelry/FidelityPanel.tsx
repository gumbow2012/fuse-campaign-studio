import { Loader2, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FidelityAudit, FidelityVerdict } from "@/lib/fidelityAudit";

/**
 * PRODUCT FIDELITY panel (§35) — read-only. It reports how a generated frame
 * compares to the active Master Product Lock and NEVER regenerates anything.
 */

const VERDICT_STYLES: Record<FidelityVerdict, string> = {
  PASS: "text-emerald-200/90",
  WARNING: "text-amber-200/90",
  FAIL: "text-red-300",
};

export default function FidelityPanel({
  audit,
  state,
  error,
  onCheck,
  disabled,
}: {
  audit: FidelityAudit | null;
  state: "idle" | "checking" | "done" | "failed" | "skipped";
  error?: string | null;
  onCheck: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-white/55">
          <ShieldCheck size={11} /> Product fidelity
        </span>
        <button
          type="button"
          onClick={onCheck}
          disabled={disabled || state === "checking"}
          className="flex items-center gap-1 rounded-md border border-white/12 px-2 py-1 text-[10px] text-foreground/80 transition-colors hover:border-cyan-200/50 hover:text-cyan-100 disabled:opacity-40"
        >
          {state === "checking" ? <Loader2 size={10} className="animate-spin" /> : null}
          {audit ? "Re-check" : "Check against reference"}
        </button>
      </div>

      {state === "failed" ? (
        <p className="mt-1.5 text-[10px] text-amber-200/90">
          {error || "Fidelity check unavailable right now."}
        </p>
      ) : state === "skipped" ? (
        <p className="mt-1.5 text-[10px] text-muted-foreground">
          No locked product details to compare against yet.
        </p>
      ) : null}

      {audit ? (
        <div className="mt-1.5 space-y-1">
          {audit.rows.map((row) => (
            <div key={row.dimension} className="flex items-baseline justify-between gap-2">
              <span className="text-[10px] text-muted-foreground">{row.dimension}</span>
              <span className="flex min-w-0 items-baseline gap-1.5">
                {row.note ? (
                  <span className="truncate text-[9px] text-white/45" title={row.note}>
                    {row.note}
                  </span>
                ) : null}
                <span
                  className={cn(
                    "text-[10px] font-semibold tracking-[0.12em]",
                    VERDICT_STYLES[row.verdict],
                  )}
                >
                  {row.verdict}
                </span>
              </span>
            </div>
          ))}
          {audit.summary ? (
            <p className="pt-1 text-[9px] leading-relaxed text-white/45">{audit.summary}</p>
          ) : null}
          <p className="text-[9px] text-white/30">
            Analysis only — nothing was regenerated.
          </p>
        </div>
      ) : null}
    </div>
  );
}
