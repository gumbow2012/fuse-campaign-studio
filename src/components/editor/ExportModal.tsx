import { useState } from "react";
import { ArrowRight, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  exportCampaign,
  formatTimecode,
  resolveAspect,
  type ExportResult,
} from "@/services/campaignEditor";

/** Honest export surface — no fake progress while the render worker connects. */
export default function ExportModal({
  open,
  onOpenChange,
  projectId,
  aspectRatio,
  durationMs,
  clipCount,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  aspectRatio: string | null;
  durationMs: number;
  clipCount: number;
}) {
  const aspect = resolveAspect(aspectRatio);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ExportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const response = await exportCampaign(projectId, {
        aspect_ratio: aspect.ratio,
        width: aspect.width,
        height: aspect.height,
      });
      setResult(response);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not start the export.");
    } finally {
      setSubmitting(false);
    }
  };

  const outputPath = result?.export?.output_path ?? null;
  const connecting = !!result && (result.render_pipeline !== "connected" || !outputPath);

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
          {aspect.width}×{aspect.height} · {aspect.label}
        </p>

        {!result ? (
          <>
            <Button
              type="button"
              onClick={() => void start()}
              disabled={submitting || clipCount === 0}
              className="w-full bg-cyan-400 font-display uppercase tracking-[0.1em] text-slate-950 hover:bg-cyan-300"
            >
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Export video
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            {error ? <p className="text-center text-xs text-rose-300">{error}</p> : null}
          </>
        ) : (
          <div className="space-y-3 rounded-xl border border-cyan-300/25 bg-cyan-400/[0.06] p-4 text-center">
            {connecting ? (
              <>
                <p className="font-display text-sm uppercase tracking-[0.12em] text-cyan-100">
                  Export pipeline connecting
                </p>
                <p className="text-xs leading-relaxed text-slate-300">
                  We&apos;ll have your final file shortly — you can keep editing in the meantime.
                </p>
                <p className="font-mono text-[11px] text-slate-500">
                  Combining {clipCount} clips…
                </p>
              </>
            ) : (
              <>
                <p className="font-display text-sm uppercase tracking-[0.12em] text-cyan-100">
                  Your video is ready
                </p>
                <Button asChild className="w-full bg-cyan-400 text-slate-950 hover:bg-cyan-300">
                  <a href={outputPath ?? "#"} download>
                    <Download className="mr-2 h-4 w-4" />
                    Download video
                  </a>
                </Button>
              </>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="w-full border-white/15 bg-white/[0.03] text-slate-200"
            >
              Back to edit
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
