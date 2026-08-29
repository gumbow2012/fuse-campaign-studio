import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { formatCampaignOutputs } from "@/lib/campaignOutputs";
import type { Entry, TemplateMedia } from "@/lib/homeMediaAllocator";
import { track } from "@/lib/analytics/track";
import { campaignDisplayName } from "@/lib/campaignDisplayName";

/**
 * NEW DROPS — video-first rail that flows straight out of the hero.
 * Genuine new drops come first and keep the NEW badge; the rest of the rail is
 * filled with other eligible live campaigns (no badge) so the row reaches the
 * right edge. Timestamps are never touched and nothing is marked "new" that
 * isn't. Only real preview media is used; hidden when there is nothing to show.
 */

/** Deep link into the builder by template NAME (the supported ad-link ref). */
function runHref(name: string) {
  return name ? `/app/templates?template=${encodeURIComponent(name)}` : "/app/templates";
}

/** Plays only while in view (IntersectionObserver), muted + inline. */
function AutoMedia({ media, eager }: { media: TemplateMedia; eager?: boolean }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = videoRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting && entry.intersectionRatio > 0.4),
      { threshold: [0, 0.4, 0.75] },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [media.url]);

  useEffect(() => {
    const node = videoRef.current;
    if (!node) return;
    if (visible) void node.play().catch(() => undefined);
    else node.pause();
  }, [visible]);

  if (media.type === "video") {
    return (
      <video
        ref={videoRef}
        src={media.url}
        className="h-full w-full object-cover"
        muted
        loop
        playsInline
        preload="metadata"
      />
    );
  }

  return (
    <img
      src={media.url}
      alt=""
      loading={eager ? "eager" : "lazy"}
      draggable={false}
      className="h-full w-full object-cover"
    />
  );
}

function DropCard({ entry, eager, isNew }: { entry: Entry; eager?: boolean; isNew?: boolean }) {
  const name = String(entry.template.name ?? "");
  const href = runHref(name);
  const outputs = formatCampaignOutputs(
    entry.template.counts as { imageOutputs?: number | null; videoOutputs?: number | null } | undefined,
  );

  return (
    <Link
      to={href}
      aria-label={`Run ${name}`}
      onClick={() => track("homepage_campaign_card_click", { template_id: String(entry.template.id ?? "") })}
      className="group relative w-[78vw] max-w-[320px] shrink-0 snap-start overflow-hidden rounded-[1.1rem] border border-white/12 bg-black transition-colors hover:border-cyan-200/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 sm:w-[40vw] lg:w-[calc((100%-4*0.875rem)/4.6)] lg:max-w-none"
    >
      <div className="relative aspect-[4/5] overflow-hidden bg-black">
        <AutoMedia media={entry.media} eager={eager} />
        {isNew && (
          <span className="absolute left-3 top-3 rounded-full bg-emerald-300/95 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-950">
            New
          </span>
        )}
        <span className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/85 to-transparent" />
        <div className="pointer-events-none absolute inset-x-3 bottom-2.5">
          <p className="truncate font-display text-[13px] font-bold uppercase tracking-[0.1em] text-white drop-shadow-[0_1px_6px_rgba(0,0,0,0.9)]">
            {campaignDisplayName(name)}
          </p>
          <p className="mt-0.5 truncate text-[11px] font-medium text-slate-200">{outputs}</p>
        </div>
      </div>
    </Link>
  );
}


/** Video-first ordering inside a group; catalog order breaks ties. */
function videoFirst(entries: Entry[]) {
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => {
      const aVideo = a.entry.media.type === "video" ? 0 : 1;
      const bVideo = b.entry.media.type === "video" ? 0 : 1;
      return aVideo - bVideo || a.index - b.index;
    })
    .map((row) => row.entry);
}

export default function NewDropsShelf({
  entries,
  fill = [],
}: {
  /** Genuine new drops — these keep the NEW badge. */
  entries: Entry[];
  /** Other eligible live campaigns used to fill the rail. Never badged. */
  fill?: Entry[];
}) {
  const rail = useMemo(() => {
    const seen = new Set<string>();
    const rows: Array<{ entry: Entry; isNew: boolean }> = [];
    const push = (list: Entry[], isNew: boolean) => {
      for (const entry of videoFirst(list)) {
        const key = String(entry.template.id ?? entry.template.name ?? "").trim().toLowerCase();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        rows.push({ entry, isNew });
      }
    };
    push(entries, true);
    push(fill, false);
    return rows.slice(0, 14);
  }, [entries, fill]);

  if (!rail.length) return null;

  return (
    <section id="new-today" className="container pb-8 pt-4 sm:pt-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-lg font-bold uppercase tracking-[0.06em] text-white sm:text-xl">
          New drops
        </h2>
        <Link
          to="/app/templates"
          className="flex shrink-0 items-center gap-1 text-[11.5px] font-bold uppercase tracking-[0.16em] text-cyan-200 transition-colors hover:text-white"
        >
          Browse all
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>


      <div className="-mx-4 mt-4 flex snap-x snap-mandatory gap-3.5 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:-mx-6 sm:px-6">
        {rail.map(({ entry, isNew }, index) => (
          <DropCard
            key={`drop-${entry.template.id}-${index}`}
            entry={entry}
            isNew={isNew}
            eager={index < 5}
          />
        ))}
      </div>
    </section>
  );
}
