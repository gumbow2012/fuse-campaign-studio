/**
 * PHOTOSHOOT — a gallery, not a grid.
 *
 * One large true-ratio photo with a floating action bar (fullscreen, download,
 * copy link), a thumbnail rail beside it on desktop and under it on mobile, and
 * keyboard / swipe navigation. Photos appear as they complete; a slot that
 * hasn't landed stays a calm "needs another pass" card.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Expand, Link2, Loader2, X } from "lucide-react";
import StudioButton from "@/components/results/StudioButton";
import TrueRatioMedia from "@/components/results/TrueRatioMedia";
import { toast } from "@/hooks/use-toast";
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

  const go = useCallback(
    (delta: number) => {
      setIndex((current) => (ready.length ? (current + delta + ready.length) % ready.length : 0));
    },
    [ready.length],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") go(1);
      else if (event.key === "ArrowLeft") go(-1);
      else if (event.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  if (!ready.length) return null;

  const active = ready[Math.min(index, ready.length - 1)];
  const missing = slots.length - ready.length;

  const copyLink = async () => {
    if (!active.item) return;
    try {
      await navigator.clipboard.writeText(active.item.url);
      toast({ title: "Link copied", description: "This private link expires after a while." });
    } catch {
      toast({ title: "Couldn't copy the link", description: "Try downloading the photo instead." });
    }
  };

  return (
    <section
      className={cn("rounded-3xl border border-white/10 bg-slate-950/50 p-6 sm:p-8", className)}
      aria-label="Photoshoot"
    >
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
        <div>
          <h3 className="font-display text-lg font-bold uppercase tracking-[0.14em] text-white">
            Photoshoot
            <span className="ml-2 font-display text-sm font-semibold tracking-[0.14em] text-cyan-100 tabular-nums">
              {ready.length} photo{ready.length === 1 ? "" : "s"}
            </span>
          </h3>
          <p className="mt-1.5 text-[13px] leading-6 text-slate-400">
            {missing > 0
              ? `${ready.length} of ${slots.length} photos ready — the rest need another pass.`
              : "Full-resolution stills, exactly as generated."}
          </p>
        </div>
        <StudioButton tone="primary" size="xl" disabled={downloading} onClick={onDownloadAll}>
          {downloading ? (
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
          ) : (
            <Download className="h-5 w-5" aria-hidden />
          )}
          {executionComplete && !missing
            ? "Download all photos"
            : `Download ${ready.length} ready photo${ready.length === 1 ? "" : "s"}`}
        </StudioButton>
      </header>

      <div className="mt-7 grid gap-5 lg:grid-cols-[minmax(0,1fr)_132px]">
        <div
          className="relative"
          onTouchStart={(event) => {
            touchStart.current = event.touches[0]?.clientX ?? null;
          }}
          onTouchEnd={(event) => {
            const start = touchStart.current;
            touchStart.current = null;
            const end = event.changedTouches[0]?.clientX;
            if (start == null || end == null || Math.abs(end - start) < 40) return;
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

          {/* Floating action bar on the image. */}
          <div className="absolute bottom-3 right-3 flex items-center gap-2 rounded-2xl border border-white/12 bg-slate-950/80 p-1.5 backdrop-blur">
            <StudioButton tone="tertiary" size="icon-lg" aria-label="Fullscreen" onClick={() => setFullscreen(true)}>
              <Expand className="h-4 w-4" aria-hidden />
            </StudioButton>
            <StudioButton
              tone="tertiary"
              size="icon-lg"
              aria-label="Download photo"
              onClick={() => onDownloadItem(active)}
            >
              <Download className="h-4 w-4" aria-hidden />
            </StudioButton>
            <StudioButton tone="tertiary" size="icon-lg" aria-label="Copy link" onClick={() => void copyLink()}>
              <Link2 className="h-4 w-4" aria-hidden />
            </StudioButton>
          </div>

          {ready.length > 1 ? (
            <>
              <StudioButton
                tone="tertiary"
                size="icon-lg"
                aria-label="Previous photo"
                onClick={() => go(-1)}
                className="absolute left-3 top-1/2 -translate-y-1/2 bg-slate-950/75 backdrop-blur"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden />
              </StudioButton>
              <StudioButton
                tone="tertiary"
                size="icon-lg"
                aria-label="Next photo"
                onClick={() => go(1)}
                className="absolute right-3 top-1/2 -translate-y-1/2 bg-slate-950/75 backdrop-blur"
              >
                <ChevronRight className="h-4 w-4" aria-hidden />
              </StudioButton>
            </>
          ) : null}

          <p className="mt-3 font-display text-[12px] font-semibold uppercase tracking-[0.16em] text-slate-400 tabular-nums">
            {slotLabel(active)} · {index + 1} / {ready.length}
          </p>
        </div>

        {/* Thumbnails: right rail on desktop, horizontal strip on mobile. */}
        <ul className="flex gap-3 overflow-x-auto pb-2 lg:max-h-[min(66vh,720px)] lg:flex-col lg:overflow-y-auto lg:pb-0">
          {slots.map((slot) => {
            if (!slot.item) {
              return (
                <li key={`pending-${slot.number}`} className="shrink-0">
                  <div className="flex h-[116px] w-[116px] items-center justify-center rounded-xl border border-dashed border-white/15 bg-white/[0.02] px-2 text-center">
                    <span className="text-[11px] leading-tight text-slate-500">Needs another pass</span>
                  </div>
                </li>
              );
            }
            const position = ready.findIndex((candidate) => candidate.item?.id === slot.item?.id);
            const isActive = position === Math.min(index, ready.length - 1);
            return (
              <li key={slot.item.id} className="shrink-0">
                <button
                  type="button"
                  onClick={() => setIndex(position)}
                  aria-current={isActive}
                  aria-label={slotLabel(slot)}
                  className={cn(
                    "block h-[116px] w-[116px] overflow-hidden rounded-xl border bg-black transition-[border-color,box-shadow,transform] duration-200 hover:scale-[1.03] motion-reduce:transition-none",
                    isActive
                      ? "border-cyan-300 shadow-[0_0_0_2px_rgba(103,232,249,0.3)]"
                      : "border-white/12 hover:border-white/30",
                  )}
                >
                  <img src={slot.item.url} alt="" loading="lazy" className="h-full w-full object-cover" />
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {fullscreen && active.item ? (
        <div
          role="dialog"
          aria-modal
          aria-label={`${slotLabel(active)} fullscreen`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/95 p-4 animate-in fade-in duration-200"
          onClick={() => setFullscreen(false)}
        >
          <img
            src={active.item.url}
            alt={`${slotLabel(active)} from your campaign`}
            className="max-h-full max-w-full object-contain"
          />
          <StudioButton
            tone="tertiary"
            size="icon-lg"
            aria-label="Close fullscreen"
            onClick={() => setFullscreen(false)}
            className="absolute right-5 top-5"
          >
            <X className="h-4 w-4" aria-hidden />
          </StudioButton>
        </div>
      ) : null}
    </section>
  );
}

export default PhotoshootSection;
