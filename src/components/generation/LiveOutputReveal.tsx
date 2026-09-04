/**
 * G3 — live output reveal. Outputs appear the moment the server reports them;
 * the grid is keyed by output id so a poll never re-renders finished tiles.
 * Videos show a poster frame with a play affordance — nothing autoplays.
 */
import { useState } from "react";
import { Play } from "lucide-react";
import type { LiveOutputItem } from "@/services/campaignLiveStatus";
import { cn } from "@/lib/utils";

export interface LiveOutputRevealProps {
  ready: number;
  total: number;
  items: LiveOutputItem[];
  className?: string;
}

function OutputTile({ item }: { item: LiveOutputItem }) {
  const isVideo = item.media_type === "video";
  const [playing, setPlaying] = useState(false);

  return (
    <figure className="group relative overflow-hidden rounded-xl border border-white/10 bg-black/40 animate-fade-in">
      <div className="aspect-[9/16] w-full">
        {isVideo ? (
          playing ? (
            <video
              src={item.url}
              poster={item.poster_url ?? undefined}
              controls
              autoPlay
              playsInline
              className="h-full w-full object-cover"
            />
          ) : (
            <button
              type="button"
              onClick={() => setPlaying(true)}
              className="relative h-full w-full"
              aria-label={`Play video ${item.output_number ?? ""}`.trim()}
            >
              {item.poster_url ? (
                <img
                  src={item.poster_url}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              ) : (
                <video
                  src={item.url}
                  preload="metadata"
                  muted
                  playsInline
                  className="h-full w-full object-cover"
                />
              )}
              <span className="absolute inset-0 flex items-center justify-center bg-black/25">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-slate-950">
                  <Play className="h-4 w-4" aria-hidden />
                </span>
              </span>
            </button>
          )
        ) : (
          <img
            src={item.url}
            alt={`Campaign asset ${item.output_number ?? ""}`.trim()}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        )}
      </div>
      <figcaption className="flex items-center justify-between gap-2 px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-[0.2em] text-slate-400">
        <span>
          {isVideo ? "Video" : "Image"}
          {item.output_number ? ` ${String(item.output_number).padStart(2, "0")}` : ""}
        </span>
        <span className="text-[hsl(186_100%_62%)]">Ready</span>
      </figcaption>
    </figure>
  );
}

export function LiveOutputReveal({ ready, total, items, className }: LiveOutputRevealProps) {
  const placeholders = Math.max(0, total - items.length);

  if (total === 0 && items.length === 0) return null;

  return (
    <section className={cn("space-y-3", className)} aria-label="Your campaign outputs">
      <p className="font-display text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-300">
        Your campaign — {ready} / {total} ready
      </p>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {items.map((item) => (
          <OutputTile key={item.id} item={item} />
        ))}
        {Array.from({ length: placeholders }).map((_, index) => (
          <div
            key={`placeholder-${index}`}
            className="aspect-[9/16] rounded-xl border border-dashed border-white/10 bg-white/[0.02]"
            aria-hidden
          />
        ))}
      </div>
    </section>
  );
}

export default LiveOutputReveal;
