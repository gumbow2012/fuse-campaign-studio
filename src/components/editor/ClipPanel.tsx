import { Copy, Trash2, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { clipDurationMs, formatSeconds, type EditSegment } from "@/services/campaignEditor";

/** Dead-simple selected-clip controls. */
export default function ClipPanel({
  segment,
  clipNumber,
  onVolume,
  onMute,
  onDuplicate,
  onRemove,
}: {
  segment: EditSegment;
  clipNumber: number;
  onVolume: (volume: number) => void;
  onMute: (muted: boolean) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-2xl border border-cyan-300/25 bg-slate-950/70 p-4">
      <div className="flex items-baseline justify-between">
        <h3 className="font-display text-sm uppercase tracking-[0.16em] text-white">
          Clip {clipNumber}
        </h3>
        <span className="font-mono text-xs text-cyan-200">{formatSeconds(clipDurationMs(segment))}</span>
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.16em] text-slate-400">
          <span>Volume</span>
          <span className="font-mono text-slate-300">{Math.round(segment.volume * 100)}%</span>
        </div>
        <Slider
          className="mt-2"
          value={[segment.volume]}
          min={0}
          max={2}
          step={0.05}
          aria-label="Clip volume"
          onValueChange={([value]) => onVolume(value)}
        />
      </div>

      <div className="mt-4 grid gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => onMute(!segment.muted)}
          className={
            segment.muted
              ? "justify-start border-cyan-300/50 bg-cyan-400/10 text-cyan-100"
              : "justify-start border-white/15 bg-white/[0.03] text-slate-200"
          }
        >
          {segment.muted ? <VolumeX className="mr-2 h-4 w-4" /> : <Volume2 className="mr-2 h-4 w-4" />}
          {segment.muted ? "Muted" : "Mute"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onDuplicate}
          className="justify-start border-white/15 bg-white/[0.03] text-slate-200"
        >
          <Copy className="mr-2 h-4 w-4" />
          Duplicate
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onRemove}
          className="justify-start border-rose-400/30 bg-rose-400/10 text-rose-100 hover:bg-rose-400/20"
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Remove from edit
        </Button>
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
        Removing only takes the clip off this edit — your original output stays available.
      </p>
    </div>
  );
}
