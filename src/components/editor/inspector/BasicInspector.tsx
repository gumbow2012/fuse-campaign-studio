import { useRef } from "react";
import { Music2, RotateCcw, Sliders, Type, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { AdjustSlider, InspectorSection, OptionRow, ToggleChip } from "./AdjustControls";
import { clipDurationMs, formatSeconds, type EditSegment } from "@/services/campaignEditor";
import {
  ASPECT_OPTIONS,
  CROP_PRESETS,
  GRAIN_PRESETS,
  applyGrainPreset,
  type CropPreset,
  type FitMode,
  type FramingAspect,
  type GrainPresetId,
} from "@/services/editorAdjustments";
import type { AdjustOptions } from "./ClipInspector";

type Patch = Record<string, unknown>;

/**
 * BASIC clip inspector — the approachable subset of the SAME adjustment state
 * the Advanced inspector writes. Nothing here is a separate model, so values
 * always reflect Advanced changes and Advanced-only settings stay untouched.
 */
export default function BasicInspector({
  segment,
  clipNumber,
  clipTotal,
  onAdjust,
  onRecord,
  onResetAll,
  onVolume,
  onMute,
  onTrim,
  onTrimCommit,
  onAddText,
  onAddMusic,
  onOpenAdvanced,
}: {
  segment: EditSegment;
  clipNumber: number;
  clipTotal: number;
  onAdjust: (patch: Patch, options?: AdjustOptions) => void;
  onRecord: (undoPatch: Patch, redoPatch: Patch, label: string) => void;
  onResetAll: () => void;
  onVolume: (volume: number) => void;
  onMute: (muted: boolean) => void;
  onTrim: (startMs: number, endMs: number) => void;
  onTrimCommit: (startMs: number, endMs: number) => void;
  onAddText: () => void;
  onAddMusic: () => void;
  onOpenAdvanced: () => void;
}) {
  const { framing, color, grain } = segment.adjustments;
  const beforeRef = useRef<Record<string, number>>({});

  /** Live preview while dragging, final value + one undo step on release. */
  const drag = (namespace: "framing" | "color", key: string, current: number, label: string) => ({
    onChange: (value: number) => {
      const ref = `${namespace}.${key}`;
      if (beforeRef.current[ref] === undefined) beforeRef.current[ref] = current;
      onAdjust({ [namespace]: { [key]: value } }, { record: false });
    },
    onCommit: (value: number) => {
      const ref = `${namespace}.${key}`;
      const before = beforeRef.current[ref];
      delete beforeRef.current[ref];
      onAdjust({ [namespace]: { [key]: value } }, { record: false, immediate: true });
      if (before !== undefined && before !== value) {
        onRecord({ [namespace]: { [key]: before } }, { [namespace]: { [key]: value } }, label);
      }
    },
  });

  const set = (patch: Patch, label: string) => onAdjust(patch, { immediate: true, label });

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-cyan-300/25 bg-slate-950/70 p-4">
        <div className="flex items-baseline justify-between">
          <h3 className="font-display text-sm uppercase tracking-[0.16em] text-white">
            Clip {clipNumber} — {formatSeconds(clipDurationMs(segment))}
          </h3>
          <span className="font-mono text-[10px] text-slate-500">of {clipTotal}</span>
        </div>
        <p className="mt-1 text-[11px] text-slate-500">
          Simple controls. Your source video is never re-generated.
        </p>
      </div>

      {/* Trim */}
      <InspectorSection title="Trim" open onToggle={() => undefined}>
        <Slider
          min={0}
          max={Math.max(segment.source_duration_ms, 1000)}
          step={100}
          value={[segment.trim_start_ms, segment.trim_end_ms]}
          aria-label="Trim clip"
          onValueChange={([start, end]) => {
            if (end - start < 400) return;
            onTrim(start, end);
          }}
          onValueCommit={([start, end]) => onTrimCommit(start, end)}
        />
        <div className="flex justify-between font-mono text-[10px] text-slate-500">
          <span>{formatSeconds(segment.trim_start_ms)}</span>
          <span>{formatSeconds(segment.trim_end_ms)}</span>
        </div>
      </InspectorSection>

      {/* Frame */}
      <InspectorSection title="Frame" open onToggle={() => undefined}>
        <OptionRow<CropPreset>
          label="Crop preset"
          columns={3}
          value={framing.crop}
          onChange={(id) => {
            const preset = CROP_PRESETS.find((item) => item.id === id);
            set(
              { framing: { crop: id, scale: preset?.scale ?? framing.scale, y: preset?.y ?? framing.y } },
              "crop preset",
            );
          }}
          options={CROP_PRESETS.map((preset) => ({ id: preset.id, label: preset.label }))}
        />
        <OptionRow<FramingAspect>
          label="Aspect ratio"
          columns={5}
          value={framing.aspect}
          onChange={(id) => set({ framing: { aspect: id } }, "aspect")}
          options={ASPECT_OPTIONS}
        />
        <OptionRow<FitMode>
          label="Fit"
          columns={2}
          value={framing.fit === "stretch" ? "fill" : framing.fit}
          onChange={(id) => set({ framing: { fit: id } }, "fit")}
          options={[
            { id: "fit", label: "Fit" },
            { id: "fill", label: "Fill" },
          ]}
        />
        <AdjustSlider
          label="Zoom"
          min={1}
          max={2.5}
          step={0.01}
          value={framing.scale}
          suffix="×"
          {...drag("framing", "scale", framing.scale, "zoom")}
        />
        <AdjustSlider
          label="Position H"
          value={framing.x}
          min={-50}
          max={50}
          {...drag("framing", "x", framing.x, "position")}
        />
        <AdjustSlider
          label="Position V"
          value={framing.y}
          min={-50}
          max={50}
          {...drag("framing", "y", framing.y, "position")}
        />
        <AdjustSlider
          label="Straighten"
          value={framing.rotate}
          min={-15}
          max={15}
          suffix="°"
          {...drag("framing", "rotate", framing.rotate, "straighten")}
        />
        <ToggleChip
          label={framing.flip ? "Flipped" : "Flip horizontal"}
          active={framing.flip}
          onToggle={() => set({ framing: { flip: !framing.flip } }, "flip")}
        />
      </InspectorSection>

      {/* Look */}
      <InspectorSection title="Look" open onToggle={() => undefined}>
        <AdjustSlider
          label="Exposure"
          value={color.exposure}
          {...drag("color", "exposure", color.exposure, "exposure")}
        />
        <AdjustSlider
          label="Contrast"
          value={color.contrast}
          {...drag("color", "contrast", color.contrast, "contrast")}
        />
        <AdjustSlider
          label="Saturation"
          value={color.saturation}
          {...drag("color", "saturation", color.saturation, "saturation")}
        />
        <AdjustSlider
          label="Temperature"
          value={color.temperature}
          {...drag("color", "temperature", color.temperature, "temperature")}
        />
        <OptionRow<GrainPresetId>
          label="Film grain"
          columns={3}
          value={grain.preset}
          onChange={(id) => set({ grain: applyGrainPreset(grain, id) }, "grain preset")}
          options={GRAIN_PRESETS.map((preset) => ({ id: preset.id, label: preset.label }))}
        />
      </InspectorSection>

      {/* Sound */}
      <InspectorSection title="Sound" open onToggle={() => undefined}>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label={segment.muted ? "Unmute clip" : "Mute clip"}
            onClick={() => onMute(!segment.muted)}
            className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 bg-white/[0.03] text-slate-300"
          >
            {segment.muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
          <Slider
            className="flex-1"
            min={0}
            max={2}
            step={0.05}
            value={[segment.volume]}
            aria-label="Clip volume"
            onValueChange={([value]) => onVolume(value)}
          />
          <span className="w-10 text-right font-mono text-[10px] text-slate-400">
            {Math.round(segment.volume * 100)}%
          </span>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={onAddMusic}
          className="w-full border-white/10 bg-white/[0.03] text-slate-200"
        >
          <Music2 className="mr-2 h-4 w-4" />
          Add music
        </Button>
      </InspectorSection>

      {/* Extras */}
      <div className="grid gap-2 rounded-2xl border border-white/10 bg-slate-950/70 p-4">
        <Button
          type="button"
          variant="outline"
          onClick={onAddText}
          className="border-white/10 bg-white/[0.03] text-slate-200"
        >
          <Type className="mr-2 h-4 w-4" />
          Add text
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onResetAll}
          className="border-white/10 bg-white/[0.03] text-slate-300"
        >
          <RotateCcw className="mr-2 h-4 w-4" />
          Reset clip
        </Button>
        <Button
          type="button"
          onClick={onOpenAdvanced}
          className="bg-cyan-400 font-display uppercase tracking-[0.08em] text-slate-950 hover:bg-cyan-300"
        >
          <Sliders className="mr-2 h-4 w-4" />
          Advanced editor
        </Button>
      </div>
    </div>
  );
}
