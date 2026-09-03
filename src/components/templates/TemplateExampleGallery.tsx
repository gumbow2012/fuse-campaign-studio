/**
 * Template Detail gallery — one main viewer plus a thumbnail carousel of every
 * example. Videos show their poster with a play badge and only mount/play when
 * selected. Clicking the main viewer opens the fullscreen lightbox.
 */

import { useEffect, useState } from "react";
import { ImageOff, Maximize2, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import TemplateMediaLightbox from "./TemplateMediaLightbox";
import type { TemplateGalleryItem } from "@/services/templateDetailPage";

function Placeholder({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.01))] text-slate-500">
      <ImageOff className={compact ? "h-4 w-4" : "h-6 w-6"} aria-hidden />
      {compact ? null : (
        <p className="font-mono text-[9px] uppercase tracking-[0.22em]">Preview unavailable</p>
      )}
    </div>
  );
}

function Frame({
  src,
  alt,
  compact,
}: {
  src: string | null;
  alt: string;
  compact?: boolean;
}) {
  const [state, setState] = useState<"loading" | "ready" | "error">(src ? "loading" : "error");

  useEffect(() => setState(src ? "loading" : "error"), [src]);

  if (!src || state === "error") return <Placeholder compact={compact} />;

  return (
    <>
      {state === "loading" ? (
        <div className="absolute inset-0 animate-pulse bg-white/[0.06]" />
      ) : null}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        onLoad={() => setState("ready")}
        onError={() => setState("error")}
        className={cn("h-full w-full object-cover", state === "loading" && "opacity-0")}
      />
    </>
  );
}

export default function TemplateExampleGallery({
  items,
  loading = false,
  className,
}: {
  items: TemplateGalleryItem[];
  loading?: boolean;
  className?: string;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  useEffect(() => {
    setActiveIndex(0);
    setPlaying(false);
  }, [items]);

  const active = items[activeIndex] ?? null;

  if (loading) {
    return (
      <div className={cn("space-y-3", className)}>
        <div className="relative aspect-[9/16] w-full animate-pulse overflow-hidden rounded-2xl bg-white/[0.06]" />
        <div className="flex gap-2">
          {[0, 1, 2, 3].map((key) => (
            <div key={key} className="h-16 w-11 animate-pulse rounded-md bg-white/[0.06]" />
          ))}
        </div>
      </div>
    );
  }

  if (!active) {
    return (
      <div className={cn("space-y-3", className)}>
        <div className="relative aspect-[9/16] w-full overflow-hidden rounded-2xl border border-white/10 bg-black">
          <Placeholder />
        </div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className="relative aspect-[9/16] w-full overflow-hidden rounded-2xl border border-white/10 bg-black shadow-[0_30px_80px_-40px_rgba(8,145,178,0.55)]">
        {active.media_type === "video" && playing ? (
          <video
            key={active.id}
            src={active.url}
            poster={active.poster_url ?? undefined}
            controls
            autoPlay
            playsInline
            preload="metadata"
            className="h-full w-full object-cover"
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              if (active.media_type === "video") setPlaying(true);
              else setLightboxIndex(activeIndex);
            }}
            aria-label={
              active.media_type === "video"
                ? `Play ${active.label ?? "example video"}`
                : `View ${active.label ?? "example"} fullscreen`
            }
            className="group relative h-full w-full"
          >
            <Frame
              src={active.media_type === "video" ? active.poster_url ?? active.url : active.url}
              alt={active.label ?? "Template example"}
            />
            {active.media_type === "video" ? (
              <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/65 ring-1 ring-cyan-200/40 transition group-hover:bg-black/80">
                  <Play className="h-6 w-6 translate-x-[1px] fill-white text-white" />
                </span>
              </span>
            ) : null}
          </button>
        )}

        <button
          type="button"
          onClick={() => setLightboxIndex(activeIndex)}
          aria-label="Open fullscreen"
          className="absolute right-2 top-2 rounded-full border border-white/15 bg-black/60 p-2 text-white/80 backdrop-blur transition hover:border-cyan-300/50 hover:text-white"
        >
          <Maximize2 className="h-4 w-4" />
        </button>

        {active.label ? (
          <span className="pointer-events-none absolute bottom-2 left-2 rounded-full bg-black/70 px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.2em] text-slate-200">
            {active.label}
          </span>
        ) : null}
      </div>

      {items.length > 1 ? (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {items.map((item, index) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setActiveIndex(index);
                setPlaying(item.media_type === "video");
              }}
              aria-current={index === activeIndex}
              aria-label={item.label ?? `Example ${index + 1}`}
              className={cn(
                "relative h-16 w-11 shrink-0 overflow-hidden rounded-md border bg-black/50 transition",
                index === activeIndex
                  ? "border-cyan-300/70 ring-1 ring-cyan-300/40"
                  : "border-white/10 hover:border-white/30",
              )}
            >
              <Frame
                src={item.media_type === "video" ? item.poster_url ?? null : item.url}
                alt={item.label ?? `Example ${index + 1}`}
                compact
              />
              {item.media_type === "video" ? (
                <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <Play className="h-3 w-3 fill-white text-white drop-shadow" />
                </span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}

      {lightboxIndex !== null ? (
        <TemplateMediaLightbox
          items={items}
          index={lightboxIndex}
          onIndexChange={(next) => {
            setLightboxIndex(next);
            setActiveIndex(next);
          }}
          onClose={() => setLightboxIndex(null)}
        />
      ) : null}
    </div>
  );
}
