/**
 * R8 — PHOTOSHOOT. A gallery, not a grid: one large true-ratio active photo
 * with arrows, swipe, keyboard navigation, a thumbnail rail, fullscreen and
 * per-photo download. Photos appear live as they complete; a slot that hasn't
 * landed is a calm "needs another pass" placeholder.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Expand, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import TrueRatioMedia from "@/components/results/TrueRatioMedia";
import type { CampaignResultSlot } from "@/components/results/resultSlots";
import { cn } from "@/lib/utils";

export interface PhotoshootSectionProps {
  slots: CampaignResultSlot[];
  downloading: boolean;
  executionComplete: boolean;
  onDownloadItem: (slot: CampaignResultSlot) => void;
  onDownloadAll: () => void;
  className?: string;
}

const slotLabel = (slot: CampaignResultSlot) => `Photo ${String(slot.number).padStart(2, "0")}`;

export function PhotoshootSection({
  slots,
  downloading,
  executionComplete,
  onDownloadItem,
  onDownloadAll,
  className,
}: PhotoshootSectionProps) {
  const ready = useMemo(() => slots.filter((slot) => slot.item), [slots]);
  const [index, setIndex] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const touchStart = useRef<number | null>(null);

  useEffect(() => {
    if (index > ready.length - 1) setIndex(Math.max(0, ready.length - 1));
  }, [index, ready.length]);

  const go = (delta: number) => {
    if (!ready.length) return;
    setIndex((current) => (current + delta + ready.length) % ready.length);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") go(1);
      else if (event.key === "ArrowLeft") go(-1);
      else if (event.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!ready.length) return null;

  const active = ready[Math.min(index, ready.length - 1)];

  return (
    <section className={cn("space-y-4", className)} aria-label="Photoshoot">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="font-display text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-300">
          Photoshoot
          <span className="text-slate-500">
            {" "}
            — {ready.length} photo{ready.length === 1 ? "" : "s"}
            {slots.length > ready.length ? ` of ${slots.length}` : ""}
          </span>
        </p>
        <Button
          type="button"
          variant="outline"
          disabled={downloading}
          onClick={onDownloadAll}
          className="rounded-full border-white/20 text-[11px] uppercase tracking-[0.16em]"
        >
          {downloading ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <Download className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          )}
          {executionComplete && ready.length === slots.length
            ? "Download all photos"
            : `Download ${ready.length} ready photo${ready.length === 1 ? "" : "s"}`}
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_112px]">
        <div
          className="relative"
          onTouchStart={(event) => {
            touchStart.current = event.touches[0]?.clientX ?? null;
          }}
          onTouchEnd={(event) => {
            const start = touchStart.current;
            touchStart.current = null;
            const end = event.changedTouches[0]?.clientX;
            if (start == null || end == null) return;
            if (Math.abs(end - start) < 40) return;
            go(end < start ? 1 : -1);
          }}
        >
          {active.item ? (
            <TrueRatioMedia
              url={active.item.url}
              type="image"
              alt={`${slotLabel(active)} from your campaign`}
              maxHeight="min(66vh, 720px)"
            />
          ) : null}

          {ready.length > 1 ? (
            <>
              <button
                type="button"
                onClick={() => go(-1)}
                aria-label="Previous photo"
                className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full border border-white/15 bg-slate-950/70 p-2 text-slate-200 backdrop-blur transition-colors hover:text-white"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => go(1)}
                aria-label="Next photo"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full border border-white/15 bg-slate-950/70 p-2 text-slate-200 backdrop-blur transition-colors hover:text-white"
              >
                <ChevronRight className="h-4 w-4" aria-hidden />
              </button>
            </>
          ) : null}

          <div className="mt-2 flex items-center justify-between gap-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-400">
              {slotLabel(active)} · {index + 1} / {ready.length}
            </p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setFullscreen(true)}
                className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-slate-300 transition-colors hover:text-white"
              >
                <Expand className="h-3.5 w-3.5" aria-hidden /> Fullscreen
              </button>
              <button
                type="button"
                onClick={() => onDownloadItem(active)}
                className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-slate-300 transition-colors hover:text-white"
              >
                <Download className="h-3.5 w-3.5" aria-hidden /> Download photo
              </button>
            </div>
          </div>
        </div>

        {/* Thumbnail rail — right on desktop, horizontal strip on mobile. */}
        <ul className="flex gap-2 overflow-x-auto pb-1 lg:max-h-[66vh] lg:flex-col lg:overflow-y-auto lg:pb-0">
          {slots.map((slot) => {
            if (!slot.item) {
              return (
                <li key={`pending-${slot.number}`} className="shrink-0">
                  <div className="flex h-[72px] w-[72px] items-center justify-center rounded-lg border border-dashed border-white/15 bg-white/[0.02] px-1 text-center lg:h-[92px] lg:w-full">
                    <span className="font-mono text-[7px] uppercase leading-tight tracking-[0.12em] text-slate-500">
                      Needs another pass
                    </span>
                  </div>
                </li>
              );
            }
            const position = ready.findIndex((candidate) => candidate.number === slot.number);
            const isActive = position === index;
            return (
              <li key={slot.item.id} className="shrink-0 lg:shrink">
                <button
                  type="button"
                  onClick={() => setIndex(position)}
                  aria-current={isActive}
                  aria-label={`${slotLabel(slot)} — ready`}
                  className={cn(
                    "block h-[72px] w-[72px] overflow-hidden rounded-lg border bg-black transition-colors lg:h-[92px] lg:w-full",
                    isActive
                      ? "border-[hsl(186_100%_62%)] shadow-[0_0_0_1px_hsl(186_100%_62%/0.5)]"
                      : "border-white/12 hover:border-white/30",
                  )}
                >
                  <img src={slot.item.url} alt="" loading="lazy" className="h-full w-full object-contain" />
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {fullscreen && active.item ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/95 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`${slotLabel(active)} fullscreen`}
          onClick={() => setFullscreen(false)}
        >
          <button
            type="button"
            onClick={() => setFullscreen(false)}
            aria-label="Close fullscreen"
            className="absolute right-4 top-4 rounded-full border border-white/15 bg-white/[0.06] p-2 text-slate-200"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
          <img
            src={active.item.url}
            alt={`${slotLabel(active)} from your campaign`}
            className="max-h-[92vh] max-w-[96vw] object-contain"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      ) : null}
    </section>
  );
}

export default PhotoshootSection;
