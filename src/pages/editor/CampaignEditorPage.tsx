import { useCallback, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check, Download, Loader2, Redo2, Undo2 } from "lucide-react";
import SiteShell from "@/components/mvp/SiteShell";
import PageMeta from "@/components/mvp/PageMeta";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import PreviewPlayer from "@/components/editor/PreviewPlayer";
import EditorTimeline from "@/components/editor/EditorTimeline";
import ClipPanel from "@/components/editor/ClipPanel";
import UnusedClips from "@/components/editor/UnusedClips";
import ExportModal from "@/components/editor/ExportModal";
import { useCampaignEditor } from "@/hooks/useCampaignEditor";
import { clipDurationMs, formatSeconds, formatTimecode } from "@/services/campaignEditor";

/** FUSE Campaign Editor — assemble the clips a campaign generated. */
export default function CampaignEditorPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const editor = useCampaignEditor(projectId);
  const {
    project,
    active,
    unused,
    durationMs,
    loading,
    loadError,
    saveState,
    selectedId,
    setSelectedId,
    runOp,
    undo,
    redo,
    canUndo,
    canRedo,
  } = editor;

  const [currentMs, setCurrentMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [seekNonce, setSeekNonce] = useState(0);
  const [exportOpen, setExportOpen] = useState(false);
  const trimDraftRef = useRef<{ id: string; start: number; end: number } | null>(null);

  const selected = useMemo(
    () => active.find((segment) => segment.id === selectedId) ?? null,
    [active, selectedId],
  );
  const selectedIndex = selected ? active.findIndex((segment) => segment.id === selected.id) : -1;

  const seek = useCallback((ms: number) => {
    setCurrentMs(Math.max(0, ms));
    setSeekNonce((nonce) => nonce + 1);
  }, []);

  /* Live trim feedback (optimistic, debounced save on release). */
  const onTrim = useCallback(
    (id: string, startMs: number, endMs: number) => {
      trimDraftRef.current = { id, start: startMs, end: endMs };
      runOp({ op: "trim", payload: { segment_id: id, trim_start_ms: startMs, trim_end_ms: endMs } });
    },
    [runOp],
  );

  const onTrimCommit = useCallback(
    (id: string, startMs: number, endMs: number) => {
      trimDraftRef.current = null;
      runOp(
        { op: "trim", payload: { segment_id: id, trim_start_ms: startMs, trim_end_ms: endMs } },
        { immediate: true, record: false },
      );
      seek(0);
    },
    [runOp, seek],
  );

  const saveLabel =
    saveState === "saving"
      ? "Saving…"
      : saveState === "saved"
        ? "Saved"
        : saveState === "error"
          ? "Retrying…"
          : "";

  if (loading) {
    return (
      <SiteShell>
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-cyan-300" />
        </div>
      </SiteShell>
    );
  }

  if (loadError || !project) {
    return (
      <SiteShell>
        <div className="mx-auto max-w-md px-4 py-24 text-center">
          <h1 className="font-display text-xl uppercase tracking-[0.12em] text-white">
            Editor unavailable
          </h1>
          <p className="mt-3 text-sm text-slate-400">
            {loadError ?? "We couldn't open this campaign edit."} Your generated outputs are still
            available to view and download.
          </p>
          <Button asChild className="mt-6 bg-cyan-400 text-slate-950 hover:bg-cyan-300">
            <Link to="/app/templates">View all outputs</Link>
          </Button>
        </div>
      </SiteShell>
    );
  }

  const singleClip = active.length === 1 && unused.length === 0;

  return (
    <SiteShell>
      <PageMeta
        title="Campaign Editor · FUSE"
        description="Trim, reorder and export the video clips your FUSE campaign generated."
      />

      <div className="mx-auto w-full max-w-6xl px-4 pb-32 pt-6 sm:px-6">
        {/* Header */}
        <div className="flex flex-wrap items-center gap-3">
          <Button
            asChild
            variant="outline"
            size="sm"
            className="border-white/10 bg-white/[0.03] text-slate-300"
          >
            <Link to="/app/templates">
              <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
              Back
            </Link>
          </Button>
          <div className="min-w-0">
            <h1 className="truncate font-display text-lg uppercase tracking-[0.1em] text-white sm:text-xl">
              {project.name || "Campaign edit"}
            </h1>
            <p className="text-[11px] text-slate-500">
              {active.length} clips · {formatTimecode(durationMs)} · {project.aspect_ratio ?? "9:16"}
            </p>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <span
              className={`flex min-w-[68px] items-center justify-end gap-1 text-[11px] ${
                saveState === "error" ? "text-amber-200" : "text-slate-400"
              }`}
              aria-live="polite"
            >
              {saveState === "saving" ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              {saveState === "saved" ? <Check className="h-3 w-3 text-cyan-300" /> : null}
              {saveLabel}
            </span>
            <button
              type="button"
              aria-label="Undo"
              disabled={!canUndo}
              onClick={undo}
              className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 bg-white/[0.03] text-slate-300 disabled:opacity-35"
            >
              <Undo2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Redo"
              disabled={!canRedo}
              onClick={redo}
              className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 bg-white/[0.03] text-slate-300 disabled:opacity-35"
            >
              <Redo2 className="h-4 w-4" />
            </button>
            <Button
              type="button"
              onClick={() => setExportOpen(true)}
              className="hidden bg-cyan-400 font-display uppercase tracking-[0.08em] text-slate-950 hover:bg-cyan-300 md:inline-flex"
            >
              Export video
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>

        {singleClip && selected ? (
          /* FREE-FIRST single clip — no empty timeline, just the essentials. */
          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <PreviewPlayer
              segments={active}
              aspectRatio={project.aspect_ratio}
              currentMs={currentMs}
              onCurrentMs={setCurrentMs}
              seekNonce={seekNonce}
              playing={playing}
              onPlayingChange={setPlaying}
            />
            <div className="space-y-4">
              <div className="rounded-2xl border border-cyan-300/25 bg-slate-950/70 p-4">
                <h2 className="font-display text-sm uppercase tracking-[0.16em] text-white">Your video</h2>
                <p className="mt-1 text-[11px] text-slate-500">
                  {formatSeconds(clipDurationMs(selected))} of{" "}
                  {formatSeconds(selected.source_duration_ms)}
                </p>
                <div className="mt-4">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-slate-400">Trim</p>
                  <Slider
                    className="mt-3"
                    min={0}
                    max={Math.max(selected.source_duration_ms, 1000)}
                    step={100}
                    value={[selected.trim_start_ms, selected.trim_end_ms]}
                    aria-label="Trim video"
                    onValueChange={([start, end]) => {
                      if (end - start < 400) return;
                      onTrim(selected.id, start, end);
                    }}
                    onValueCommit={([start, end]) => onTrimCommit(selected.id, start, end)}
                  />
                  <div className="mt-2 flex justify-between font-mono text-[10px] text-slate-500">
                    <span>{formatSeconds(selected.trim_start_ms)}</span>
                    <span>{formatSeconds(selected.trim_end_ms)}</span>
                  </div>
                </div>
                {selected.url ? (
                  <Button asChild className="mt-5 w-full bg-cyan-400 text-slate-950 hover:bg-cyan-300">
                    <a href={selected.url} download>
                      <Download className="mr-2 h-4 w-4" />
                      Download
                    </a>
                  </Button>
                ) : null}
              </div>
              <ClipPanel
                segment={selected}
                clipNumber={1}
                onVolume={(volume) => runOp({ op: "volume", payload: { segment_id: selected.id, volume } })}
                onMute={(muted) => runOp({ op: "mute", payload: { segment_id: selected.id, muted } })}
                onDuplicate={() => runOp({ op: "duplicate", payload: { segment_id: selected.id } })}
                onRemove={() => runOp({ op: "remove", payload: { segment_id: selected.id } })}
              />
            </div>
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
              <PreviewPlayer
                segments={active}
                aspectRatio={project.aspect_ratio}
                currentMs={currentMs}
                onCurrentMs={setCurrentMs}
                seekNonce={seekNonce}
                playing={playing}
                onPlayingChange={setPlaying}
              />
              <div className="space-y-4">
                {selected ? (
                  <ClipPanel
                    segment={selected}
                    clipNumber={selectedIndex + 1}
                    onVolume={(volume) =>
                      runOp({ op: "volume", payload: { segment_id: selected.id, volume } })
                    }
                    onMute={(muted) => runOp({ op: "mute", payload: { segment_id: selected.id, muted } })}
                    onDuplicate={() => runOp({ op: "duplicate", payload: { segment_id: selected.id } })}
                    onRemove={() => runOp({ op: "remove", payload: { segment_id: selected.id } })}
                  />
                ) : (
                  <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4 text-sm text-slate-400">
                    Tap a clip on the timeline to edit it.
                  </div>
                )}
              </div>
            </div>

            <EditorTimeline
              segments={active}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onReorder={(order) => {
                runOp({ op: "reorder", payload: { order } }, { immediate: true });
                seek(0);
              }}
              onTrim={onTrim}
              onTrimCommit={onTrimCommit}
              currentMs={currentMs}
              onSeek={seek}
            />

            <UnusedClips
              segments={unused}
              onRestore={(id) => runOp({ op: "restore", payload: { segment_id: id } }, { immediate: true })}
            />
          </div>
        )}
      </div>

      {/* Sticky mobile export */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-slate-950/95 p-3 backdrop-blur md:hidden">
        <Button
          type="button"
          onClick={() => setExportOpen(true)}
          className="w-full bg-cyan-400 font-display uppercase tracking-[0.08em] text-slate-950 hover:bg-cyan-300"
        >
          Export video
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>

      <ExportModal
        open={exportOpen}
        onOpenChange={setExportOpen}
        projectId={project.id}
        aspectRatio={project.aspect_ratio}
        durationMs={durationMs}
        clipCount={active.length}
      />
    </SiteShell>
  );
}
