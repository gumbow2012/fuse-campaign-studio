import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Clapperboard, Gem, Layers3, Shirt, Sparkles, Upload, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import SiteShell from "@/components/mvp/SiteShell";
import PageMeta from "@/components/mvp/PageMeta";
import { useAuth } from "@/contexts/AuthContext";
import { fetchTemplates } from "@/services/fuseApi";
import { listPublicCreatorProfiles, type CreatorProfile } from "@/services/creatorProfile";
import { cn } from "@/lib/utils";
import {
  allocateHomeMedia,
  FALLBACK_GIFS,
  outputLabel,
  type Entry,
  type TemplateMedia,
} from "@/lib/homeMediaAllocator";
import {
  loadTemplatePerformance,
  type TemplatePerformanceMap,
  type TemplatePerformanceRow,
} from "@/services/templatePerformance";
import { PerformanceBlock, PerformanceDisclaimer } from "@/components/TemplatePerformance";


/* --------------------------------- pieces --------------------------------- */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-100">{children}</p>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mt-3 font-display text-3xl font-semibold uppercase tracking-[-0.02em] text-white sm:text-4xl">
      {children}
    </h2>
  );
}

/** Video plays when visible, pauses offscreen; hover on desktop, tap on mobile. */
function AutoMedia({
  media,
  className,
  eager,
  active = true,
  staggerIndex = 0,
}: {
  media: TemplateMedia;
  className?: string;
  eager?: boolean;
  active?: boolean;
  /** Deterministic playback offset so cards aren't mechanically synchronized. */
  staggerIndex?: number;
}) {
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
    if (visible && active) {
      void node.play().catch(() => undefined);
    } else {
      node.pause();
    }
  }, [visible, active]);

  if (media.type === "video") {
    return (
      <video
        ref={videoRef}
        src={media.url}
        className={className}
        muted
        loop
        playsInline
        preload="metadata"
        onLoadedMetadata={(event) => {
          const node = event.currentTarget;
          const offset = (staggerIndex % 5) * 0.6;
          if (Number.isFinite(node.duration) && node.duration > offset + 0.2) {
            try {
              node.currentTime = offset;
            } catch {
              /* seeking not supported yet — ignore */
            }
          }
        }}
        onMouseEnter={() => void videoRef.current?.play().catch(() => undefined)}
        onClick={() => {
          const node = videoRef.current;
          if (!node) return;
          if (node.paused) void node.play().catch(() => undefined);
          else node.pause();
        }}
      />
    );
  }

  return (
    <img
      src={media.url}
      alt=""
      className={className}
      loading={eager ? "eager" : "lazy"}
      draggable={false}
    />
  );
}

function Badge({ tone, children }: { tone: "new" | "trending" | "creator"; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] backdrop-blur",
        tone === "new" && "bg-emerald-300/90 text-slate-950",
        tone === "trending" && "bg-cyan-300/90 text-slate-950",
        tone === "creator" && "bg-white/15 text-white",
      )}
    >
      {children}
    </span>
  );
}

function TemplateCard({
  entry,
  badge,
  creator,
  eager,
  index = 0,
  performance,
}: {
  entry: Entry;
  badge?: { tone: "new" | "trending" | "creator"; label: string };
  creator?: string | null;
  eager?: boolean;
  index?: number;
  performance?: TemplatePerformanceRow;
}) {
  const outputs = outputLabel(entry.template);
  const vibe = entry.template.category ?? entry.template.tags?.[0] ?? null;

  return (
    <article className="group relative w-[248px] shrink-0 overflow-hidden rounded-[1.25rem] border border-white/10 bg-slate-950/80 transition-colors hover:border-cyan-200/40 sm:w-[272px]">
      <div className="relative aspect-[9/16] overflow-hidden bg-black">
        <AutoMedia
          media={entry.media}
          eager={eager}
          staggerIndex={index}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black via-black/70 to-transparent" />
        {badge && (
          <div className="absolute left-3 top-3">
            <Badge tone={badge.tone}>{badge.label}</Badge>
          </div>
        )}
      </div>
      <div className="absolute inset-x-0 bottom-0 p-4">
        {performance && <PerformanceBlock row={performance} compact className="mb-3" />}
        <p className="font-display text-sm font-semibold uppercase tracking-[0.08em] text-white">
          {entry.template.name}
        </p>
        <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-slate-400">
          {[vibe, outputs].filter(Boolean).join(" · ")}
        </p>
        {creator && <p className="mt-1 text-[10px] text-slate-400">by {creator}</p>}
        <Button
          asChild
          size="sm"
          className="mt-3 h-9 w-full rounded-full bg-cyan-300 text-[12px] font-semibold uppercase tracking-[0.14em] text-slate-950 hover:bg-cyan-200"
        >
          <Link to="/app/templates">Use Template</Link>
        </Button>
      </div>
    </article>
  );
}


