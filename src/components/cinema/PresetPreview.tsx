/**
 * FUSE Cinema — single reusable preset preview renderer (CV1 + CV10 serving).
 *
 * Renders a preset's PreviewMedia, overlaid with any hosted media registered in
 * the CV10 preview registry:
 *   still / strip     → lazy <picture> (avif/webp first)
 *   loop              → muted <video> (webm first) that plays on hover/visible
 *   still-swatches    → hex swatch bar
 *   (no src)          → the legacy CSS gradient, FALLBACK ONLY
 *
 * Performance rules: nothing loads before it enters the viewport, stills are
 * lazy + async-decoded, thumbnail derivatives are preferred, loops only ever
 * `preload="metadata"` and never autoplay unless explicitly asked. No media is
 * generated here and previews are NEVER regenerated when a picker opens.
 */

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";
import type { PreviewMedia, PreviewSource } from "@/lib/cinema/previewTypes";
import {
  loadPreviewRegistry,
  lookupPreviewMedia,
  previewRegistryVersion,
  subscribePreviewRegistry,
} from "@/lib/cinema/previewRegistry";

export interface PresetPreviewProps {
  media: PreviewMedia;
  /** Accessible description, e.g. the preset name. */
  alt: string;
  className?: string;
  /**
   * CV4: play `loop` previews as soon as they are visible (used by CompareView so
   * two movement loops run side by side). Default stays hover-only.
   */
  autoPlay?: boolean;
}

const IMAGE_PRIORITY = ["image/avif", "image/webp"];
const VIDEO_PRIORITY = ["video/webm", "video/mp4"];

function orderSources(sources: PreviewSource[] | undefined, priority: string[]) {
  if (!sources?.length) return [];
  return [...sources].sort((a, b) => {
    const rank = (source: PreviewSource) => {
      const index = priority.indexOf(source.type ?? "");
      return index === -1 ? priority.length : index;
    };
    return rank(a) - rank(b);
  });
}

/** Registry-aware media: hosted URLs win, otherwise the passed-in media stands. */
function useRegisteredMedia(media: PreviewMedia): PreviewMedia {
  useSyncExternalStore(subscribePreviewRegistry, previewRegistryVersion, () => 0);
  useEffect(() => {
    void loadPreviewRegistry();
  }, []);

  const registered = media.presetId ? lookupPreviewMedia(media.presetId) : undefined;
  if (!registered) return media;
  return {
    ...media,
    kind: registered.kind ?? media.kind,
    src: registered.src ?? media.src,
    sources: registered.sources?.length ? registered.sources : media.sources,
    thumbSrc: registered.thumbSrc ?? media.thumbSrc,
    poster: registered.poster ?? media.poster,
    swatches: registered.swatches ?? media.swatches,
  };
}

export default function PresetPreview({ media: input, alt, className, autoPlay }: PresetPreviewProps) {
  const media = useRegisteredMedia(input);
  const hostRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = hostRef.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!autoPlay || !visible) return;
    void videoRef.current?.play().catch(() => undefined);
  }, [autoPlay, visible, media.src]);

  const base = cn("relative h-12 w-full overflow-hidden bg-muted/30", className);

  /* ------------------------------- swatches ------------------------------- */
  if (media.kind === "still-swatches" && !media.src) {
    const hexes = media.swatches ?? [];
    if (hexes.length > 0) {
      return (
        <div ref={hostRef} className={cn(base, "flex")} role="img" aria-label={`${alt} palette`}>
          {hexes.slice(0, 8).map((hex, index) => (
            <span key={`${hex}-${index}`} className="h-full flex-1" style={{ background: hex }} />
          ))}
        </div>
      );
    }
  }

  /* --------------------------------- loop --------------------------------- */
  if (media.kind === "loop" && (media.src || media.sources?.length)) {
    const videoSources = orderSources(media.sources, VIDEO_PRIORITY);
    return (
      <div
        ref={hostRef}
        className={base}
        onMouseEnter={() => void videoRef.current?.play().catch(() => undefined)}
        onMouseLeave={() => {
          if (autoPlay) return;
          const video = videoRef.current;
          if (!video) return;
          video.pause();
          video.currentTime = 0;
        }}
      >
        {visible ? (
          <video
            ref={videoRef}
            src={videoSources.length ? undefined : media.src}
            poster={media.poster}
            aria-label={alt}
            className="h-full w-full object-cover"
            muted
            loop
            playsInline
            preload="metadata"
          >
            {videoSources.map((source) => (
              <source key={source.src} src={source.src} type={source.type} />
            ))}
          </video>
        ) : media.poster ? (
          <img src={media.poster} alt={alt} className="h-full w-full object-cover" loading="lazy" />
        ) : null}
      </div>
    );
  }

  /* ---------------------------- still / strip ----------------------------- */
  const stillSrc = media.thumbSrc ?? media.src;
  if (stillSrc || media.sources?.length) {
    const imageSources = orderSources(media.sources, IMAGE_PRIORITY);
    const fit = media.kind === "strip" ? "object-contain" : "object-cover";
    return (
      <div ref={hostRef} className={base}>
        {visible ? (
          <picture>
            {imageSources.map((source) => (
              <source key={source.src} srcSet={source.src} type={source.type} />
            ))}
            <img
              src={stillSrc ?? imageSources[0]?.src}
              alt={alt}
              loading="lazy"
              decoding="async"
              className={cn("h-full w-full", fit)}
            />
          </picture>
        ) : (
          <div className="h-full w-full" style={{ background: media.fallbackGradient }} />
        )}
      </div>
    );
  }

  /* ------------------------ gradient fallback only ------------------------ */
  return (
    <div
      ref={hostRef}
      className={base}
      style={{ background: media.fallbackGradient }}
      aria-hidden={!media.fallbackGradient}
    />
  );
}
