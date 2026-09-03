import { OptionRow, AdjustSlider, ToggleChip } from "@/components/editor/inspector/AdjustControls";
import {
  CONTAINER_SUPPORT,
  FRAME_RATE_OPTIONS,
  PLATFORM_PRESETS,
  QUALITY_OPTIONS,
  RESOLUTION_OPTIONS,
  estimateFileSizeMb,
  resolveDimensions,
  type AudioQualityId,
  type CodecId,
  type ContainerId,
  type ExportSettings,
  type FrameRateId,
  type PlatformId,
  type QualityId,
  type ResolutionId,
} from "@/services/exportSettings";
import { ASPECT_PRESETS } from "@/services/campaignEditor";

/** Quality lives here now — the export panel owns resolution, fps, codec, bitrate. */
export default function ExportSettingsPanel({
  settings,
  durationMs,
  onChange,
}: {
  settings: ExportSettings;
  durationMs: number;
  onChange: (patch: Partial<ExportSettings>) => void;
}) {
  const { width, height } = resolveDimensions(settings);
  const sizeMb = estimateFileSizeMb(settings, durationMs);

  return (
    <div className="space-y-4">
      <OptionRow<PlatformId>
        label="Platform preset"
        columns={3}
        value={settings.platform}
        onChange={(id) => {
          const preset = PLATFORM_PRESETS.find((item) => item.id === id);
          onChange({ ...(preset?.patch ?? {}), platform: id });
        }}
        options={PLATFORM_PRESETS.map((preset) => ({ id: preset.id, label: preset.label }))}
      />

      <OptionRow<ResolutionId>
        label="Resolution"
        columns={4}
        value={settings.resolution}
        onChange={(id) => onChange({ resolution: id, platform: "custom" })}
        options={RESOLUTION_OPTIONS}
      />

      <OptionRow
        label="Aspect ratio"
        columns={4}
        value={settings.aspect_ratio}
        onChange={(id) => onChange({ aspect_ratio: id, platform: "custom" })}
        options={Object.keys(ASPECT_PRESETS).map((ratio) => ({ id: ratio, label: ratio }))}
      />

      <OptionRow<FrameRateId>
        label="Frame rate"
        columns={5}
        value={settings.frame_rate}
        onChange={(id) => onChange({ frame_rate: id, platform: "custom" })}
        options={FRAME_RATE_OPTIONS}
      />

      <OptionRow<QualityId>
        label="Quality"
        columns={4}
        value={settings.quality}
        onChange={(id) => onChange({ quality: id, platform: "custom" })}
        options={QUALITY_OPTIONS.map((option) => ({ id: option.id, label: option.label }))}
      />

      <OptionRow<"auto" | "custom">
        label="Bitrate"
        columns={2}
        value={settings.bitrate_mode}
        onChange={(id) => onChange({ bitrate_mode: id })}
        options={[
          { id: "auto", label: "Auto" },
          { id: "custom", label: "Custom" },
        ]}
      />
      {settings.bitrate_mode === "custom" ? (
        <AdjustSlider
          label="Bitrate"
          value={settings.bitrate_mbps}
          min={1}
          max={80}
          step={1}
          suffix=" Mbps"
          onChange={(value) => onChange({ bitrate_mbps: value })}
        />
      ) : null}

      <OptionRow<CodecId>
        label="Codec"
        columns={2}
        value={settings.codec}
        onChange={(id) => onChange({ codec: id })}
        options={[
          { id: "h264", label: "H.264" },
          { id: "h265", label: "H.265" },
        ]}
      />

      <OptionRow<ContainerId>
        label="Format"
        columns={2}
        value={settings.container}
        onChange={(id) => onChange({ container: id })}
        options={[
          { id: "mp4", label: "MP4" },
          { id: "mov", label: "MOV (needs desktop app)", disabled: !CONTAINER_SUPPORT.mov },
        ]}
      />

      <OptionRow<AudioQualityId>
        label="Audio quality"
        columns={3}
        value={settings.audio_quality}
        onChange={(id) => onChange({ audio_quality: id })}
        options={[
          { id: "low", label: "Low" },
          { id: "standard", label: "Standard" },
          { id: "high", label: "High" },
        ]}
      />

      <div className="flex flex-wrap gap-1.5">
        <ToggleChip
          label="Remove audio"
          active={settings.remove_audio}
          onToggle={() => onChange({ remove_audio: !settings.remove_audio })}
        />
        <ToggleChip
          label="Seamless loop"
          active={settings.loop}
          onToggle={() => onChange({ loop: !settings.loop })}
        />
      </div>

      <dl className="grid grid-cols-2 gap-2 text-center">
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <dt className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Frame</dt>
          <dd className="mt-1 font-mono text-sm text-white">
            {width}×{height}
          </dd>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <dt className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Est. size</dt>
          <dd className="mt-1 font-mono text-sm text-white">
            {sizeMb < 1 ? "<1" : sizeMb.toFixed(sizeMb > 100 ? 0 : 1)} MB
          </dd>
        </div>
      </dl>
    </div>
  );
}
