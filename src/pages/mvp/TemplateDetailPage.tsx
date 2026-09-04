/**
 * CAMPAIGN PRODUCT PAGE — /templates/:slug
 *
 * Ecommerce-style PDP for a campaign template: one unified media gallery on the
 * left, a sticky product panel on the right (deliverables, uploads, cost and a
 * contextual CTA), then a short "how it works" strip, related campaigns and an
 * optional collapsed detail accordion.
 *
 * Presentation only. Credit cost comes from the same catalog the marketplace
 * cards read, entitlement state comes from the existing auth/profile context,
 * and `/templates/:slug/build` remains the single path into the builder.
 */

import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, ChevronDown } from "lucide-react";
import SiteShell from "@/components/mvp/SiteShell";
import PageMeta from "@/components/mvp/PageMeta";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import CampaignMediaGallery from "@/components/templates/CampaignMediaGallery";
import AdminTemplateMediaManager from "@/components/templates/AdminTemplateMediaManager";
import FavoriteTemplateButton from "@/components/templates/FavoriteTemplateButton";
import { useTemplateFavorites } from "@/hooks/useTemplateFavorites";
import { fetchTemplateDetailPage, type TemplateGalleryItem } from "@/services/templateDetailPage";
import { fetchTemplates, type ApiTemplate } from "@/services/fuseApi";
import { templateDetailPath, templateSlug } from "@/lib/templateSlug";

const STEPS = [
  { step: "01", title: "Pick", copy: "Choose this campaign" },
  { step: "02", title: "Upload", copy: "Add your products" },
  { step: "03", title: "Run", copy: "FUSE builds your version" },
];

function countLabel(count: number, singular: string) {
  return `${count} ${count === 1 ? singular : `${singular}s`}`;
}

function PanelBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-white/[0.08] pt-4">
      <p className="font-mono text-[9px] uppercase tracking-[0.24em] text-slate-500">{label}</p>
      <div className="mt-2 text-sm leading-6 text-slate-200">{children}</div>
    </div>
  );
}

