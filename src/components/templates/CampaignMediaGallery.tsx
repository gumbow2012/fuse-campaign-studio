/**
 * CAMPAIGN PRODUCT GALLERY — one unified viewer for a template product page.
 *
 * Video-first: the caller passes items already merchandised (hero first, then
 * the gallery order returned by the backend). One dominant 9:16 viewer plus a
 * compact thumbnail strip; no internal taxonomy labels.
 *
 * Media that fails to load is dropped from the gallery entirely and the viewer
 * falls through to the next usable item, so a broken asset never renders as a
 * blank black card.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Expand, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import TemplateMediaLightbox from "./TemplateMediaLightbox";
import type { TemplateGalleryItem } from "@/services/templateDetailPage";

function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-[18px] bg-white/[0.06]", className)} />;
}

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
            <Skeleton key={key} className="h-20 w-12 rounded-[10px]" />
          ))}
        </div>
      </div>
    );
  }

  if (!active) {
    return (
      <div className={className}>
        <div className="flex aspect-[9/16] w-full items-center justify-center rounded-[18px] border border-white/10 bg-[linear-gradient(180deg,hsl(var(--navy-mid)/0.85),hsl(var(--navy-deep)))]">
          <p className="font-mono text-[9px] uppercase tracking-[0.24em] text-slate-500">
            Preview coming soon
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div
        className="relative aspect-[9/16] w-full overflow-hidden rounded-[18px] border border-[hsl(var(--electric-blue)/0.28)] bg-black shadow-[0_50px_120px_-70px_hsl(var(--electric-blue)/0.7)]"
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
          <video
            key={active.id}
            src={active.url}
            poster={active.poster_url ?? posters[active.id] ?? undefined}
            autoPlay
            muted
            loop
            controls
            playsInline
            crossOrigin="anonymous"
            preload="metadata"
            aria-label={`${name} campaign preview`}
            onError={() => markBroken(active.id)}
            className="h-full w-full bg-black object-contain"
          />

        ) : (
          <button
            type="button"
            onClick={() => setLightbox(true)}
            aria-label={`View ${name} preview larger`}
            className="group relative h-full w-full"
          >
            <img
              key={active.id}
              src={active.url}
              alt={`${name} campaign preview`}
              onError={() => markBroken(active.id)}
              className="h-full w-full object-cover"
            />
            <span className="absolute right-3 top-3 rounded-full border border-white/15 bg-black/55 p-2 text-white/85 backdrop-blur transition group-hover:border-cyan-300/60 group-hover:text-white">
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
                "relative aspect-[9/16] w-14 shrink-0 overflow-hidden rounded-[10px] border bg-black transition lg:w-auto",
                index === activeIndex
                  ? "border-[hsl(var(--electric-cyan)/0.8)] ring-1 ring-[hsl(var(--electric-cyan)/0.3)]"
                  : "border-white/10 hover:border-[hsl(var(--electric-blue)/0.5)]",
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
                    <span className="absolute inset-0 bg-[linear-gradient(180deg,hsl(var(--navy-mid)/0.9),hsl(var(--navy-deep)))]" />
                  )}
                  <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-black/60 ring-1 ring-white/20">
                      <Play className="h-3 w-3 translate-x-[1px] fill-white text-white" />
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
