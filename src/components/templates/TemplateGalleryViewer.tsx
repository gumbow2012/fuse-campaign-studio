/**
 * TEMPLATE PRODUCT PAGE — image & video gallery.
 *
 * Large selected preview + thumbnail grid of every gallery item. Videos are
 * marked with a play icon and their real duration (read from the loaded video
 * element's metadata — never invented). Mobile swipe steps the selection, and
 * the preview opens the fullscreen lightbox. Broken media and raw filenames are
 * never shown: a designed placeholder plus the item's label is used instead.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { ImageOff, Maximize2, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import TemplateMediaLightbox from "./TemplateMediaLightbox";
import type { TemplateGalleryItem } from "@/services/templateDetailPage";

/* ── duration probing ── */

export function formatDuration(seconds: number | null | undefined) {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) return null;
  const total = Math.round(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

/** Reads real durations from video metadata for the given items. */
export function useVideoDurations(items: TemplateGalleryItem[]) {
  const [durations, setDurations] = useState<Record<string, number>>({});
  const signature = items
    .filter((item) => item.media_type === "video")
    .map((item) => `${item.id}:${item.url}`)
    .join("|");

  useEffect(() => {
    if (!signature) return;
    let cancelled = false;
    const nodes: HTMLVideoElement[] = [];

    for (const entry of signature.split("|")) {
      const separator = entry.indexOf(":");
      const id = entry.slice(0, separator);
      const url = entry.slice(separator + 1);
      if (!id || !url) continue;
      const node = document.createElement("video");
      node.preload = "metadata";
      node.muted = true;
      node.src = url;
      node.addEventListener("loadedmetadata", () => {
        if (cancelled) return;
        const value = node.duration;
        if (Number.isFinite(value) && value > 0) {
          setDurations((current) => (current[id] ? current : { ...current, [id]: value }));
        }
      });
      nodes.push(node);
    }

    return () => {
      cancelled = true;
      for (const node of nodes) {
        node.removeAttribute("src");
        node.load();
      }
    };
  }, [signature]);

  return durations;
}

/* ── frames ── */

function Placeholder({ label, compact }: { label?: string | null; compact?: boolean }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-[linear-gradient(180deg,hsl(var(--navy-mid)/0.85),hsl(var(--navy-deep)))] px-2 text-center text-slate-500">
      <ImageOff className={compact ? "h-4 w-4" : "h-6 w-6"} aria-hidden />
      <p
        className={cn(
          "font-mono uppercase tracking-[0.2em]",
          compact ? "text-[7px] leading-tight" : "text-[9px]",
        )}
      >
        {label || "Preview unavailable"}
      </p>
    </div>
  );
}

export function MediaFrame({
  src,
  alt,
  label,
  compact,
  contain,
}: {
  src: string | null;
  alt: string;
  label?: string | null;
  compact?: boolean;
  contain?: boolean;
}) {
  const [state, setState] = useState<"loading" | "ready" | "error">(src ? "loading" : "error");
  useEffect(() => setState(src ? "loading" : "error"), [src]);

  if (!src || state === "error") return <Placeholder label={label} compact={compact} />;

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
        className={cn(
          "h-full w-full",
          contain ? "object-contain" : "object-cover",
          state === "loading" && "opacity-0",
        )}
      />
    </>
  );
}

/** Thumbnail tile used by the gallery strip and every example-output section. */
export function TemplateMediaThumb({
  item,
  index,
  active,
  duration,
  onClick,
  className,
}: {
  item: TemplateGalleryItem;
  index: number;
  active?: boolean;
  duration?: number | null;
  onClick: () => void;
  className?: string;
}) {
  const durationLabel = item.media_type === "video" ? formatDuration(duration) : null;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? true : undefined}
      aria-label={item.label ?? `Example ${index + 1}`}
      className={cn(
        "group relative aspect-[9/16] overflow-hidden rounded-[12px] border bg-black transition",
        active
          ? "border-[hsl(var(--electric-cyan)/0.75)] ring-1 ring-[hsl(var(--electric-cyan)/0.35)]"
          : "border-white/10 hover:border-[hsl(var(--electric-blue)/0.5)]",
        className,
      )}
    >
      <MediaFrame
        src={item.media_type === "video" ? item.poster_url ?? null : item.url}
        alt={item.label ?? `Example ${index + 1}`}
        label={item.label}
        compact
      />
      {item.media_type === "video" ? (
        <>
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black/60 ring-1 ring-white/20">
              <Play className="h-3.5 w-3.5 translate-x-[1px] fill-white text-white" />
            </span>
          </span>
          {durationLabel ? (
            <span className="pointer-events-none absolute bottom-1 right-1 rounded bg-black/75 px-1.5 py-0.5 font-mono text-[8px] tracking-[0.1em] text-slate-100">
              {durationLabel}
            </span>
          ) : null}
        </>
      ) : null}
    </button>
  );
}