export default function TemplateDetailPage() {
  const { slug = "" } = useParams();
  const navigate = useNavigate();
  const { user, profile, isAdmin, isCreator } = useAuth();
  const { canFavorite, isFavorite, toggleFavorite } = useTemplateFavorites();
  const [aboutOpen, setAboutOpen] = useState(false);

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

  const creditCost = catalogEntry ? Number(catalogEntry.estimated_credits_per_run) : null;
  const costLabel =
    creditCost != null ? `${creditCost} credits` : catalogQuery.isLoading ? "…" : "See builder";
  const favoriteId = String(catalogEntry?.id ?? template?.id ?? "");
  const buildPath = slug ? `/templates/${encodeURIComponent(slug)}/build` : "/app/templates";

  /** Merchandised media: hero first (video-first), then the returned order. */
  const galleryItems = useMemo<TemplateGalleryItem[]>(() => {
    if (!template) return [];
    const items = [...template.gallery];
    const hero = template.hero ?? template.featured ?? null;
    if (!hero?.url) return items;
    const existing = items.findIndex((item) => item.url === hero.url);
    if (existing >= 0) {
      const [match] = items.splice(existing, 1);
      return [match, ...items];
    }
    return [
      {
        id: "hero",
        media_type: hero.media_type,
        url: hero.url,
        poster_url: hero.poster_url,
        label: null,
        category: null,
        is_primary: true,
      },
      ...items,
    ];
  }, [template]);

  const uploadsLabel = template?.required_inputs.length
    ? template.required_inputs.map((input) => input.label).join(" · ")
    : "No product uploads required";

  const deliverables = template
    ? `${countLabel(template.image_count, "image")} · ${countLabel(template.video_count, "video clip")}`
    : "";

  const balance = Number(profile?.credits_balance ?? 0);
  const privileged = isAdmin || isCreator;
  const freeEligible = !user && catalogEntry?.free_preview_enabled === true;
  const shortOnCredits =
    !!user && !privileged && creditCost != null && balance < creditCost;

  const cta = freeEligible
    ? { label: "Try your first video free", sub: "Create an account and generate one video with your product." }
    : shortOnCredits
      ? { label: "Unlock access", sub: null }
      : { label: "Run campaign", sub: null };

  /** Other campaigns with a real preview, deduped by name. */
  const related = useMemo(() => {
    const seen = new Set<string>();
    const out: ApiTemplate[] = [];
    for (const entry of catalogQuery.data ?? []) {
      if (String(entry.id) === String(catalogEntry?.id ?? "")) continue;
      if (!entry.preview_url) continue;
      const key = entry.name.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(entry);
      if (out.length === 4) break;
    }
    return out;
  }, [catalogQuery.data, catalogEntry]);

  const ctaButton = (
    <Button
      type="button"
      onClick={() => navigate(buildPath)}
      className="w-full rounded-full bg-[hsl(var(--electric-cyan))] py-6 text-[12px] font-semibold uppercase tracking-[0.18em] text-slate-950 shadow-[0_0_40px_-12px_hsl(var(--electric-cyan)/0.85)] hover:bg-[hsl(var(--electric-blue))]"
    >
      {cta.label}
      <ArrowRight className="h-4 w-4" />
    </Button>
  );

  return (
    <SiteShell>
      <PageMeta
        title={template ? `${template.name} — FUSE Campaign` : "Campaign — FUSE"}
        description={
          template?.description?.slice(0, 155) ??
          "See what this FUSE campaign creates, what you upload, and what it costs to run."
        }
        path={`/templates/${slug}`}
        image={catalogEntry?.preview_url ?? null}
      />

      <div className="relative mx-auto w-full max-w-[1400px] px-4 py-6 pb-28 sm:px-6 lg:py-10 lg:pb-16">
        <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-72 bg-[radial-gradient(60%_100%_at_20%_0%,hsl(var(--electric-blue)/0.14),transparent_70%)]" />

        <Link
          to="/app/templates"
          className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-slate-400 transition hover:text-cyan-100"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Back
        </Link>

        {detailQuery.isLoading ? (
          <div className="mt-5 grid gap-8 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
            <div className="mx-auto aspect-[9/16] w-full max-w-sm animate-pulse rounded-[18px] bg-white/[0.06] lg:mx-0" />
            <div className="space-y-3">
              <div className="h-9 w-2/3 animate-pulse rounded bg-white/[0.06]" />
              <div className="h-16 w-full animate-pulse rounded bg-white/[0.05]" />
              <div className="h-40 w-full animate-pulse rounded-2xl bg-white/[0.04]" />
            </div>
          </div>
        ) : !template ? (
          <div className="mt-10 rounded-2xl border border-white/10 bg-black/30 p-8 text-center">
            <h1 className="font-display text-2xl font-semibold uppercase tracking-[-0.01em] text-white">
              Campaign not found
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
          <>
            {/* PRODUCT AREA */}
            <div className="mt-5 grid items-start gap-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:gap-12">
              <CampaignMediaGallery
                items={galleryItems}
                name={template.name}
                className="mx-auto w-full max-w-sm lg:mx-0 lg:max-w-md"
              />

              <div className="lg:sticky lg:top-24">
                <div className="rounded-[20px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.012))] p-6 backdrop-blur-sm">
                  <p className="font-mono text-[9px] uppercase tracking-[0.26em] text-[hsl(var(--electric-cyan))]">
                    Campaign template
                  </p>
                  <h1 className="mt-2 font-display text-3xl font-bold uppercase leading-[1.05] tracking-[-0.02em] text-white sm:text-4xl">
                    {template.name}
                  </h1>
                  {template.description ? (
                    <p className="mt-3 text-sm leading-6 text-slate-400">{template.description}</p>
                  ) : null}

                  <p className="mt-4 text-sm font-semibold text-white">{deliverables}</p>
                  <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.2em] text-slate-400">
                    {[template.aspect_ratio, costLabel].filter(Boolean).join(" · ")}
                  </p>

                  <div className="mt-5 space-y-4">
                    <PanelBlock label="You'll add">{uploadsLabel}</PanelBlock>
                    <PanelBlock label="You'll get">
                      {countLabel(template.image_count, "campaign image")} +{" "}
                      {countLabel(template.video_count, "video clip")}
                    </PanelBlock>
                  </div>

                  <div className="mt-6 space-y-3">
                    {ctaButton}
                    {cta.sub ? (
                      <p className="text-center text-[11px] leading-5 text-slate-400">{cta.sub}</p>
                    ) : null}
                    {canFavorite && favoriteId ? (
                      <div className="flex justify-center">
                        <FavoriteTemplateButton
                          favorite={isFavorite(favoriteId)}
                          onToggle={() => toggleFavorite(favoriteId)}
                          label={isFavorite(favoriteId) ? "Saved" : "Save"}
                          className="px-4 py-2"
                        />
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>

            {/* HOW IT WORKS */}
            <section className="mt-14">
              <h2 className="font-display text-lg font-semibold uppercase tracking-[-0.01em] text-white">
                How it works
              </h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {STEPS.map((entry) => (
                  <div
                    key={entry.step}
                    className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5"
                  >
                    <p className="font-mono text-[10px] tracking-[0.24em] text-[hsl(var(--electric-cyan))]">
                      {entry.step}
                    </p>
                    <p className="mt-2 font-display text-base font-semibold uppercase tracking-[-0.01em] text-white">
                      {entry.title}
                    </p>
                    <p className="mt-1 text-sm text-slate-400">{entry.copy}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* MORE CAMPAIGNS LIKE THIS */}
            {related.length ? (
              <section className="mt-12">
                <h2 className="font-display text-lg font-semibold uppercase tracking-[-0.01em] text-white">
                  More campaigns like this
                </h2>
                <div className="mt-4 grid gap-3 grid-cols-2 sm:grid-cols-4">
                  {related.map((entry) => (
                    <Link
                      key={String(entry.id)}
                      to={templateDetailPath(entry)}
                      className="group overflow-hidden rounded-[14px] border border-white/10 bg-black transition hover:border-[hsl(var(--electric-blue)/0.5)]"
                    >
                      <div className="aspect-[9/16] w-full overflow-hidden bg-[linear-gradient(180deg,hsl(var(--navy-mid)/0.85),hsl(var(--navy-deep)))]">
                        {entry.preview_url ? (
                          <img
                            src={entry.preview_url}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
                          />
                        ) : null}
                      </div>
                      <p className="truncate px-3 py-2.5 font-display text-[12px] font-semibold uppercase tracking-[0.02em] text-white">
                        {entry.name}
                      </p>
                    </Link>
                  ))}
                </div>
              </section>
            ) : null}

            {/* ABOUT THIS CAMPAIGN — collapsed */}
            <section className="mt-12">
              <button
                type="button"
                onClick={() => setAboutOpen((open) => !open)}
                aria-expanded={aboutOpen}
                className="flex w-full items-center justify-between gap-4 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-5 py-4 text-left transition hover:border-white/20"
              >
                <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-slate-300">
                  About this campaign
                </span>
                <ChevronDown
                  className={cn("h-4 w-4 text-slate-400 transition", aboutOpen && "rotate-180")}
                  aria-hidden
                />
              </button>
              {aboutOpen ? (
                <div className="mt-3 space-y-3 rounded-2xl border border-white/[0.08] bg-black/25 p-5 text-sm leading-6 text-slate-300">
                  {template.description ? <p>{template.description}</p> : null}
                  <p>
                    <span className="text-slate-500">You upload:</span> {uploadsLabel}
                  </p>
                  <p>
                    <span className="text-slate-500">You get:</span> {deliverables}
                  </p>
                  {template.aspect_ratio ? (
                    <p>
                      <span className="text-slate-500">Format:</span> {template.aspect_ratio}
                    </p>
                  ) : null}
                  <p>
                    <span className="text-slate-500">Cost to run:</span> {costLabel}
                  </p>
                </div>
              ) : null}
            </section>

            {isAdmin ? (
              <div className="mt-12">
                <AdminTemplateMediaManager templateId={template.id} />
              </div>
            ) : null}
          </>
        )}
      </div>

      {/* MOBILE STICKY CTA — the desktop panel is already sticky */}
      {template ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[hsl(var(--navy-deep)/0.94)] px-4 py-3 backdrop-blur-xl lg:hidden">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-display text-[13px] font-semibold uppercase tracking-[0.04em] text-white">
                {template.name}
              </p>
              <p className="truncate font-mono text-[9px] uppercase tracking-[0.2em] text-slate-500">
                {[deliverables, costLabel].filter(Boolean).join(" · ")}
              </p>
            </div>
            <Button
              type="button"
              onClick={() => navigate(buildPath)}
              className="shrink-0 rounded-full bg-[hsl(var(--electric-cyan))] px-5 py-5 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-950 hover:bg-[hsl(var(--electric-blue))]"
            >
              {cta.label}
            </Button>
          </div>
        </div>
      ) : null}
    </SiteShell>
  );
}
