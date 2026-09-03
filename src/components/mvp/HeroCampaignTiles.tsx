import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import type { Entry } from "@/lib/homeMediaAllocator";
import { templateDetailPath } from "@/lib/templateSlug";
import { track } from "@/lib/analytics/track";

/**
 * HERO — four moving campaign previews. SHOW FIRST, EXPLAIN AFTER TAP.
 *
 * Media accuracy: each tile renders the campaign's OWN approved preview (already
 * resolved + deduped by the home allocator). Video plays only while in view,
 * muted + inline; `prefers-reduced-motion` keeps the poster frame still.
 */

function builderHref(templateId?: string | null) {
  const id = templateId ? String(templateId) : "";
  return id ? `/app/templates?template=${encodeURIComponent(id)}` : "/app/templates";
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

function TileMedia({ entry, eager, reduced }: { entry: Entry; eager: boolean; reduced: boolean }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = videoRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([item]) => setVisible(item.isIntersecting && item.intersectionRatio > 0.35),
      { threshold: [0, 0.35, 0.7] },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [entry.media.url]);

  useEffect(() => {
    const node = videoRef.current;
    if (!node) return;
    if (visible && !reduced) void node.play().catch(() => undefined);
    else node.pause();
  }, [visible, reduced]);

  if (entry.media.type === "video") {
    return (
      <video
        ref={videoRef}
        src={entry.media.url}
        className="h-full w-full object-cover"
        muted
        loop
        playsInline
        preload="metadata"
        tabIndex={-1}
        aria-hidden
      />
    );
  }

  return (
    <img
      src={entry.media.url}
      alt=""
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      draggable={false}
      className="h-full w-full object-cover"
    />
  );
}

const STRIP_CLASS =
  "flex items-center justify-center gap-2 overflow-x-auto px-1 sm:gap-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";
const SQUARE_CLASS =
  "block h-[76px] w-[76px] shrink-0 overflow-hidden rounded-[0.7rem] bg-black sm:h-[104px] sm:w-[104px] lg:h-[128px] lg:w-[128px]";

function TileSkeleton() {
  return <div className={cn(SQUARE_CLASS, "animate-pulse bg-white/[0.06]")} />;
}

export default function HeroCampaignTiles({
  entries,
  loading,
  className,
}: {
  entries: Entry[];
  loading?: boolean;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const seen = useRef(false);

  /** Video-first, deduped, exactly four tiles. */
  const tiles = useMemo(() => {
    const seenKeys = new Set<string>();
    const unique = entries.filter((entry) => {
      const key = String(entry.template.id ?? entry.template.name ?? "").toLowerCase();
      if (!key || seenKeys.has(key)) return false;
      seenKeys.add(key);
      return true;
    });
    return unique.slice(0, 4);
  }, [entries]);

  useEffect(() => {
    const node = wrapRef.current;
    if (!node || !tiles.length || seen.current) return;
    const observer = new IntersectionObserver(
      ([item]) => {
        if (item.isIntersecting && !seen.current) {
          seen.current = true;
          track("homepage_campaign_preview_view", { count: tiles.length });
          observer.disconnect();
        }
      },
      { threshold: 0.3 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [tiles.length]);

  if (!tiles.length) {
    if (!loading) return null;
    return (
      <div className={cn(STRIP_CLASS, className)}>
        <TileSkeleton />
        <TileSkeleton />
        <TileSkeleton />
        <TileSkeleton />
      </div>
    );
  }

  return (
    <div
      ref={wrapRef}
      className={cn(STRIP_CLASS, className)}
    >
      {tiles.map((entry, index) => {
        const templateId = String(entry.template.id ?? "");
        return (
          <Link
            key={`hero-tile-${templateId}-${index}`}
            to={templateDetailPath(entry.template)}
            onClick={() =>
              track("homepage_campaign_preview_click", { template_id: templateId, slot: index })
            }
            aria-label={`Open ${entry.template.name}`}
            className="group shrink-0 focus-visible:outline-none"
          >
            <div
              className={cn(
                SQUARE_CLASS,
                "ring-1 ring-white/10 transition-transform duration-300 group-hover:scale-[1.03] group-focus-visible:ring-2 group-focus-visible:ring-cyan-300 motion-reduce:transition-none motion-reduce:group-hover:scale-100",
              )}
            >
              <TileMedia entry={entry} eager={index < 2} reduced={reduced} />
            </div>
          </Link>
        );
      })}
    </div>
  );

}
