import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowRight, Info, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * CAMPAIGN TILE — dense, imagery-first feed tile for /app/templates.
 *
 * Presentation only: it never touches builder logic, identifiers or execution.
 * Media above, name below (feed style). The whole media area is the interaction
 * target; selection is delegated to the parent.
 */

/** Hard cap on simultaneously playing feed videos (bandwidth + decode). */
const MAX_CONCURRENT_VIDEOS = 4;
const playing = new Set<string>();

function prefersReducedMotion() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function TileMedia({
  mediaKey,
  url,
  isVideo,
  poster,
  alt,
  eager,
}: {
  mediaKey: string;
  url: string | null | undefined;
  isVideo: boolean;
  poster?: string | null;
  alt: string;
  eager?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [visible, setVisible] = useState(false);
  const reduced = prefersReducedMotion();

  useEffect(() => {
    const node = videoRef.current;
    if (!node || reduced) return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting && entry.intersectionRatio > 0.6),
      { threshold: [0, 0.6, 0.9] },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [reduced, url]);

  useEffect(() => {
    const node = videoRef.current;
    if (!node || reduced) return;
    if (visible) {
      if (playing.size >= MAX_CONCURRENT_VIDEOS && !playing.has(mediaKey)) return;
      playing.add(mediaKey);
      void node.play().catch(() => undefined);
    } else {
      playing.delete(mediaKey);
      node.pause();
    }
    return () => {
      playing.delete(mediaKey);
    };
  }, [mediaKey, reduced, visible]);

  if (!url) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.16),transparent_40%),linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))]">
        <Sparkles className="h-6 w-6 text-cyan-100/60" aria-hidden />
      </div>
    );
  }

  if (isVideo && !reduced) {
    return (
      <video
        ref={videoRef}
        src={url}
        poster={poster ?? undefined}
        className="h-full w-full object-cover"
        muted
        loop
        playsInline
        preload="metadata"
        aria-label={alt}
      />
    );
  }

  return (
    <img
      src={isVideo ? poster ?? url : url}
      alt={alt}
      className="h-full w-full object-cover"
      loading={eager ? "eager" : "lazy"}
      decoding="async"
    />
  );
}

export interface CampaignTileProps {
  /** Canonical template id — used only as a stable key, never renamed. */
  templateId: string;
  /** Short customer-facing display name. */
  displayName: string;
  /** Accessible full campaign name. */
  fullName: string;
  /** "X images · Y video clips" — from the shared formatter, never invented. */
  outputsLabel?: string | null;
  previewUrl?: string | null;
  posterUrl?: string | null;
  isVideo: boolean;
  selected: boolean;
  eager?: boolean;
  statusPill?: "new" | "trending" | null;
  /** Shows the green FREE pill when this campaign offers the free first video. */
  freeVideo?: boolean;
  onSelect: () => void;
  onDetails?: () => void;
  /** Fires once when the tile first becomes visible. */
  onImpression?: () => void;
  /** Optional overlay controls (favorite / batch-select). */
  overlay?: ReactNode;
  /** Media aspect classes (presentation only). Defaults to 4:5. */
  mediaAspectClassName?: string;
}

export default function CampaignTile({
  templateId,
  displayName,
  fullName,
  outputsLabel,
  previewUrl,
  posterUrl,
  isVideo,
  selected,
  eager,
  statusPill,
  freeVideo,
  onSelect,
  onDetails,
  onImpression,
  overlay,
  mediaAspectClassName = "aspect-[4/5]",
}: CampaignTileProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const impressionSent = useRef(false);

  useEffect(() => {
    const node = rootRef.current;
    if (!node || !onImpression) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !impressionSent.current) {
          impressionSent.current = true;
          onImpression();
          observer.disconnect();
        }
      },
      { threshold: 0.35 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [onImpression]);

  return (
    <div ref={rootRef} className="group/tile min-w-0">
      <div className="relative">
        <div
          role="button"
          tabIndex={0}
          onClick={onSelect}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onSelect();
            }
          }}
          data-feed-card={templateId}
          aria-label={`Open ${fullName}`}
          aria-pressed={selected}
          className={cn(
            "relative block w-full cursor-pointer overflow-hidden rounded-xl bg-black transition-[transform,box-shadow,filter] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 motion-reduce:transition-none",
            "motion-safe:group-hover/tile:scale-[1.015] motion-safe:group-hover/tile:brightness-[1.06]",
            selected
              ? "ring-1 ring-cyan-300 shadow-[0_0_22px_-6px_rgba(34,211,238,0.65)]"
              : "ring-1 ring-white/10 group-hover/tile:ring-cyan-300/50",
          )}
        >
          {/* Stable aspect container — CLS-safe at every breakpoint. */}
          <div className={cn("relative w-full", mediaAspectClassName)}>
            <TileMedia
              mediaKey={templateId}
              url={previewUrl}
              poster={posterUrl}
              isVideo={isVideo}
              alt={`${fullName} campaign preview`}
              eager={eager}
            />

            {freeVideo ? (
              <span
                title="Your first video is free"
                aria-label="Your first video is free"
                className="pointer-events-none absolute left-1.5 top-1.5 z-10 rounded-full border border-emerald-300/50 bg-emerald-500/25 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.18em] text-emerald-100 shadow-[0_0_14px_-4px_rgba(16,185,129,0.9)] backdrop-blur"
              >
                Free
              </span>
            ) : null}

            {statusPill ? (
              <span className={cn("pointer-events-none absolute top-1.5 rounded-full border border-cyan-300/40 bg-black/70 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.16em] text-cyan-100 backdrop-blur", freeVideo ? "right-1.5" : "left-1.5")}>
                {statusPill === "new" ? "New" : "Trending"}
              </span>
            ) : null}

            {/* Hover-only affordance — never a permanent button, and never a
                purchase or generate promise: clicking a tile only selects it. */}
            <span className="pointer-events-none absolute bottom-1.5 right-1.5 hidden items-center gap-1 rounded-full bg-cyan-300 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-slate-950 opacity-0 transition-opacity duration-150 group-hover/tile:opacity-100 lg:inline-flex">
              View
              <ArrowRight className="h-2.5 w-2.5" aria-hidden />
            </span>

          </div>
        </div>
        {overlay}
      </div>


      <div className="mt-1.5 flex items-start gap-1">
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "truncate font-display text-[11.5px] font-bold uppercase tracking-[0.1em]",
              selected ? "text-cyan-100" : "text-white",
            )}
          >
            {displayName}
          </p>
          {outputsLabel ? (
            <p className="truncate text-[9.5px] font-medium tracking-[0.02em] text-slate-500">
              {outputsLabel}
            </p>
          ) : null}
        </div>
        {onDetails ? (
          <button
            type="button"
            aria-label={`Details for ${fullName}`}
            onClick={(event) => {
              event.stopPropagation();
              onDetails();
            }}
            className="mt-0.5 shrink-0 text-slate-600 transition-colors hover:text-cyan-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-300"
          >
            <Info className="h-3 w-3" aria-hidden />
          </button>
        ) : null}
      </div>
    </div>
  );
}
