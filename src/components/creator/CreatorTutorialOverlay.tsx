/**
 * Creator builder tutorial overlay (presentation only).
 *
 * Spotlights the REAL builder controls via `data-tutorial` anchors — the real
 * controls stay clickable so "Try it" lessons advance when the creator actually
 * performs the action. Respects prefers-reduced-motion.
 */
import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  CREATOR_TUTORIAL_LESSONS,
  type CreatorTutorialLesson,
} from "@/lib/creatorTutorial";

type Rect = { top: number; left: number; width: number; height: number };

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(mql.matches);
    apply();
    mql.addEventListener("change", apply);
    return () => mql.removeEventListener("change", apply);
  }, []);
  return reduced;
}

function findAnchor(lesson: CreatorTutorialLesson): HTMLElement | null {
  const keys = [lesson.anchor, ...(lesson.fallbackAnchors ?? [])];
  for (const key of keys) {
    const element = document.querySelector<HTMLElement>(`[data-tutorial="${key}"]`);
    if (element) return element;
  }
  return null;
}

export default function CreatorTutorialOverlay({
  lesson,
  index,
  total,
  completedIds,
  milestoneId,
  onNext,
  onBack,
  onSkip,
}: {
  lesson: CreatorTutorialLesson;
  index: number;
  total: number;
  completedIds: string[];
  milestoneId: string | null;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}) {
  const reducedMotion = usePrefersReducedMotion();
  const [rect, setRect] = useState<Rect | null>(null);
  const [trackerOpen, setTrackerOpen] = useState(false);

  const measure = useCallback(() => {
    const element = findAnchor(lesson);
    if (!element) {
      setRect(null);
      return;
    }
    const box = element.getBoundingClientRect();
    setRect({ top: box.top, left: box.left, width: box.width, height: box.height });
  }, [lesson]);

  useEffect(() => {
    measure();
    const interval = window.setInterval(measure, 400);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [measure]);

  const glow = milestoneId === lesson.id && !reducedMotion;

  // Card placement: under the spotlight when there's room, otherwise above it.
  const cardStyle: React.CSSProperties = (() => {
    if (!rect) return { bottom: 24, left: 24 };
    const below = rect.top + rect.height + 14;
    const fitsBelow = below + 300 < window.innerHeight;
    const left = Math.min(Math.max(12, rect.left), Math.max(12, window.innerWidth - 392));
    return fitsBelow
      ? { top: below, left }
      : { top: Math.max(12, rect.top - 316), left };
  })();

  return (
    <>
      {/* Spotlight ring — pointer-events off so the real control stays usable. */}
      {rect ? (
        <div
          aria-hidden
          className={`pointer-events-none fixed z-[60] rounded-2xl border-2 border-primary/80 ${
            glow ? "animate-pulse" : ""
          }`}
          style={{
            top: rect.top - 6,
            left: rect.left - 6,
            width: rect.width + 12,
            height: rect.height + 12,
            boxShadow: "0 0 0 9999px rgba(3,7,18,0.62), 0 0 28px 4px hsl(var(--primary) / 0.55)",
            transition: reducedMotion ? "none" : "all 180ms ease-out",
          }}
        />
      ) : (
        <div aria-hidden className="pointer-events-none fixed inset-0 z-[60] bg-background/70" />
      )}

      {/* Lesson card */}
      <section
        role="dialog"
        aria-label={`Tutorial step ${index + 1} of ${total}`}
        className="fixed z-[61] w-[min(380px,calc(100vw-24px))] rounded-3xl border border-primary/30 bg-card/95 p-4 shadow-2xl backdrop-blur"
        style={cardStyle}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">
              Your first template · {index + 1} / {total}
            </p>
            <h2 className="mt-1 font-display text-base font-black uppercase tracking-tight">
              {lesson.title}
            </h2>
          </div>
          <Button type="button" variant="ghost" size="icon" aria-label="Skip walkthrough" onClick={onSkip}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <p className="mt-2 text-xs text-foreground/90">{lesson.what}</p>
        <p className="mt-1.5 text-xs text-muted-foreground">{lesson.why}</p>
        <p className="mt-1.5 text-xs font-medium text-foreground">{lesson.todo}</p>

        {lesson.extra?.length ? (
          <ul className="mt-2 space-y-1">
            {lesson.extra.map((item) => (
              <li key={item} className="text-[11px] leading-relaxed text-muted-foreground">
                · {item}
              </li>
            ))}
          </ul>
        ) : null}

        {lesson.tryIt ? (
          <p className="mt-3 rounded-xl border border-primary/30 bg-primary/[0.08] px-3 py-2 text-[11px] font-medium text-primary">
            Try it: {lesson.tryIt}
          </p>
        ) : null}

        <p className="mt-3 text-[11px] text-muted-foreground xl:hidden">
          The full visual builder works best on desktop — continue there when you're ready.
        </p>

        <div className="mt-4 flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="rounded-full"
            onClick={onBack}
            disabled={index === 0}
          >
            Back
          </Button>
          <Button type="button" size="sm" className="flex-1 rounded-full" onClick={onNext}>
            {index === total - 1 ? "Finish" : "Next"}
          </Button>
          <Button type="button" variant="ghost" size="sm" className="rounded-full" onClick={onSkip}>
            Skip
          </Button>
        </div>
      </section>

      {/* Compact collapsible progress tracker */}
      <div className="fixed bottom-3 right-3 z-[61] w-[min(280px,calc(100vw-24px))] rounded-2xl border border-border/60 bg-card/95 shadow-xl backdrop-blur">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
          onClick={() => setTrackerOpen((open) => !open)}
          aria-expanded={trackerOpen}
        >
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Your first template — {completedIds.length} / {total}
          </span>
          {trackerOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
        </button>
        {trackerOpen ? (
          <ul className="max-h-[40vh] overflow-y-auto border-t border-border/50 px-3 py-2">
            {CREATOR_TUTORIAL_LESSONS.map((item, itemIndex) => {
              const done = completedIds.includes(item.id);
              return (
                <li
                  key={item.id}
                  className={`flex items-center gap-2 py-1 text-[11px] ${
                    itemIndex === index ? "text-primary" : done ? "text-foreground/80" : "text-muted-foreground"
                  }`}
                >
                  <span className="w-3 text-center">{done ? "✓" : "·"}</span>
                  {item.step}
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </>
  );
}
