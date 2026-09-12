/**
 * CAMPAIGN PRODUCT GALLERY — one unified viewer for a template product page.
 *
 * Video-first: the caller passes items already merchandised (hero first, then
 * the gallery order returned by the backend). One dominant viewer plus a
 * compact thumbnail strip; no internal taxonomy labels.
 *
 * The frame follows the ACTIVE item's own intrinsic aspect ratio (from video
 * metadata / natural image size), defaulting to 9:16 until it is known, so a
 * 4:3 clip never sits in a tall frame full of empty space. Height is capped
 * (56vh mobile, min(72vh,720px) desktop) via the `.campaign-frame` utility.
 *
 * Media that fails to load is dropped from the gallery entirely and the viewer
 * falls through to the next usable item, so a broken asset never renders as a
 * blank card.
 *
 * Loading treatment: media never pops in from black. A blurred ambient still of
 * the clip fills the frame, a sharp poster sits on top, and the video/image
 * cross-fades in the moment it can play. A shimmer covers the only moment
 * nothing at all is ready.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Expand, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import TemplateMediaLightbox from "./TemplateMediaLightbox";
import useClipPosters from "@/hooks/useClipPosters";
import type { TemplateGalleryItem } from "@/services/templateDetailPage";

function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-[18px] bg-muted/40", className)} />;
}

/** Soft frame base behind media — never pure black. */
const FRAME_BG = "bg-[linear-gradient(180deg,hsl(var(--muted)/0.75),hsl(var(--card)))]";
const DEFAULT_RATIO = 9 / 16;

