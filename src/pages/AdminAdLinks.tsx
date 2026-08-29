/**
 * META AD LINKS — admin-only deep-link generator.
 *
 * Builds per-template destination URLs for Meta ads using the PUBLIC production
 * domain and the template NAME as the `template` ref (that's what the public
 * builder resolves). Read-only utility: no template, billing or workflow writes.
 */

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Copy, ExternalLink, Link2, Loader2 } from "lucide-react";
import SiteShell from "@/components/mvp/SiteShell";
import PageMeta from "@/components/mvp/PageMeta";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { fetchTemplates, type ApiTemplate } from "@/services/fuseApi";

const PROD_ORIGIN = "https://fuse-us.com";
const BUILDER_PATH = "/app/templates";

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

type RowOverrides = {
  source?: string;
  medium?: string;
  campaign?: string;
  content?: string;
};

function buildUrl(opts: {
  templateName?: string;
  source: string;
  medium: string;
  campaign?: string;
  content?: string;
}) {
  const params = new URLSearchParams();
  if (opts.templateName) params.set("template", opts.templateName);
  params.set("utm_source", opts.source || "meta");
  params.set("utm_medium", opts.medium || "paid_social");
  if (opts.campaign) params.set("utm_campaign", opts.campaign);
  if (opts.content) params.set("utm_content", opts.content);
  return `${PROD_ORIGIN}${BUILDER_PATH}?${params.toString()}`;
}

async function copy(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  } catch {
    toast.error("Couldn't copy — select the text manually");
  }
}

export default function AdminAdLinks() {
  const [overrides, setOverrides] = useState<Record<string, RowOverrides>>({});

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["admin-ad-links-templates"],
    queryFn: () => fetchTemplates(""),
    staleTime: 60_000,
  });

  const liveTemplates = useMemo(
    () => (templates as ApiTemplate[]).filter((t) => t.is_active !== false),
    [templates],
  );

  const rows = useMemo(
    () =>
      liveTemplates.map((template) => {
        const name = template.name;
        const base = slugify(name);
        const o = overrides[name] ?? {};
        const source = o.source ?? "meta";
        const medium = o.medium ?? "paid_social";
        const campaign = o.campaign ?? `${base}_acquisition`;
        const content = o.content ?? `${base}_reel_01`;
        return {
          name,
          source,
          medium,
          campaign,
          content,
          url: buildUrl({ templateName: name, source, medium, campaign, content }),
        };
      }),
    [liveTemplates, overrides],
  );

  const brandUrl = buildUrl({ source: "meta", medium: "paid_social", campaign: "brand_awareness" });

  const tsv = useMemo(
    () =>
      [
        ["Template", "Destination URL", "Campaign slug", "Content slug"].join("\t"),
        ...rows.map((r) => [r.name, r.url, r.campaign, r.content].join("\t")),
      ].join("\n"),
    [rows],
  );

  const patch = (name: string, next: RowOverrides) =>
    setOverrides((current) => ({ ...current, [name]: { ...current[name], ...next } }));

  return (
    <SiteShell>
      <PageMeta title="Meta Ad Links — FUSE Admin" description="Generate per-campaign Meta ad deep links." path="/admin/ad-links" noindex />
      <div className="container py-10">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-300">Admin</p>
            <h1 className="font-display text-3xl font-black uppercase tracking-tight text-white">Meta Ad Links</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-400">
              Template-specific ads should use these per-campaign deep links — they open the builder with that
              campaign preselected. Brand/awareness ads can use the plain link:{" "}
              <button
                type="button"
                onClick={() => void copy(brandUrl, "Brand link")}
                className="break-all text-left text-cyan-300 underline decoration-dotted"
              >
                {brandUrl}
              </button>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" asChild>
              <Link to="/admin/templates/merchandising">
                <Link2 className="mr-2 h-4 w-4" /> Merchandising
              </Link>
            </Button>
            <Button onClick={() => void copy(tsv, "TSV export")} disabled={!rows.length}>
              <Copy className="mr-2 h-4 w-4" /> Copy all (TSV)
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading campaigns…
          </div>
        ) : !rows.length ? (
          <p className="text-sm text-slate-400">No live campaigns available.</p>
        ) : (
          <div className="space-y-4">
            {rows.map((row) => (
              <div key={row.name} className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="font-display text-lg font-bold uppercase tracking-tight text-white">{row.name}</h2>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" asChild>
                      <a href={row.url} target="_blank" rel="noreferrer">
                        <ExternalLink className="mr-2 h-3.5 w-3.5" /> Open
                      </a>
                    </Button>
                    <Button size="sm" onClick={() => void copy(row.url, "Link")}>
                      <Copy className="mr-2 h-3.5 w-3.5" /> Copy link
                    </Button>
                  </div>
                </div>

                <Input readOnly value={row.url} className="mt-3 font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />

                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <label className="block text-xs text-slate-400">
                    Source
                    <Input
                      className="mt-1"
                      value={row.source}
                      onChange={(e) => patch(row.name, { source: slugify(e.target.value) })}
                    />
                  </label>
                  <label className="block text-xs text-slate-400">
                    Medium
                    <Input
                      className="mt-1"
                      value={row.medium}
                      onChange={(e) => patch(row.name, { medium: slugify(e.target.value) })}
                    />
                  </label>
                  <label className="block text-xs text-slate-400">
                    Campaign slug
                    <Input
                      className="mt-1"
                      value={row.campaign}
                      onChange={(e) => patch(row.name, { campaign: slugify(e.target.value) })}
                    />
                  </label>
                  <label className="block text-xs text-slate-400">
                    Content slug
                    <Input
                      className="mt-1"
                      value={row.content}
                      onChange={(e) => patch(row.name, { content: slugify(e.target.value) })}
                    />
                  </label>
                </div>
              </div>
            ))}

            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
              <h2 className="font-display text-lg font-bold uppercase tracking-tight text-white">Export</h2>
              <p className="mt-1 text-xs text-slate-400">Paste straight into a sheet or Ads Manager.</p>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-xs">
                  <thead className="text-slate-400">
                    <tr>
                      <th className="py-2 pr-4">Template</th>
                      <th className="py-2 pr-4">Destination URL</th>
                      <th className="py-2 pr-4">Campaign slug</th>
                      <th className="py-2">Content slug</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-200">
                    {rows.map((row) => (
                      <tr key={row.name} className="border-t border-white/5">
                        <td className="py-2 pr-4 font-semibold">{row.name}</td>
                        <td className="py-2 pr-4 font-mono break-all">{row.url}</td>
                        <td className="py-2 pr-4 font-mono">{row.campaign}</td>
                        <td className="py-2 font-mono">{row.content}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </SiteShell>
  );
}
