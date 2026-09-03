/**
 * TEMPLATE PRODUCT PAGE — /templates/:slug
 *
 * Public, presentation-only surface, top to bottom:
 *   1. Video hero (autoplay muted/inline/loop + explicit controls)
 *   2. Image & video gallery (large preview + thumbnails, lightbox, swipe)
 *   3. Template overview (what it creates, required uploads, outputs, specs)
 *   4. Example-output sections (only sections that actually contain media)
 *   5. Sticky "Use This Template" CTA
 *
 * "Use This Template" is the ONLY path into the campaign builder
 * (`/templates/:slug/build`, which carries this template into the builder).
 * Credit cost is read from the same catalog the marketplace cards use — never
 * invented here. Admins additionally get the example media manager.
 */

import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Camera, Coins, Film, Image as ImageIcon, Layers3, Ratio } from "lucide-react";
import SiteShell from "@/components/mvp/SiteShell";
import PageMeta from "@/components/mvp/PageMeta";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import TemplateHeroVideo from "@/components/templates/TemplateHeroVideo";
import TemplateGalleryViewer, {
  TemplateMediaThumb,
  useVideoDurations,
} from "@/components/templates/TemplateGalleryViewer";
import TemplateMediaLightbox from "@/components/templates/TemplateMediaLightbox";
import AdminTemplateMediaManager from "@/components/templates/AdminTemplateMediaManager";
import FavoriteTemplateButton from "@/components/templates/FavoriteTemplateButton";
import { useTemplateFavorites } from "@/hooks/useTemplateFavorites";
import { fetchTemplateDetailPage, type TemplateGalleryItem } from "@/services/templateDetailPage";
import { fetchTemplates, type ApiTemplate } from "@/services/fuseApi";
import { templateSlug } from "@/lib/templateSlug";

const CATEGORY_SECTIONS: Array<{ key: string; title: string }> = [
  { key: "full_body", title: "Full-body shots" },
  { key: "product_detail", title: "Product-detail shots" },
  { key: "lifestyle", title: "Lifestyle shots" },
];

const SHOT_TYPE_LABELS: Record<string, string> = {
  full_body: "Full-body",
  product_detail: "Product detail",
  lifestyle: "Lifestyle",
};

function inputTypeLabel(expected: string) {
  return expected.toLowerCase() === "video" ? "Video" : "Image";
}

function SpecRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Coins;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-6 border-b border-white/[0.06] py-3 last:border-b-0">
      <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">
        <Icon className="h-3.5 w-3.5 text-[hsl(var(--electric-cyan))]" aria-hidden />
        {label}
      </span>
      <span className="text-right text-sm font-semibold text-white">{value}</span>
    </div>
  );
}

function SectionHeading({ title, count }: { title: string; count: number }) {
  return (
    <div className="flex items-baseline gap-3">
      <h2 className="font-display text-lg font-semibold uppercase tracking-[-0.01em] text-white">
        {title}
      </h2>
      <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-slate-500">
        {count} {count === 1 ? "asset" : "assets"}
      </span>
    </div>
  );
}