export default function CampaignMediaGallery({
  items,
  name,
  loading = false,
  className,
}: {
  items: TemplateGalleryItem[];
  name: string;
  loading?: boolean;
  className?: string;
}) {
  const [broken, setBroken] = useState<Record<string, true>>({});
  /** Per item: the visible media has decoded a frame, so it can fade in over its poster. */
  const [mediaReady, setMediaReady] = useState<Record<string, true>>({});
  /** Intrinsic width/height ratio per item, learned from the media itself. */
  const [ratios, setRatios] = useState<Record<string, number>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const usable = useMemo(() => items.filter((item) => !broken[item.id]), [items, broken]);

  /* Video items rarely ship a poster_url — extract a first frame client-side. */
  const posterSources = useMemo(
    () =>
      usable
        .filter((item) => item.media_type === "video")
        .map((item) => ({ id: item.id, url: item.url, poster: item.poster_url })),
    [usable],
  );
  const posters = useClipPosters(posterSources);

  const activeIndex = Math.max(
    0,
    usable.findIndex((item) => item.id === activeId),
  );
  const active = usable[activeIndex] ?? null;

  useEffect(() => {
    if (!usable.length) return;
    if (!usable.some((item) => item.id === activeId)) setActiveId(usable[0].id);
  }, [usable, activeId]);

  const markBroken = useCallback((id: string) => {
    setBroken((current) => (current[id] ? current : { ...current, [id]: true }));
  }, []);

  const markReady = useCallback((id: string) => {
    setMediaReady((current) => (current[id] ? current : { ...current, [id]: true }));
  }, []);

  const markRatio = useCallback((id: string, width: number, height: number) => {
    if (!width || !height) return;
    const ratio = width / height;
    if (!Number.isFinite(ratio) || ratio <= 0) return;
    setRatios((current) =>
      Math.abs((current[id] ?? 0) - ratio) < 0.001 ? current : { ...current, [id]: ratio },
    );
  }, []);

  const step = (delta: number) => {
    if (usable.length < 2) return;
    const next = (activeIndex + delta + usable.length) % usable.length;
    setActiveId(usable[next].id);
  };

  if (loading) {
    return (
      <div className={cn("space-y-3", className)}>
        <Skeleton className="aspect-[9/16] w-full" />
        <div className="flex gap-2">
          {[0, 1, 2, 3, 4].map((key) => (
            <Skeleton key={key} className="h-[59px] w-11 rounded-[10px]" />
          ))}
        </div>
      </div>
    );
  }

  if (!active) {
    return (
      <div className={className}>
        <div
          className={cn(
            "campaign-frame flex items-center justify-center rounded-[18px] border border-border/70",
            FRAME_BG,
          )}
          style={{ ["--frame-ratio" as string]: String(DEFAULT_RATIO) }}
        >
          <p className="text-[13px] text-muted-foreground">Preview coming soon</p>
        </div>
      </div>
    );
  }

  const activePoster =
    active.media_type === "video" ? (active.poster_url ?? posters[active.id] ?? null) : null;
  const activeReady = !!mediaReady[active.id];
  const activeRatio = ratios[active.id] ?? DEFAULT_RATIO;

  return (
    <div className={cn("space-y-3", className)}>
      <div
        className={cn(
          "campaign-frame relative overflow-hidden rounded-[18px] border border-border/70 transition-[aspect-ratio,max-width] duration-300 ease-out motion-reduce:transition-none",
          FRAME_BG,
        )}
        style={{ ["--frame-ratio" as string]: String(activeRatio) }}
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
        {active.media_type === "video" ? (
          <>
            {/* 1. Ambient underlay — the clip's own still, blown up and blurred. */}
            {activePoster ? (
              <img
                src={activePoster}
                alt=""
                aria-hidden
                decoding="async"
                className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover opacity-70 blur-2xl"
              />
            ) : null}

            {/* 2. Shimmer only for the moment nothing is ready — not even a poster. */}
            {!activePoster && !activeReady ? (
              <div className="absolute inset-0 animate-pulse bg-muted/40 motion-reduce:animate-none" aria-hidden />
            ) : null}

            {/* 3. Sharp poster, visible until the video can play, then dissolves under it. */}
            {activePoster ? (
              <img
                src={activePoster}
                alt=""
                aria-hidden
                decoding="async"
                className={cn(
                  "pointer-events-none absolute inset-0 h-full w-full object-contain transition-opacity duration-500 ease-out motion-reduce:transition-none",
                  activeReady ? "opacity-0" : "opacity-100",
                )}
              />
            ) : null}

            {/* 4. The video breathes in over the poster the moment it can play. */}
            <video
              key={active.id}
              src={active.url}
              poster={activePoster ?? undefined}
              autoPlay
              muted
              loop
              controls
              playsInline
              crossOrigin="anonymous"
              preload="auto"
              aria-label={`${name} campaign preview`}
              onLoadedMetadata={(event) => {
                const el = event.currentTarget;
                markRatio(active.id, el.videoWidth, el.videoHeight);
              }}
              onLoadedData={() => markReady(active.id)}
              onCanPlay={() => markReady(active.id)}
              onError={() => markBroken(active.id)}
              className={cn(
                "relative h-full w-full object-contain transition-opacity duration-500 ease-out motion-reduce:transition-none",
                activeReady ? "opacity-100" : "opacity-0",
              )}
            />
          </>
        ) : (
          <button
            type="button"
            onClick={() => setLightbox(true)}
            aria-label={`View ${name} preview larger`}
            className="group relative h-full w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {!activeReady ? (
              <div className="absolute inset-0 animate-pulse bg-muted/40 motion-reduce:animate-none" aria-hidden />
            ) : null}
            <img
              key={active.id}
              src={active.url}
              alt={`${name} campaign preview`}
              decoding="async"
              onLoad={(event) => {
                const el = event.currentTarget;
                markRatio(active.id, el.naturalWidth, el.naturalHeight);
                markReady(active.id);
              }}
              onError={() => markBroken(active.id)}
              className={cn(
                "h-full w-full object-contain transition-opacity duration-500 ease-out motion-reduce:transition-none",
                activeReady ? "opacity-100" : "opacity-0",
              )}
            />
            <span className="absolute right-3 top-3 rounded-full border border-border/70 bg-background/70 p-2 text-foreground backdrop-blur transition group-hover:border-primary/60">
              <Expand className="h-4 w-4" />
            </span>
          </button>
        )}
      </div>

      {usable.length > 1 ? (
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:grid lg:overflow-visible lg:[grid-template-columns:repeat(auto-fill,minmax(72px,1fr))]">
          {usable.map((item, index) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveId(item.id)}
              aria-current={index === activeIndex ? true : undefined}
              aria-label={`Preview ${index + 1}`}
              className={cn(
                "relative aspect-[3/4] min-h-[44px] w-11 shrink-0 overflow-hidden rounded-[10px] border bg-muted/40 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:w-auto",
                index === activeIndex
                  ? "border-primary ring-1 ring-primary/40"
                  : "border-border/70 hover:border-primary/50",
              )}
            >
              {item.media_type === "video" ? (
                <>
                  {item.poster_url ?? posters[item.id] ? (
                    <img
                      src={(item.poster_url ?? posters[item.id]) as string}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    /* Poster still extracting — a quiet gradient, never a film icon. */
                    <span className="absolute inset-0 bg-[linear-gradient(180deg,hsl(var(--muted)/0.8),hsl(var(--card)))]" />
                  )}
                  <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-background/70 ring-1 ring-border">
                      <Play className="h-3 w-3 translate-x-[1px] fill-current text-foreground" />
                    </span>
                  </span>
                </>
              ) : (
                <img
                  src={item.url}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  onError={() => markBroken(item.id)}
                  className="h-full w-full object-cover"
                />
              )}
            </button>
          ))}
        </div>
      ) : null}

      {lightbox ? (
        <TemplateMediaLightbox
          items={usable}
          index={activeIndex}
          onIndexChange={(next) => setActiveId(usable[next]?.id ?? activeId)}
          onClose={() => setLightbox(false)}
        />
      ) : null}
    </div>
  );
}
