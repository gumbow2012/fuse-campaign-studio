import { useRef, useState } from "react";
import { ClipboardPaste, Copy, Layers, Trash2, Volume2, VolumeX, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AdjustSlider, InspectorSection, OptionRow, ToggleChip } from "./AdjustControls";
import { clipDurationMs, formatSeconds, type EditSegment } from "@/services/campaignEditor";
import {
  ASPECT_OPTIONS,
  AUTO_ENHANCE,
  COLOR_PRESETS,
  CROP_PRESETS,
  DEFAULT_COLOR,
  DEFAULT_FRAMING,
  DEFAULT_GRAIN,
  GRAIN_PRESETS,
  applyColorPreset,
  applyGrainPreset,
  type ColorPresetId,
  type CropPreset,
  type FitMode,
  type FramingAspect,
  type GrainPresetId,
  type PanZoomMode,
} from "@/services/editorAdjustments";

export type AdjustOptions = { record?: boolean; immediate?: boolean; label?: string };
type Patch = Record<string, unknown>;

/** Pro clip inspector — every control is non-destructive metadata. */
export default function ClipInspector({
  segment,
  clipNumber,
  clipTotal,
  scope,
  onScopeChange,
  onAdjust,
  onRecord,
  onResetSection,
  onResetAll,
  onCopy,
  onPaste,
  canPaste,
  onMatchAll,
  onVolume,
  onMute,
  onDuplicate,
  onRemove,
}: {
  segment: EditSegment;
  clipNumber: number;
  clipTotal: number;
  scope: "clip" | "all";
  onScopeChange: (scope: "clip" | "all") => void;
  onAdjust: (patch: Patch, options?: AdjustOptions) => void;
  onRecord: (undoPatch: Patch, redoPatch: Patch, label: string) => void;
  onResetSection: (section: "framing" | "color" | "grain" | "motion" | "audio") => void;
  onResetAll: () => void;
  onCopy: () => void;
  onPaste: () => void;
  canPaste: boolean;
  onMatchAll: () => void;
  onVolume: (volume: number) => void;
  onMute: (muted: boolean) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const { framing, color, grain, motion, audio } = segment.adjustments;
  const [open, setOpen] = useState<Record<string, boolean>>({
    framing: true,
    color: false,
    grain: false,
    motion: false,
    audio: false,
  });
  const beforeRef = useRef<Record<string, number>>({});
  const toggle = (key: string) => setOpen((state) => ({ ...state, [key]: !state[key] }));

  /** Continuous control: live preview while dragging, one undo step per gesture. */
  const drag = (
    namespace: "framing" | "color" | "grain" | "motion" | "audio",
    key: string,
    current: number,
    label: string,
  ) => ({
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
      {/* Header + apply scope */}
      <div className="rounded-2xl border border-cyan-300/25 bg-slate-950/70 p-4">
        <div className="flex items-baseline justify-between">
          <h3 className="font-display text-sm uppercase tracking-[0.16em] text-white">
            Clip {clipNumber} — {formatSeconds(clipDurationMs(segment))}
          </h3>
          <span className="font-mono text-[10px] text-slate-500">of {clipTotal}</span>
        </div>
        <div className="mt-3">
          <OptionRow
            label="Apply to"
            columns={2}
            value={scope}
            onChange={onScopeChange}
            options={[
              { id: "clip", label: "This clip" },
              { id: "all", label: "All clips" },
            ]}
          />
        </div>
      </div>

      {/* 1 — Framing */}
      <InspectorSection
        title="Framing"
        meta={framing.crop === "none" ? undefined : "cropped"}
        open={!!open.framing}
        onToggle={() => toggle("framing")}
        onReset={() => onResetSection("framing")}
      >
        <OptionRow<FramingAspect>
          label="Aspect ratio"
          columns={5}
          value={framing.aspect}
          onChange={(id) => set({ framing: { aspect: id } }, "aspect ratio")}
          options={ASPECT_OPTIONS}
        />
        <OptionRow<FitMode>
          label="Fit"
          columns={3}
          value={framing.fit}
          onChange={(id) => set({ framing: { fit: id } }, "fit mode")}
          options={[
            { id: "fit", label: "Fit" },
            { id: "fill", label: "Fill" },
            { id: "stretch", label: "Stretch" },
          ]}
        />
        <OptionRow<CropPreset>
          label="Crop"
          columns={3}
          value={framing.crop}
          onChange={(id) => set({ framing: { crop: id } }, "crop preset")}
          options={CROP_PRESETS.map((preset) => ({ id: preset.id, label: preset.label }))}
        />
        <AdjustSlider
          label="Scale"
          value={framing.scale}
          min={0.5}
          max={4}
          step={0.01}
          suffix="×"
          {...drag("framing", "scale", framing.scale, "scale")}
        />
        <AdjustSlider
          label="Position X"
          value={framing.x}
          min={-50}
          max={50}
          suffix="%"
          {...drag("framing", "x", framing.x, "position")}
        />
        <AdjustSlider
          label="Position Y"
          value={framing.y}
          min={-50}
          max={50}
          suffix="%"
          {...drag("framing", "y", framing.y, "position")}
        />
        <AdjustSlider
          label="Straighten"
          value={framing.rotate}
          min={-15}
          max={15}
          step={0.5}
          suffix="°"
          {...drag("framing", "rotate", framing.rotate, "straighten")}
        />
        <div className="flex flex-wrap gap-1.5">
          <ToggleChip
            label="Flip horizontal"
            active={framing.flip}
            onToggle={() => set({ framing: { flip: !framing.flip } }, "flip")}
          />
          <ToggleChip
            label="Keep garment visible"
            active={framing.keepGarment}
            onToggle={() => set({ framing: { keepGarment: !framing.keepGarment } }, "keep garment")}
          />
        </div>
        <p className="text-[10px] leading-relaxed text-slate-500">
          Keep garment visible biases the crop so tops, graphics and logos never leave the frame.
        </p>
      </InspectorSection>

      {/* 2 — Light & Color */}
      <InspectorSection
        title="Light & Color"
        meta={color.preset === "match" ? "match source" : undefined}
        open={!!open.color}
        onToggle={() => toggle("color")}
        onReset={() => onResetSection("color")}
      >
        <OptionRow<ColorPresetId>
          label="Preset"
          columns={2}
          value={color.preset}
          onChange={(id) => set({ color: applyColorPreset(color, id) }, "colour preset")}
          options={COLOR_PRESETS.map((preset) => ({ id: preset.id, label: preset.label }))}
        />
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            set(
              { color: color.auto ? { ...DEFAULT_COLOR, preset: color.preset } : { ...AUTO_ENHANCE, auto: true } },
              "auto-enhance",
            )
          }
          className={
            color.auto
              ? "w-full justify-start border-cyan-300/50 bg-cyan-400/10 text-cyan-100"
              : "w-full justify-start border-white/15 bg-white/[0.03] text-slate-200"
          }
        >
          <Wand2 className="mr-2 h-4 w-4" />
          {color.auto ? "Auto-enhance on" : "Auto-enhance"}
        </Button>
        {(
          [
            ["exposure", "Exposure"],
            ["contrast", "Contrast"],
            ["highlights", "Highlights"],
            ["shadows", "Shadows"],
            ["whites", "Whites"],
            ["blacks", "Blacks"],
            ["temperature", "Temperature"],
            ["tint", "Tint"],
            ["saturation", "Saturation"],
            ["vibrance", "Vibrance"],
          ] as const
        ).map(([key, label]) => (
          <AdjustSlider
            key={key}
            label={label}
            value={color[key]}
            {...drag("color", key, color[key], label.toLowerCase())}
          />
        ))}
        <AdjustSlider
          label="Fade"
          value={color.fade}
          min={0}
          max={100}
          {...drag("color", "fade", color.fade, "fade")}
        />
      </InspectorSection>

      {/* 3 — Detail & Grain */}
      <InspectorSection
        title="Detail & Grain"
        meta={grain.preset === "none" ? "clean" : undefined}
        open={!!open.grain}
        onToggle={() => toggle("grain")}
        onReset={() => onResetSection("grain")}
      >
        <OptionRow<GrainPresetId>
          label="Preset"
          columns={2}
          value={grain.preset}
          onChange={(id) => set({ grain: applyGrainPreset(grain, id) }, "grain preset")}
          options={GRAIN_PRESETS.map((preset) => ({ id: preset.id, label: preset.label }))}
        />
        <AdjustSlider
          label="Sharpness"
          value={grain.sharpness}
          min={0}
          max={100}
          {...drag("grain", "sharpness", grain.sharpness, "sharpness")}
        />
        <AdjustSlider label="Clarity" value={grain.clarity} {...drag("grain", "clarity", grain.clarity, "clarity")} />
        <AdjustSlider
          label="Texture"
          value={grain.texture}
          min={0}
          max={100}
          {...drag("grain", "texture", grain.texture, "texture")}
        />
        <AdjustSlider
          label="Noise reduction"
          value={grain.noiseReduction}
          min={0}
          max={100}
          {...drag("grain", "noiseReduction", grain.noiseReduction, "noise reduction")}
        />
        <AdjustSlider
          label="Grain amount"
          value={grain.grainAmount}
          min={0}
          max={100}
          {...drag("grain", "grainAmount", grain.grainAmount, "grain")}
        />
        <AdjustSlider
          label="Grain size"
          value={grain.grainSize}
          min={0}
          max={100}
          {...drag("grain", "grainSize", grain.grainSize, "grain size")}
        />
        <AdjustSlider
          label="Grain softness"
          value={grain.grainSoftness}
          min={0}
          max={100}
          {...drag("grain", "grainSoftness", grain.grainSoftness, "grain softness")}
        />
        <AdjustSlider
          label="Vignette"
          value={grain.vignette}
          min={0}
          max={100}
          {...drag("grain", "vignette", grain.vignette, "vignette")}
        />
        <AdjustSlider
          label="Bloom / halation"
          value={grain.bloom}
          min={0}
          max={100}
          {...drag("grain", "bloom", grain.bloom, "bloom")}
        />
        <p className="text-[10px] leading-relaxed text-slate-500">
          Grain and sharpening stay off by default — heavy settings damage garment graphics and type.
        </p>
      </InspectorSection>

      {/* 4 — Motion */}
      <InspectorSection
        title="Motion"
        meta={motion.speed === 1 ? undefined : `${motion.speed.toFixed(2)}×`}
        open={!!open.motion}
        onToggle={() => toggle("motion")}
        onReset={() => onResetSection("motion")}
      >
        <AdjustSlider
          label="Playback speed"
          value={motion.speed}
          min={0.25}
          max={4}
          step={0.05}
          suffix="×"
          {...drag("motion", "speed", motion.speed, "playback speed")}
        />
        <div className="flex flex-wrap gap-1.5">
          <ToggleChip
            label="Reverse"
            active={motion.reverse}
            onToggle={() => set({ motion: { reverse: !motion.reverse } }, "reverse")}
          />
          <ToggleChip
            label="Stabilize"
            active={motion.stabilize}
            onToggle={() => set({ motion: { stabilize: !motion.stabilize } }, "stabilize")}
          />
          <ToggleChip
            label="Ease in / out"
            active={motion.ease}
            onToggle={() => set({ motion: { ease: !motion.ease } }, "easing")}
          />
        </div>
        <AdjustSlider
          label="Freeze last frame"
          value={motion.freezeMs}
          min={0}
          max={3000}
          step={100}
          suffix="ms"
          {...drag("motion", "freezeMs", motion.freezeMs, "freeze frame")}
        />
        <AdjustSlider
          label="Fade in"
          value={motion.fadeInMs}
          min={0}
          max={3000}
          step={50}
          suffix="ms"
          {...drag("motion", "fadeInMs", motion.fadeInMs, "fade in")}
        />
        <AdjustSlider
          label="Fade out"
          value={motion.fadeOutMs}
          min={0}
          max={3000}
          step={50}
          suffix="ms"
          {...drag("motion", "fadeOutMs", motion.fadeOutMs, "fade out")}
        />
        <AdjustSlider
          label="Motion blur"
          value={motion.motionBlur}
          min={0}
          max={100}
          {...drag("motion", "motionBlur", motion.motionBlur, "motion blur")}
        />
        <OptionRow<PanZoomMode>
          label="Pan & zoom"
          columns={4}
          value={motion.panZoom}
          onChange={(id) => set({ motion: { panZoom: id } }, "pan & zoom")}
          options={[
            { id: "none", label: "Off" },
            { id: "in", label: "Zoom in" },
            { id: "out", label: "Zoom out" },
            { id: "left", label: "Pan ←" },
            { id: "right", label: "Pan →" },
            { id: "up", label: "Pan ↑" },
            { id: "down", label: "Pan ↓" },
          ]}
        />
        {motion.panZoom !== "none" ? (
          <AdjustSlider
            label="Pan & zoom amount"
            value={motion.panZoomAmount}
            min={0}
            max={100}
            {...drag("motion", "panZoomAmount", motion.panZoomAmount, "pan & zoom amount")}
          />
        ) : null}
        <p className="text-[10px] leading-relaxed text-slate-500">
          Reverse renders up to 15s per clip. Stabilize adds a gentle crop-in that hides handheld drift.
        </p>
      </InspectorSection>

      {/* 5 — Audio */}
      <InspectorSection
        title="Audio"
        meta={segment.muted || audio.detached ? "silent" : `${Math.round(segment.volume * 100)}%`}
        open={!!open.audio}
        onToggle={() => toggle("audio")}
        onReset={() => onResetSection("audio")}
      >
        <AdjustSlider
          label="Volume"
          value={segment.volume}
          min={0}
          max={2}
          step={0.05}
          onChange={onVolume}
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => onMute(!segment.muted)}
          className={
            segment.muted
              ? "w-full justify-start border-cyan-300/50 bg-cyan-400/10 text-cyan-100"
              : "w-full justify-start border-white/15 bg-white/[0.03] text-slate-200"
          }
        >
          {segment.muted ? <VolumeX className="mr-2 h-4 w-4" /> : <Volume2 className="mr-2 h-4 w-4" />}
          {segment.muted ? "Muted" : "Mute"}
        </Button>
        <AdjustSlider
          label="Audio fade in"
          value={audio.fadeInMs}
          min={0}
          max={5000}
          step={50}
          suffix="ms"
          {...drag("audio", "fadeInMs", audio.fadeInMs, "audio fade in")}
        />
        <AdjustSlider
          label="Audio fade out"
          value={audio.fadeOutMs}
          min={0}
          max={5000}
          step={50}
          suffix="ms"
          {...drag("audio", "fadeOutMs", audio.fadeOutMs, "audio fade out")}
        />
        <AdjustSlider
          label="Duck music under this clip"
          value={audio.musicDuck}
          min={0}
          max={100}
          suffix="%"
          {...drag("audio", "musicDuck", audio.musicDuck, "music ducking")}
        />
        <AdjustSlider
          label="Noise reduction"
          value={audio.noiseReduction}
          min={0}
          max={100}
          {...drag("audio", "noiseReduction", audio.noiseReduction, "audio noise reduction")}
        />
        <div className="flex flex-wrap gap-1.5">
          <ToggleChip
            label="Voice enhance"
            active={audio.voiceEnhance}
            onToggle={() => set({ audio: { voiceEnhance: !audio.voiceEnhance } }, "voice enhance")}
          />
          <ToggleChip
            label="Normalize loudness"
            active={audio.normalize}
            onToggle={() => set({ audio: { normalize: !audio.normalize } }, "loudness")}
          />
          <ToggleChip
            label="Detach audio"
            active={audio.detached}
            onToggle={() => set({ audio: { detached: !audio.detached } }, "detach audio")}
          />
        </div>
        <p className="text-[10px] leading-relaxed text-slate-500">
          Detach keeps the picture and drops this clip&apos;s sound — add a music track to replace it.
        </p>
      </InspectorSection>

      {/* 6 — Copy / paste / reset + clip actions */}
      <div className="grid gap-2 rounded-2xl border border-white/10 bg-slate-950/70 p-4">
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onCopy}
            className="justify-start border-white/15 bg-white/[0.03] text-slate-200"
          >
            <Copy className="mr-2 h-3.5 w-3.5" />
            Copy
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!canPaste}
            onClick={onPaste}
            className="justify-start border-white/15 bg-white/[0.03] text-slate-200"
          >
            <ClipboardPaste className="mr-2 h-3.5 w-3.5" />
            Paste
          </Button>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={onMatchAll}
          className="justify-start border-cyan-300/30 bg-cyan-400/[0.06] text-cyan-100"
        >
          <Layers className="mr-2 h-4 w-4" />
          Match all clips
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onResetAll}
          className="justify-start border-white/15 bg-white/[0.03] text-slate-200"
        >
          Reset all adjustments
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onDuplicate}
          className="justify-start border-white/15 bg-white/[0.03] text-slate-200"
        >
          <Copy className="mr-2 h-4 w-4" />
          Duplicate clip
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
        <p className="text-[10px] leading-relaxed text-slate-500">
          Everything here is non-destructive — your original outputs stay untouched.
        </p>
      </div>
    </div>
  );
}

export { DEFAULT_COLOR, DEFAULT_FRAMING, DEFAULT_GRAIN };