export default function TemplateDetailPage() {
  const { slug = "" } = useParams();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const { canFavorite, isFavorite, toggleFavorite } = useTemplateFavorites();
  const [heroOpen, setHeroOpen] = useState(false);
  const [sectionLightbox, setSectionLightbox] = useState<{ items: TemplateGalleryItem[]; index: number } | null>(
    null,
  );

  const detailQuery = useQuery({
    queryKey: ["template-detail-page", slug],
    queryFn: () => fetchTemplateDetailPage(slug),
    enabled: !!slug,
    // Signed media urls live ~1h — refresh well inside that window.
    staleTime: 30 * 60 * 1000,
    retry: false,
  });

  const catalogQuery = useQuery<ApiTemplate[]>({
    queryKey: ["templates"],
    queryFn: () => fetchTemplates(""),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const template = detailQuery.data ?? null;
  const gallery = template?.gallery ?? [];
  const durations = useVideoDurations(gallery);

  /** Same catalog record the marketplace card renders — cost comes from here. */
  const catalogEntry = useMemo(() => {
    const list = catalogQuery.data ?? [];
    if (!list.length) return null;
    return (
      list.find((entry) => templateSlug(entry) === slug) ??
      (template
        ? list.find(
            (entry) =>
              String(entry.templateId ?? "") === template.id ||
              String(entry.id) === template.id ||
              entry.name.toLowerCase() === template.name.toLowerCase(),
          ) ?? null
        : null)
    );
  }, [catalogQuery.data, slug, template]);

  const costLabel = catalogEntry
    ? `${catalogEntry.estimated_credits_per_run} credits`
    : catalogQuery.isLoading
      ? "Loading…"
      : "See builder";

  const favoriteId = String(catalogEntry?.id ?? template?.id ?? "");

  const hero = template?.hero ?? template?.featured ?? null;
  const heroLightboxItems: TemplateGalleryItem[] = hero
    ? [
        {
          id: "hero",
          media_type: hero.media_type,
          url: hero.url,
          poster_url: hero.poster_url,
          label: "Featured",
          category: null,
          is_primary: true,
        },
      ]
    : [];

  const buildPath = slug ? `/templates/${encodeURIComponent(slug)}/build` : "/app/templates";

  const outputsLabel = template
    ? [
        template.image_count
          ? `${template.image_count} image${template.image_count === 1 ? "" : "s"}`
          : null,
        template.video_count
          ? `${template.video_count} video clip${template.video_count === 1 ? "" : "s"}`
          : null,
      ]
        .filter(Boolean)
        .join(" · ") || `${template.total_outputs} assets`
    : "";

  const videoExamples = gallery.filter((item) => item.media_type === "video");
  const imageExamples = gallery.filter((item) => item.media_type === "image");

  const categorySections = CATEGORY_SECTIONS.map((section) => ({
    ...section,
    items: gallery.filter((item) => (item.category ?? "").toLowerCase() === section.key),
  })).filter((section) => section.items.length > 0);

  const shotTypes = useMemo(() => {
    const seen = new Set<string>();
    for (const item of gallery) {
      const key = (item.category ?? "").toLowerCase();
      if (key && SHOT_TYPE_LABELS[key]) seen.add(SHOT_TYPE_LABELS[key]);
    }
    return Array.from(seen);
  }, [gallery]);

  const renderSection = (title: string, items: TemplateGalleryItem[]) =>
    items.length ? (
      <section key={title} className="space-y-3">
        <SectionHeading title={title} count={items.length} />
        <div
          className="grid gap-2.5"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))" }}
        >
          {items.map((item, index) => (
            <TemplateMediaThumb
              key={`${title}-${item.id}`}
              item={item}
              index={index}
              duration={durations[item.id] ?? null}
              onClick={() => setSectionLightbox({ items, index })}
            />
          ))}
        </div>
      </section>
    ) : null;

  const ctaButton = (
    <Button
      type="button"
      onClick={() => navigate(buildPath)}
      className="w-full rounded-full bg-[hsl(var(--electric-cyan))] py-6 text-[12px] font-semibold uppercase tracking-[0.18em] text-slate-950 shadow-[0_0_40px_-12px_hsl(var(--electric-cyan)/0.85)] hover:bg-[hsl(var(--electric-blue))] sm:w-auto sm:px-10"
    >
      Use this template
      <ArrowRight className="h-4 w-4" />
    </Button>
  );

  return (
    <SiteShell>
      <PageMeta
        title={template ? `${template.name} — FUSE Campaign Template` : "Campaign template — FUSE"}
        description={
          template?.description?.slice(0, 155) ??
          "Explore this FUSE campaign template: real examples, required uploads, outputs and credit cost."
        }
        path={`/templates/${slug}`}
        image={null}
      />

      <div className="relative mx-auto w-full max-w-6xl px-4 py-8 pb-28 sm:px-6 lg:py-12">
        <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-80 bg-[radial-gradient(60%_100%_at_20%_0%,hsl(var(--electric-blue)/0.16),transparent_70%)]" />

        <Link
          to="/app/templates"
          className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-slate-400 transition hover:text-cyan-100"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          All campaigns
        </Link>

        {detailQuery.isLoading ? (
          <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)]">
            <div className="aspect-[9/16] w-full max-w-sm animate-pulse rounded-[18px] bg-white/[0.06]" />
            <div className="space-y-3">
              <div className="h-9 w-2/3 animate-pulse rounded bg-white/[0.06]" />
              <div className="h-20 w-full animate-pulse rounded bg-white/[0.05]" />
              <div className="h-52 w-full animate-pulse rounded-2xl bg-white/[0.04]" />
            </div>
          </div>
        ) : !template ? (
          <div className="mt-10 rounded-2xl border border-white/10 bg-black/30 p-8 text-center">
            <h1 className="font-display text-2xl font-semibold uppercase tracking-[-0.01em] text-white">
              Template not found
            </h1>
            <p className="mt-2 text-sm text-slate-400">
              This campaign isn't available. Browse the full marketplace instead.
            </p>
            <Button
              asChild
              className="mt-5 rounded-full bg-[hsl(var(--electric-cyan))] text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-950 hover:bg-[hsl(var(--electric-blue))]"
            >
              <Link to="/app/templates">Explore campaigns</Link>
            </Button>
          </div>
        ) : (
          <div className="mt-6 space-y-14">
            {/* 1 · VIDEO HERO */}
            <section className="grid items-center gap-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)]">
              <TemplateHeroVideo
                media={hero}
                name={template.name}
                onExpand={heroLightboxItems.length ? () => setHeroOpen(true) : undefined}
                className="mx-auto max-w-sm lg:mx-0"
              />

              <div className="space-y-5">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.26em] text-[hsl(var(--electric-cyan))]">
                    Campaign template
                  </p>
                  <h1 className="mt-2 font-display text-3xl font-bold uppercase tracking-[-0.02em] text-white sm:text-4xl lg:text-5xl">
                    {template.name}
                  </h1>
                  {template.description ? (
                    <p className="mt-4 max-w-xl text-sm leading-6 text-slate-400">
                      {template.description}
                    </p>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  {outputsLabel ? (
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.2em] text-slate-300">
                      {outputsLabel}
                    </span>
                  ) : null}
                  {template.aspect_ratio ? (
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.2em] text-slate-300">
                      {template.aspect_ratio}
                    </span>
                  ) : null}
                  <span className="rounded-full border border-[hsl(var(--electric-blue)/0.35)] bg-[hsl(var(--electric-blue)/0.12)] px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.2em] text-cyan-100">
                    {costLabel}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  {ctaButton}
                  {canFavorite && favoriteId ? (
                    <FavoriteTemplateButton
                      favorite={isFavorite(favoriteId)}
                      onToggle={() => toggleFavorite(favoriteId)}
                      label={isFavorite(favoriteId) ? "Saved" : "Save"}
                      className="px-4 py-3"
                    />
                  ) : null}
                </div>
              </div>
            </section>

            {/* 2 · IMAGE & VIDEO GALLERY */}
            {gallery.length ? (
              <section className="space-y-4">
                <SectionHeading title="Gallery" count={gallery.length} />
                <TemplateGalleryViewer items={gallery} />
              </section>
            ) : null}

            {/* 3 · TEMPLATE OVERVIEW */}
            <section className="space-y-4">
              <h2 className="font-display text-lg font-semibold uppercase tracking-[-0.01em] text-white">
                Template overview
              </h2>
              <div className="grid gap-5 lg:grid-cols-2">
                <div className="space-y-5 rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.01))] p-6">
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-slate-500">
                      What this campaign creates
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-300">
                      {template.description ||
                        `A complete campaign set: ${outputsLabel || "a full asset kit"}.`}
                    </p>
                  </div>

                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-slate-500">
                      Required product / reference uploads
                    </p>
                    {template.required_inputs.length ? (
                      <ul className="mt-3 space-y-2">
                        {template.required_inputs.map((input) => (
                          <li
                            key={input.name}
                            className="flex items-center justify-between gap-4 rounded-xl border border-white/[0.07] bg-black/30 px-3.5 py-2.5"
                          >
                            <span className="min-w-0 truncate text-sm font-semibold text-white">
                              {input.name}
                            </span>
                            <span className="shrink-0 rounded-full border border-[hsl(var(--electric-blue)/0.35)] bg-[hsl(var(--electric-blue)/0.12)] px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.16em] text-cyan-100">
                              {inputTypeLabel(String(input.expected))}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-2 text-sm text-slate-400">No uploads required</p>
                    )}
                  </div>

                  {shotTypes.length ? (
                    <div>
                      <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-slate-500">
                        Typical shot types
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {shotTypes.map((shot) => (
                          <span
                            key={shot}
                            className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] text-slate-200"
                          >
                            <Camera className="h-3 w-3 text-[hsl(var(--electric-cyan))]" aria-hidden />
                            {shot}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.01))] p-6">
                  <p className="font-mono text-[10px] uppercase tracking-[0.26em] text-slate-500">
                    Specs
                  </p>
                  <div className="mt-3">
                    <SpecRow icon={ArrowRight} label="Expected outputs" value={outputsLabel} />
                    <SpecRow
                      icon={ImageIcon}
                      label="Images produced"
                      value={String(template.image_count)}
                    />
                    <SpecRow
                      icon={Film}
                      label="Video clips produced"
                      value={String(template.video_count)}
                    />
                    {template.aspect_ratio ? (
                      <SpecRow icon={Ratio} label="Aspect ratio" value={template.aspect_ratio} />
                    ) : null}
                    <SpecRow icon={Layers3} label="Total assets" value={String(template.total_outputs)} />
                    <SpecRow icon={Coins} label="Credit cost" value={costLabel} />
                  </div>
                </div>
              </div>
            </section>

            {/* 4 · EXAMPLE OUTPUTS — only sections that contain media */}
            {hero || videoExamples.length || imageExamples.length || categorySections.length ? (
              <div className="space-y-10">
                {hero ? (
                  <section className="space-y-3">
                    <SectionHeading title="Featured video" count={1} />
                    <div
                      className="grid gap-2.5"
                      style={{ gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))" }}
                    >
                      <TemplateMediaThumb
                        item={heroLightboxItems[0]}
                        index={0}
                        onClick={() => setHeroOpen(true)}
                      />
                    </div>
                  </section>
                ) : null}
                {renderSection("Example videos", videoExamples)}
                {renderSection("Example images", imageExamples)}
                {categorySections.map((section) => renderSection(section.title, section.items))}
              </div>
            ) : null}

            {/* 5 · CTA */}
            <section className="rounded-2xl border border-[hsl(var(--electric-blue)/0.3)] bg-[linear-gradient(135deg,hsl(var(--electric-blue)/0.14),transparent_60%)] p-7 text-center">
              <h2 className="font-display text-xl font-bold uppercase tracking-[-0.01em] text-white">
                Ready to run this campaign?
              </h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">
                Upload your product shots and FUSE builds the full asset set.
              </p>
              <div className="mt-5 flex justify-center">{ctaButton}</div>
            </section>

            {isAdmin ? <AdminTemplateMediaManager templateId={template.id} /> : null}
          </div>
        )}
      </div>

      {/* Sticky CTA — stays reachable while scrolling */}
      {template ? (
        <div
          className={cn(
            "fixed inset-x-0 bottom-0 z-40 border-t border-white/10",
            "bg-[hsl(var(--navy-deep)/0.92)] px-4 py-3 backdrop-blur-xl",
          )}
        >
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="truncate font-display text-sm font-semibold uppercase tracking-[0.06em] text-white">
                {template.name}
              </p>
              <p className="truncate font-mono text-[9px] uppercase tracking-[0.2em] text-slate-500">
                {[outputsLabel, costLabel].filter(Boolean).join(" · ")}
              </p>
            </div>
            <Button
              type="button"
              onClick={() => navigate(buildPath)}
              className="shrink-0 rounded-full bg-[hsl(var(--electric-cyan))] px-6 py-5 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-950 hover:bg-[hsl(var(--electric-blue))]"
            >
              Use this template
            </Button>
          </div>
        </div>
      ) : null}

      {heroOpen && heroLightboxItems.length ? (
        <TemplateMediaLightbox
          items={heroLightboxItems}
          index={0}
          onIndexChange={() => undefined}
          onClose={() => setHeroOpen(false)}
        />
      ) : null}

      {sectionLightbox ? (
        <TemplateMediaLightbox
          items={sectionLightbox.items}
          index={sectionLightbox.index}
          onIndexChange={(next) => setSectionLightbox({ items: sectionLightbox.items, index: next })}
          onClose={() => setSectionLightbox(null)}
        />
      ) : null}
    </SiteShell>
  );
}
