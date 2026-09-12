/**
 * CAMPAIGN DETAIL / GENERATION PAGE — /templates/:slug
 *
 * Calm, product-first layout: media gallery on the left, editorial headline plus
 * the real setup flow on the right (references → summary → generate), then an
 * optional reference guide, how-it-works, related campaigns and details.
 *
 * The inputs shown here come ONLY from this campaign's real configuration
 * (catalog `input_schema`, falling back to the detail endpoint's
 * `required_inputs`). Interface artwork is illustration only — it never counts
 * as an uploaded reference, and missing/failed configuration never enables
 * generation. Auth, routing, media, saving and the run pipeline are unchanged.
 */

import { useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ChevronDown } from "lucide-react";
import InlineCampaignRunPanel from "@/components/templates/InlineCampaignRunPanel";
import CampaignBodyGuide, { bodyGuideFields } from "@/components/campaigns/CampaignBodyGuide";

import SiteShell from "@/components/mvp/SiteShell";
import PageMeta from "@/components/mvp/PageMeta";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import CampaignMediaGallery from "@/components/templates/CampaignMediaGallery";
import AdminTemplateMediaManager from "@/components/templates/AdminTemplateMediaManager";
import FavoriteTemplateButton from "@/components/templates/FavoriteTemplateButton";
import { useTemplateFavorites } from "@/hooks/useTemplateFavorites";
import { fetchTemplateDetailPage, type TemplateGalleryItem } from "@/services/templateDetailPage";
import { fetchTemplates, type ApiTemplate } from "@/services/fuseApi";
import { templateDetailPath, templateSlug } from "@/lib/templateSlug";
import {
  aspectRatioLine,
  campaignCopy,
  deliverablesLine,
  normalizeCampaignFields,
  type CampaignFieldsState,
} from "@/lib/campaignFields";

const STEPS = [
  { title: "Add your references", copy: "Upload the products this campaign uses." },
  { title: "Generate", copy: "FUSE builds your version of the campaign." },
  { title: "Download", copy: "Take the images and clips straight to your feed." },
];