function MediaShelf({ children }: { children: React.ReactNode }) {
  return (
    <div className="-mx-4 mt-6 overflow-x-auto px-4 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:-mx-6 sm:px-6">
      <div className="flex gap-4">{children}</div>
    </div>
  );
}

function Shelf({
  label,
  heading,
  entries,
  badge,
  id,
  perfMap,
  showDisclaimer,
}: {
  label: string;
  heading: string;
  entries: Entry[];
  badge?: { tone: "new" | "trending" | "creator"; label: string };
  id?: string;
  perfMap?: TemplatePerformanceMap;
  showDisclaimer?: boolean;
}) {
  if (!entries.length) return null;
  return (
    <section id={id} className="container border-t border-white/10 py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <SectionLabel>{label}</SectionLabel>
          <SectionHeading>{heading}</SectionHeading>
        </div>
        <Button asChild variant="ghost" className="rounded-full text-cyan-100 hover:text-white">
          <Link to="/app/templates">
            Browse all
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
      <MediaShelf>
        {entries.map((entry, index) => (
          <TemplateCard
            key={`${label}-${entry.template.id}-${index}`}
            entry={entry}
            badge={badge}
            index={index}
            eager={index < 2}
            performance={perfMap?.[String(entry.template.id ?? "")]}
          />
        ))}
      </MediaShelf>
      {showDisclaimer && <PerformanceDisclaimer className="mt-4" />}
    </section>
  );
}


/* ---------------------------------- page ---------------------------------- */

