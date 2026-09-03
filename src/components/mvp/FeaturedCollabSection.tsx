/**
 * EXCLUSIVE CREATOR COLLABS — LIMITED-TIME DROPS.
 *
 * One section wired to the public `featured-drops` endpoint. Cards reuse the
 * existing template deep-link (`/app/templates?template=<name>`), so selecting
 * a drop opens the normal builder/run flow — no new run path is introduced.
 */

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, ImageOff, Play, Timer, Video as VideoIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { track } from "@/lib/analytics/track";
import { campaignDisplayName } from "@/lib/campaignDisplayName";
import { fetchFeaturedDrop, type FeaturedDropTemplate } from "@/services/featuredDrops";

function runHref(name: string) {
  return name ? `/app/templates?template=${encodeURIComponent(name)}` : "/app/templates";
}

/** Countdown while the drop is within 10 days, otherwise a plain end date. */
function useDropWindow(endsAt: string | null) {
  const endTime = endsAt ? new Date(endsAt).getTime() : Number.NaN;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (Number.isNaN(endTime)) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [endTime]);

  return useMemo(() => {
    if (Number.isNaN(endTime)) return null;
    const remaining = endTime - now;
    if (remaining <= 0) return "Drop window closed";

    const days = Math.floor(remaining / 86_400_000);
    if (days >= 10) {
      return `Available through ${new Date(endTime).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      })}`;
    }
    const hours = Math.floor((remaining % 86_400_000) / 3_600_000);
    const minutes = Math.floor((remaining % 3_600_000) / 60_000);
    const seconds = Math.floor((remaining % 60_000) / 1000);
    const pad = (value: number) => String(value).padStart(2, "0");
    return days > 0
      ? `${days}d ${pad(hours)}h ${pad(minutes)}m left`
      : `${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s left`;
  }, [endTime, now]);
}

function Placeholder({ video }: { video?: boolean }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-white/[0.03] text-slate-500">
      {video ? <VideoIcon className="h-6 w-6 text-cyan-100/60" /> : <ImageOff className="h-6 w-6" />}
      <p className="text-[10px] uppercase tracking-[0.18em]">Preview unavailable</p>
    </div>
  );
}

/** Poster-only media: videos show a first frame + play badge, never autoplay. */
function DropMedia({ template }: { template: FeaturedDropTemplate }) {
  const [state, setState] = useState<"loading" | "ready" | "error">(
    template.preview_url ? "loading" : "error",
  );

  if (!template.preview_url || state === "error") {
    return <Placeholder video={template.media_type === "video"} />;
  }

  return (
    <>
      {state === "loading" ? <div className="absolute inset-0 animate-pulse bg-white/[0.06]" /> : null}
      {template.media_type === "video" ? (
        <video
          src={template.preview_url}
          className={cn("h-full w-full object-cover", state === "loading" && "opacity-0")}
          muted
          playsInline
          preload="metadata"
          onLoadedData={() => setState("ready")}
          onError={() => setState("error")}
        />
      ) : (
        <img
          src={template.preview_url}
          alt={`${template.name} campaign preview`}
          loading="lazy"
          decoding="async"
          onLoad={() => setState("ready")}
          onError={() => setState("error")}
          className={cn("h-full w-full object-cover", state === "loading" && "opacity-0")}
        />
      )}
      {template.media_type === "video" ? (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/60 ring-1 ring-white/25">
            <Play className="h-4 w-4 translate-x-[1px] fill-white text-white" />
          </span>
        </span>
      ) : null}
    </>
  );
}

export default function FeaturedCollabSection() {
  const { data: featured, isLoading } = useQuery({
    queryKey: ["featured-drops"],
    queryFn: fetchFeaturedDrop,
    // Signed previews live ~1h — refresh comfortably inside that window.
    staleTime: 20 * 60 * 1000,
    gcTime: 20 * 60 * 1000,
    retry: false,
  });

  const windowLabel = useDropWindow(featured?.creator.ends_at ?? null);

  if (isLoading) {
    return (
      <section className="container pb-8 pt-2">
        <div className="rounded-[1.4rem] border border-cyan-200/15 bg-[#0B1120]/70 p-5">
          <div className="h-3 w-40 animate-pulse rounded bg-white/[0.08]" />
          <div className="mt-3 h-6 w-64 animate-pulse rounded bg-white/[0.08]" />
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((key) => (
              <div key={key} className="aspect-[4/5] animate-pulse rounded-[1.1rem] bg-white/[0.05]" />
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (!featured) return null;

  const { creator, templates } = featured;

  return (
    <section className="container pb-8 pt-2">
      <div className="overflow-hidden rounded-[1.4rem] border border-cyan-200/20 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.14),transparent_46%),linear-gradient(180deg,rgba(11,17,32,0.92),rgba(11,17,32,0.6))] p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-cyan-200">
              Exclusive creator collabs
            </p>
            <h2 className="mt-1.5 font-display text-2xl font-bold uppercase tracking-[0.04em] text-white sm:text-3xl">
              Limited-time drops
            </h2>

            <div className="mt-3 flex items-start gap-3">
              {creator.avatar_url ? (
                <img
                  src={creator.avatar_url}
                  alt={creator.name}
                  loading="lazy"
                  className="h-11 w-11 shrink-0 rounded-full border border-cyan-200/30 object-cover"
                />
              ) : (
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-cyan-200/25 bg-white/[0.04] font-display text-sm text-cyan-100">
                  {creator.name.slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white">
                  This week: <span className="text-cyan-100">{creator.name}</span>
                </p>
                {creator.blurb ? (
                  <p className="mt-0.5 max-w-xl text-xs leading-5 text-slate-300">{creator.blurb}</p>
                ) : null}
              </div>
            </div>
          </div>

          {windowLabel ? (
            <span className="inline-flex items-center gap-2 rounded-full border border-cyan-200/25 bg-black/40 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-100">
              <Timer className="h-3.5 w-3.5" />
              {windowLabel}
            </span>
          ) : null}
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {templates.map((template) => (
            <Link
              key={template.id}
              to={runHref(template.name)}
              aria-label={`Run ${template.name}`}
              onClick={() =>
                track("homepage_campaign_card_click", {
                  template_id: String(template.id),
                  surface: "featured_creator_collab",
                })
              }
              className="group overflow-hidden rounded-[1.1rem] border border-white/12 bg-black transition-colors hover:border-cyan-200/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
            >
              <div className="relative aspect-[4/5] overflow-hidden bg-black">
                <DropMedia template={template} />
              </div>
              <div className="space-y-1 p-3">
                <p className="truncate font-display text-[13px] font-bold uppercase tracking-[0.1em] text-white">
                  {campaignDisplayName(template.name)}
                </p>
                {template.description ? (
                  <p className="line-clamp-2 text-[11px] leading-4 text-slate-400">
                    {template.description}
                  </p>
                ) : null}
                <span className="inline-flex items-center gap-1 pt-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-100">
                  Run this drop
                  <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
