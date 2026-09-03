/**
 * Fullscreen media lightbox for the Template Detail page.
 * Keyboard: ESC closes, ←/→ steps. Videos use controls and never autoplay
 * more than the active item.
 */

import { useCallback, useEffect } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TemplateGalleryItem } from "@/services/templateDetailPage";

export default function TemplateMediaLightbox({
  items,
  index,
  onIndexChange,
  onClose,
}: {
  items: TemplateGalleryItem[];
  index: number;
  onIndexChange: (next: number) => void;
  onClose: () => void;
}) {
  const total = items.length;
  const active = items[index] ?? null;

  const step = useCallback(
    (delta: number) => {
      if (!total) return;
      onIndexChange((index + delta + total) % total);
    },
    [index, onIndexChange, total],
  );

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight") step(1);
      if (event.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", handler);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handler);
      document.body.style.overflow = previous;
    };
  }, [onClose, step]);

  if (!active) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={active.label ?? "Template example"}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/95 backdrop-blur-xl"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-4 top-4 z-10 rounded-full border border-white/15 bg-black/60 p-2 text-white/80 transition hover:text-white"
      >
        <X className="h-5 w-5" />
      </button>

      {total > 1 ? (
        <>
          <button
            type="button"
            aria-label="Previous example"
            onClick={(event) => {
              event.stopPropagation();
              step(-1);
            }}
            className="absolute left-3 z-10 rounded-full border border-white/15 bg-black/60 p-2.5 text-white/80 transition hover:border-cyan-300/50 hover:text-white sm:left-6"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            aria-label="Next example"
            onClick={(event) => {
              event.stopPropagation();
              step(1);
            }}
            className="absolute right-3 z-10 rounded-full border border-white/15 bg-black/60 p-2.5 text-white/80 transition hover:border-cyan-300/50 hover:text-white sm:right-6"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </>
      ) : null}

      <div
        className="relative flex max-h-[88vh] w-full max-w-4xl flex-col items-center gap-3 px-4"
        onClick={(event) => event.stopPropagation()}
      >
        {active.media_type === "video" ? (
          <video
            key={active.id}
            src={active.url}
            poster={active.poster_url ?? undefined}
            controls
            autoPlay
            playsInline
            className="max-h-[80vh] w-auto rounded-xl border border-white/10 bg-black"
          />
        ) : (
          <img
            key={active.id}
            src={active.url}
            alt={active.label ?? "Template example"}
            className="max-h-[80vh] w-auto rounded-xl border border-white/10 bg-black object-contain"
          />
        )}
        <p
          className={cn(
            "font-mono text-[10px] uppercase tracking-[0.24em] text-slate-400",
            !active.label && "text-slate-500",
          )}
        >
          {active.label ?? "Example"}
          {total > 1 ? ` · ${index + 1}/${total}` : ""}
        </p>
      </div>
    </div>
  );
}
