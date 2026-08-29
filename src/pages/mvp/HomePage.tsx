import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Clapperboard, Gem, Shirt, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import SiteShell from "@/components/mvp/SiteShell";
import PageMeta from "@/components/mvp/PageMeta";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/BrandContext";
import { fetchTemplates, type ApiTemplate } from "@/services/fuseApi";
import CreatorVerificationBadge from "@/components/CreatorVerificationBadge";
import AddToCollectionButton from "@/components/collections/AddToCollectionButton";
import { listFollowedCreatorIds } from "@/services/creatorFollows";
import { listPublicCreatorProfiles, type CreatorProfile } from "@/services/creatorProfile";
import { listProductProfiles, type ProductProfileType } from "@/services/productProfiles";
import { readVisualStyle } from "@/services/brandProfiles";
import { rankTemplatesForBrand } from "@/lib/brandRelevance";
import { cn } from "@/lib/utils";
import {
  allocateHomeMedia,
  FALLBACK_GIFS,
  outputLabel,
  resolveMedia,
  type Entry,
  type TemplateMedia,
} from "@/lib/homeMediaAllocator";
import {
  loadTemplatePerformance,
  type TemplatePerformanceMap,
  type TemplatePerformanceRow,
} from "@/services/templatePerformance";
import { PerformanceBlock, PerformanceDisclaimer } from "@/components/TemplatePerformance";
import HeroCampaignTiles from "@/components/mvp/HeroCampaignTiles";
import HeroWorkflowAnimation from "@/components/mvp/HeroWorkflowAnimation";
import NewDropsShelf from "@/components/mvp/NewDropsShelf";

import { track } from "@/lib/analytics/track";



/* --------------------------------- pieces --------------------------------- */

/**
 * CONVERSION: deep-link straight into the campaign builder for one template.
 * `/app/templates?template=<id>` is the builder's supported deep link (the
 * `/app/templates/run` path is a query-dropping redirect in App.tsx).
 * Falls back to the plain gallery when no template id is known.
 */
function builderHref(templateId?: string | null) {
  const id = templateId ? String(templateId) : "";
  return id ? `/app/templates?template=${encodeURIComponent(id)}` : "/app/templates";
}


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

/** "by @handle" attribution — omitted when the author has no public profile. */
function CreatorAttribution({ template }: { template: ApiTemplate }) {
  const creator = template.creator;
  if (!creator?.handle) return null;
  return (
    <p className="mt-1 flex items-center gap-1 text-[10px] text-slate-400">
      <span>by</span>
      <Link
        to={`/creator/${creator.handle}`}
        className="text-cyan-100 transition-colors hover:text-white"
        onClick={(event) => event.stopPropagation()}
      >
        @{creator.handle}
      </Link>
      <CreatorVerificationBadge status={creator.verificationStatus} size={10} />
    </p>
  );
}

