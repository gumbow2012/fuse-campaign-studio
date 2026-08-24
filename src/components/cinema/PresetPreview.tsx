/**
 * FUSE Cinema — single reusable preset preview renderer (CV1).
 *
 * Renders a preset's PreviewMedia:
 *   still / strip     → lazy <img>
 *   loop              → muted <video loop> that plays on hover only
 *   still-swatches    → hex swatch bar
 *   (no src)          → the legacy CSS gradient, FALLBACK ONLY
 *
 * No media is generated here; this only displays what the manifest provides.
 */

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { PreviewMedia } from "@/lib/cinema/previewTypes";

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

export default function PresetPreview({ media, alt, className, autoPlay }: PresetPreviewProps) {
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
  if (media.kind === "loop" && media.src) {
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
            src={media.src}
            poster={media.poster}
            aria-label={alt}
            className="h-full w-full object-cover"
            muted
            loop
            playsInline
            preload="metadata"
          />
        ) : media.poster ? (
          <img src={media.poster} alt={alt} className="h-full w-full object-cover" loading="lazy" />
        ) : null}
      </div>
    );
  }

  /* ---------------------------- still / strip ----------------------------- */
  if (media.src) {
    return (
      <div ref={hostRef} className={base}>
        <img
          src={media.src}
          alt={alt}
          loading="lazy"
          decoding="async"
          className={cn("h-full w-full", media.kind === "strip" ? "object-contain" : "object-cover")}
        />
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
