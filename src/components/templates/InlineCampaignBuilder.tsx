/**
 * MOBILE / TABLET (<lg) INLINE CAMPAIGN BUILDER — presentation shell only.
 *
 * Renders the compact builder directly beneath the selected campaign card's
 * visual row. It owns NO state: every input row, readiness number, cost and the
 * generate action are passed down from TemplateStudioPage, which remains the
 * single source of truth (files, text, cast, selection, readiness).
 */

import { forwardRef, useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";




interface InlineCampaignBuilderProps {
  templateName: string;
  /** "N inputs · X images · Y video clips · NNN CR" */
  metaLine: string;
  readyCount: number;
  totalCount: number;
  creditsLabel: string;
  /** Cast selector when the template has no dedicated face slot. */
  topSlot?: ReactNode;
  /** Compact input rows, rendered by the parent (same handlers as desktop). */
  children: ReactNode;
  /** Extra notices under the generate bar (credits / signed-out copy). */
  footer?: ReactNode;
  generateDisabled: boolean;
  generateLabel: string;
  onGenerate: () => void;
  onClose: () => void;
}

const InlineCampaignBuilder = forwardRef<HTMLDivElement, InlineCampaignBuilderProps>(
  function InlineCampaignBuilder(
    {
      templateName,
      metaLine,
      readyCount,
      totalCount,
      creditsLabel,
      topSlot,
      children,
      footer,
      generateDisabled,
      generateLabel,
      onGenerate,
      onClose,
    },
    ref,
  ) {
    /* Expand animation: opacity + translate only (no height 0→auto jank). */
    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const [entered, setEntered] = useState(reduceMotion);

    useEffect(() => {
      if (reduceMotion) return;
      const frame = window.requestAnimationFrame(() => setEntered(true));
      return () => window.cancelAnimationFrame(frame);
    }, [reduceMotion]);

    return (
      <div
        ref={ref}
        className={cn(
          "col-span-full scroll-mt-20 overflow-hidden rounded-[1.25rem] border border-cyan-300/25 bg-slate-950/85 shadow-[0_18px_60px_rgba(0,0,0,0.4)]",
          reduceMotion
            ? undefined
            : "transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none",
          entered ? "translate-y-0 opacity-100" : "-translate-y-1 opacity-0",
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-white/8 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate font-display text-base font-bold tracking-[-0.02em] text-white">
              {templateName}
            </p>
            <p className="mt-1 text-[10px] uppercase leading-4 tracking-[0.12em] text-slate-400">
              {metaLine}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close campaign builder"
            className="shrink-0 rounded-full border border-white/12 px-2.5 py-1 text-[11px] text-slate-300 transition hover:text-white"
          >
            ✕
          </button>
        </div>

        {/* The sticky bar below is a flow sibling, so only breathing room is
            needed here — the last input is never hidden behind it. */}
        <div className="px-4 pb-4 pt-4">
          <p className="font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-white">
            Add your campaign assets
          </p>
          {topSlot ? <div className="mt-3">{topSlot}</div> : null}
          <div className="mt-3 space-y-2">{children}</div>
        </div>

        {/* Sticky generate bar — scoped to this open builder only. */}
        <div className="sticky bottom-0 z-20 border-t border-white/10 bg-slate-950/95 px-3 py-3 backdrop-blur-xl">
          {/* Stacks on narrow phones so neither the readiness count nor the
              action label is ever clipped. */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 shrink-0">
              <p
                className={cn(
                  "whitespace-nowrap font-display text-[10px] font-semibold uppercase tracking-[0.12em]",
                  readyCount >= totalCount ? "text-emerald-200" : "text-slate-400",
                )}
              >
                {readyCount}/{totalCount} ready
              </p>
              <p className="mt-0.5 truncate text-[10px] uppercase tracking-[0.1em] text-slate-400">
                {creditsLabel}
              </p>
            </div>
            <button
              type="button"
              onClick={onGenerate}
              disabled={generateDisabled}
              className={cn(
                "w-full whitespace-nowrap rounded-full px-3.5 py-2.5 sm:w-auto font-display text-[10px] font-semibold uppercase tracking-[0.12em] transition",

                generateDisabled
                  ? "border border-white/10 bg-white/[0.05] text-slate-500"
                  : "bg-cyan-300 text-slate-950 hover:bg-cyan-200",
              )}
            >
              {generateLabel}
            </button>
          </div>
          {footer ? <div className="mt-2">{footer}</div> : null}
        </div>
      </div>
    );
  },
);

export default InlineCampaignBuilder;
