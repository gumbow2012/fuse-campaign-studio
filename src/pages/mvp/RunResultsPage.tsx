import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Check, Download, Loader2, RefreshCw, Scissors } from "lucide-react";
import SiteShell from "@/components/mvp/SiteShell";
import PageMeta from "@/components/mvp/PageMeta";
import { Button } from "@/components/ui/button";
import { fetchRunResults, retryFailedRun, type RunResults } from "@/services/runResults";
import { toast } from "@/hooks/use-toast";

/**
 * Partial-run recovery — every output a run DID finish, plus free retries.
 * Read-only: nothing here regenerates, hides, or re-charges finished outputs.
 */
export default function RunResultsPage() {
  const { runId } = useParams<{ runId: string }>();
  const navigate = useNavigate();
  const [results, setResults] = useState<RunResults | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [retryStarted, setRetryStarted] = useState(false);


  const load = useCallback(async () => {
    if (!runId) return;
    try {
      const next = await fetchRunResults(runId);
      setResults(next);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "We couldn't load this campaign's outputs.");
    }
  }, [runId]);

  useEffect(() => {
    setLoading(true);
    void load().finally(() => setLoading(false));
  }, [load]);

  const counts = results?.counts;
  const headline = useMemo(() => {
    if (!counts) return "";
    const total = counts.total || counts.completed + counts.failed;
    return counts.failed > 0
      ? `${counts.completed} of ${total} outputs ready · ${counts.failed} failed`
      : `${counts.completed} outputs ready`;
  }, [counts]);

  const editHref = results?.edit_project_id ? `/editor/${results.edit_project_id}` : null;
  const canEdit = !!editHref && (results?.editable || results?.has_video);

  const downloadOutput = async (url: string, index: number, type: string) => {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error("expired");
      const blob = await response.blob();
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = `FUSE_output_${index + 1}.${type === "image" ? "jpg" : "mp4"}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(href);
    } catch {
      await load();
      toast({ title: "Link refreshed", description: "Please tap download again." });
    }
  };

  const retryFailed = async () => {
    if (!runId || !results?.failed_steps.length) return;
    setRetrying(true);
    try {
      await retryFailedRun(runId);
      setRetryStarted(true);
      toast({
        title: "Retrying your clips",
        description: "Retried clips appear in the editor's Available Media, not on your timeline.",
      });
    } catch {
      toast({
        title: "Retry didn't start",
        description: "You can try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setRetrying(false);
      await load();
    }
  };


  if (loading) {
    return (
      <SiteShell>
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-cyan-300" />
        </div>
      </SiteShell>
    );
  }

  return (
    <SiteShell>
      <PageMeta
        title="Campaign outputs · FUSE"
        description="View, edit and retry the outputs your FUSE campaign generated."
        path={`/app/runs/${runId ?? ""}`}
        noindex
      />

      <div className="mx-auto w-full max-w-5xl px-4 pb-24 pt-6 sm:px-6">
        <Button
          asChild
          variant="outline"
          size="sm"
          className="border-white/10 bg-white/[0.03] text-slate-300"
        >
          <Link to="/app/campaigns">
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
            Your campaigns
          </Link>
        </Button>

        <h1 className="mt-4 font-display text-xl uppercase tracking-[0.1em] text-white">
          Campaign outputs
        </h1>
        <p className="mt-1 text-sm text-slate-400">{error ?? headline}</p>

        {results ? (
          <>
            <div className="mt-5 flex flex-wrap gap-2">
              {canEdit ? (
                <Button
                  onClick={() => navigate(editHref!)}
                  className="bg-cyan-400 font-display uppercase tracking-[0.08em] text-slate-950 hover:bg-cyan-300"
                >
                  <Scissors className="mr-2 h-4 w-4" />
                  Edit completed outputs
                </Button>
              ) : null}
              {results.failed_steps.length ? (
                <Button
                  variant="outline"
                  disabled={retrying}
                  onClick={() => void retryFailed()}
                  className="border-white/15 bg-white/[0.03] text-slate-200"
                >
                  {retrying ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-2 h-4 w-4" />
                  )}
                  Retry failed outputs (free)
                </Button>
              ) : null}
              {canEdit && results.failed_steps.length ? (
                <Button
                  variant="ghost"
                  onClick={() => navigate(editHref!)}
                  className="text-slate-300 hover:text-white"
                >
                  Continue without failed outputs
                </Button>
              ) : null}
            </div>

            {retrying || retryStarted ? (
              <p className="mt-3 text-[12px] text-cyan-100">
                {retrying ? "Starting your retries…" : "Retry started — your campaign is re-running."} Retried
                clips will appear in the editor's “Available Media”, not on your timeline.
              </p>
            ) : null}

            {results.failed_steps.length || results.error_summary ? (
              <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-sm text-slate-200">
                  {results.is_transient
                    ? "Some clips are temporarily unavailable and we're retrying them automatically."
                    : results.error_summary || "Some clips didn't finish."}
                </p>
                <p className="mt-1 text-[12px] text-slate-400">
                  You're never charged for clips that don't finish.
                </p>
              </div>
            ) : null}


            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {results.outputs.map((output, index) => (
                <div
                  key={`${output.step_id ?? output.node_id ?? index}`}
                  className="overflow-hidden rounded-2xl border border-white/10 bg-black/30"
                >
                  <div className="aspect-[9/16] w-full bg-black/60">
                    {output.type === "image" ? (
                      <img
                        src={output.url}
                        alt={output.label || `Campaign output ${index + 1}`}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <video
                        src={output.url}
                        controls
                        playsInline
                        preload="metadata"
                        className="h-full w-full object-cover"
                      />
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2 px-2 py-2">
                    <span className="truncate text-[11px] text-slate-300">
                      {output.label || `Output ${index + 1}`}
                    </span>
                    <button
                      type="button"
                      aria-label={`Download output ${index + 1}`}
                      onClick={() => void downloadOutput(output.url, index, output.type)}
                      className="rounded-lg border border-white/10 bg-white/[0.04] p-1.5 text-slate-300 hover:text-white"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {results.failed_steps.length ? (
              <div className="mt-6">
                <p className="font-display text-[11px] uppercase tracking-[0.18em] text-amber-200">
                  {retryStarted ? "Re-running" : "Needs retry"}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {results.failed_steps.map((step) => (
                    <span
                      key={step.step_id}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300/30 bg-amber-400/10 px-2.5 py-1.5 text-[11px] text-amber-100"
                    >
                      {retryStarted ? <Check className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                      {retryStarted ? "Retry started" : "Clip needs a retry"}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}


            {!results.outputs.length ? (
              <p className="mt-8 text-sm text-slate-400">
                This campaign didn't finish any outputs. Retrying is free.
              </p>
            ) : null}
          </>
        ) : null}
      </div>
    </SiteShell>
  );
}