function TemplateCard({
  entry,
  badge,
  creator,
  eager,
  index = 0,
  performance,
  runs,
}: {
  entry: Entry;
  badge?: { tone: "new" | "trending" | "creator"; label: string };
  creator?: string | null;
  eager?: boolean;
  index?: number;
  performance?: TemplatePerformanceRow;
  /** Real run count from public_template_popularity — omitted when unavailable. */
  runs?: number | null;
}) {
  const outputs = outputLabel(entry.template);
  const vibe = entry.template.category ?? entry.template.tags?.[0] ?? null;
  const templateId = String(entry.template.id ?? "");
  const templateHref = builderHref(templateId);


  return (
    <article className="group relative w-[248px] shrink-0 overflow-hidden rounded-[1.25rem] border border-white/10 bg-slate-950/80 transition-colors hover:border-cyan-200/40 sm:w-[272px]">
      <Link
        to={templateHref}
        onClick={() => track("homepage_campaign_card_click", { template_id: templateId })}
        className="absolute inset-0 z-10"
        aria-label={`Open ${entry.template.name}`}
      />
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
        <div className="absolute right-3 top-3 z-20">
          <AddToCollectionButton templateId={templateId} />
        </div>
      </div>
      <div className="absolute inset-x-0 bottom-0 p-4">
        {performance && <PerformanceBlock row={performance} compact className="mb-3" />}
        <p className="font-display text-sm font-semibold uppercase tracking-[0.08em] text-white">
          {entry.template.name}
        </p>
        <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-slate-400">
          {[vibe, outputs].filter(Boolean).join(" · ")}
        </p>
        {/* Real popularity only — nothing is rendered when the RPC has no row. */}
        {typeof runs === "number" && runs > 0 && (
          <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-100">
            {runs.toLocaleString()} run{runs === 1 ? "" : "s"}
          </p>
        )}
        {creator ? (
          <p className="mt-1 text-[10px] text-slate-400">by {creator}</p>
        ) : (
          <CreatorAttribution template={entry.template} />
        )}
        <Button
          asChild
          size="sm"
          className="relative z-20 mt-3 h-9 w-full rounded-full bg-cyan-300 text-[12px] font-semibold uppercase tracking-[0.14em] text-slate-950 hover:bg-cyan-200"
        >
          <Link to={templateHref} onClick={() => track("homepage_campaign_card_click", { template_id: templateId })}>
            Unlock this template →
          </Link>
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
  description,
  entries,
  badge,
  id,
  perfMap,
  runsMap,
  showDisclaimer,
}: {
  label: string;
  heading: string;
  description?: string;
  entries: Entry[];
  badge?: { tone: "new" | "trending" | "creator"; label: string };
  id?: string;
  perfMap?: TemplatePerformanceMap;
  /** templateId → real run count. Missing ids simply render no count. */
  runsMap?: Record<string, number>;
  showDisclaimer?: boolean;
}) {
  if (!entries.length) return null;
  return (
    <section id={id} className="container border-t border-white/10 py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <SectionLabel>{label}</SectionLabel>
          <SectionHeading>{heading}</SectionHeading>
          {description ? (
            <p className="mt-3 max-w-xl text-sm leading-6 text-slate-400">{description}</p>
          ) : null}
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
            runs={runsMap?.[String(entry.template.id ?? "")] ?? null}
          />
        ))}
      </MediaShelf>
      {showDisclaimer && <PerformanceDisclaimer className="mt-4" />}
    </section>
  );
}



/** Shape returned by the public `get_marketplace_shelves()` RPC. */
type MerchandisedShelf = {
  id?: string;
  slug?: string;
  title?: string;
  subtitle?: string | null;
  sort_order?: number;
  is_visible?: boolean;
  is_algorithmic?: boolean;
  templates?: { template_id?: string; name?: string; pinned?: boolean; sort_order?: number }[] | null;
};

/* ---------------------------------- page ---------------------------------- */


