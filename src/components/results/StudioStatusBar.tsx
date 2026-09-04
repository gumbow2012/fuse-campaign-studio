/**
 * Compact campaign status: a single line, not a panel of dots.
 * "18 / 19 READY" · thin progress bar with % · what still needs another pass,
 * plus the free retry when the server says outputs are missing.
 */
import { Loader2, RefreshCw } from "lucide-react";
import StudioButton from "@/components/results/StudioButton";
import { cn } from "@/lib/utils";

export interface StudioStatusBarProps {
  ready: number;
  total: number;
  percent: number;
  complete: boolean;
  missing: number;
  retrying?: boolean;
  onRetry?: () => void;
  className?: string;
}

export function StudioStatusBar({
  ready,
  total,
  percent,
  complete,
  missing,
  retrying = false,
  onRetry,
  className,
}: StudioStatusBarProps) {
  const value = Math.max(0, Math.min(100, Math.round(complete ? 100 : percent)));

  return (
    <div
      className={cn(
        "rounded-2xl border border-white/10 bg-slate-950/60 px-5 py-4 sm:px-6",
        className,
      )}
      aria-label="Campaign status"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <p className="font-display text-sm font-bold uppercase tracking-[0.16em] text-white tabular-nums">
          {total > 0 ? `${ready} / ${total} ready` : `${ready} ready`}
        </p>

        <div className="order-3 h-1.5 w-full min-w-[140px] flex-1 overflow-hidden rounded-full bg-white/10 sm:order-none sm:w-auto">
          <div
            className="h-full rounded-full bg-cyan-300 shadow-[0_0_16px_rgba(103,232,249,0.55)] transition-[width] duration-500 motion-reduce:transition-none"
            style={{ width: `${value}%` }}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span className="font-display text-[12px] font-semibold uppercase tracking-[0.16em] text-cyan-100 tabular-nums">
            {complete ? "Complete" : `${value}%`}
          </span>
          {missing > 0 ? (
            <span className="text-[13px] text-slate-400">
              {missing} output{missing === 1 ? "" : "s"} need{missing === 1 ? "s" : ""} another pass
            </span>
          ) : null}
          {missing > 0 && onRetry ? (
            <StudioButton tone="danger" size="md" disabled={retrying} onClick={onRetry}>
              {retrying ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <RefreshCw className="h-4 w-4" aria-hidden />
              )}
              Retry failed output
            </StudioButton>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default StudioStatusBar;
