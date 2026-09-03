/**
 * TEMPLATE DETAIL PAGE — /templates/:slug
 *
 * Public, presentation-only surface: overview, featured preview, full example
 * gallery with fullscreen viewing, spec panel, and a single CTA that opens the
 * existing campaign builder with this template selected (?template=<id>).
 * Credit cost is read from the same catalog the marketplace cards use — never
 * invented here. Admins additionally get the example media manager.
 */

import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Clock, Coins, Film, Image as ImageIcon, Layers3, Maximize2, Play, Ratio } from "lucide-react";
import SiteShell from "@/components/mvp/SiteShell";
import PageMeta from "@/components/mvp/PageMeta";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import TemplateExampleGallery from "@/components/templates/TemplateExampleGallery";
import TemplateMediaLightbox from "@/components/templates/TemplateMediaLightbox";
import AdminTemplateMediaManager from "@/components/templates/AdminTemplateMediaManager";
import { fetchTemplateDetailPage, type TemplateGalleryItem } from "@/services/templateDetailPage";
import { fetchTemplates, type ApiTemplate } from "@/services/fuseApi";
import { templateSlug } from "@/lib/templateSlug";

function formatMinutes(seconds: number | null) {
  if (!seconds || seconds <= 0) return null;
  const minutes = Math.max(1, Math.round(seconds / 60));
  return `~${minutes} min`;
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
    <div className="flex items-start justify-between gap-4 border-b border-white/[0.06] py-2.5 last:border-b-0">
      <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">
        <Icon className="h-3.5 w-3.5 text-cyan-200/70" aria-hidden />
        {label}
      </span>
      <span className="text-right text-sm font-semibold text-white">{value}</span>
    </div>
  );
}

