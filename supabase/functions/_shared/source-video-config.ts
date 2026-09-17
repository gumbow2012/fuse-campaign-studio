/**
 * Source-clip edit route (Kling O3 Pro video-to-video edit) configuration.
 *
 * Kept pure and separate so the exact save behaviour is testable without a
 * server: the route marker, the measured clip facts used for pricing and
 * pre-submit validation, and the removal of the image-to-video keys this
 * provider route must never receive.
 */

export type SourceVideoInput = {
  duration?: number | string | null;
  width?: number | string | null;
  height?: number | string | null;
} | null;

export const SOURCE_VIDEO_MODE = "source_video_edit";
export const SOURCE_VIDEO_MIN_SECONDS = 3;
export const SOURCE_VIDEO_MAX_SECONDS = 15;
export const SOURCE_VIDEO_MIN_EDGE_PX = 720;
export const SOURCE_VIDEO_MAX_EDGE_PX = 3840;

/** Provider keys that belong to the image-to-video routes only. */
const OBSOLETE_KEYS = ["duration", "resolution", "aspect_ratio", "generate_audio"] as const;

export function normalizeSourceVideoMetadata(input: SourceVideoInput) {
  if (input == null) return null;
  const duration = Number(input.duration ?? NaN);
  const width = Number(input.width ?? NaN);
  const height = Number(input.height ?? NaN);

  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error("Source clip length must be a positive number of seconds");
  }
  if (duration < SOURCE_VIDEO_MIN_SECONDS || duration > SOURCE_VIDEO_MAX_SECONDS) {
    throw new Error(
      `Source clip length must be between ${SOURCE_VIDEO_MIN_SECONDS} and ${SOURCE_VIDEO_MAX_SECONDS} seconds`,
    );
  }
  // Matches buildKlingVideoEditInput exactly: EVERY edge must be a whole
  // number of pixels inside the provider's accepted range, so the editor can
  // never store a size the runner rejects at submit time.
  for (const value of [width, height]) {
    if (!Number.isFinite(value) || !Number.isInteger(value)) {
      throw new Error("Source clip width and height must be whole numbers of pixels");
    }
    if (value < SOURCE_VIDEO_MIN_EDGE_PX || value > SOURCE_VIDEO_MAX_EDGE_PX) {
      throw new Error(
        `Source clip width and height must each be between ${SOURCE_VIDEO_MIN_EDGE_PX} and ${SOURCE_VIDEO_MAX_EDGE_PX} pixels`,
      );
    }
  }
  // Exact values are preserved (e.g. 12.535918) — never rounded to a timeline.
  return { duration, width, height };
}

/**
 * Apply the source-edit route to a prompt config. Unrelated keys are preserved;
 * only the image-to-video generation keys are removed.
 */
export function applySourceVideoEditConfig(
  promptConfig: Record<string, unknown>,
  body: {
    modelKey: string;
    keepSourceAudio?: boolean | null;
    hasKeepSourceAudio?: boolean;
    sourceVideo?: SourceVideoInput;
    hasSourceVideo?: boolean;
  },
): Record<string, unknown> {
  const next = { ...promptConfig };

  next.video_model = body.modelKey;
  next.requires_source_video = true;
  next.video_mode = SOURCE_VIDEO_MODE;

  if (body.hasKeepSourceAudio) {
    next.keep_source_audio = body.keepSourceAudio !== false;
  } else if (typeof next.keep_source_audio !== "boolean") {
    next.keep_source_audio = true;
  }

  for (const key of OBSOLETE_KEYS) delete next[key];
  delete next.video_mode_legacy;

  if (body.hasSourceVideo) {
    const measured = normalizeSourceVideoMetadata(body.sourceVideo ?? null);
    if (measured === null) delete next.source_video;
    else next.source_video = measured;
  }

  return next;
}
