import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Clapperboard, Gem, Layers3, Shirt, Sparkles, Upload, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import SiteShell from "@/components/mvp/SiteShell";
import PageMeta from "@/components/mvp/PageMeta";
import { useAuth } from "@/contexts/AuthContext";
import { fetchTemplates, type ApiTemplate } from "@/services/fuseApi";
import { listPublicCreatorProfiles, type CreatorProfile } from "@/services/creatorProfile";
import { sortTemplatesForStudio } from "@/lib/templateOrdering";
import { cn } from "@/lib/utils";

/* Curated existing media only — nothing is generated for the homepage. */
const CURATED_PREVIEW_GIFS: Array<{ match: RegExp; src: string }> = [
  { match: /ugc\s*mirror/i, src: "/template-previews/ugc-mirror.gif" },
  { match: /paparazzi/i, src: "/template-previews/paparazzi.gif" },
  { match: /unboxing/i, src: "/template-previews/unboxing.gif" },
  { match: /amazon|delivery/i, src: "/template-previews/amazon-guy.gif" },
  { match: /armored/i, src: "/template-previews/armored-truck.gif" },
  { match: /blue\s*lab/i, src: "/template-previews/blue-lab.gif" },
  { match: /doctor/i, src: "/template-previews/doctor.gif" },
  { match: /garage/i, src: "/template-previews/garage.gif" },
  { match: /jeans/i, src: "/template-previews/jeans.gif" },
  { match: /raven/i, src: "/template-previews/raven.gif" },
  { match: /skate/i, src: "/template-previews/skatepark.gif" },
];

const FALLBACK_GIFS = CURATED_PREVIEW_GIFS.map((entry) => entry.src);

type TemplateMedia = { url: string; type: "image" | "video" };
type Entry = { template: ApiTemplate; media: TemplateMedia };

function curatedGifFor(name: string) {
  return CURATED_PREVIEW_GIFS.find((entry) => entry.match.test(name))?.src ?? null;
}

function resolveMedia(template: ApiTemplate): TemplateMedia | null {
  if (template.preview_url) {
    const isVideo =
      template.preview_asset_type === "video" || /\.(mp4|mov|webm)(\?|$)/i.test(template.preview_url);
    return { url: template.preview_url, type: isVideo ? "video" : "image" };
  }
  const gif = curatedGifFor(template.name);
  return gif ? { url: gif, type: "image" } : null;
}

function outputCount(template: ApiTemplate) {
  const images = template.counts?.imageOutputs ?? 0;
  const videos = template.counts?.videoOutputs ?? 0;
  return images + videos;
}

function outputLabel(template: ApiTemplate) {
  const total = outputCount(template);
  if (total <= 0) return null;
  return `${total} output${total === 1 ? "" : "s"}`;
}

function isRecent(template: ApiTemplate, days = 21) {
  if (!template.created_at) return false;
  const created = new Date(template.created_at).getTime();
  if (Number.isNaN(created)) return false;
  return Date.now() - created <= days * 24 * 60 * 60 * 1000;
}

/** Requirement chips derived from the template's real input schema. */
function requirementChips(template: ApiTemplate) {
  const chips: string[] = [];
  for (const input of template.input_schema ?? []) {
    const label = (input.label || input.key || "").trim();
    if (!label) continue;
    if (chips.length >= 3) break;
    chips.push(input.required ? label : `${label} (optional)`);
  }
  if (template.castConfig?.supported) chips.push("Cast (optional)");
  return chips;
}

const CATEGORY_SHELVES: Array<{ title: string; match: RegExp }> = [
  { title: "Streetwear", match: /street|apparel|outfit|garment|fashion/i },
  { title: "Jewelry", match: /jewel|chain|diamond|ice/i },
  { title: "Artist", match: /artist|music|rap|album/i },
  { title: "Product", match: /product|packshot|ecom|unbox/i },
  { title: "Cinematic", match: /cinema|film|cinematic|trailer/i },
];

