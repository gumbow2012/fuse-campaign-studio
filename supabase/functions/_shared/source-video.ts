import { MAX_SOURCE_VIDEO_BYTES, readSourceVideo } from "./video-reference.ts";

/** Accept an owned storage path, never an arbitrary URL signed with the service key. */
export async function resolveOwnedSourceVideo(admin: any, userId: string, value: unknown) {
  const source = readSourceVideo(value, userId);
  const slash = source.path.lastIndexOf("/");
  const folder = source.path.slice(0, slash);
  const filename = source.path.slice(slash + 1);
  const bucket = admin.storage.from("fuse-assets");
  const { data: objects, error } = await bucket.list(folder, { search: filename, limit: 100 });
  if (error) throw new Error("Could not verify the uploaded source video");
  const object = objects?.find((entry: any) => entry.name === filename);
  const size = Number(object?.metadata?.size);
  const mime = String(object?.metadata?.mimetype ?? "").toLowerCase();
  if (!object || !Number.isFinite(size) || size <= 0 || size >= MAX_SOURCE_VIDEO_BYTES) {
    throw new Error("Source video is missing or exceeds the under-50-MB limit");
  }
  if (!["video/mp4", "video/quicktime"].includes(mime)) {
    throw new Error("Source video must be an MP4 or MOV");
  }
  const { data, error: signError } = await bucket.createSignedUrl(source.path, 21600);
  if (signError || !data?.signedUrl) throw new Error("Could not access the source video");
  // Canonical storage path persists; the provider gets a fresh six-hour token.
  return { source, canonicalUrl: `fuse-assets:${source.path}`, executionUrl: data.signedUrl as string };
}
