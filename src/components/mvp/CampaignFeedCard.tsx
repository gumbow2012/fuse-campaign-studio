import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowRight, Info, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * CAMPAIGN FEED CARD — immersive, media-dominant campaign tile for the
 * /app/templates feed. Presentation only: it never touches builder logic,
 * identifiers or execution. Selection is delegated to the parent (which owns
 * the inline-builder row insertion).
 */

/** Hard cap on simultaneously playing feed videos (bandwidth + decode). */
const MAX_CONCURRENT_VIDEOS = 3;
const playing = new Set<string>();

function prefersReducedMotion() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function FeedMedia({
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
      ([entry]) => setVisible(entry.isIntersecting && entry.intersectionRatio > 0.5),
      { threshold: [0, 0.5, 0.85] },
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
      <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.18),transparent_38%),linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))]">
        <Sparkles className="h-8 w-8 text-cyan-100/60" aria-hidden />
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

export interface CampaignFeedCardProps {
  /** Canonical template id — used only as a stable key, never renamed. */
  templateId: string;
  /** Short customer-facing display name. */
  displayName: string;
  /** Accessible full campaign name. */
  fullName: string;
  outputsLabel: string;
  previewUrl?: string | null;
  posterUrl?: string | null;
  isVideo: boolean;
  selected: boolean;
  eager?: boolean;
  statusPill?: "new" | "trending" | null;
  onSelect: () => void;
  onDetails?: () => void;
  /** Fires once when the card first becomes visible. */
  onImpression?: () => void;
  /** Optional overlay controls (favorite / batch-select). */
  overlay?: ReactNode;
}

export default function CampaignFeedCard({
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
  onSelect,
  onDetails,
  onImpression,
  overlay,
}: CampaignFeedCardProps) {
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
    <div
      ref={rootRef}
      className={cn(
        "group relative overflow-hidden rounded-[1.25rem] bg-black transition-shadow",
        selected
          ? "ring-1 ring-cyan-300 shadow-[0_0_40px_-6px_rgba(34,211,238,0.6)]"
          : "ring-1 ring-white/10 hover:ring-white/25",
      )}
    >
      {/* Stable aspect container — CLS-safe on both breakpoints. */}
      <button
        type="button"
        onClick={onSelect}
        aria-label={`Open ${fullName}`}
        aria-pressed={selected}
        className="block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
      >
        <div className="relative aspect-[4/5] w-full sm:aspect-[3/4] lg:aspect-[4/5]">
          <FeedMedia
            mediaKey={templateId}
            url={previewUrl}
            poster={posterUrl}
            isVideo={isVideo}
            alt={`${fullName} campaign preview`}
            eager={eager}
          />
          <span className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black via-black/70 to-transparent" />

          <div className="pointer-events-none absolute inset-x-0 bottom-0 p-4 sm:p-5">
            {statusPill ? (
              <span className="mb-2 inline-flex rounded-full border border-cyan-300/40 bg-cyan-300/15 px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.18em] text-cyan-100">
                {statusPill === "new" ? "New" : "Trending"}
              </span>
            ) : null}
            <p className="font-display text-[22px] font-bold uppercase leading-[1.05] tracking-[0.06em] text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.95)] sm:text-[26px]">
              {displayName}
            </p>
            <p className="mt-1 text-[12px] font-medium text-slate-200/90">{outputsLabel}</p>
            <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-cyan-300 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-950">
              Run campaign
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </span>
          </div>
        </div>
      </button>

      {onDetails ? (
        <button
          type="button"
          aria-label={`Details for ${fullName}`}
          onClick={(event) => {
            event.stopPropagation();
            onDetails();
          }}
          className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full border border-white/20 bg-black/60 text-white/85 backdrop-blur transition-colors hover:bg-black/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
        >
          <Info className="h-3.5 w-3.5" aria-hidden />
        </button>
      ) : null}

      {overlay}
    </div>
  );
}
