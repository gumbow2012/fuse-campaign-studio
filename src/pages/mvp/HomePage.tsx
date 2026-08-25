import { useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Check, Clapperboard, Layers3, Sparkles, Upload, Wand2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import SiteShell from "@/components/mvp/SiteShell";
import PageMeta from "@/components/mvp/PageMeta";
import { useAuth } from "@/contexts/AuthContext";
import { fetchTemplates, type ApiTemplate } from "@/services/fuseApi";
import { listPublicCreatorProfiles, type CreatorProfile } from "@/services/creatorProfile";
import { sortTemplatesForStudio } from "@/lib/templateOrdering";
import { cn } from "@/lib/utils";

/* Curated existing media only — nothing generated for the homepage. */
const CURATED_PREVIEW_GIFS: Array<{ match: RegExp; src: string; label: string }> = [
  { match: /ugc\s*mirror/i, src: "/template-previews/ugc-mirror.gif", label: "UGC Mirror" },
  { match: /paparazzi/i, src: "/template-previews/paparazzi.gif", label: "Paparazzi" },
  { match: /unboxing/i, src: "/template-previews/unboxing.gif", label: "Unboxing" },
  { match: /amazon|delivery/i, src: "/template-previews/amazon-guy.gif", label: "Amazon Guy" },
  { match: /armored/i, src: "/template-previews/armored-truck.gif", label: "Armored Truck" },
  { match: /blue\s*lab/i, src: "/template-previews/blue-lab.gif", label: "Blue Lab" },
  { match: /doctor/i, src: "/template-previews/doctor.gif", label: "Doctor" },
  { match: /garage/i, src: "/template-previews/garage.gif", label: "Garage" },
  { match: /jeans/i, src: "/template-previews/jeans.gif", label: "Jeans" },
  { match: /raven/i, src: "/template-previews/raven.gif", label: "Raven" },
  { match: /skate/i, src: "/template-previews/skatepark.gif", label: "Skate Park" },
];

const FALLBACK_GIFS = CURATED_PREVIEW_GIFS.map((entry) => entry.src);

function curatedGifFor(name: string) {
  return CURATED_PREVIEW_GIFS.find((entry) => entry.match.test(name))?.src ?? null;
}

type TemplateMedia = { url: string; type: "image" | "video" };

function resolveMedia(template: ApiTemplate): TemplateMedia | null {
  if (template.preview_url) {
    const isVideo =
      template.preview_asset_type === "video" || /\.(mp4|mov|webm)(\?|$)/i.test(template.preview_url);
    return { url: template.preview_url, type: isVideo ? "video" : "image" };
  }
  const gif = curatedGifFor(template.name);
  return gif ? { url: gif, type: "image" } : null;
}

function outputSummary(template: ApiTemplate) {
  const images = template.counts?.imageOutputs ?? 0;
  const videos = template.counts?.videoOutputs ?? 0;
  const parts: string[] = [];
  if (images > 0) parts.push(`${images} image${images === 1 ? "" : "s"}`);
  if (videos > 0) parts.push(`${videos} video${videos === 1 ? "" : "s"}`);
  return parts.join(" · ");
}

function isRecent(template: ApiTemplate, days = 21) {
  if (!template.created_at) return false;
  const created = new Date(template.created_at).getTime();
  if (Number.isNaN(created)) return false;
  return Date.now() - created <= days * 24 * 60 * 60 * 1000;
}

/* --------------------------------- pieces --------------------------------- */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-100">{children}</p>
  );
}

