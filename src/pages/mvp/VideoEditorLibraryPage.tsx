import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Download, Loader2, Scissors } from "lucide-react";
import SiteShell from "@/components/mvp/SiteShell";
import PageMeta from "@/components/mvp/PageMeta";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import {
  ACTIVE_EXPORT_STATUSES,
  fetchExportDownload,
  fetchVideoEditorLibrary,
  type LibraryExport,
  type LibraryProject,
} from "@/services/videoEditorLibrary";

function formatWhen(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
}

function formatDuration(ms: number | null) {
  if (!ms) return "";
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function ProjectRow({ project }: { project: LibraryProject }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/25 p-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-white">{project.name || "Campaign edit"}</p>
        <p className="mt-1 text-[11px] text-slate-500">
          {project.timeline_count} on timeline · {project.media_count} available media · rev{" "}
          {project.revision}
          {project.updated_at ? ` · ${formatWhen(project.updated_at)}` : ""}
        </p>
      </div>
      {project.is_partial ? (
        <span className="rounded-lg border border-amber-300/30 bg-amber-400/10 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-amber-100">
          Partial
        </span>
      ) : null}
      <Button asChild size="sm" className="bg-cyan-400 text-slate-950 hover:bg-cyan-300">
        <Link to={`/editor/${project.id}`}>
          <Scissors className="mr-1.5 h-3.5 w-3.5" />
          Open
        </Link>
      </Button>
    </div>
  );
}

function ExportRow({ item }: { item: LibraryExport }) {
  const [busy, setBusy] = useState(false);

  const download = async () => {
    setBusy(true);
    try {
      const { ready, download_url } = await fetchExportDownload(item.id);
      if (!ready || !download_url) {
        toast({ title: "Still rendering", description: "This export isn't ready yet." });
        return;
      }
      const anchor = document.createElement("a");
      anchor.href = download_url;
      anchor.rel = "noopener";
      anchor.download = `FUSE_${(item.project_name || "campaign").replace(/\s+/g, "_")}.mp4`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } catch (e) {
      toast({
        title: "Download unavailable",
        description: e instanceof Error ? e.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const active = ACTIVE_EXPORT_STATUSES.has(item.status);

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/25 p-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-white">
          {item.project_name || "Campaign export"}
        </p>
        <p className="mt-1 text-[11px] text-slate-500">
          {item.status === "ready"
            ? "Ready"
            : active
              ? item.status === "queued"
                ? "Queued…"
                : "Rendering…"
              : item.status === "failed"
                ? "Failed"
                : item.status}
          {item.aspect_ratio ? ` · ${item.aspect_ratio}` : ""}
          {item.duration_ms ? ` · ${formatDuration(item.duration_ms)}` : ""}
          {item.created_at ? ` · ${formatWhen(item.created_at)}` : ""}
        </p>
      </div>
      {active ? <Loader2 className="h-4 w-4 animate-spin text-cyan-300" /> : null}
      {item.downloadable ? (
        <Button
          size="sm"
          disabled={busy}
          onClick={() => void download()}
          className="bg-cyan-400 text-slate-950 hover:bg-cyan-300"
        >
          {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1.5 h-3.5 w-3.5" />}
          Download
        </Button>
      ) : null}
    </div>
  );
}

function Section({
  title,
  children,
  count,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  if (!count) return null;
  return (
    <section className="mt-8">
      <h2 className="font-display text-[11px] uppercase tracking-[0.18em] text-slate-400">
        {title} · {count}
      </h2>
      <div className="mt-3 space-y-2">{children}</div>
    </section>
  );
}

/** Video Editor library — every edit project and export you own. */
export default function VideoEditorLibraryPage() {
  const query = useQuery({
    queryKey: ["video-editor-library"],
    queryFn: fetchVideoEditorLibrary,
    staleTime: 5_000,
    refetchInterval: (q) =>
      (q.state.data?.exports ?? []).some((item) => ACTIVE_EXPORT_STATUSES.has(item.status)) ? 6_000 : false,
  });

  const data = query.data;
  const buckets = useMemo(() => {
    const projects = data?.projects ?? [];
    const exports = data?.exports ?? [];
    return {
      drafts: projects.filter((p) => p.status === "draft"),
      partial: projects.filter((p) => p.is_partial && p.status !== "draft"),
      past: projects.filter((p) => p.status !== "draft" && !p.is_partial),
      activeExports: exports.filter((e) => ACTIVE_EXPORT_STATUSES.has(e.status)),
      completedExports: exports.filter((e) => e.status === "ready"),
      failedExports: exports.filter((e) => e.status === "failed"),
      downloadable: exports.filter((e) => e.downloadable),
    };
  }, [data]);

  return (
    <SiteShell>
      <PageMeta
        title="Video Editor · FUSE"
        description="Your FUSE campaign edits, drafts and video exports in one place."
        path="/app/video-editor"
        noindex
      />
      <div className="mx-auto w-full max-w-4xl px-4 pb-24 pt-6 sm:px-6">
        <h1 className="font-display text-xl uppercase tracking-[0.1em] text-white">Video Editor</h1>
        <p className="mt-1 text-sm text-slate-400">
          Pick up any edit where you left off, or download a finished export.
        </p>

        {query.isLoading ? (
          <div className="mt-16 flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-cyan-300" />
          </div>
        ) : query.isError ? (
          <p className="mt-8 text-sm text-slate-400">We couldn't load your video editor library.</p>
        ) : (
          <>
            <Section title="Drafts" count={buckets.drafts.length}>
              {buckets.drafts.map((project) => (
                <ProjectRow key={project.id} project={project} />
              ))}
            </Section>
            <Section title="Partial projects" count={buckets.partial.length}>
              {buckets.partial.map((project) => (
                <ProjectRow key={project.id} project={project} />
              ))}
            </Section>
            <Section title="Past projects" count={buckets.past.length}>
              {buckets.past.map((project) => (
                <ProjectRow key={project.id} project={project} />
              ))}
            </Section>
            <Section title="Active exports" count={buckets.activeExports.length}>
              {buckets.activeExports.map((item) => (
                <ExportRow key={item.id} item={item} />
              ))}
            </Section>
            <Section title="Completed exports" count={buckets.completedExports.length}>
              {buckets.completedExports.map((item) => (
                <ExportRow key={item.id} item={item} />
              ))}
            </Section>
            <Section title="Failed exports" count={buckets.failedExports.length}>
              {buckets.failedExports.map((item) => (
                <ExportRow key={item.id} item={item} />
              ))}
            </Section>
            <Section title="Downloadable history" count={buckets.downloadable.length}>
              {buckets.downloadable.map((item) => (
                <ExportRow key={`dl-${item.id}`} item={item} />
              ))}
            </Section>

            {!data?.projects.length && !data?.exports.length ? (
              <p className="mt-10 text-sm text-slate-400">
                Nothing here yet — generate a campaign and it'll show up for editing.
              </p>
            ) : null}
          </>
        )}
      </div>
    </SiteShell>
  );
}
