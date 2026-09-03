/**
 * Template Preview Gallery — renders the signed preview media returned by the
 * public `template-preview-media` endpoint.
 *
 * Rules baked in here:
 * - Items render in the order the endpoint returns (primary first = the cover).
 * - Videos never autoplay in a grid: the poster shows with a play badge and the
 *   video element is only mounted after an explicit click on the lead frame.
 * - Signed urls are fetched when the gallery opens and never persisted.
 */

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ImageOff, Play, Video as VideoIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  fetchTemplatePreviewMedia,
  type TemplatePreviewItem,
} from "@/services/templatePreviewMedia";

function Skeleton({ className }: { className?: string }) {
  return <div className={cn("h-full w-full animate-pulse bg-white/[0.06]", className)} />;
}

function Unavailable({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-white/[0.03] text-slate-500">
      <ImageOff className={compact ? "h-4 w-4" : "h-6 w-6"} />
      {compact ? null : (
        <p className="text-[10px] uppercase tracking-[0.18em]">Preview unavailable</p>
      )}
    </div>
  );
}

function VideoPlaceholder({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-b from-white/[0.06] to-white/[0.02] text-cyan-100/70">
      <VideoIcon className={compact ? "h-4 w-4" : "h-7 w-7"} />
    </div>
  );
}

/** Single frame: poster/image with skeleton + failure placeholder. */
function PreviewFrame({
  src,
  alt,
  compact,
  className,
}: {
  src: string | null;
  alt: string;
  compact?: boolean;
  className?: string;
}) {
  const [state, setState] = useState<"loading" | "ready" | "error">(src ? "loading" : "error");

  useEffect(() => {
    setState(src ? "loading" : "error");
  }, [src]);

  if (!src || state === "error") return <Unavailable compact={compact} />;

  return (
    <>
      {state === "loading" ? <Skeleton className="absolute inset-0" /> : null}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        onLoad={() => setState("ready")}
        onError={() => setState("error")}
        className={cn("h-full w-full object-cover", state === "loading" && "opacity-0", className)}
      />
    </>
  );
}

function LeadMedia({ item }: { item: TemplatePreviewItem }) {
  const [playing, setPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    setPlaying(false);
  }, [item.id]);

  if (item.media_type === "video") {
    if (playing) {
      return (
        <video
          ref={videoRef}
          src={item.url}
          poster={item.poster_url ?? undefined}
          className="h-full w-full object-cover"
          controls
          autoPlay
          playsInline
          preload="metadata"
        />
      );
    }
    return (
      <button
        type="button"
        onClick={() => setPlaying(true)}
        aria-label={item.alt ? `Play ${item.alt}` : "Play preview video"}
        className="group relative h-full w-full"
      >
        {item.poster_url ? (
          <PreviewFrame src={item.poster_url} alt={item.alt} />
        ) : (
          <VideoPlaceholder />
        )}
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/65 ring-1 ring-white/25 transition group-hover:bg-black/80">
            <Play className="h-5 w-5 translate-x-[1px] fill-white text-white" />
          </span>
        </span>
      </button>
    );
  }

  return <PreviewFrame src={item.url} alt={item.alt} />;
}

export default function TemplatePreviewGallery({
  templateId,
  enabled = true,
  fallbackUrl = null,
  fallbackIsVideo = false,
  className,
  frameClassName = "aspect-[9/16]",
}: {
  templateId: string;
  /** Gallery only fetches when it is actually open/visible. */
  enabled?: boolean;
  /** Existing single preview, used when the endpoint returns nothing. */
  fallbackUrl?: string | null;
  fallbackIsVideo?: boolean;
  className?: string;
  frameClassName?: string;
}) {
  const query = useQuery({
    queryKey: ["template-preview-media", templateId],
    queryFn: () => fetchTemplatePreviewMedia(templateId),
    enabled: enabled && !!templateId,
    // Signed urls live ~1h — refetch well inside that window, never cached to a DB.
    staleTime: 30 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: false,
  });

  const items: TemplatePreviewItem[] =
    query.data && query.data.length
      ? query.data
      : fallbackUrl
        ? [
            {
              id: "fallback",
              media_type: fallbackIsVideo ? "video" : "image",
              url: fallbackUrl,
              poster_url: fallbackIsVideo ? null : fallbackUrl,
              alt: "",
              label: null,
              is_primary: true,
              sort_order: 0,
            },
          ]
        : [];

  const [activeId, setActiveId] = useState<string | null>(null);
  const active = items.find((item) => item.id === activeId) ?? items[0] ?? null;

  if (query.isLoading) {
    return (
      <div className={className}>
        <div className={cn("relative overflow-hidden bg-black/40", frameClassName)}>
          <Skeleton />
        </div>
      </div>
    );
  }

  if (!active) {
    return (
      <div className={className}>
        <div className={cn("relative overflow-hidden bg-black/40", frameClassName)}>
          <Unavailable />
        </div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className={cn("relative overflow-hidden bg-black", frameClassName)}>
        <LeadMedia item={active} />
        {active.label ? (
          <span className="pointer-events-none absolute bottom-2 left-2 rounded-full bg-black/70 px-2 py-0.5 text-[9px] uppercase tracking-[0.18em] text-slate-200">
            {active.label}
          </span>
        ) : null}
      </div>

      {items.length > 1 ? (
        <div className="flex gap-2 overflow-x-auto px-2 pb-1 md:px-3">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveId(item.id)}
              aria-label={item.alt || item.label || "Show preview"}
              aria-current={item.id === active.id}
              className={cn(
                "relative h-14 w-10 shrink-0 overflow-hidden rounded-md border bg-black/50",
                item.id === active.id
                  ? "border-cyan-300/70 ring-1 ring-cyan-300/40"
                  : "border-white/10 hover:border-white/25",
              )}
            >
              {item.media_type === "video" && !item.poster_url ? (
                <VideoPlaceholder compact />
              ) : (
                <PreviewFrame
                  src={item.media_type === "video" ? item.poster_url : item.url}
                  alt={item.alt}
                  compact
                />
              )}
              {item.media_type === "video" ? (
                <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <Play className="h-3 w-3 fill-white text-white drop-shadow" />
                </span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