export default function TemplateDetailPage() {
  const { slug = "" } = useParams();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [featuredOpen, setFeaturedOpen] = useState(false);
  const [gridIndex, setGridIndex] = useState<number | null>(null);

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

  const featured = template?.featured ?? null;
  const featuredLightboxItems: TemplateGalleryItem[] = featured
    ? [
        {
          id: "featured",
          media_type: featured.media_type,
          url: featured.url,
          poster_url: featured.poster_url,
          label: "Featured",
          is_primary: true,
        },
      ]
    : [];

  const runTarget = catalogEntry
    ? `/app/templates?template=${encodeURIComponent(String(catalogEntry.id))}`
    : template
      ? `/app/templates?template=${encodeURIComponent(template.name || template.id)}`
      : "/app/templates";

  const outputsLabel = template
    ? [
        template.image_count ? `${template.image_count} image${template.image_count === 1 ? "" : "s"}` : null,
        template.video_count ? `${template.video_count} video clip${template.video_count === 1 ? "" : "s"}` : null,
      ]
        .filter(Boolean)
        .join(" · ") || `${template.total_outputs} assets`
    : "";

  return (
    <SiteShell>
      <PageMeta
        title={template ? `${template.name} — FUSE Campaign Template` : "Campaign template — FUSE"}
        description={
          template?.description?.slice(0, 155) ??
          "Explore this FUSE campaign template: real examples, required inputs, outputs and credit cost."
        }
        path={`/templates/${slug}`}
        image={featured?.poster_url ?? featured?.url ?? null}
      />

      <div className="relative mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:py-12">
        <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-72 bg-[radial-gradient(60%_100%_at_20%_0%,rgba(34,211,238,0.14),transparent_70%)]" />

        <Link
          to="/app/templates"
          className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-slate-400 transition hover:text-cyan-100"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          All campaigns
        </Link>

        {detailQuery.isLoading ? (
          <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]">
            <div className="aspect-[9/16] w-full max-w-sm animate-pulse rounded-2xl bg-white/[0.06]" />
            <div className="space-y-3">
              <div className="h-8 w-2/3 animate-pulse rounded bg-white/[0.06]" />
              <div className="h-20 w-full animate-pulse rounded bg-white/[0.05]" />
              <div className="h-48 w-full animate-pulse rounded-2xl bg-white/[0.04]" />
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
              className="mt-5 rounded-full bg-cyan-300 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-950 hover:bg-cyan-200"
            >
              <Link to="/app/templates">Explore campaigns</Link>
            </Button>
          </div>
        ) : (
          <div className="mt-6 space-y-10">
            <div className="grid gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              {/* Featured preview */}
              <div>
                <div className="relative aspect-[9/16] w-full overflow-hidden rounded-2xl border border-white/10 bg-black shadow-[0_40px_100px_-50px_rgba(8,145,178,0.6)]">
                  {featured ? (
                    featured.media_type === "video" ? (
                      <video
                        src={featured.url}
                        poster={featured.poster_url ?? undefined}
                        controls
                        playsInline
                        preload="metadata"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => setFeaturedOpen(true)}
                        aria-label="View featured preview fullscreen"
                        className="group h-full w-full"
                      >
                        <img
                          src={featured.url}
                          alt={`${template.name} featured preview`}
                          className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
                        />
                      </button>
                    )
                  ) : (
                    <div className="flex h-full w-full items-center justify-center font-mono text-[10px] uppercase tracking-[0.22em] text-slate-500">
                      Preview unavailable
                    </div>
                  )}
                  {featured ? (
                    <button
                      type="button"
                      onClick={() => setFeaturedOpen(true)}
                      aria-label="Open fullscreen"
                      className="absolute right-2 top-2 rounded-full border border-white/15 bg-black/60 p-2 text-white/80 backdrop-blur transition hover:border-cyan-300/50 hover:text-white"
                    >
                      <Maximize2 className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
              </div>

              {/* Overview + spec + CTA */}
              <div className="space-y-6">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.26em] text-cyan-200/80">
                    Campaign template
                  </p>
                  <h1 className="mt-2 font-display text-3xl font-bold uppercase tracking-[-0.02em] text-white sm:text-4xl">
                    {template.name}
                  </h1>
                  {template.description ? (
                    <p className="mt-3 max-w-xl text-sm leading-6 text-slate-400">
                      {template.description}
                    </p>
                  ) : null}
                </div>

                <div className="rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.01))] p-5">
                  <p className="font-mono text-[10px] uppercase tracking-[0.26em] text-slate-500">
                    Specs
                  </p>
                  <div className="mt-3">
                    <div className="border-b border-white/[0.06] py-2.5">
                      <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">
                        <Layers3 className="h-3.5 w-3.5 text-cyan-200/70" aria-hidden />
                        Required inputs
                      </span>
                      {template.required_inputs.length ? (
                        <ul className="mt-2 space-y-1">
                          {template.required_inputs.map((input) => (
                            <li
                              key={input.name}
                              className="flex items-center justify-between gap-3 text-sm text-white"
                            >
                              <span className="font-semibold">{input.name}</span>
                              <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-slate-500">
                                {input.expected}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-1 text-sm text-slate-400">No uploads required</p>
                      )}
                    </div>
                    <SpecRow icon={ArrowRight} label="Expected outputs" value={outputsLabel} />
                    <SpecRow icon={ImageIcon} label="Image count" value={String(template.image_count)} />
                    <SpecRow icon={Film} label="Video count" value={String(template.video_count)} />
                    {template.aspect_ratio ? (
                      <SpecRow icon={Ratio} label="Aspect ratio" value={template.aspect_ratio} />
                    ) : null}
                    <SpecRow icon={Coins} label="Credit cost" value={costLabel} />
                    {formatMinutes(template.est_generation_seconds) ? (
                      <SpecRow
                        icon={Clock}
                        label="Estimated time"
                        value={formatMinutes(template.est_generation_seconds) as string}
                      />
                    ) : null}
                  </div>
                </div>

                <Button
                  type="button"
                  onClick={() => navigate(runTarget)}
                  className="w-full rounded-full bg-cyan-300 py-6 text-[12px] font-semibold uppercase tracking-[0.18em] text-slate-950 shadow-[0_0_40px_-12px_rgba(34,211,238,0.8)] hover:bg-cyan-200 sm:w-auto sm:px-10"
                >
                  Use this template
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Full example gallery */}
            <section>
              <div className="flex items-center gap-3">
                <h2 className="font-display text-lg font-semibold uppercase tracking-[-0.01em] text-white">
                  Examples
                </h2>
                <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-slate-500">
                  {template.gallery.length} {template.gallery.length === 1 ? "asset" : "assets"}
                </span>
              </div>
              <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,0.55fr)_minmax(0,1fr)]">
                <TemplateExampleGallery items={template.gallery} className="max-w-sm" />
                <div className="hidden gap-2 lg:grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))" }}>
                  {template.gallery.map((item, index) => (
                    <button
                      key={`grid-${item.id}`}
                      type="button"
                      onClick={() => setGridIndex(index)}
                      aria-label={item.label ?? `Example ${index + 1}`}
                      className={cn(
                        "relative aspect-[9/16] overflow-hidden rounded-xl border border-white/10 bg-black transition hover:border-cyan-300/50",
                      )}
                    >
                      <img
                        src={(item.media_type === "video" ? item.poster_url : item.url) ?? item.url}
                        alt={item.label ?? `Example ${index + 1}`}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                      {item.media_type === "video" ? (
                        <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-black/65 ring-1 ring-white/20">
                            <Play className="h-4 w-4 translate-x-[1px] fill-white text-white" />
                          </span>
                        </span>
                      ) : null}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            {isAdmin ? <AdminTemplateMediaManager templateId={template.id} /> : null}
          </div>
        )}
      </div>

      {featuredOpen && featuredLightboxItems.length ? (
        <TemplateMediaLightbox
          items={featuredLightboxItems}
          index={0}
          onIndexChange={() => undefined}
          onClose={() => setFeaturedOpen(false)}
        />
      ) : null}
    </SiteShell>
  );
}
