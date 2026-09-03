import { Download, Loader2, RotateCcw, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { formatTimecode } from "@/services/campaignEditor";
import { triggerDownload } from "@/services/videoExport/exportClient";
import type { useCampaignExport } from "@/hooks/useCampaignExport";

type ExportApi = ReturnType<typeof useCampaignExport>;

/** Local render surface — real progress from the export worker, never fake. */
export default function ExportModal({
  open,
  onOpenChange,
  durationMs,
  exportApi,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  durationMs: number;
  exportApi: ExportApi;
}) {
  const { status, aspect, start, cancel, reset, supported, clipCount, readyClips, clipDownloads } = exportApi;
  const busy = status.phase === "preparing" || status.phase === "rendering";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-white/10 bg-slate-950/95">
        <DialogHeader>
          <DialogTitle className="font-display uppercase tracking-[0.12em] text-white">
            Export video
          </DialogTitle>
        </DialogHeader>

        <dl className="grid grid-cols-3 gap-2 text-center">
          {[
            { label: "Ratio", value: aspect.ratio },
            { label: "Duration", value: formatTimecode(durationMs) },
            { label: "Clips", value: String(clipCount) },
          ].map((item) => (
            <div key={item.label} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <dt className="text-[10px] uppercase tracking-[0.16em] text-slate-500">{item.label}</dt>
              <dd className="mt-1 font-mono text-sm text-white">{item.value}</dd>
            </div>
          ))}
        </dl>
        <p className="text-center text-[11px] text-slate-500">
          {aspect.width}×{aspect.height} · {aspect.label} · rendered on this device
        </p>

        {!supported ? (
          <div className="space-y-3 rounded-xl border border-amber-300/25 bg-amber-400/[0.06] p-4">
            <p className="font-display text-sm uppercase tracking-[0.12em] text-amber-100">
              Combining isn&apos;t supported here
            </p>
            <p className="text-xs leading-relaxed text-slate-300">
              This browser can&apos;t render video locally. You can still download each clip.
            </p>
            <div className="grid gap-2">
              {clipDownloads.map((clip) => (
                <Button
                  key={clip.label}
                  type="button"
                  variant="outline"
                  onClick={() => triggerDownload(clip.url, `${clip.label.replace(" ", "-")}.mp4`)}
                  className="border-white/15 bg-white/[0.03] text-slate-200"
                >
                  <Download className="mr-2 h-4 w-4" />
                  {clip.label}
                </Button>
              ))}
            </div>
          </div>
        ) : status.phase === "done" && status.downloadUrl ? (
          <div className="space-y-3 rounded-xl border border-cyan-300/25 bg-cyan-400/[0.06] p-4 text-center">
            <p className="font-display text-sm uppercase tracking-[0.12em] text-cyan-100">
              Your video is ready
            </p>
            <p className="font-mono text-[11px] text-slate-400">{status.fileName}</p>
            <Button asChild className="w-full bg-cyan-400 text-slate-950 hover:bg-cyan-300">
              <a href={status.downloadUrl} download={status.fileName ?? "campaign.mp4"}>
                <Download className="mr-2 h-4 w-4" />
                Download again
              </a>
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={reset}
              className="w-full border-white/15 bg-white/[0.03] text-slate-200"
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Export again
            </Button>
          </div>
        ) : busy ? (
          <div className="space-y-3 rounded-xl border border-cyan-300/25 bg-cyan-400/[0.06] p-4">
            <div className="flex items-center justify-between text-xs text-cyan-100">
              <span className="font-display uppercase tracking-[0.12em]">{status.stage || "Rendering"}</span>
              <span className="font-mono">{status.progress}%</span>
            </div>
            <Progress value={status.progress} className="h-1.5" />
            <p className="text-[11px] leading-relaxed text-slate-400">
              Keep editing if you want — the render continues in the background.
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={cancel}
              className="w-full border-white/15 bg-white/[0.03] text-slate-200"
            >
              Cancel render
            </Button>
          </div>
        ) : (
          <>
            <Button
              type="button"
              onClick={start}
              disabled={clipCount === 0}
              className="w-full bg-cyan-400 font-display uppercase tracking-[0.1em] text-slate-950 hover:bg-cyan-300"
            >
              {readyClips >= clipCount && clipCount > 0 ? (
                <Zap className="mr-2 h-4 w-4" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              {readyClips >= clipCount && clipCount > 0 ? "Quick export" : "Export video"}
            </Button>
            <p className="text-center text-[11px] text-slate-500">
              {readyClips > 0
                ? `${readyClips}/${clipCount} clips already prepared`
                : "Preparing clips in the background…"}
            </p>
            {status.error ? <p className="text-center text-xs text-rose-300">{status.error}</p> : null}
          </>
        )}

        {status.phase !== "done" && supported ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="w-full text-slate-400 hover:text-white"
          >
            Back to edit
          </Button>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
