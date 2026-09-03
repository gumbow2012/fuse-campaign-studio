/**
 * Asset Library thumbnail. The fuse-assets bucket is PRIVATE, so previews are
 * resolved to short-lived signed URLs at render time (batched per visible page)
 * and never persisted. Cards degrade to a designed "Preview unavailable" state
 * with a Retry action instead of a broken-image icon.
 */

import { useEffect, useState } from "react";
import { ImageOff, Play, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import useNearViewport from "@/hooks/useNearViewport";
import { useSignedAssetUrl } from "@/hooks/useSignedAssetUrl";
import { invalidateSignedUrl } from "@/services/assetSigning";

function formatDuration(seconds?: number | null): string | null {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) return null;
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export interface AssetThumbnailProps {
  /** Canonical stored reference (path or URL) — never a signed URL. */
  url: string;
  type: string;
  /** Optimized thumbnail / video poster frame when the asset has one. */
  previewUrl?: string | null;
  durationSeconds?: number | null;
  /** Eager path for first-screen tiles. */
  priority?: boolean;
  className?: string;
}

export default function AssetThumbnail({
  url,
  type,
  previewUrl,
  durationSeconds,
  priority = false,
  className,
}: AssetThumbnailProps) {
  const { ref: hostRef, near } = useNearViewport<HTMLDivElement>(priority, "300px");
  const isVideo = type === "video";
  const source = previewUrl || (isVideo ? null : url);
  const { url: resolved, state, refresh } = useSignedAssetUrl(source, near);
  const [imageError, setImageError] = useState(false);
  const [retried, setRetried] = useState(false);

  useEffect(() => {
    setImageError(false);
    setRetried(false);
  }, [source]);

  const retry = () => {
    if (source) invalidateSignedUrl(source);
    setImageError(false);
    setRetried(true);
    refresh();
  };

  const handleError = () => {
    if (!retried) {
      // Retry ONCE with a freshly signed original before giving up.
      retry();
      return;
    }
    setImageError(true);
  };

  const duration = formatDuration(durationSeconds);
  const showSkeleton = !source ? false : state === "idle" || state === "loading";
  const failed = imageError || state === "unavailable" || !source;

  return (
    <div ref={hostRef} className={cn("relative aspect-square w-full overflow-hidden bg-black/40", className)}>
      {showSkeleton ? (
        <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-white/[0.06] to-white/[0.02]" />
      ) : null}

      {!failed && resolved ? (
        <img
          src={resolved}
          alt=""
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          onError={handleError}
          className="h-full w-full object-cover"
        />
      ) : null}

      {failed ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-white/[0.03] px-2 text-center">
          {isVideo && !previewUrl ? (
            <>
              <Play size={16} className="text-cyan-100/70" />
              <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Video</span>
            </>
          ) : (
            <>
              <ImageOff size={16} className="text-muted-foreground" />
              <span className="text-[10px] leading-tight text-muted-foreground">Preview unavailable</span>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  event.preventDefault();
                  setRetried(false);
                  retry();
                }}
                className="flex items-center gap-1 rounded-md border border-white/15 bg-black/50 px-1.5 py-0.5 text-[10px] text-cyan-100"
              >
                <RotateCcw size={10} /> Retry
              </button>
            </>
          )}
        </div>
      ) : null}

      {isVideo && !failed ? (
        <span className="pointer-events-none absolute bottom-1 right-1 flex items-center gap-1 rounded-md bg-black/75 px-1.5 py-0.5 text-[10px] text-cyan-100">
          <Play size={9} className="fill-current" />
          {duration ?? "Video"}
        </span>
      ) : null}
    </div>
  );
}
