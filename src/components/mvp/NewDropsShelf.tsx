import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { formatCampaignOutputs } from "@/lib/campaignOutputs";
import type { Entry, TemplateMedia } from "@/lib/homeMediaAllocator";
import { track } from "@/lib/analytics/track";

/**
 * NEW DROPS — video-first shelf that flows straight out of the hero.
 * Compact 4:5 cards: moving preview + name + output counts + RUN CAMPAIGN.
 * Only real preview media is used; nothing is fabricated. Hidden when empty.
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

function DropCard({ entry, eager }: { entry: Entry; eager?: boolean }) {
  const name = String(entry.template.name ?? "");
  const href = runHref(name);
  const outputs = formatCampaignOutputs(
    entry.template.counts as { imageOutputs?: number | null; videoOutputs?: number | null } | undefined,
  );

  return (
    <article className="group relative w-[78vw] max-w-[320px] shrink-0 snap-start overflow-hidden rounded-[1.1rem] border border-white/12 bg-slate-950/80 transition-colors hover:border-cyan-200/40 sm:w-[260px]">
      <Link
        to={href}
        className="absolute inset-0 z-10"
        aria-label={`Run ${name}`}
        onClick={() => track("homepage_campaign_card_click", { template_id: String(entry.template.id ?? "") })}
      />
      <div className="relative aspect-[4/5] overflow-hidden bg-black">
        <AutoMedia media={entry.media} eager={eager} />
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

export default function NewDropsShelf({ entries }: { entries: Entry[] }) {
  /** Video-first: real moving previews lead, catalog order is the tiebreaker. */
  const ordered = useMemo(
    () =>
      entries
        .map((entry, index) => ({ entry, index }))
        .sort((a, b) => {
          const aVideo = a.entry.media.type === "video" ? 0 : 1;
          const bVideo = b.entry.media.type === "video" ? 0 : 1;
          return aVideo - bVideo || a.index - b.index;
        })
        .map((row) => row.entry)
        .slice(0, 8),
    [entries],
  );

  if (!ordered.length) return null;

  return (
    <section id="new-today" className="container pb-10 pt-4 sm:pt-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-xl font-semibold uppercase tracking-[0.04em] text-white sm:text-2xl">
          New drops
        </h2>
        <Link
          to="/app/templates"
          className="flex items-center gap-1 text-[11.5px] font-bold uppercase tracking-[0.16em] text-cyan-200 transition-colors hover:text-white"
        >
          View all
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="-mx-4 mt-4 flex snap-x snap-mandatory gap-3.5 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:-mx-6 sm:px-6">
        {ordered.map((entry, index) => (
          <DropCard key={`drop-${entry.template.id}-${index}`} entry={entry} eager={index < 4} />
        ))}
      </div>
    </section>
  );
}