export default function HomePage() {
  const { isAdmin, isCreator } = useAuth();

  const { data: templates = [] } = useQuery({
    queryKey: ["mvp-templates"],
    queryFn: () => fetchTemplates(""),
    staleTime: 5 * 60 * 1000,
  });

  const { data: creators = [] } = useQuery({
    queryKey: ["home-public-creators"],
    queryFn: () => listPublicCreatorProfiles(6),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  // Single dedup allocator — every section draws from here.
  const allocation = useMemo(() => allocateHomeMedia(templates), [templates]);
  const { hero: heroPair, trending, newToday, creatorDrops, categories, mediaWall } = allocation;

  const original = heroPair[0] ?? null;
  const yourVersion = heroPair[1] ?? null;

  /** Every entry already claimed by the allocator — perf shelves reuse these only. */
  const allocatedEntries = useMemo(
    () => [
      ...heroPair,
      ...trending,
      ...newToday,
      ...creatorDrops,
      ...categories.flatMap((shelf) => shelf.entries),
    ],
    [heroPair, trending, newToday, creatorDrops, categories],
  );

  const performanceIds = useMemo(
    () => allocatedEntries.map((entry) => String(entry.template.id ?? "")).filter(Boolean),
    [allocatedEntries],
  );

  const { data: perfMap = {} as TemplatePerformanceMap } = useQuery({
    queryKey: ["home-template-performance", performanceIds.slice().sort().join(",")],
    queryFn: () => loadTemplatePerformance(performanceIds),
    enabled: performanceIds.length > 0,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const perfFor = (entry: Entry): TemplatePerformanceRow | undefined =>
    perfMap[String(entry.template.id ?? "")];

  const heroPerf = original ? perfFor(original) : undefined;

  const topRoas = useMemo(
    () =>
      allocatedEntries
        .filter((entry) => (perfMap[String(entry.template.id ?? "")]?.roas ?? null) !== null)
        .sort(
          (a, b) =>
            (perfMap[String(b.template.id ?? "")]?.roas ?? 0) -
            (perfMap[String(a.template.id ?? "")]?.roas ?? 0),
        )
        .slice(0, 8),
    [allocatedEntries, perfMap],
  );

  const mostTested = useMemo(
    () =>
      allocatedEntries
        .filter((entry) => (perfMap[String(entry.template.id ?? "")]?.spend ?? null) !== null)
        .sort(
          (a, b) =>
            (perfMap[String(b.template.id ?? "")]?.spend ?? 0) -
            (perfMap[String(a.template.id ?? "")]?.spend ?? 0),
        )
        .slice(0, 8),
    [allocatedEntries, perfMap],
  );


  useEffect(() => {
    if (!import.meta.env.DEV) return;
    // eslint-disable-next-line no-console
    console.info("[FUSE home media manifest]", {
      ...allocation.manifest.sections,
      duplicates: allocation.manifest.duplicates,
      uniqueTemplates: allocation.manifest.totalUnique,
    });
  }, [allocation]);


  return (
    <SiteShell>
      <PageMeta
        title="FUSE — Campaign Templates That Are Already Built"
        description="Pick creative that's already working, add your brand, and FUSE rebuilds the whole campaign for you. No prompts, no creative calls."
        path="/"
      />

      {/* 1 · TEMPLATE-FIRST HERO */}
      <section className="relative overflow-hidden border-b border-white/10">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at 18% 15%, rgba(34,211,238,0.18) 0%, transparent 55%), radial-gradient(circle at 85% 8%, rgba(59,130,246,0.14) 0%, transparent 50%)",
          }}
        />

        <div className="container relative grid gap-10 py-12 md:py-16 lg:grid-cols-[1fr_0.9fr] lg:items-center">
          <div>
            <SectionLabel>Campaign template marketplace</SectionLabel>
            <h1 className="mt-4 font-display text-4xl font-bold uppercase leading-[1.03] tracking-[-0.02em] text-white sm:text-6xl">
              The campaign is
              <br />
              <span className="text-cyan-200">already built.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-8 text-slate-300">
              Pick creative that&rsquo;s already working. Add your brand. FUSE does the rest.
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Button
                asChild
                size="lg"
                className="rounded-full bg-cyan-300 px-8 font-semibold text-slate-950 hover:bg-cyan-200"
              >
                <Link to="/app/templates">
                  Explore Templates
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="rounded-full border-white/15 bg-white/5 px-7 text-foreground hover:bg-white/10"
              >
                <Link to="/creators">Become a Creator</Link>
              </Button>
              {isCreator && (
                <>
                  <Button
                    asChild
                    size="lg"
                    variant="ghost"
                    className="rounded-full px-5 text-slate-300 hover:text-white"
                  >
                    <Link to="/app/lab/canvas">Create a Template</Link>
                  </Button>
                  <Button
                    asChild
                    size="lg"
                    variant="ghost"
                    className="rounded-full px-5 text-slate-300 hover:text-white"
                  >
                    <Link to="/app/creator">Creator Dashboard</Link>
                  </Button>
                </>
              )}
              {isAdmin && (
                <Button
                  asChild
                  size="sm"
                  variant="ghost"
                  className="rounded-full px-4 text-xs text-slate-400 hover:text-white"
                >
                  <Link to="/admin">Admin</Link>
                </Button>
              )}
            </div>

            <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">
              No prompts · New templates daily · Performance tracked
            </p>

          </div>

          {/* Hero transformation — TEMPLATE → your brand → YOUR CAMPAIGN */}
          <div className="relative">
            {original ? (
              <div>
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                  <HeroTile label="Template" media={original.media} eager />
                  <div className="w-[92px] sm:w-[104px]">
                    <div
                      className="relative overflow-hidden rounded-xl border border-cyan-300/25 bg-slate-950/80 px-3 py-4 text-center"
                      style={{
                        backgroundImage:
                          "linear-gradient(rgba(148,163,184,0.10) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.10) 1px, transparent 1px)",
                        backgroundSize: "14px 14px",
                      }}
                    >
                      <p className="font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-white">
                        Your brand
                      </p>
                      <p className="mt-1 text-[8px] uppercase tracking-[0.16em] text-slate-400">
                        garment + logo + cast
                      </p>
                      <p className="mt-3 text-[9px] font-semibold uppercase tracking-[0.2em] text-cyan-200">
                        + Product
                      </p>
                    </div>
                    <p className="mt-2 text-center text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      →
                    </p>
                  </div>
                  <HeroTile
                    label="Your campaign"
                    highlight
                    media={yourVersion?.media ?? original.media}
                  />
                </div>

                <div className="mx-auto mt-4 max-w-[420px] space-y-2 text-center">
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <p className="font-display text-sm font-semibold uppercase tracking-[0.1em] text-white">
                      {original.template.name}
                    </p>
                    {outputLabel(original.template) && (
                      <span className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
                        · {outputLabel(original.template)}
                      </span>
                    )}
                  </div>
                  {heroPerf && (
                    <PerformanceBlock row={heroPerf} compact className="text-left" />
                  )}
                  <Button
                    asChild
                    size="sm"
                    className="h-9 rounded-full bg-cyan-300 px-5 text-[12px] font-semibold uppercase tracking-[0.14em] text-slate-950 hover:bg-cyan-200"
                  >
                    <Link to="/app/templates">Use this template</Link>
                  </Button>
                  {heroPerf && <PerformanceDisclaimer />}
                </div>
              </div>
            ) : (
              <div className="overflow-hidden rounded-[1.5rem] border border-white/10 bg-black">
                <img src={FALLBACK_GIFS[0]} alt="" className="aspect-[9/16] w-full object-cover" />
              </div>
            )}
          </div>


        </div>
      </section>

      {/* 2 · LIVE DROP */}
      {newToday.length > 0 && (
        <section className="border-b border-white/10 bg-white/[0.02]">
          <div className="container flex flex-wrap items-center justify-between gap-4 py-5">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300">
                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-300" />
                New drop live
              </span>
              <p className="font-display text-sm font-semibold uppercase tracking-[0.14em] text-white">
                Raw Street Vol. 01
                <span className="ml-3 text-[11px] font-medium tracking-[0.18em] text-slate-400">
                  {newToday.length} new campaign{newToday.length === 1 ? "" : "s"}
                </span>
              </p>
            </div>
            <Button asChild variant="ghost" className="rounded-full text-cyan-100 hover:text-white">
              <a href="#new-today">
                View drop
                <ArrowRight className="h-4 w-4" />
              </a>
            </Button>
          </div>
        </section>
      )}

      {/* 3 · SHELVES */}
      <Shelf
        label="Top ROAS"
        heading="Highest returning campaigns"
        entries={topRoas}
        perfMap={perfMap}
        showDisclaimer
      />
      <Shelf
        label="Most tested"
        heading="Proven on the most ad spend"
        entries={mostTested}
        perfMap={perfMap}
        showDisclaimer
      />
      <Shelf
        label="Trending now"
        heading="What brands are using right now"
        entries={trending}
        perfMap={perfMap}
        badge={{ tone: "trending", label: "Trending" }}
      />
      <Shelf
        id="new-today"
        label="New today"
        heading="Just added to the marketplace"
        entries={newToday}
        perfMap={perfMap}
        badge={{ tone: "new", label: "New" }}
      />

      {creators.length > 0 && (
        <Shelf
          label="Creator drops"
          heading="Built by FUSE creators"
          entries={creatorDrops}
        />
      )}
      {categories.map((shelf) => (
        <Shelf
          key={shelf.title}
          label={shelf.title}
          heading={`${shelf.title} campaigns`}
          entries={shelf.entries}
        />
      ))}

      {/* 4 · THREE STEPS */}
      <section className="container border-t border-white/10 py-12">
        <SectionLabel>Three steps</SectionLabel>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {[
            { n: "01", title: "Pick", copy: "Find a campaign you want.", icon: Layers3 },
            {
              n: "02",
              title: "Upload",
              copy: "Add your product, logo and optional cast.",
              icon: Upload,
            },
            { n: "03", title: "Generate", copy: "FUSE rebuilds it for your brand.", icon: Wand2 },
          ].map((step) => (
            <div
              key={step.n}
              className="rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-6"
            >
              <div className="flex items-center justify-between">
                <p className="font-display text-2xl font-bold text-cyan-200">{step.n}</p>
                <step.icon className="h-4 w-4 text-slate-400" />
              </div>
              <p className="mt-4 font-display text-xl font-semibold uppercase tracking-[0.04em] text-white">
                {step.title}
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-300">{step.copy}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 5 · CREATOR PROGRAM */}
      <section className="container border-t border-white/10 py-12">
        <div className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-6 md:p-10">
          <SectionLabel>Creator program</SectionLabel>
          <SectionHeading>Build it once. Let everyone use it.</SectionHeading>
          <p className="mt-3 font-display text-lg text-cyan-100">Your process can become a product.</p>
          <p className="mt-4 max-w-3xl text-base leading-7 text-slate-300">
            Creators take the campaigns they already make — the looks, the angles, the sequencing —
            and publish them as FUSE templates. Brands add their own assets, FUSE handles the rest,
            and the creator keeps earning every time their template gets used.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-2">
            {["Create", "Publish", "Brands use it", "Earn", "Create more"].map((step, index) => (
              <div key={step} className="flex items-center gap-2">
                <span className="rounded-full border border-cyan-200/25 bg-cyan-300/[0.08] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-50">
                  {step}
                </span>
                {index < 4 && <ArrowRight className="h-3.5 w-3.5 text-slate-500" />}
              </div>
            ))}
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <Button
              asChild
              size="lg"
              className="rounded-full bg-cyan-300 px-8 font-semibold text-slate-950 hover:bg-cyan-200"
            >
              <Link to="/creators">
                Become a Creator
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            {isCreator && (
              <Button
                asChild
                size="lg"
                variant="outline"
                className="rounded-full border-white/15 bg-white/5 px-7 text-foreground hover:bg-white/10"
              >
                <Link to="/app/creator">Creator Dashboard</Link>
              </Button>
            )}
          </div>

          {creators.length > 0 && (
            <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {creators.map((creator: CreatorProfile) => (
                <Link
                  key={creator.id}
                  to={`/creator/${creator.handle}`}
                  className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-4 transition-colors hover:border-cyan-200/30"
                >
                  {creator.avatar_url ? (
                    <img
                      src={creator.avatar_url}
                      alt=""
                      loading="lazy"
                      className="h-12 w-12 rounded-full border border-white/15 object-cover"
                    />
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-white/5 text-sm text-slate-300">
                      {creator.display_name.slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="truncate font-display text-sm font-semibold uppercase tracking-[0.06em] text-white">
                      {creator.display_name}
                    </p>
                    <p className="truncate text-xs text-slate-400">@{creator.handle}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* 6 · MADE WITH FUSE */}
      {mediaWall.length > 0 && (
        <section className="container border-t border-white/10 py-12">
          <SectionLabel>Made with FUSE</SectionLabel>
          <SectionHeading>This is what brands are making without starting from scratch.</SectionHeading>
          <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {mediaWall.map((src) => (
              <img
                key={src}
                src={src}
                alt="Campaign asset made with a FUSE template"
                loading="lazy"
                className="aspect-[9/16] w-full rounded-xl border border-white/10 object-cover"
              />
            ))}
          </div>
        </section>
      )}

      {/* 7 · ADVANCED TOOLS (demoted) */}
      <section className="container border-t border-white/10 py-12">
        <SectionLabel>Advanced tools</SectionLabel>
        <h3 className="mt-3 font-display text-2xl font-semibold uppercase tracking-[-0.01em] text-white">
          Want to go off-template?
        </h3>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
          Advanced FUSE tools give you deeper control when you need it.
        </p>
        <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Image", to: "/app/lab/studio", icon: Sparkles },
            { label: "Cinema", to: "/app/lab/cinema", icon: Clapperboard },
            { label: "Outfit", to: "/app/lab/outfit-swap", icon: Shirt },
            { label: "Jewelry", to: "/app/lab/jewelry-swap", icon: Gem },
          ].map((tool) => (
            <Link
              key={tool.label}
              to={tool.to}
              className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-slate-300 transition-colors hover:border-white/25 hover:text-white"
            >
              <tool.icon className="h-4 w-4 text-slate-500" />
              {tool.label}
            </Link>
          ))}
        </div>
      </section>

      {/* 8 · FINAL CTA */}
      <section className="container pb-16">
        <div className="rounded-[2rem] border border-cyan-300/20 bg-cyan-300/[0.08] p-8 text-center md:p-12">
          <h2 className="font-display text-3xl font-semibold uppercase tracking-[-0.02em] text-white sm:text-4xl">
            Find something fire. Make it yours.
          </h2>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Button
              asChild
              size="lg"
              className="rounded-full bg-cyan-300 px-8 font-semibold text-slate-950 hover:bg-cyan-200"
            >
              <Link to="/app/templates">
                Explore Templates
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="rounded-full border-white/15 bg-white/5 px-7 text-foreground hover:bg-white/10"
            >
              <Link to="/creators">Build for FUSE</Link>
            </Button>
          </div>
        </div>
      </section>
    </SiteShell>
  );
}

function HeroTile({
  label,
  media,
  highlight,
  eager,
}: {
  label: string;
  media: TemplateMedia;
  highlight?: boolean;
  eager?: boolean;
}) {
  return (
    <div>
      <div
        className={cn(
          "overflow-hidden rounded-[1.25rem] border bg-black",
          highlight ? "border-cyan-200/40" : "border-white/10",
        )}
      >
        <div className="aspect-[9/16]">
          <AutoMedia media={media} eager={eager} className="h-full w-full object-cover" />
        </div>
      </div>
      <p className="mt-2 text-center text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </p>
    </div>
  );
}