/* ── viewer ── */

export default function TemplateGalleryViewer({
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
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const durations = useVideoDurations(items);

  useEffect(() => {
    setActiveIndex(0);
    setPlaying(false);
  }, [items]);

  const active = items[activeIndex] ?? null;
  const total = items.length;

  const step = (delta: number) => {
    if (total < 2) return;
    setActiveIndex((current) => (current + delta + total) % total);
    setPlaying(false);
  };

  const activeDurationLabel = useMemo(
    () => (active?.media_type === "video" ? formatDuration(durations[active.id]) : null),
    [active, durations],
  );

  if (loading) {
    return (
      <div className={cn("grid gap-4 lg:grid-cols-[minmax(0,0.62fr)_minmax(0,1fr)]", className)}>
        <div className="aspect-[9/16] w-full animate-pulse rounded-[18px] bg-white/[0.06]" />
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {[0, 1, 2, 3, 4, 5].map((key) => (
            <div key={key} className="aspect-[9/16] animate-pulse rounded-[12px] bg-white/[0.05]" />
          ))}
        </div>
      </div>
    );
  }

  if (!active) {
    return (
      <div className={className}>
        <div className="relative aspect-[9/16] w-full max-w-sm overflow-hidden rounded-[18px] border border-white/10">
          <Placeholder />
        </div>
      </div>
    );
  }

  return (
    <div className={cn("grid gap-4 lg:grid-cols-[minmax(0,0.62fr)_minmax(0,1fr)]", className)}>
      <div
        className="relative aspect-[9/16] w-full overflow-hidden rounded-[18px] border border-[hsl(var(--electric-blue)/0.28)] bg-black shadow-[0_40px_100px_-60px_hsl(var(--electric-blue)/0.65)]"
        onTouchStart={(event) => {
          const touch = event.touches[0];
          touchStart.current = { x: touch.clientX, y: touch.clientY };
        }}
        onTouchEnd={(event) => {
          const start = touchStart.current;
          touchStart.current = null;
          if (!start) return;
          const touch = event.changedTouches[0];
          const dx = touch.clientX - start.x;
          const dy = touch.clientY - start.y;
          if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy)) return;
          step(dx < 0 ? 1 : -1);
        }}
      >
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
            <MediaFrame
              src={active.media_type === "video" ? active.poster_url ?? null : active.url}
              alt={active.label ?? "Template example"}
              label={active.label}
            />
            {active.media_type === "video" ? (
              <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/65 ring-1 ring-[hsl(var(--electric-cyan)/0.45)] transition group-hover:bg-black/80">
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
          className="absolute right-2 top-2 rounded-full border border-white/15 bg-black/60 p-2 text-white/80 backdrop-blur transition hover:border-cyan-300/60 hover:text-white"
        >
          <Maximize2 className="h-4 w-4" />
        </button>

        <div className="pointer-events-none absolute bottom-2 left-2 flex items-center gap-2">
          {active.label ? (
            <span className="rounded-full bg-black/70 px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.2em] text-slate-200">
              {active.label}
            </span>
          ) : null}
          {activeDurationLabel ? (
            <span className="rounded-full bg-black/70 px-2 py-1 font-mono text-[9px] tracking-[0.12em] text-slate-200">
              {activeDurationLabel}
            </span>
          ) : null}
        </div>
      </div>

      <div>
        <div
          className="grid gap-2"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(88px, 1fr))" }}
        >
          {items.map((item, index) => (
            <TemplateMediaThumb
              key={item.id}
              item={item}
              index={index}
              active={index === activeIndex}
              duration={durations[item.id] ?? null}
              onClick={() => {
                setActiveIndex(index);
                setPlaying(false);
              }}
            />
          ))}
        </div>
        <p className="mt-3 font-mono text-[9px] uppercase tracking-[0.2em] text-slate-500 lg:hidden">
          Swipe the preview to browse
        </p>
      </div>

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