function matchesCategory(template: ApiTemplate, match: RegExp) {
  const haystack = [template.category ?? "", ...(template.tags ?? [])].join(" ");
  return match.test(haystack);
}

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
}: {
  media: TemplateMedia;
  className?: string;
  eager?: boolean;
  active?: boolean;
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
}: {
  entry: Entry;
  badge?: { tone: "new" | "trending" | "creator"; label: string };
  creator?: string | null;
  eager?: boolean;
}) {
  const outputs = outputLabel(entry.template);
  const vibe = entry.template.category ?? entry.template.tags?.[0] ?? null;

  return (
    <article className="group relative w-[248px] shrink-0 overflow-hidden rounded-[1.25rem] border border-white/10 bg-slate-950/80 transition-colors hover:border-cyan-200/40 sm:w-[272px]">
      <div className="relative aspect-[9/16] overflow-hidden bg-black">
        <AutoMedia
          media={entry.media}
          eager={eager}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black via-black/60 to-transparent" />
        {badge && (
          <div className="absolute left-3 top-3">
            <Badge tone={badge.tone}>{badge.label}</Badge>
          </div>
        )}
      </div>
      <div className="absolute inset-x-0 bottom-0 p-4">
        <p className="font-display text-sm font-semibold uppercase tracking-[0.08em] text-white">
          {entry.template.name}
        </p>
        <p className="mt-1 text-[11px] uppercase tracking-[0.16em] text-slate-300">
          {[vibe, outputs].filter(Boolean).join(" · ")}
        </p>
        {creator && <p className="mt-1 text-[11px] text-slate-400">by {creator}</p>}
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
}: {
  label: string;
  heading: string;
  entries: Entry[];
  badge?: { tone: "new" | "trending" | "creator"; label: string };
  id?: string;
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
            eager={index < 2}
          />
        ))}
      </MediaShelf>
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

  const withMedia = useMemo<Entry[]>(
    () =>
      sortTemplatesForStudio(templates)
        .map((template) => ({ template, media: resolveMedia(template) }))
        .filter((entry): entry is Entry => !!entry.media),
    [templates],
  );

  const heroPicks = useMemo(() => withMedia.slice(0, 4), [withMedia]);
  const [heroIndex, setHeroIndex] = useState(0);
  const hero = heroPicks[Math.min(heroIndex, Math.max(heroPicks.length - 1, 0))] ?? null;

  const trending = useMemo(() => withMedia.slice(0, 12), [withMedia]);

  const newToday = useMemo(
    () =>
      withMedia
        .filter((entry) => isRecent(entry.template))
        .sort(
          (a, b) =>
            new Date(b.template.created_at ?? 0).getTime() -
            new Date(a.template.created_at ?? 0).getTime(),
        )
        .slice(0, 10),
    [withMedia],
  );

  const categoryShelves = useMemo(
    () =>
      CATEGORY_SHELVES.map((shelf) => ({
        ...shelf,
        entries: withMedia.filter((entry) => matchesCategory(entry.template, shelf.match)).slice(0, 10),
      })).filter((shelf) => shelf.entries.length >= 2),
    [withMedia],
  );

  const mediaWall = useMemo(() => {
    const urls = withMedia
      .filter((entry) => entry.media.type === "image")
      .map((entry) => entry.media.url);
    return Array.from(new Set([...urls, ...FALLBACK_GIFS])).slice(0, 12);
  }, [withMedia]);

  const heroRequirements = hero ? requirementChips(hero.template) : [];

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
              No prompts · No creative calls · New templates constantly
            </p>
          </div>

          {/* Interactive hero preview — real templates, curated existing media */}
          <div className="relative">
            {hero ? (
              <div>
                <div className="overflow-hidden rounded-[1.5rem] border border-cyan-200/25 bg-black">
                  <div className="aspect-[9/16] max-h-[560px]">
                    <AutoMedia
                      media={hero.media}
                      eager
                      className="h-full w-full object-cover"
                    />
                  </div>
                </div>

                <div className="mt-3 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-display text-sm font-semibold uppercase tracking-[0.1em] text-white">
                      {hero.template.name}
                    </p>
                    {outputLabel(hero.template) && (
                      <span className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
                        · {outputLabel(hero.template)}
                      </span>
                    )}
                  </div>
                  {heroRequirements.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
                        Requires
                      </span>
                      {heroRequirements.map((chip) => (
                        <span
                          key={chip}
                          className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] text-slate-300"
                        >
                          {chip}
                        </span>
                      ))}
                    </div>
                  )}
                  <Button
                    asChild
                    size="sm"
                    className="h-9 rounded-full bg-cyan-300 px-5 text-[12px] font-semibold uppercase tracking-[0.14em] text-slate-950 hover:bg-cyan-200"
                  >
                    <Link to="/app/templates">Use this template</Link>
                  </Button>
                </div>

                {heroPicks.length > 1 && (
                  <div className="mt-4 flex gap-2">
                    {heroPicks.map((entry, index) => (
                      <button
                        key={entry.template.id}
                        type="button"
                        onClick={() => setHeroIndex(index)}
                        aria-label={entry.template.name}
                        className={cn(
                          "h-20 w-14 overflow-hidden rounded-lg border bg-black transition-colors",
                          index === heroIndex
                            ? "border-cyan-200"
                            : "border-white/10 hover:border-white/30",
                        )}
                      >
                        <img
                          src={entry.media.type === "image" ? entry.media.url : entry.media.url}
                          alt=""
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                )}
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
        label="Trending now"
        heading="What brands are using right now"
        entries={trending}
        badge={{ tone: "trending", label: "Trending" }}
      />
      <Shelf
        id="new-today"
        label="New today"
        heading="Just added to the marketplace"
        entries={newToday}
        badge={{ tone: "new", label: "New" }}
      />
      {categoryShelves.map((shelf) => (
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