function HoverMedia({
  media,
  className,
  eager,
}: {
  media: TemplateMedia;
  className?: string;
  eager?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

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
        onMouseLeave={() => {
          const node = videoRef.current;
          if (!node) return;
          node.pause();
          node.currentTime = 0;
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

function TemplateCard({
  template,
  media,
  eager,
}: {
  template: ApiTemplate;
  media: TemplateMedia;
  eager?: boolean;
}) {
  const outputs = outputSummary(template);

  return (
    <article className="group relative w-[240px] shrink-0 overflow-hidden rounded-[1.25rem] border border-white/10 bg-slate-950/80 transition-colors hover:border-cyan-200/40 sm:w-[262px]">
      <div className="relative aspect-[9/16] overflow-hidden bg-black">
        <HoverMedia
          media={media}
          eager={eager}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black via-black/60 to-transparent" />
      </div>
      <div className="absolute inset-x-0 bottom-0 p-4">
        <p className="font-display text-sm font-semibold uppercase tracking-[0.08em] text-white">
          {template.name}
        </p>
        <p className="mt-1 text-[11px] uppercase tracking-[0.16em] text-slate-300">
          {template.category ?? "Campaign template"}
          {outputs ? ` · ${outputs}` : ""}
        </p>
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

/* ---------------------------------- page ---------------------------------- */

export default function HomePage() {
  const { user, isAdmin, isCreator } = useAuth();

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

  const withMedia = useMemo(
    () =>
      sortTemplatesForStudio(templates)
        .map((template) => ({ template, media: resolveMedia(template) }))
        .filter((entry): entry is { template: ApiTemplate; media: TemplateMedia } => !!entry.media),
    [templates],
  );

  const trending = withMedia.slice(0, 12);
  const heroMedia = withMedia.slice(0, 3);

  const newToday = useMemo(
    () =>
      withMedia
        .filter((entry) => isRecent(entry.template))
        .sort(
          (a, b) =>
            new Date(b.template.created_at ?? 0).getTime() -
            new Date(a.template.created_at ?? 0).getTime(),
        )
        .slice(0, 8),
    [withMedia],
  );

  const mediaWall = useMemo(() => {
    const urls = withMedia
      .filter((entry) => entry.media.type === "image")
      .map((entry) => entry.media.url);
    const pool = [...urls, ...FALLBACK_GIFS];
    return Array.from(new Set(pool)).slice(0, 12);
  }, [withMedia]);

  return (
    <SiteShell>
      <PageMeta
        title="FUSE — Viral Campaign Templates, Already Built"
        description="Pick a proven campaign template, upload your brand, and generate a full drop campaign. No prompting, no agency, no AI knowledge needed."
        path="/"
      />

      {/* 1 · HERO */}
      <section className="relative overflow-hidden border-b border-white/10">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage:
              "linear-gradient(to right, rgba(148,163,184,0.12) 1px, transparent 1px), linear-gradient(to bottom, rgba(148,163,184,0.12) 1px, transparent 1px)",
            backgroundSize: "56px 56px",
          }}
        />
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at 20% 20%, rgba(34,211,238,0.16) 0%, transparent 55%), radial-gradient(circle at 85% 10%, rgba(59,130,246,0.14) 0%, transparent 50%)",
          }}
        />

        <div className="container relative grid gap-10 py-12 md:py-16 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div>
            <SectionLabel>Template marketplace</SectionLabel>
            <h1 className="mt-4 font-display text-4xl font-bold uppercase leading-[1.05] tracking-[-0.02em] text-white sm:text-6xl">
              Viral campaigns.
              <br />
              <span className="text-cyan-200">Already built.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-8 text-slate-300">
              Pick a proven creative. Upload your brand. FUSE does the rest.
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

              {isCreator ? (
                <>
                  <Button
                    asChild
                    size="lg"
                    variant="outline"
                    className="rounded-full border-white/15 bg-white/5 px-7 text-foreground hover:bg-white/10"
                  >
                    <Link to="/app/lab/canvas">Create a Template</Link>
                  </Button>
                  <Button
                    asChild
                    size="lg"
                    variant="ghost"
                    className="rounded-full px-6 text-slate-300 hover:text-white"
                  >
                    <Link to="/app/creator">Creator Dashboard</Link>
                  </Button>
                </>
              ) : (
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="rounded-full border-white/15 bg-white/5 px-7 text-foreground hover:bg-white/10"
                >
                  <Link to="/creators">Become a Creator</Link>
                </Button>
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
              No prompts · No agency calls · New templates daily
            </p>
          </div>

          {/* Hero media — curated existing template previews */}
          <div className="relative">
            {heroMedia.length ? (
              <div className="grid grid-cols-3 gap-3">
                {heroMedia.map((entry, index) => (
                  <div key={entry.template.name} className="space-y-2">
                    <div
                      className={cn(
                        "overflow-hidden rounded-[1.1rem] border bg-black",
                        index === 1 ? "border-cyan-200/40" : "border-white/10",
                      )}
                    >
                      <div className="aspect-[9/16]">
                        <HoverMedia
                          media={entry.media}
                          eager={index < 2}
                          className="h-full w-full object-cover"
                        />
                      </div>
                    </div>
                    <p className="text-center text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                      {["Original campaign", "Your brand", "Your version"][index]}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                {FALLBACK_GIFS.slice(0, 3).map((src, index) => (
                  <div key={src} className="space-y-2">
                    <div className="overflow-hidden rounded-[1.1rem] border border-white/10 bg-black">
                      <img src={src} alt="" className="aspect-[9/16] w-full object-cover" />
                    </div>
                    <p className="text-center text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                      {["Original campaign", "Your brand", "Your version"][index]}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 2 · TRENDING NOW */}
      {trending.length > 0 && (
        <section className="container py-12">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <SectionLabel>Trending now</SectionLabel>
              <h2 className="mt-3 font-display text-3xl font-semibold uppercase tracking-[-0.02em] text-white sm:text-4xl">
                Featured campaign templates
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
                Real templates from the FUSE marketplace. Hover a video card to preview it.
              </p>
            </div>
            <Button asChild variant="ghost" className="rounded-full text-cyan-100 hover:text-white">
              <Link to="/app/templates">
                Browse all
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>

          <MediaShelf>
            {trending.map((entry, index) => (
              <TemplateCard
                key={`${entry.template.name}-${index}`}
                template={entry.template}
                media={entry.media}
                eager={index < 3}
              />
            ))}
          </MediaShelf>
        </section>
      )}

      {/* 3 · NEW TODAY */}
      {newToday.length > 0 && (
        <section className="container border-t border-white/10 py-12">
          <SectionLabel>New today</SectionLabel>
          <h2 className="mt-3 font-display text-3xl font-semibold uppercase tracking-[-0.02em] text-white sm:text-4xl">
            Just added to the marketplace
          </h2>
          <MediaShelf>
            {newToday.map((entry, index) => (
              <TemplateCard
                key={`new-${entry.template.name}-${index}`}
                template={entry.template}
                media={entry.media}
              />
            ))}
          </MediaShelf>
        </section>
      )}

      {/* 4 · THREE STEPS */}
      <section className="container border-t border-white/10 py-12">
        <SectionLabel>Three steps</SectionLabel>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {[
            { n: "01", title: "Pick", copy: "Choose a proven campaign template.", icon: Layers3 },
            { n: "02", title: "Upload", copy: "Add your product, logo or model.", icon: Upload },
            { n: "03", title: "Generate", copy: "Get your campaign assets back.", icon: Wand2 },
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

      {/* 5 · TEMPLATE → YOUR BRAND */}
      <section className="container border-t border-white/10 py-12">
        <SectionLabel>Template → your brand</SectionLabel>
        <h2 className="mt-3 font-display text-3xl font-semibold uppercase tracking-[-0.02em] text-white sm:text-4xl">
          Same proven campaign. Your product.
        </h2>
        <div className="mt-6 grid items-center gap-4 md:grid-cols-[1fr_auto_1fr_auto_1fr]">
          <FlowTile
            label="Original campaign"
            media={withMedia[0]?.media ?? { url: FALLBACK_GIFS[0], type: "image" }}
          />
          <FlowPlus />
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
              Your brand assets
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {["/template-placeholders/shirt.jpeg", "/template-placeholders/pants.jpeg", "/template-placeholders/accessory.jpeg", "/template-placeholders/model.jpeg"].map(
                (src) => (
                  <img
                    key={src}
                    src={src}
                    alt=""
                    loading="lazy"
                    className="aspect-square w-full rounded-lg border border-white/10 object-cover"
                  />
                ),
              )}
            </div>
          </div>
          <FlowArrow />
          <FlowTile
            label="Your version"
            highlight
            media={withMedia[1]?.media ?? { url: FALLBACK_GIFS[1], type: "image" }}
          />
        </div>
      </section>

      {/* 6 · WHY FUSE */}
      <section className="container border-t border-white/10 py-12">
        <SectionLabel>Why FUSE</SectionLabel>
        <h2 className="mt-3 font-display text-3xl font-semibold uppercase tracking-[-0.02em] text-white sm:text-4xl">
          The hard part is already done.
        </h2>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">
              Traditional AI tools
            </p>
            <ul className="mt-4 space-y-3">
              {[
                "Learn prompting",
                "Hunt for references",
                "Test model after model",
                "Fight character + product consistency",
                "Hours per usable asset",
              ].map((item) => (
                <li key={item} className="flex items-center gap-3 text-sm text-slate-400">
                  <X className="h-4 w-4 shrink-0 text-rose-300/80" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-cyan-300/25 bg-cyan-300/[0.06] p-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-100">
              FUSE
            </p>
            <ul className="mt-4 space-y-3">
              {["Choose a template", "Add your brand", "Generate"].map((item) => (
                <li key={item} className="flex items-center gap-3 text-sm text-white">
                  <Check className="h-4 w-4 shrink-0 text-emerald-200" />
                  {item}
                </li>
              ))}
            </ul>
            <p className="mt-6 font-display text-lg font-semibold leading-7 text-white">
              Don’t know how to prompt? Good — the creators already did it.
            </p>
          </div>
        </div>
      </section>

      {/* 7 · CREATOR MARKETPLACE */}
      <section className="container border-t border-white/10 py-12">
        <div className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-6 md:p-10">
          <SectionLabel>Creator marketplace</SectionLabel>
          <h2 className="mt-3 font-display text-3xl font-semibold uppercase tracking-[-0.02em] text-white sm:text-4xl">
            Make the template. Let the internet use it.
          </h2>
          <p className="mt-4 max-w-3xl text-base leading-7 text-slate-300">
            Creators productize their process once — the lighting, the angles, the sequencing — and
            publish it as a FUSE template. Brands and fans generate their own campaigns with it, and
            creators earn the rewards configured for their templates.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button
              asChild
              size="lg"
              className="rounded-full bg-cyan-300 px-8 font-semibold text-slate-950 hover:bg-cyan-200"
            >
              <Link to="/creators">
                Become a FUSE Creator
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
        </div>
      </section>

      {/* 8 · FEATURED CREATORS */}
      {creators.length > 0 && (
        <section className="container border-t border-white/10 py-12">
          <SectionLabel>Featured creators</SectionLabel>
          <h2 className="mt-3 font-display text-3xl font-semibold uppercase tracking-[-0.02em] text-white sm:text-4xl">
            The people behind the templates
          </h2>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {creators.map((creator: CreatorProfile) => (
              <div
                key={creator.id}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"
              >
                <div className="flex items-center gap-3">
                  {creator.avatar_url ? (
                    <img
                      src={creator.avatar_url}
                      alt=""
                      loading="lazy"
                      className="h-11 w-11 rounded-full border border-white/15 object-cover"
                    />
                  ) : (
                    <div className="flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-white/5 text-sm text-slate-300">
                      {creator.display_name.slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="truncate font-display text-sm font-semibold uppercase tracking-[0.06em] text-white">
                      {creator.display_name}
                    </p>
                    <p className="truncate text-xs text-slate-400">@{creator.handle}</p>
                  </div>
                </div>
                {creator.specialties.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {creator.specialties.slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-slate-300"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
                <Button
                  asChild
                  size="sm"
                  variant="outline"
                  className="mt-4 w-full rounded-full border-white/15 bg-transparent text-xs hover:bg-white/10"
                >
                  <Link to={`/creator/${creator.handle}`}>View Profile</Link>
                </Button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 9 · MADE WITH FUSE */}
      {mediaWall.length > 0 && (
        <section className="container border-t border-white/10 py-12">
          <SectionLabel>Made with FUSE</SectionLabel>
          <h2 className="mt-3 font-display text-3xl font-semibold uppercase tracking-[-0.02em] text-white sm:text-4xl">
            This is what brands are making without starting from scratch.
          </h2>
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

      {/* 10 · ADVANCED TOOLS */}
      <section className="container border-t border-white/10 py-10">
        <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.02] px-5 py-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <Clapperboard className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
            <div>
              <p className="text-sm font-semibold text-white">Want more control?</p>
              <p className="mt-1 text-sm leading-6 text-slate-400">
                Cinema and Generation Studio give you shot-level direction. Start with templates, go
                deeper when you want.
              </p>
            </div>
          </div>
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="self-start rounded-full text-xs text-cyan-100 hover:text-white md:self-auto"
          >
            <Link to={user ? "/app/cinema" : "/auth?mode=signup"}>Explore advanced tools</Link>
          </Button>
        </div>
      </section>

      {/* 11 · FINAL CTA */}
      <section className="container pb-16">
        <div className="rounded-[2rem] border border-cyan-300/20 bg-cyan-300/[0.08] p-8 text-center md:p-12">
          <h2 className="font-display text-3xl font-semibold uppercase tracking-[-0.02em] text-white sm:text-4xl">
            Find a campaign. Make it yours.
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
              <Link to="/creators">Become a Creator</Link>
            </Button>
          </div>
        </div>
      </section>
    </SiteShell>
  );
}

function FlowTile({
  label,
  media,
  highlight,
}: {
  label: string;
  media: TemplateMedia;
  highlight?: boolean;
}) {
  return (
    <div>
      <div
        className={cn(
          "overflow-hidden rounded-2xl border bg-black",
          highlight ? "border-cyan-200/40" : "border-white/10",
        )}
      >
        <div className="aspect-[9/16]">
          <HoverMedia media={media} className="h-full w-full object-cover" />
        </div>
      </div>
      <p className="mt-2 text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
        {label}
      </p>
    </div>
  );
}

function FlowPlus() {
  return (
    <div className="flex items-center justify-center text-slate-500">
      <span className="font-display text-2xl">+</span>
    </div>
  );
}

function FlowArrow() {
  return (
    <div className="flex items-center justify-center text-cyan-200">
      <Sparkles className="h-5 w-5" />
    </div>
  );
}
