/**
 * /templates/:slug/build — the ONLY entry point from a template product page
 * into the campaign builder. It resolves the slug against the catalog and hands
 * the builder its existing `?template=` deep link, replacing this hop in
 * history so browser Back returns to the product page.
 */

import { Navigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchTemplates, type ApiTemplate } from "@/services/fuseApi";
import { templateSlug } from "@/lib/templateSlug";

export default function TemplateBuildRedirectPage() {
  const { slug = "" } = useParams();

  const { data, isLoading } = useQuery<ApiTemplate[]>({
    queryKey: ["templates"],
    queryFn: () => fetchTemplates(""),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
          Opening builder…
        </p>
      </div>
    );
  }

  const match = (data ?? []).find((entry) => templateSlug(entry) === slug) ?? null;
  const target = match
    ? `/app/templates?template=${encodeURIComponent(String(match.id))}`
    : "/app/templates";

  return <Navigate to={target} replace />;
}
