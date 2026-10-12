/** Generation model catalog for MCP, derived from the shared fal registries. */
import { DEFAULT_IMAGE_MODEL, DEFAULT_VIDEO_MODEL, IMAGE_MODELS, VIDEO_MODELS } from "../../_shared/fal.ts";

const USD_PER_CREDIT = 0.098;
const credits = (usd: number) => Math.max(1, Math.ceil(usd / USD_PER_CREDIT));

const promptVideoModels = () => Object.values(VIDEO_MODELS).filter((m) => !m.key.includes("video-edit"));

export const IMAGE_KEYS: string[] = Object.keys(IMAGE_MODELS);
export const VIDEO_KEYS: string[] = promptVideoModels().map((m) => m.key);

export function imageModelLabel(key?: string) {
  return (IMAGE_MODELS as Record<string, { label: string }>)[key ?? DEFAULT_IMAGE_MODEL]?.label ?? key ?? null;
}
export function videoModelLabel(key?: string) {
  return (VIDEO_MODELS as Record<string, { label: string }>)[key ?? DEFAULT_VIDEO_MODEL]?.label ?? key ?? null;
}

export function imageFlatUsd(key?: string) {
  return ((IMAGE_MODELS as Record<string, { fallbackFlatUsd: number }>)[key ?? DEFAULT_IMAGE_MODEL] ?? IMAGE_MODELS[DEFAULT_IMAGE_MODEL]).fallbackFlatUsd;
}
export function videoUsdPerSecond(key?: string) {
  const m = (VIDEO_MODELS as Record<string, { fallbackUsdPerSecond?: number }>)[key ?? DEFAULT_VIDEO_MODEL] ?? VIDEO_MODELS[DEFAULT_VIDEO_MODEL];
  return m.fallbackUsdPerSecond ?? 0.14;
}

export function listGenerationModels() {
  return {
    image_models: Object.values(IMAGE_MODELS).map((m) => ({
      key: m.key,
      label: m.label,
      is_default: m.key === DEFAULT_IMAGE_MODEL,
      param_kind: m.paramKind,
      options: [...m.options],
      default_option: m.defaultOption,
      approx_credits_per_image: credits(m.fallbackFlatUsd),
    })),
    video_models: promptVideoModels().map((m) => {
      const range = m.durationRange ?? (m.maxDurationSec ? { min: m.maxDurationSec, max: m.maxDurationSec } : null);
      const durations = range ? Array.from({ length: range.max - range.min + 1 }, (_, i) => range.min + i) : [];
      return {
        key: m.key,
        label: m.label,
        is_default: m.key === DEFAULT_VIDEO_MODEL,
        family: m.family,
        durations,
        resolutions: m.resolutions ?? null,
        aspect_ratios: m.aspectRatios ?? null,
        fixed_aspect: m.fixedAspect ?? null,
        supports_audio: m.supportsAudio,
        supports_multi_reference: !!m.supportsMultiReference,
        approx_credits_per_5s: credits((m.fallbackUsdPerSecond ?? 0.14) * 5),
      };
    }),
  };
}
