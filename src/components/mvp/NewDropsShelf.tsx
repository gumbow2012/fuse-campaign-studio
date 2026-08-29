import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { formatCampaignOutputs } from "@/lib/campaignOutputs";
import type { Entry, TemplateMedia } from "@/lib/homeMediaAllocator";
import { track } from "@/lib/analytics/track";

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
    <article className="group relative w-[76vw] max-w-[320px] shrink-0 snap-start overflow-hidden rounded-[1.1rem] border border-white/12 bg-slate-950/80 transition-colors hover:border-cyan-200/40 sm:w-[38vw] lg:w-[262px] xl:w-[274px]">
      <Link
        to={href}
        className="absolute inset-0 z-10"
        aria-label={`Run ${name}`}
        onClick={() => track("homepage_campaign_card_click", { template_id: String(entry.template.id ?? "") })}
      />
      <div className="relative aspect-[4/5] overflow-hidden bg-black">
        <AutoMedia media={entry.media} eager={eager} />
        {isNew && (
          <span className="absolute left-3 top-3 rounded-full bg-emerald-300/95 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-950">
            New
          </span>
        )}
      </div>
      <div className="p-3.5">
        <p className="truncate font-display text-sm font-semibold uppercase tracking-[0.08em] text-white">
          {name}
        </p>
        <p className="mt-1 text-[11.5px] font-medium text-slate-200">{outputs}</p>
        <Link
          to={href}
          onClick={() => track("homepage_campaign_card_click", { template_id: String(entry.template.id ?? "") })}
          className="relative z-20 mt-3 flex h-9 w-full items-center justify-center gap-1.5 rounded-full bg-cyan-300 text-[11.5px] font-bold uppercase tracking-[0.14em] text-slate-950 transition-colors hover:bg-cyan-200"
        >
          Run campaign
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </article>
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
    <section id="new-today" className="container pb-10 pt-4 sm:pt-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[10.5px] font-bold uppercase tracking-[0.28em] text-cyan-200">Just dropped</p>
          <h2 className="mt-1.5 font-display text-xl font-semibold uppercase tracking-[0.04em] text-white sm:text-2xl">
            New drops
          </h2>
          <p className="mt-1.5 text-[12.5px] font-medium text-slate-300">
            The newest campaigns ready to run.
          </p>
        </div>
        <Link
          to="/app/templates"
          className="flex shrink-0 items-center gap-1 text-[11.5px] font-bold uppercase tracking-[0.16em] text-cyan-200 transition-colors hover:text-white"
        >
          View all
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
