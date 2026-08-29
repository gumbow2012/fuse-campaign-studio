/**
 * PUBLIC creator storefront catalog.
 *
 * Shows ONLY this creator's published templates: the same public catalog the
 * marketplace reads (`fetchTemplates`, active versions only), filtered by the
 * template's public creator attribution (`fuse_templates.created_by`).
 * Run counts come from the real `public_template_popularity` RPC when it is
 * available — never fabricated.
 */

import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { fetchTemplates, type ApiTemplate } from "@/services/fuseApi";
import { supabase } from "@/integrations/supabase/client";
import FavoriteTemplateButton from "@/components/templates/FavoriteTemplateButton";
import { useTemplateFavorites } from "@/hooks/useTemplateFavorites";
import { useAuth } from "@/contexts/AuthContext";

function TemplateMedia({ template }: { template: ApiTemplate }) {
  const className = "aspect-[9/16] w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]";
  if (!template.preview_url) {
    return <div className={`${className} bg-white/[0.04]`} aria-hidden />;
  }
  if (template.preview_asset_type === "video") {
    return (
      <video
        src={template.preview_url}
        className={className}
        muted
        loop
        playsInline
        preload="metadata"
      />
    );
  }
  return (
    <img src={template.preview_url} alt={template.name} className={className} loading="lazy" />
  );
}

export default function CreatorTemplateCatalog({
  creatorUserId,
  handle,
}: {
  creatorUserId: string;
  handle: string;
}) {
  const { user } = useAuth();
  const { isFavorite, toggleFavorite } = useTemplateFavorites();

  const templatesQuery = useQuery({
    queryKey: ["creator-storefront-templates"],
    queryFn: () => fetchTemplates(""),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const { data: popularity = {} as Record<string, number> } = useQuery({
    queryKey: ["public-template-popularity", 90],
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "public_template_popularity" as never,
        { days: 90 } as never,
      );
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

  const templates = (templatesQuery.data ?? []).filter((template) => {
    const creator = template.creator;
    if (!creator) return false;
    return creator.userId === creatorUserId || creator.handle === handle;
  });

  if (templatesQuery.isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="aspect-[9/16] rounded-[1.25rem] border border-white/8 bg-white/[0.03]" aria-hidden />
        ))}
      </div>
    );
  }

  if (!templates.length) {
    return (
      <div className="rounded-[1.25rem] border border-white/8 bg-black/20 p-6 text-sm text-slate-300">
        No published templates yet.
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {templates.map((template) => {
        const id = String(template.id);
        const runs = popularity[String(template.templateId ?? id)] ?? popularity[id];
        const credits = template.estimated_credits_per_run || 0;
        return (
          <Link
            key={id}
            to={`/app/templates?template=${encodeURIComponent(id)}`}
            className="group overflow-hidden rounded-[1.25rem] border border-white/8 bg-black/20 transition-colors hover:border-white/20 hover:bg-white/[0.05]"
          >
            <div className="relative overflow-hidden bg-black/30">
              <TemplateMedia template={template} />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
              {user ? (
                <div onClick={(event) => event.preventDefault()}>
                  <FavoriteTemplateButton
                    favorite={isFavorite(id)}
                    onToggle={() => toggleFavorite(id)}
                    className="absolute bottom-3 right-3"
                  />
                </div>
              ) : null}
            </div>
            <div className="space-y-2 p-4">
              <p className="truncate text-sm font-semibold text-white">{template.name}</p>
              {template.description ? (
                <p className="line-clamp-2 text-xs leading-5 text-slate-300">{template.description}</p>
              ) : null}
              <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-slate-400">
                <span className="rounded-full border border-white/10 px-2.5 py-1">{credits} cr</span>
                {typeof runs === "number" ? (
                  <span className="rounded-full border border-white/10 px-2.5 py-1">
                    {runs.toLocaleString()} runs
                  </span>
                ) : null}
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