export default function TemplateDetailPage() {
  const { slug = "" } = useParams();
  const { isAdmin } = useAuth();
  const { canFavorite, isFavorite, toggleFavorite } = useTemplateFavorites();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [guideSelection, setGuideSelection] = useState<string | null>(null);
  /** Lifecycle of the in-page run — drives the mobile bar's label only. */
  const [runPhase, setRunPhase] = useState<"idle" | "inputs" | "running" | "complete" | "failed">(
    "idle",
  );
  const setupRef = useRef<HTMLDivElement>(null);

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
  const favoriteId = String(catalogEntry?.id ?? template?.id ?? "");

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

  const deliverables = template ? deliverablesLine(template.image_count, template.video_count) : "";
  const aspectLabel = aspectRatioLine(template?.aspect_ratio);
  const costLabel =
    creditCost != null ? `${creditCost} credits` : catalogQuery.isLoading ? "…" : "Shown at generate";

  /**
   * REAL configuration only. The catalog `input_schema` carries the pipeline's
   * input keys, so it wins when usable; when it is missing/empty the detail
   * endpoint's `required_inputs` is the source of truth. Loading and failure are
   * distinct states — neither is ever treated as "no inputs needed".
   */
  const configState = useMemo<CampaignFieldsState>(() => {
    if (detailQuery.isLoading || catalogQuery.isLoading) return { status: "loading" };
    if (detailQuery.isError || catalogQuery.isError || !template) {
      return {
        status: "error",
        message: "We couldn't reach this campaign's setup. Check your connection and try again.",
      };
    }

    const required = template.required_inputs ?? [];
    const schema = Array.isArray(catalogEntry?.input_schema)
      ? catalogEntry!.input_schema!.filter((entry) => entry && !!String(entry.key ?? "").trim())
      : [];

    if (schema.length) {
      return {
        status: "ready",
        fields: normalizeCampaignFields(
          schema.map((entry, index) => ({
            key: String(entry.key),
            label: String(entry.label || required[index]?.label || ""),
            type: String(entry.type || required[index]?.expected || "image"),
            required: entry.required !== false,
          })),
        ),
      };
    }

    return {
      status: "ready",
      fields: normalizeCampaignFields(
        required.map((input) => ({
          key: input.name,
          label: input.label || "",
          type: String(input.expected || "image"),
          required: true,
        })),
      ),
    };
  }, [
    catalogEntry,
    catalogQuery.isError,
    catalogQuery.isLoading,
    detailQuery.isError,
    detailQuery.isLoading,
    template,
  ]);

  const fields = configState.status === "ready" ? configState.fields : [];
  const copy = campaignCopy(fields, template?.description);
  const guideFields = bodyGuideFields(fields);
  /* The guide only earns its space when several body references are configured. */
  const showGuide = configState.status === "ready" && guideFields.length >= 2;

  const runVersionId = catalogEntry ? String(catalogEntry.versionId ?? catalogEntry.id) : null;
  const runTemplateId = String(catalogEntry?.templateId ?? template?.id ?? "");

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

  const retryConfig = () => {
    void detailQuery.refetch();
    void catalogQuery.refetch();
  };

  return (
    <SiteShell>
      <PageMeta
        title={template ? `${template.name} — FUSE Campaign` : "Campaign — FUSE"}
        description={
          template?.description?.slice(0, 155) ??
          "See what this FUSE campaign creates, what you add, and what it costs to generate."
        }
        path={`/templates/${slug}`}
        image={catalogEntry?.preview_url ?? null}
      />

      <div className="campaign-surface mx-auto w-full max-w-[1180px] px-5 py-6 pb-28 sm:px-8 lg:py-12 lg:pb-16">
        {/* LOCAL HEADER */}
        <header className="flex items-center justify-between gap-4">
          <Link
            to="/app/templates"
            className="inline-flex min-h-[44px] items-center gap-2 text-[15px] text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Campaigns
          </Link>
          {canFavorite && favoriteId ? (
            <FavoriteTemplateButton
              favorite={isFavorite(favoriteId)}
              onToggle={() => toggleFavorite(favoriteId)}
              label={isFavorite(favoriteId) ? "Saved" : "Save"}
              className="px-4 py-2"
            />
          ) : null}
        </header>

        {detailQuery.isLoading ? (
          <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="mx-auto aspect-[9/16] w-full max-w-[340px] animate-pulse rounded-[24px] bg-muted/50 motion-reduce:animate-none lg:mx-0" />
            <div className="space-y-4">
              <div className="h-10 w-2/3 animate-pulse rounded-full bg-muted/50 motion-reduce:animate-none" />
              <div className="h-5 w-full animate-pulse rounded-full bg-muted/40 motion-reduce:animate-none" />
              <div className="h-44 w-full animate-pulse rounded-[22px] bg-muted/30 motion-reduce:animate-none" />
            </div>
          </div>
        ) : !template ? (
          <div className="mt-12 rounded-[22px] border border-border/70 bg-muted/20 p-10 text-center">
            <h1 className="text-[24px] font-semibold text-foreground">Campaign not found</h1>
            <p className="mx-auto mt-2 max-w-sm text-[15px] leading-6 text-muted-foreground">
              This campaign isn't available right now. Browse the full collection instead.
            </p>
            <Link
              to="/app/templates"
              className="mt-6 inline-flex min-h-[48px] items-center rounded-full bg-primary px-6 text-[15px] font-semibold text-primary-foreground transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Explore campaigns
            </Link>
          </div>
        ) : (
          <>
            {/* PRODUCT + SETUP */}
            <div className="mt-8 grid items-start gap-10 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1fr)] lg:gap-16">
              <div className="space-y-6 lg:sticky lg:top-24">
                <CampaignMediaGallery
                  items={galleryItems}
                  name={template.name}
                  className="mx-auto w-full max-w-[340px] lg:mx-0 lg:max-w-none"
                />
                {showGuide ? (
                  <div className="hidden lg:block">
                    <h2 className="text-[17px] font-semibold text-foreground">Where each piece lands</h2>
                    <p className="mt-1 text-[14px] leading-6 text-muted-foreground">
                      A guide to the references this campaign uses.
                    </p>
                    <div className="mt-3">
                      <CampaignBodyGuide
                        fields={guideFields}
                        selectedId={guideSelection}
                        onSelect={setGuideSelection}
                      />
                    </div>
                  </div>
                ) : null}
              </div>

              <div ref={setupRef} className="scroll-mt-24">
                <p className="text-[13px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  {template.name}
                </p>
                <h1 className="mt-2 text-[34px] font-semibold leading-[1.08] text-foreground sm:text-[44px]">
                  {copy.headline}
                </h1>
                <p className="mt-3 max-w-md text-[17px] leading-7 text-muted-foreground">
                  {copy.description}
                </p>
                {deliverables || aspectLabel ? (
                  <p className="mt-3 text-[15px] text-muted-foreground">
                    {[deliverables, aspectLabel].filter(Boolean).join(" · ")}
                  </p>
                ) : null}

                {runTemplateId || configState.status !== "ready" ? (
                  <InlineCampaignRunPanel
                    className="mt-8"
                    templateId={runTemplateId}
                    versionId={runVersionId}
                    templateName={template.name}
                    slug={slug}
                    creditCost={creditCost}
                    freePreviewEnabled={catalogEntry?.free_preview_enabled === true}
                    configState={configState}
                    deliverables={deliverables}
                    aspectLabel={aspectLabel}
                    onRetryConfig={retryConfig}
                    onPhaseChange={setRunPhase}
                  />
                ) : null}

                {showGuide ? (
                  <div className="mt-10 lg:hidden">
                    <h2 className="text-[17px] font-semibold text-foreground">Where each piece lands</h2>
                    <div className="mt-3">
                      <CampaignBodyGuide
                        fields={guideFields}
                        selectedId={guideSelection}
                        onSelect={setGuideSelection}
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            {/* HOW IT WORKS */}
            <section className="mt-16 border-t border-border/60 pt-10">
              <h2 className="text-[22px] font-semibold text-foreground">How it works</h2>
              <ol className="mt-5 grid gap-5 sm:grid-cols-3">
                {STEPS.map((entry, index) => (
                  <li key={entry.title}>
                    <p className="text-[13px] font-medium text-primary">Step {index + 1}</p>
                    <p className="mt-1 text-[17px] font-semibold text-foreground">{entry.title}</p>
                    <p className="mt-1 text-[15px] leading-6 text-muted-foreground">{entry.copy}</p>
                  </li>
                ))}
              </ol>
            </section>

            {/* MORE CAMPAIGNS */}
            {related.length ? (
              <section className="mt-14 border-t border-border/60 pt-10">
                <h2 className="text-[22px] font-semibold text-foreground">More campaigns</h2>
                <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
                  {related.map((entry) => (
                    <Link
                      key={String(entry.id)}
                      to={templateDetailPath(entry)}
                      className="group overflow-hidden rounded-[18px] border border-border/70 bg-muted/20 transition hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <div className="aspect-[9/16] w-full overflow-hidden bg-muted/40">
                        <img
                          src={entry.preview_url ?? undefined}
                          alt={`${entry.name} preview`}
                          loading="lazy"
                          decoding="async"
                          className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.02] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                        />
                      </div>
                      <p className="truncate px-3 py-3 text-[14px] font-medium text-foreground">
                        {entry.name}
                      </p>
                    </Link>
                  ))}
                </div>
              </section>
            ) : null}

            {/* DETAILS */}
            <section className="mt-14 border-t border-border/60 pt-6">
              <button
                type="button"
                onClick={() => setDetailsOpen((open) => !open)}
                aria-expanded={detailsOpen}
                aria-controls="campaign-details"
                className="flex min-h-[52px] w-full items-center justify-between gap-4 text-left text-[17px] font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Campaign details
                <ChevronDown
                  className={cn(
                    "h-5 w-5 text-muted-foreground transition motion-reduce:transition-none",
                    detailsOpen && "rotate-180",
                  )}
                  aria-hidden
                />
              </button>
              {detailsOpen ? (
                <dl id="campaign-details" className="space-y-3 pb-2 text-[15px] leading-6">
                  {template.description ? (
                    <p className="text-muted-foreground">{template.description}</p>
                  ) : null}
                  <div className="flex justify-between gap-6">
                    <dt className="text-muted-foreground">You add</dt>
                    <dd className="text-right text-foreground">
                      {configState.status !== "ready"
                        ? "Loading…"
                        : fields.length
                          ? fields.map((field) => field.label).join(" · ")
                          : "Nothing — this campaign runs on its own"}
                    </dd>
                  </div>
                  {deliverables ? (
                    <div className="flex justify-between gap-6">
                      <dt className="text-muted-foreground">You get</dt>
                      <dd className="text-right text-foreground">{deliverables}</dd>
                    </div>
                  ) : null}
                  {aspectLabel ? (
                    <div className="flex justify-between gap-6">
                      <dt className="text-muted-foreground">Format</dt>
                      <dd className="text-right text-foreground">{aspectLabel}</dd>
                    </div>
                  ) : null}
                  <div className="flex justify-between gap-6">
                    <dt className="text-muted-foreground">Cost to generate</dt>
                    <dd className="text-right text-foreground">{costLabel}</dd>
                  </div>
                </dl>
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

      {/* MOBILE BAR — jumps to the real setup; the desktop column is sticky */}
      {template ? (
        <div className="campaign-surface fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-background/95 px-5 py-3 backdrop-blur-xl lg:hidden">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="truncate text-[15px] font-medium text-foreground">{template.name}</p>
              <p className="truncate text-[13px] text-muted-foreground">
                {[deliverables, creditCost != null ? `${creditCost} credits` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setupRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
              className="shrink-0 rounded-full bg-primary px-5 py-3 text-[15px] font-semibold text-primary-foreground transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {runPhase === "complete"
                ? "See results"
                : runPhase === "running"
                  ? "Generating…"
                  : "Get started"}
            </button>
          </div>
        </div>
      ) : null}
    </SiteShell>
  );
}
