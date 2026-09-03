/**
 * EXCLUSIVE CREATOR COLLABS — LIMITED-TIME DROPS.
 *
 * One section wired to the public `featured-drops` endpoint. Cards reuse the
 * existing template deep-link (`/app/templates?template=<name>`), so selecting
 * a drop opens the normal builder/run flow — no new run path is introduced.
 */

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { templateDetailPath } from "@/lib/templateSlug";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, ImageOff, Play, Timer, Video as VideoIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { track } from "@/lib/analytics/track";
import { campaignDisplayName } from "@/lib/campaignDisplayName";
import { fetchFeaturedDrop, type FeaturedDropTemplate } from "@/services/featuredDrops";


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
    <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-[hsl(var(--navy-mid)/0.5)] text-muted-foreground">
      {video ? (
        <VideoIcon className="h-6 w-6 text-[hsl(var(--electric-cyan)/0.6)]" />
      ) : (
        <ImageOff className="h-6 w-6" />
      )}
      <p className="font-mono text-[10px] uppercase tracking-[0.18em]">Preview unavailable</p>
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
      {state === "loading" ? <div className="absolute inset-0 fuse-skeleton" /> : null}
      {template.media_type === "video" ? (
        <video
          src={template.preview_url}
          className={cn(
            "h-full w-full object-cover object-center transition-transform duration-700 group-hover:scale-[1.03]",
            state === "loading" && "opacity-0",
          )}
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
          className={cn(
            "h-full w-full object-cover object-center transition-transform duration-700 group-hover:scale-[1.03]",
            state === "loading" && "opacity-0",
          )}
        />
      )}
      {/* Diagonal sheen so previews never read as flat black */}
      <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,hsl(var(--electric-blue)/0.16),transparent_42%,transparent_62%,hsl(var(--navy-deep)/0.72))]" />
      {template.media_type === "video" ? (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[hsl(var(--navy-deep)/0.65)] ring-1 ring-[hsl(var(--electric-cyan)/0.35)] backdrop-blur-sm">
            <Play className="h-4 w-4 translate-x-[1px] fill-foreground text-foreground" />
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
        <div className="rounded-[1.4rem] border border-[hsl(var(--electric-blue)/0.15)] bg-[hsl(var(--card)/0.7)] p-5">
          <div className="h-3 w-40 animate-pulse rounded bg-foreground/[0.08]" />
          <div className="mt-3 h-6 w-64 animate-pulse rounded bg-foreground/[0.08]" />
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((key) => (
              <div key={key} className="aspect-[4/5] rounded-[14px] fuse-skeleton" />
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
      <div className="relative overflow-hidden rounded-[1.4rem] border border-[hsl(var(--electric-blue)/0.18)] bg-[linear-gradient(180deg,hsl(var(--card)/0.92),hsl(var(--navy-deep)/0.72))] p-5 shadow-[0_28px_90px_-40px_hsl(var(--electric-blue)/0.35)] sm:p-7">
        {/* Dimensional backdrop: 1px grid + two soft radial glows */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.5]"
          style={{
            backgroundImage:
              "linear-gradient(hsl(var(--foreground)/0.035) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)/0.035) 1px, transparent 1px)",
            backgroundSize: "44px 44px, 44px 44px",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -left-24 -top-28 h-72 w-72 rounded-full bg-[radial-gradient(circle,hsl(var(--electric-blue)/0.16),transparent_70%)] blur-2xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-[radial-gradient(circle,hsl(var(--warm-gold)/0.04),transparent_70%)] blur-2xl"
        />

        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.32em] text-[hsl(var(--electric-cyan))]">
              Exclusive creator collabs
            </p>
            <h2 className="mt-2 text-2xl font-bold uppercase tracking-[0.05em] text-foreground sm:text-3xl">
              Limited-time drops
            </h2>

            <div className="mt-4 flex items-start gap-3">
              {creator.avatar_url ? (
                <img
                  src={creator.avatar_url}
                  alt={creator.name}
                  loading="lazy"
                  className="h-11 w-11 shrink-0 rounded-full border border-[hsl(var(--electric-blue)/0.35)] object-cover"
                />
              ) : (
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[hsl(var(--electric-blue)/0.28)] bg-foreground/[0.04] text-sm text-[hsl(var(--electric-cyan))]">
                  {creator.name.slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <p className="text-sm text-muted-foreground">
                  <span className="font-mono text-[10px] uppercase tracking-[0.22em]">This week</span>
                  <span className="mx-2 text-[hsl(var(--electric-blue)/0.5)]">/</span>
                  <span className="text-base font-semibold uppercase tracking-[0.06em] text-foreground [font-family:'Orbitron_Variable','Orbitron',system-ui]">
                    {creator.name}
                  </span>
                </p>
                {creator.blurb ? (
                  <p className="mt-1 max-w-xl text-xs leading-5 text-muted-foreground">{creator.blurb}</p>
                ) : null}
              </div>
            </div>
          </div>

          {windowLabel ? (
            <span className="inline-flex items-center gap-2 rounded-full border border-[hsl(var(--electric-blue)/0.35)] bg-[hsl(var(--navy-deep)/0.6)] px-3.5 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-[hsl(var(--electric-cyan))] shadow-[0_0_22px_-4px_hsl(var(--electric-blue)/0.5)] backdrop-blur">
              <Timer className="h-3.5 w-3.5" />
              {windowLabel}
            </span>
          ) : null}
        </div>

        <div className="relative mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {templates.map((template, index) => (
            <Link
              key={template.id}
              to={templateDetailPath({ name: template.name, id: template.id })}
              aria-label={`Run ${template.name}`}
              onClick={() =>
                track("homepage_campaign_card_click", {
                  template_id: String(template.id),
                  surface: "featured_creator_collab",
                })
              }
              className="group relative rounded-[14px] bg-[linear-gradient(140deg,hsl(var(--electric-blue)/0.55),hsl(var(--electric-cyan)/0.18)_38%,hsl(var(--border)/0.6))] p-[1px] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_18px_46px_-18px_hsl(var(--electric-blue)/0.55)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="overflow-hidden rounded-[13px] bg-[linear-gradient(180deg,hsl(var(--card)),hsl(var(--navy-deep)))]">
                <div className="relative aspect-[4/5] overflow-hidden">
                  <DropMedia template={template} />
                  <span
                    className={cn(
                      "absolute left-2.5 top-2.5 rounded-full border px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.2em] backdrop-blur",
                      index === 0
                        ? "border-[hsl(var(--warm-gold)/0.45)] bg-[hsl(var(--warm-gold)/0.14)] text-[hsl(var(--warm-gold))]"
                        : "border-[hsl(var(--electric-blue)/0.4)] bg-[hsl(var(--electric-blue)/0.14)] text-[hsl(var(--electric-cyan))]",
                    )}
                  >
                    {index === 0 ? creator.name : "Limited"}
                  </span>
                </div>
                <div className="space-y-1.5 p-3.5">
                  <p className="truncate text-[13px] font-bold uppercase tracking-[0.1em] text-foreground [font-family:'Orbitron_Variable','Orbitron',system-ui]">
                    {campaignDisplayName(template.name)}
                  </p>
                  {template.description ? (
                    <p className="line-clamp-2 text-[11px] leading-4 text-muted-foreground">
                      {template.description}
                    </p>
                  ) : null}
                  <span className="inline-flex items-center gap-1 pt-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--electric-cyan))]">
                    Run this drop
                    <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
