/** Export settings live in project meta (`export_settings`) — server is the store, not the renderer. */

export type ResolutionId = "720p" | "1080p" | "1440p" | "4k";
export type FrameRateId = "source" | "24" | "25" | "30" | "60";
export type QualityId = "draft" | "standard" | "high" | "maximum";
export type CodecId = "h264" | "h265";
export type ContainerId = "mp4" | "mov";
export type AudioQualityId = "low" | "standard" | "high";

export type ExportSettings = {
  resolution: ResolutionId;
  aspect_ratio: string;
  frame_rate: FrameRateId;
  quality: QualityId;
  bitrate_mode: "auto" | "custom";
  bitrate_mbps: number;
  codec: CodecId;
  container: ContainerId;
  audio_quality: AudioQualityId;
  remove_audio: boolean;
  loop: boolean;
  platform: PlatformId;
};

export type PlatformId = "custom" | "tiktok" | "reels" | "shorts" | "instagram_feed" | "youtube";

export const RESOLUTION_SHORT_SIDE: Record<ResolutionId, number> = {
  "720p": 720,
  "1080p": 1080,
  "1440p": 1440,
  "4k": 2160,
};

export const RESOLUTION_OPTIONS: { id: ResolutionId; label: string }[] = [
  { id: "720p", label: "720p" },
  { id: "1080p", label: "1080p" },
  { id: "1440p", label: "1440p" },
  { id: "4k", label: "4K" },
];

export const FRAME_RATE_OPTIONS: { id: FrameRateId; label: string }[] = [
  { id: "source", label: "Source" },
  { id: "24", label: "24" },
  { id: "25", label: "25" },
  { id: "30", label: "30" },
  { id: "60", label: "60" },
];

export const QUALITY_OPTIONS: { id: QualityId; label: string; factor: number }[] = [
  { id: "draft", label: "Draft", factor: 0.05 },
  { id: "standard", label: "Standard", factor: 0.085 },
  { id: "high", label: "High", factor: 0.13 },
  { id: "maximum", label: "Maximum", factor: 0.2 },
];

export const AUDIO_QUALITY_BITRATE: Record<AudioQualityId, number> = {
  low: 96_000,
  standard: 128_000,
  high: 192_000,
};

export const PLATFORM_PRESETS: {
  id: PlatformId;
  label: string;
  patch: Partial<ExportSettings>;
}[] = [
  { id: "custom", label: "Custom", patch: {} },
  {
    id: "tiktok",
    label: "TikTok",
    patch: { aspect_ratio: "9:16", resolution: "1080p", frame_rate: "30", quality: "high" },
  },
  {
    id: "reels",
    label: "Reels",
    patch: { aspect_ratio: "9:16", resolution: "1080p", frame_rate: "30", quality: "high" },
  },
  {
    id: "shorts",
    label: "Shorts",
    patch: { aspect_ratio: "9:16", resolution: "1080p", frame_rate: "30", quality: "high" },
  },
  {
    id: "instagram_feed",
    label: "Instagram feed",
    patch: { aspect_ratio: "4:5", resolution: "1080p", frame_rate: "30", quality: "high" },
  },
  {
    id: "youtube",
    label: "YouTube",
    patch: { aspect_ratio: "16:9", resolution: "1080p", frame_rate: "30", quality: "maximum" },
  },
];

export function defaultExportSettings(aspectRatio: string | null): ExportSettings {
  return {
    resolution: "1080p",
    aspect_ratio: aspectRatio || "9:16",
    frame_rate: "source",
    quality: "high",
    bitrate_mode: "auto",
    bitrate_mbps: 12,
    codec: "h264",
    container: "mp4",
    audio_quality: "standard",
    remove_audio: false,
    loop: false,
    platform: "custom",
  };
}

export function normalizeExportSettings(raw: unknown, aspectRatio: string | null): ExportSettings {
  const base = defaultExportSettings(aspectRatio);
  const source = (raw ?? {}) as Record<string, unknown>;
  const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T) =>
    allowed.includes(value as T) ? (value as T) : fallback;

  return {
    resolution: pick(source.resolution, ["720p", "1080p", "1440p", "4k"] as const, base.resolution),
    aspect_ratio:
      typeof source.aspect_ratio === "string" && source.aspect_ratio ? source.aspect_ratio : base.aspect_ratio,
    frame_rate: pick(source.frame_rate, ["source", "24", "25", "30", "60"] as const, base.frame_rate),
    quality: pick(source.quality, ["draft", "standard", "high", "maximum"] as const, base.quality),
    bitrate_mode: pick(source.bitrate_mode, ["auto", "custom"] as const, base.bitrate_mode),
    bitrate_mbps: Number.isFinite(Number(source.bitrate_mbps))
      ? Math.min(120, Math.max(1, Number(source.bitrate_mbps)))
      : base.bitrate_mbps,
    codec: pick(source.codec, ["h264", "h265"] as const, base.codec),
    container: pick(source.container, ["mp4", "mov"] as const, base.container),
    audio_quality: pick(source.audio_quality, ["low", "standard", "high"] as const, base.audio_quality),
    remove_audio: !!source.remove_audio,
    loop: !!source.loop,
    platform: pick(
      source.platform,
      ["custom", "tiktok", "reels", "shorts", "instagram_feed", "youtube"] as const,
      base.platform,
    ),
  };
}

/** Frame dimensions for the chosen resolution + aspect (even numbers, encoder-safe). */
export function resolveDimensions(settings: ExportSettings) {
  const [rawW, rawH] = settings.aspect_ratio.split(":").map((part) => Number(part) || 0);
  const ratio = rawW > 0 && rawH > 0 ? rawW / rawH : 9 / 16;
  const shortSide = RESOLUTION_SHORT_SIDE[settings.resolution];
  const portrait = ratio < 1;
  const width = portrait ? shortSide : Math.round(shortSide * ratio);
  const height = portrait ? Math.round(shortSide / ratio) : shortSide;
  const even = (value: number) => Math.max(2, value % 2 === 0 ? value : value + 1);
  return { width: even(width), height: even(height), ratio };
}

export function resolveFps(settings: ExportSettings, sourceFps = 30) {
  return settings.frame_rate === "source" ? sourceFps : Number(settings.frame_rate);
}

export function resolveVideoBitrate(settings: ExportSettings, width: number, height: number, fps: number) {
  if (settings.bitrate_mode === "custom") return Math.round(settings.bitrate_mbps * 1_000_000);
  const factor = QUALITY_OPTIONS.find((option) => option.id === settings.quality)?.factor ?? 0.13;
  const codecFactor = settings.codec === "h265" ? 0.65 : 1;
  return Math.round(width * height * fps * factor * codecFactor);
}

/** Rough but honest size estimate shown in the export panel. */
export function estimateFileSizeMb(settings: ExportSettings, durationMs: number) {
  const { width, height } = resolveDimensions(settings);
  const fps = resolveFps(settings);
  const videoBps = resolveVideoBitrate(settings, width, height, fps);
  const audioBps = settings.remove_audio ? 0 : AUDIO_QUALITY_BITRATE[settings.audio_quality];
  const seconds = (Math.max(0, durationMs) / 1000) * (settings.loop ? 2 : 1);
  return ((videoBps + audioBps) * seconds) / 8 / 1_000_000;
}

/** Browsers can only mux MP4 locally — MOV is offered but not renderable client-side. */
export const CONTAINER_SUPPORT: Record<ContainerId, boolean> = { mp4: true, mov: false };
