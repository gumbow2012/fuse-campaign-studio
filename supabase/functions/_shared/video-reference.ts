/** Pure contracts shared by source-video ingestion and both execution paths. */
export type SourceVideo = { path: string; duration: number; width: number; height: number };
export const MAX_SOURCE_VIDEO_BYTES = 50_000_000;

export function readSourceVideo(value: unknown, userId: string): SourceVideo {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const path = String(record.path ?? "");
  const parts = path.split("/");
  if (parts[0] !== "system" || parts[1] !== "outfit-swap" || parts[2] !== userId || parts.length !== 5 ||
      parts.some((part) => !part || part === "." || part === "..") ||
      /[%?#\\\x00-\x1f]/.test(path) || !/\.(mp4|mov)$/i.test(path)) {
    throw new Error("Upload a source MP4 or MOV to your account before continuing");
  }
  const duration = Number(record.duration);
  const width = Number(record.width);
  const height = Number(record.height);
  if (!Number.isFinite(duration) || duration < 2 || duration > 15) {
    throw new Error("Source video must be between 2 and 15 seconds");
  }
  if (![width, height].every((v) => Number.isInteger(v) && v > 0)) {
    throw new Error("Source video dimensions are missing");
  }
  return { path, duration, width, height };
}

export function referenceMediaType(assetType?: unknown, config?: Record<string, unknown> | null): "image" | "video" {
  return assetType === "video" || assetType === "reference_video" || assetType === "generated_video" ||
      config?.media_type === "video" || config?.editor_expected === "video"
    ? "video" : "image";
}

export function validateReferenceUrls(imageUrls: string[], videoUrls: string[] = []) {
  const clean = (urls: string[]) => [...new Set(urls.map((url) => String(url ?? "").trim()).filter(Boolean))];
  const images = clean(imageUrls);
  const videos = clean(videoUrls);
  if (images.length > 9 || videos.length > 3 || images.length + videos.length > 12) {
    throw new Error("Seedance supports at most 9 images, 3 videos, and 12 total references");
  }
  if (!videos.length && images.length < 2) {
    throw new Error("Multi-reference video requires at least two images or one source video");
  }
  for (const url of videos) {
    if (!/^https:\/\//i.test(url)) throw new Error("Video references require an accessible HTTPS URL");
  }
  return { images, videos };
}

export function assertVideoReferenceRoute(config: Record<string, unknown> | null, videoCount: number, supportsReferences: boolean) {
  if (config?.requires_source_video === true && videoCount === 0) {
    throw new Error("Required source video is missing. Restore its reference before generating");
  }
  if (videoCount && (config?.video_mode !== "multi_reference" || !supportsReferences)) {
    throw new Error("Video references require a Seedance multi-reference step");
  }
}

export function sourceMotionPrompt(prompt: string) {
  return "Use @Video1 as the source for shot order, timing, camera movement, actions, scene geometry and supporting cast. " +
    "Use the edited image references only for the requested wardrobe and any explicitly assigned model replacement. " +
    "Keep all other people and unedited shots faithful to @Video1. Do not invent a new group, scene or action. " +
    "Preserve the approved identity and clothing changes on their designated subject only.\n\n" + prompt;
}
