/**
 * MARKET3 — PUBLIC collection view at /c/:slug (works signed-out).
 *
 * RLS returns the row only when `is_public` is true (or the viewer owns it), so
 * private collections resolve to the clean "not found" state for everyone else.
 * The Share action copies the /c/:slug link and reveals an in-app share card —
 * no server OG-image generation.
 */

import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Copy, Share2 } from "lucide-react";
import SiteShell from "@/components/mvp/SiteShell";
import PageMeta from "@/components/mvp/PageMeta";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { fetchTemplates, type ApiTemplate } from "@/services/fuseApi";
import {
  getCollectionBySlug,
  listCollectionItems,
  type TemplateCollection,
} from "@/services/collections";

function ShareCard({
  collection,
  count,
  cover,
}: {
  collection: TemplateCollection;
  count: number;
  cover: string | null;
}) {
  return (
    <div className="relative overflow-hidden rounded-[1.5rem] border border-cyan-200/30 bg-slate-950">
      <div className="absolute inset-0 bg-[radial-gradient(120%_120%_at_20%_-10%,rgba(34,211,238,0.28),transparent_65%)]" />
      {cover ? (
        <img src={cover} alt="" className="absolute inset-0 h-full w-full object-cover opacity-30" />
      ) : null}
      <div className="relative flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:p-8">
        <div className="h-28 w-28 shrink-0 overflow-hidden rounded-2xl border border-white/15 bg-black">
          {cover ? (
            <img src={cover} alt={collection.title} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center font-display text-xs uppercase tracking-[0.2em] text-cyan-100">
              FUSE
            </div>
          )}
        </div>
        <div className="min-w-0 space-y-2">
          <p className="font-display text-[10px] uppercase tracking-[0.28em] text-cyan-100">
            FUSE Drop
          </p>
          <p className="font-display text-2xl font-semibold uppercase tracking-[-0.01em] text-white sm:text-3xl">
            {collection.title}
          </p>
          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">
            {count} {count === 1 ? "template" : "templates"}
          </p>
          {collection.description ? (
            <p className="max-w-md text-sm text-slate-300">{collection.description}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function TemplateTile({ template }: { template: ApiTemplate }) {
  return (
    <Link
      to="/app/templates"
      className="group overflow-hidden rounded-[1.25rem] border border-white/10 bg-slate-950/80 transition-colors hover:border-cyan-200/40"
    >
      <div className="relative aspect-[9/16] overflow-hidden bg-black">
        {template.preview_url && template.preview_asset_type !== "video" ? (
          <img
            src={template.preview_url}
            alt={template.name}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          />
        ) : template.preview_url ? (
          <video
            src={template.preview_url}
            muted
            loop
            playsInline
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(120%_120%_at_50%_-10%,rgba(34,211,238,0.2),transparent_70%)] text-[10px] uppercase tracking-[0.2em] text-slate-500">
            FUSE
          </div>
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-3">
          <p className="font-display text-xs font-semibold uppercase tracking-[0.08em] text-white">
            {template.name}
          </p>
          <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-slate-400">
            {template.output_type === "video" ? "Video" : "Images"}
          </p>
        </div>
      </div>
    </Link>
  );
}

export default function PublicCollectionPage() {
  const { slug = "" } = useParams();
  const [shareOpen, setShareOpen] = useState(false);

  const collectionQuery = useQuery({
    queryKey: ["public-collection", slug],
    queryFn: () => getCollectionBySlug(slug),
    retry: false,
  });
  const collection = collectionQuery.data ?? null;

  const { data: items = [] } = useQuery({
    queryKey: ["collection-items", collection?.id],
    queryFn: () => listCollectionItems(collection!.id),
    enabled: Boolean(collection?.id),
  });

  const { data: templates = [] } = useQuery({
    queryKey: ["mvp-templates"],
    queryFn: () => fetchTemplates(""),
    staleTime: 5 * 60 * 1000,
  });

  const ordered = useMemo(() => {
    const map: Record<string, ApiTemplate> = {};
    for (const template of templates) map[String(template.id)] = template;
    return items.map((item) => map[item.template_id]).filter(Boolean) as ApiTemplate[];
  }, [items, templates]);

  const cover = collection?.cover_url ?? ordered[0]?.preview_url ?? null;

  const share = async () => {
    setShareOpen(true);
    const url = `${window.location.origin}/c/${slug}`;
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "Link copied", description: url });
    } catch {
      toast({ title: "Copy this link", description: url });
    }
  };

  return (
    <SiteShell>
      <PageMeta
        title={collection ? `${collection.title} · FUSE Drop` : "FUSE Drop"}
        description={
          collection?.description?.slice(0, 155) ??
          "A curated FUSE drop of AI campaign templates."
        }
        path={`/c/${slug}`}
        image={cover}
      />

      <div className="container space-y-8 py-10">
        {collectionQuery.isLoading ? (
          <p className="text-sm text-slate-400">Loading drop…</p>
        ) : !collection ? (
          <div className="mx-auto max-w-lg space-y-3 rounded-2xl border border-white/10 bg-white/[0.02] p-10 text-center">
            <p className="font-display text-[10px] uppercase tracking-[0.24em] text-cyan-100">
              Drop
            </p>
            <h1 className="font-display text-2xl font-semibold uppercase text-white">
              This drop isn’t available
            </h1>
            <p className="text-sm text-slate-400">
              It may be private or the link may have changed.
            </p>
            <Button asChild className="rounded-full bg-cyan-300 text-slate-950 hover:bg-cyan-200">
              <Link to="/">Browse the marketplace</Link>
            </Button>
          </div>
        ) : (
          <>
            <ShareCard collection={collection} count={ordered.length} cover={cover} />

            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                onClick={() => void share()}
                className="rounded-full bg-cyan-300 text-slate-950 hover:bg-cyan-200"
              >
                <Share2 className="mr-1.5 h-4 w-4" /> Share drop
              </Button>
              {shareOpen ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-slate-300">
                  <Copy className="h-3.5 w-3.5 text-cyan-200" />
                  {`${window.location.origin}/c/${collection.slug}`}
                </span>
              ) : null}
              <Button asChild variant="ghost" className="rounded-full text-cyan-100">
                <Link to="/">
                  Explore all templates <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
            </div>

            {ordered.length === 0 ? (
              <p className="text-sm text-slate-400">
                This drop has no templates yet.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {ordered.map((template) => (
                  <TemplateTile key={String(template.id)} template={template} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </SiteShell>
  );
}
