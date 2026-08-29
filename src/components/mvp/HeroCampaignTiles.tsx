import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { campaignDisplayName } from "@/lib/campaignDisplayName";
import type { Entry } from "@/lib/homeMediaAllocator";
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

function TileSkeleton() {
  return <div className="aspect-square w-full animate-pulse rounded-[0.9rem] bg-white/[0.06]" />;
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
    return unique
      .map((entry, index) => ({ entry, index }))
      .sort((a, b) => {
        const aVideo = a.entry.media.type === "video" ? 0 : 1;
        const bVideo = b.entry.media.type === "video" ? 0 : 1;
        return aVideo - bVideo || a.index - b.index;
      })
      .slice(0, 4)
      .map((row) => row.entry);
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
      <div className={cn("grid grid-cols-2 gap-2.5 lg:grid-cols-4 lg:gap-4", className)}>
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
      className={cn("grid grid-cols-2 gap-2.5 lg:grid-cols-4 lg:gap-4", className)}
    >
      {tiles.map((entry, index) => {
        const templateId = String(entry.template.id ?? "");
        const label = campaignDisplayName(entry.template.name);
        return (
          <Link
            key={`hero-tile-${templateId}-${index}`}
            to={builderHref(templateId)}
            onClick={() =>
              track("homepage_campaign_preview_click", { template_id: templateId, slot: index })
            }
            aria-label={`Open ${entry.template.name}`}
            className="group relative block aspect-square overflow-hidden rounded-[0.9rem] bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-background lg:rounded-[1.1rem]"
          >
            <div className="absolute inset-0 transition-transform duration-500 group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100">
              <TileMedia entry={entry} eager={index < 2} reduced={reduced} />
            </div>
            <span className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/80 to-transparent" />
            <span className="pointer-events-none absolute bottom-2 left-2.5 font-display text-[11px] font-bold uppercase tracking-[0.14em] text-white drop-shadow-[0_1px_6px_rgba(0,0,0,0.9)] lg:bottom-3 lg:left-3.5 lg:text-[13px]">
              {label}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