export default function HomePage() {
  const { user, isCreator, isAdmin } = useAuth();

  const { data: templates = [], isLoading: templatesLoading } = useQuery({
    queryKey: ["mvp-templates"],
    queryFn: () => fetchTemplates(""),
    staleTime: 5 * 60 * 1000,
  });

  const { data: followedCreatorIds = [] } = useQuery({
    queryKey: ["home-followed-creators"],
    queryFn: listFollowedCreatorIds,
    enabled: !!user,
    staleTime: 60 * 1000,
    retry: false,
  });

  const { data: creators = [] } = useQuery({
    queryKey: ["home-public-creators"],
    queryFn: () => listPublicCreatorProfiles(6),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  /**
   * REAL popularity only. `public_template_popularity` is a public RPC over the
   * last 90 days of runs; if it errors or has no row for a template, the count is
   * simply absent — never estimated, never faked.
   */
  const { data: popularity = {} as Record<string, number> } = useQuery({
    queryKey: ["public-template-popularity", 90],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("public_template_popularity" as never, { days: 90 } as never);
      if (error) return {} as Record<string, number>;
      const map: Record<string, number> = {};
      for (const row of (data ?? []) as { template_id?: string; runs?: number }[]) {
        if (row?.template_id) map[String(row.template_id)] = Number(row.runs ?? 0);
      }
      return map;
    },
    staleTime: 10 * 60 * 1000,
    retry: false,
  });

  /**
   * MERCHANDISING — admin-curated shelves (`/admin/templates/merchandising`).
   * `get_marketplace_shelves()` is public and returns visible shelves in
   * sort_order with their templates in the exact admin order. Failures fall
   * back to the existing popularity-driven homepage.
   */
  const { data: merchShelves = [] as MerchandisedShelf[] } = useQuery({
    queryKey: ["home-marketplace-shelves"],
    queryFn: async (): Promise<MerchandisedShelf[]> => {
      const { data, error } = await supabase.rpc("get_marketplace_shelves" as never);
      if (error) return [];
      return ((data ?? []) as unknown as MerchandisedShelf[]).filter(Boolean);
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  // Single dedup allocator — every section draws from here.
  const allocation = useMemo(() => allocateHomeMedia(templates), [templates]);
  const { hero: heroPair, trending, newToday, creatorDrops, categories, mediaWall } = allocation;

  /**
   * Curated editorial shelves, joined to the loaded template objects so cards
   * render with today's media/vibe. Algorithmic shelves keep their auto
   * behavior and are excluded here. Empty shelves are dropped.
   */
  const curatedShelves = useMemo(() => {
    if (!templates.length || !merchShelves.length) return [];
    const byId = new Map(templates.map((template) => [String(template.id ?? ""), template]));
    return merchShelves
      .filter((shelf) => shelf && shelf.is_algorithmic !== true && shelf.is_visible !== false)
      .map((shelf) => {
        const entries = (shelf.templates ?? [])
          .map((row) => {
            const template = byId.get(String(row?.template_id ?? ""));
            if (!template) return null;
            const media = resolveMedia(template);
            return media ? ({ template, media } as Entry) : null;
          })
          .filter(Boolean as unknown as (value: Entry | null) => value is Entry);
        return {
          id: String(shelf.id ?? shelf.slug ?? ""),
          slug: String(shelf.slug ?? ""),
          title: String(shelf.title ?? shelf.slug ?? "Featured"),
          subtitle: typeof shelf.subtitle === "string" && shelf.subtitle.trim() ? shelf.subtitle : undefined,
          entries,
        };
      })
      .filter((shelf) => shelf.entries.length > 0);
  }, [merchShelves, templates]);

  /** TRENDING — ordered by real run counts; catalog order is the tiebreaker. */
  const trendingRanked = useMemo(() => {
    const runsOf = (entry: Entry) => popularity[String(entry.template.id ?? "")] ?? 0;
    return trending
      .map((entry, index) => ({ entry, index }))
      .sort((a, b) => runsOf(b.entry) - runsOf(a.entry) || a.index - b.index)
      .map((row) => row.entry);
  }, [trending, popularity]);
  /**
   * Hero primary CTA target: the first template of the top curated shelf when
   * merchandising is configured, else the top-ranked real trending template,
   * else the hero template. Works logged-out (the builder is public).
   */
  const startCampaignHref = useMemo(() => {
    const top =
      curatedShelves[0]?.entries[0]?.template.id ??
      trendingRanked[0]?.template.id ??
      heroPair[0]?.template.id ??
      null;
    return builderHref(top);
  }, [curatedShelves, trendingRanked, heroPair]);


  /**
   * NEW DROPS fill — other eligible LIVE campaigns (valid preview media only)
   * used to reach the right edge of the rail. Never badged as new; timestamps
   * and merchandising are untouched.
   */
  const newDropsFill = useMemo<Entry[]>(() => {
    const claimed = new Set(newToday.map((entry) => String(entry.template.id ?? "")));
    return templates
      .filter((template) => !claimed.has(String(template.id ?? "")))
      .map((template) => {
        const media = resolveMedia(template);
        return media ? ({ template, media } as Entry) : null;
      })
      .filter(Boolean as unknown as (value: Entry | null) => value is Entry)
      .slice(0, 14);
  }, [templates, newToday]);

  /** Hero is pinned to two specific templates; fall back to the allocator. */

  const pinnedHero = useMemo(() => {
    const findByName = (name: string): Entry | null => {
      const template = templates.find(
        (candidate) => String(candidate.name ?? "").trim().toLowerCase() === name,
      );
      if (!template) return null;
      const media = resolveMedia(template);
      return media ? ({ template, media } as Entry) : null;
    };
    return { left: findByName("grillzzzz"), right: findByName("studio") };
  }, [templates]);

  const original = pinnedHero.left ?? heroPair[0] ?? null;
  const yourVersion = pinnedHero.right ?? heroPair[1] ?? null;

  /**
   * Desktop hero story preview — one real, live campaign asset. Preference
   * order only; falls back to the allocator so it is never empty-by-name.
   */
  const heroStoryPreview = useMemo<Entry | null>(() => {
    const find = (needle: string): Entry | null => {
      const template = templates.find((candidate) =>
        String(candidate.name ?? "").trim().toLowerCase().includes(needle),
      );
      if (!template) return null;
      const media = resolveMedia(template);
      return media ? ({ template, media } as Entry) : null;
    };
    for (const needle of ["grillzzzz", "grillz", "broken planet", "spider man", "airport"]) {
      const match = find(needle);
      if (match) return match;
    }
    return pinnedHero.left ?? heroPair[0] ?? null;
  }, [templates, pinnedHero.left, heroPair]);




  /** Every entry already claimed by the allocator — perf shelves reuse these only. */
  /** Hero strip: pinned to four campaigns, falling back to allocator entries. */
  const heroTiles = useMemo<Entry[]>(() => {
    const pool: Entry[] = [];
    const seenPool = new Set<string>();
    for (const entry of [...newToday, ...trending, ...creatorDrops, ...categories.flatMap((shelf) => shelf.entries)]) {
      const key = String(entry.template.id ?? entry.template.name ?? "").trim().toLowerCase();
      if (!key || seenPool.has(key)) continue;
      seenPool.add(key);
      pool.push(entry);
    }

    const findByName = (needle: string): Entry | null => {
      const template = templates.find((candidate) => {
        const name = String(candidate.name ?? "").trim().toLowerCase();
        return name === needle || name.includes(needle);
      });
      if (!template) return null;
      const media = resolveMedia(template);
      return media ? ({ template, media } as Entry) : null;
    };

    const pinned = ["airport tray", "warehouse", "spider man", "grillzzzz"];
    const rows: Entry[] = [];
    const used = new Set<string>();
    const keyOf = (entry: Entry) =>
      String(entry.template.id ?? entry.template.name ?? "").trim().toLowerCase();

    for (const needle of pinned) {
      const match = findByName(needle);
      const chosen = match && !used.has(keyOf(match))
        ? match
        : pool.find((entry) => !used.has(keyOf(entry))) ?? null;
      if (!chosen) continue;
      used.add(keyOf(chosen));
      rows.push(chosen);
    }
    return rows;
  }, [templates, newToday, trending, creatorDrops, categories]);


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

  /** Templates authored by creators the signed-in viewer follows. */
  const followedEntries = useMemo<Entry[]>(() => {
    if (!user || !followedCreatorIds.length) return [];
    const followed = new Set(followedCreatorIds);
    return templates
      .filter((template) => template.creator?.userId && followed.has(template.creator.userId))
      .map((template) => {
        const media = resolveMedia(template);
        return media ? { template, media } : null;
      })
      .filter(Boolean as unknown as (value: Entry | null) => value is Entry)
      .slice(0, 12);
  }, [templates, followedCreatorIds, user]);

  /* ---------------------- brand personalization (additive) ---------------------- */

  const { activeBrand, activeBrandId } = useBrand();

  const { data: brandProducts = [] } = useQuery({
    queryKey: ["home-brand-products", user?.id ?? "", activeBrandId ?? ""],
    queryFn: () => listProductProfiles(user?.id ?? ""),
    enabled: !!user && !!activeBrandId,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  /** Real, saved signals only: this brand's product types + its visual-style tags. */
  const brandSignals = useMemo(() => {
    const productTypes = Array.from(
      new Set(
        brandProducts
          .filter((product) => product.brand_id && product.brand_id === activeBrandId)
          .map((product) => product.type),
      ),
    ) as ProductProfileType[];
    const styleTags = readVisualStyle(activeBrand)?.tags ?? [];
    return { productTypes, styleTags };
  }, [brandProducts, activeBrandId, activeBrand]);

  /** Empty when nothing genuinely matches — the shelf is then never rendered. */
  const recommended = useMemo(() => {
    if (!activeBrand) return [];
    return rankTemplatesForBrand(templates, brandSignals, 6)
      .map((row) => {
        const media = resolveMedia(row.template);
        return media ? { entry: { template: row.template, media } as Entry, reasons: row.reasons } : null;
      })
      .filter(Boolean as unknown as (value: { entry: Entry; reasons: string[] } | null) => value is {
        entry: Entry;
        reasons: string[];
      });
  }, [activeBrand, templates, brandSignals]);

  const [brandNudgeDismissed, setBrandNudgeDismissed] = useState(
    () => typeof window !== "undefined" && window.localStorage.getItem("fuse.brandNudge") === "off",
  );
  const dismissBrandNudge = () => {
    setBrandNudgeDismissed(true);
    try {
      window.localStorage.setItem("fuse.brandNudge", "off");
    } catch {
      /* storage unavailable — dismissal stays session-only */
    }
  };
  const showBrandNudge = !!user && !activeBrand && !brandNudgeDismissed;



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

        {/* MOBILE / TABLET (<lg) — stacked hero: headline, copy, graph, tiles, CTA. */}
        <div className="container relative py-7 text-center md:py-11 lg:hidden">

          <div className="mx-auto max-w-[1180px]">
            <h1
              className="mx-auto font-display font-bold uppercase text-white"
              style={{ fontSize: "clamp(34px, 8.6vw, 96px)", lineHeight: 0.94, letterSpacing: "-0.02em" }}
            >
              <span className="block">One-click campaign</span>
              <span className="block">Marketplace</span>
            </h1>

            <p className="mx-auto mt-4 font-sans text-[15px] font-extrabold uppercase leading-[1.3] tracking-[0.06em] text-white sm:text-[17px] lg:text-[19px]">
              <span className="block">
                No prompts <span className="text-cyan-300">·</span> No guessing
              </span>
              <span className="mt-1 block text-cyan-100">Prebuilt expert workflows</span>
            </p>

            {/* Mechanism proof — the prebuilt workflow itself is the hero visual */}
            <div className="mx-auto mt-5 max-w-[760px] md:mt-7">
              <HeroWorkflowAnimation />
            </div>

            {/* Small secondary proof strip — real campaign previews, labels below */}
            <HeroCampaignTiles
              entries={heroTiles}
              loading={templatesLoading}
              className="mx-auto mt-4 max-w-[640px]"
            />


            <div className="mt-4 flex flex-col items-center gap-3 md:mt-5">
              <Button
                asChild
                size="lg"
                className="group relative h-[58px] overflow-hidden rounded-full border border-cyan-100/70 bg-gradient-to-b from-cyan-200 to-cyan-400 px-8 font-sans text-[16.5px] font-extrabold uppercase tracking-[0.06em] text-slate-950 shadow-[0_10px_30px_-12px_rgba(34,211,238,0.65)] transition-all duration-200 hover:-translate-y-[2px] hover:shadow-[0_16px_38px_-12px_rgba(34,211,238,0.8)] active:translate-y-[1px] active:scale-[0.985] motion-reduce:transition-none motion-reduce:hover:translate-y-0 sm:px-9 sm:text-[18px]"
              >
                <Link to="/app/templates" onClick={() => track("hero_explore_campaigns_click")}>
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 skew-x-[-18deg] bg-white/40 opacity-0 [animation:hero-cta-sheen_7s_ease-in-out_infinite] motion-reduce:animate-none"
                  />
                  <span className="relative">Explore campaigns</span>
                  <ArrowRight className="relative h-[18px] w-[18px] transition-transform duration-200 group-hover:translate-x-[5px] motion-reduce:transition-none" />
                </Link>
              </Button>

              <div className="flex flex-wrap items-center justify-center gap-2">
                {isCreator ? (
                  <Button
                    asChild
                    variant="ghost"
                    size="sm"
                    className="rounded-full px-4 text-[12px] text-slate-300 hover:text-white"
                  >
                    <Link to="/app/creator">Creator Dashboard</Link>
                  </Button>
                ) : null}

                {(isCreator || isAdmin) && (
                  <Button
                    asChild
                    variant="ghost"
                    size="sm"
                    className="rounded-full px-4 text-[12px] text-slate-300 hover:text-white"
                  >
                    <Link to="/app/lab/canvas">Create a Template</Link>
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* DESKTOP (lg+) — wide left→right story hero: messaging left,
            YOUR PRODUCTS → PREBUILT WORKFLOW → FINISHED CAMPAIGN right.
            Mobile (<lg) keeps its own stacked hero above, untouched. */}
        <div className="container relative hidden items-center gap-10 py-14 lg:grid lg:min-h-[700px] lg:grid-cols-[minmax(0,46fr)_minmax(0,54fr)] xl:gap-14">
          <div className="min-w-0">
            <h1
              className="font-display font-bold uppercase text-white"
              style={{ fontSize: "clamp(52px, 4.4vw, 82px)", lineHeight: 0.92, letterSpacing: "-0.045em" }}
            >
              <span className="block">One-click campaign</span>
              <span className="block text-cyan-100">Marketplace</span>
            </h1>

            <p className="mt-5 max-w-[520px] font-sans text-[20px] font-bold leading-[1.35] text-white">
              Viral campaigns. Already built and ready to run.
            </p>
            <p className="mt-2 max-w-[520px] font-sans text-[15.5px] leading-[1.5] text-slate-300">
              Pick one. Upload your products. Hit run.
            </p>

            <p className="mt-6 max-w-[520px] font-sans text-[16px] font-extrabold uppercase leading-[1.3] tracking-[0.06em] text-white">
              <span className="block">
                No prompts <span className="text-cyan-300">·</span> No guessing
              </span>
              <span className="mt-1 block text-cyan-100">Prebuilt expert workflows</span>
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button
                asChild
                size="lg"

                className="group relative h-[58px] overflow-hidden rounded-full border border-cyan-100/70 bg-gradient-to-b from-cyan-200 to-cyan-400 px-9 font-sans text-[18px] font-extrabold uppercase tracking-[0.06em] text-slate-950 shadow-[0_10px_30px_-12px_rgba(34,211,238,0.65)] transition-all duration-200 hover:-translate-y-[2px] hover:shadow-[0_16px_38px_-12px_rgba(34,211,238,0.8)] active:translate-y-[1px] active:scale-[0.985] motion-reduce:transition-none motion-reduce:hover:translate-y-0"
              >
                <Link to="/app/templates" onClick={() => track("hero_explore_campaigns_click")}>
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 skew-x-[-18deg] bg-white/40 opacity-0 [animation:hero-cta-sheen_7s_ease-in-out_infinite] motion-reduce:animate-none"
                  />
                  <span className="relative">Explore campaigns</span>
                  <ArrowRight className="relative h-[18px] w-[18px] transition-transform duration-200 group-hover:translate-x-[5px] motion-reduce:transition-none" />
                </Link>
              </Button>

              {isCreator ? (
                <Button
                  asChild
                  variant="ghost"
                  size="sm"
                  className="rounded-full px-4 text-[12px] text-slate-300 hover:text-white"
                >
                  <Link to="/app/creator">Creator Dashboard</Link>
                </Button>
              ) : null}

              {(isCreator || isAdmin) && (
                <Button
                  asChild
                  variant="ghost"
                  size="sm"
                  className="rounded-full px-4 text-[12px] text-slate-300 hover:text-white"
                >
                  <Link to="/app/lab/canvas">Create a Template</Link>
                </Button>
              )}
            </div>
          </div>

          {/* STORY SEQUENCE — your products → prebuilt workflow → finished campaign */}
          <div className="relative flex min-w-0 items-center gap-2 xl:gap-3">
            {/* 1 · YOUR PRODUCTS input card */}
            <div className="w-[132px] shrink-0 rounded-2xl border border-cyan-200/25 bg-[linear-gradient(180deg,rgba(34,211,238,0.08),rgba(255,255,255,0.02))] p-3 shadow-[0_0_28px_-14px_rgba(34,211,238,0.7)] xl:w-[148px]">
              <p className="font-display text-[9.5px] font-bold uppercase tracking-[0.2em] text-cyan-100">
                Your products
              </p>
              <ul className="mt-2.5 space-y-1.5">
                {["Product", "Logo", "Cast"].map((label) => (
                  <li
                    key={label}
                    className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 font-display text-[9.5px] font-bold uppercase tracking-[0.16em] text-slate-300"
                  >
                    {label}
                  </li>
                ))}
              </ul>
              <p className="mt-2.5 rounded-lg border border-dashed border-cyan-200/35 px-2 py-1.5 text-center font-display text-[9.5px] font-bold uppercase tracking-[0.16em] text-cyan-100">
                + Product
              </p>
            </div>

            {/* connector */}
            <span aria-hidden className="h-px w-4 shrink-0 bg-gradient-to-r from-cyan-300/10 to-cyan-300/70 xl:w-6" />

            {/* 2 · the prebuilt workflow itself */}
            <div className="min-w-0 flex-1">
              <HeroWorkflowAnimation />
            </div>

            {/* connector */}
            <span aria-hidden className="h-px w-4 shrink-0 bg-gradient-to-r from-cyan-300/70 to-cyan-300/20 xl:w-6" />

            {/* 3 · finished campaign — one real live preview */}
            <div className="w-[168px] shrink-0 xl:w-[188px]">
              <div className="overflow-hidden rounded-2xl border border-cyan-200/30 bg-black/50 shadow-[0_0_36px_-16px_rgba(34,211,238,0.8)]">
                {heroStoryPreview ? (
                  <AutoMedia
                    media={heroStoryPreview.media}
                    className="aspect-[9/16] w-full object-cover"
                    eager
                  />
                ) : (
                  <div className="aspect-[9/16] w-full animate-pulse bg-white/[0.05]" />
                )}
              </div>
              <p className="mt-2 text-center font-display text-[9px] font-bold uppercase tracking-[0.22em] text-slate-500">
                Campaign
              </p>
            </div>
          </div>

        </div>

      </section>



      {/* 1.4 · NEW DROPS — <lg: media-first rail; lg+: previous desktop shelf. */}
      <div className="lg:hidden">
        <NewDropsShelf entries={newToday} fill={newDropsFill} />
      </div>
      <div className="hidden lg:block">
        <Shelf
          id="new-today"
          label="New Drops"
          heading="Just dropped"
          description="The newest campaigns ready to run."
          entries={newToday.length ? newToday : newDropsFill}
          perfMap={perfMap}
          runsMap={popularity}
          badge={{ tone: "new", label: "New" }}
        />
      </div>


      {/* 1.6 · HOW IT WORKS — compact row, no giant cards */}
      <section className="container pb-8">
        <h2 className="font-display text-lg font-bold uppercase tracking-[0.06em] text-white sm:text-xl">
          How it works
        </h2>
        <ol className="mt-3 grid gap-2.5 sm:grid-cols-3">
          {[
            { n: "01", title: "Pick", copy: "Choose a campaign" },
            { n: "02", title: "Upload", copy: "Add your assets" },
            { n: "03", title: "Run", copy: "Get your images + video clips" },
          ].map((step) => (
            <li
              key={step.n}
              className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-3"
            >
              <span className="font-display text-base font-bold text-cyan-200">{step.n}</span>
              <span className="min-w-0">
                <span className="block font-display text-[13px] font-bold uppercase tracking-[0.08em] text-white">
                  {step.title}
                </span>
                <span className="block truncate text-[12.5px] text-slate-300">{step.copy}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>




      {/* 1.5 · TRENDING */}
      <Shelf
        id="trending-now"
        label="Trending now"
        heading="Trending campaigns"
        description="Most-run campaigns right now."
        entries={trendingRanked}
        perfMap={perfMap}
        runsMap={popularity}
        badge={{ tone: "trending", label: "Trending" }}
      />

      {/* 1.6 · CURATED SHELVES — exact order from /admin/templates/merchandising */}
      {curatedShelves.map((shelf) => (
        <Shelf
          key={shelf.id}
          id={`shelf-${shelf.slug}`}
          label="Curated"
          heading={shelf.title}
          description={shelf.subtitle}
          entries={shelf.entries}
          perfMap={perfMap}
          runsMap={popularity}
        />
      ))}



      {/* 2.5 · BRAND PERSONALIZATION — additive only, never a filter */}
      {showBrandNudge && (
        <section className="container pt-8">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-cyan-200/20 bg-cyan-300/[0.04] px-5 py-4">
            <div className="flex items-center gap-3">
              <Sparkles className="h-4 w-4 shrink-0 text-cyan-200" />
              <Link
                to="/app/brand"
                className="text-sm text-slate-200 transition hover:text-white"
              >
                Build your brand to personalize your marketplace
                <ArrowRight className="ml-2 inline h-3.5 w-3.5 text-cyan-200" />
              </Link>
            </div>
            <button
              type="button"
              onClick={dismissBrandNudge}
              aria-label="Dismiss brand personalization tip"
              className="rounded-full p-1 text-slate-500 transition hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </section>
      )}

      {activeBrand && recommended.length > 0 && (
        <section className="container border-t border-white/10 py-12">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <SectionLabel>For your brand</SectionLabel>
              <SectionHeading>Recommended for {activeBrand.name}</SectionHeading>
              <p className="mt-3 max-w-xl text-sm leading-6 text-slate-400">
                Matched to your saved products and brand style. The full catalog stays below.
              </p>
            </div>
            <Button asChild variant="ghost" className="rounded-full text-cyan-100 hover:text-white">
              <Link to="/app/brand">
                Brand workspace
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
          <MediaShelf>
            {recommended.map(({ entry, reasons }, index) => (
              <div key={`recommended-${entry.template.id}-${index}`} className="shrink-0">
                <TemplateCard
                  entry={entry}
                  index={index}
                  eager={index < 2}
                  performance={perfMap[String(entry.template.id ?? "")]}
                />
                {reasons.length > 0 && (
                  <p className="mt-2 w-[248px] truncate font-display text-[10px] uppercase tracking-[0.18em] text-cyan-100/80 sm:w-[272px]">
                    {reasons.join(" · ")}
                  </p>
                )}
              </div>
            ))}
          </MediaShelf>
        </section>
      )}

      {/* 3 · SHELVES — New Drops and Trending render above, directly after the hero */}


      <Shelf
        id="from-creators-you-follow"
        label="Your creators"
        heading="From creators you follow"
        entries={followedEntries}
        perfMap={perfMap}
        runsMap={popularity}
      />
      <Shelf
        label="Top ROAS"
        heading="Highest returning campaigns"
        entries={topRoas}
        perfMap={perfMap}
        runsMap={popularity}
        showDisclaimer
      />
      <Shelf
        label="Most tested"
        heading="Proven on the most ad spend"
        entries={mostTested}
        perfMap={perfMap}
        runsMap={popularity}
        showDisclaimer
      />

      {creators.length > 0 && (
        <Shelf
          label="Creator drops"
          heading="Built by FUSE creators"
          entries={creatorDrops}
          runsMap={popularity}
        />
      )}
      {categories.map((shelf) => (
        <Shelf
          key={shelf.title}
          label={shelf.title}
          heading={`${shelf.title} campaigns`}
          entries={shelf.entries}
          runsMap={popularity}
        />
      ))}





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

          {/* FEATURED CREATORS — real public creator_profiles rows only. */}
          {creators.length > 0 && (
            <>
            <div className="mt-10 flex flex-wrap items-end justify-between gap-3">
              <SectionLabel>Featured creators</SectionLabel>
              <Button asChild variant="ghost" className="rounded-full text-cyan-100 hover:text-white">
                <Link to="/creators">
                  All creators
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
            </>
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
