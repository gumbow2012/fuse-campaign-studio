/**
 * R5 — TRUE ASPECT RATIO viewer.
 *
 * The container adopts the media's REAL ratio as soon as the browser reports
 * natural dimensions, so nothing is cropped, stretched or letterboxed inside a
 * fixed 9:16 box. `object-contain` guarantees the complete frame is visible
 * even for the brief moment before the ratio resolves.
 */
import { useCallback, useState } from "react";
import { cn } from "@/lib/utils";

export interface TrueRatioMediaProps {
  url: string;
  type: "image" | "video";
  poster?: string | null;
  alt?: string;
  /** Cap so a tall 9:16 asset never pushes the page around. */
  maxHeight?: string;
  controls?: boolean;
  className?: string;
  /** Fallback ratio used only until the media reports its own. */
  fallbackRatio?: string;
}

export function TrueRatioMedia({
  url,
  type,
  poster,
  alt,
  maxHeight = "min(70vh, 720px)",
  controls = true,
  className,
  fallbackRatio = "4 / 5",
}: TrueRatioMediaProps) {
  const [ratio, setRatio] = useState<string | null>(null);

  const apply = useCallback((width: number, height: number) => {
    if (width > 0 && height > 0) setRatio(`${width} / ${height}`);
  }, []);

  return (
    <div
      className={cn(
        "mx-auto w-full overflow-hidden rounded-2xl border border-white/10 bg-black",
        className,
      )}
      style={{ aspectRatio: ratio ?? fallbackRatio, maxHeight }}
    >
      {type === "video" ? (
        <video
          key={url}
          src={url}
          poster={poster ?? undefined}
          controls={controls}
          playsInline
          preload="metadata"
          onLoadedMetadata={(event) => {
            const el = event.currentTarget;
            apply(el.videoWidth, el.videoHeight);
          }}
          className="h-full w-full object-contain"
        />
      ) : (
        <img
          key={url}
          src={url}
          alt={alt ?? ""}
          loading="lazy"
          onLoad={(event) => {
            const el = event.currentTarget;
            apply(el.naturalWidth, el.naturalHeight);
          }}
          className="h-full w-full object-contain"
        />
      )}
    </div>
  );
}

export default TrueRatioMedia;
