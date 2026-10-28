import { supabase } from "@/integrations/supabase/client";

const BUCKET = "fuse-assets";
/** Signed URLs must outlive a full swap + reconstruction run. */
const SIGNED_URL_TTL = 60 * 60 * 24;

function safeName(name: string) {
  const base = name.replace(/\.[a-z0-9]+$/i, "");
  const ext = name.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase() ?? "bin";
  const slug =
    base
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "file";
  return `${slug}.${ext}`;
}

async function currentUserId() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const userId = session?.user?.id;
  if (!userId) throw new Error("Please sign in again to upload files.");
  return userId;
}

/** Stable per-run folder so a video and its frames live together. */
export async function createOutfitSwapFolder() {
  const userId = await currentUserId();
  return `system/outfit-swap/${userId}/${crypto.randomUUID()}`;
}

/** Cinema references live under the user's own prefix (the only path storage RLS lets users write). */
export async function cinemaReferenceFolder() {
  return `${await currentUserId()}/cinema/references`;
}

/**
 * Upload straight to Supabase Storage from the browser — large videos and frame
 * batches never pass through an edge function.
 */
/** Browsers often leave a phone .MOV (and some files) untyped; name the common ones by extension. */
const TYPE_BY_EXTENSION: Record<string, string> = {
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export async function uploadToStorage(folder: string, file: File | Blob, filename: string) {
  const path = `${folder}/${crypto.randomUUID()}-${safeName(filename)}`;
  const extension = filename.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase() ?? "";
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    upsert: true,
    contentType: (file as File).type || TYPE_BY_EXTENSION[extension] || "application/octet-stream",
  });
  if (error) throw new Error(error.message);

  const { data, error: signError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL);
  if (signError || !data?.signedUrl) throw new Error(signError?.message ?? "Could not link that file.");

  return { path, url: data.signedUrl };
}

/**
 * Cast master portraits: upload under `${userId}/cast-masters/...` so the
 * existing authenticated_upload_fuse_assets policy accepts the write, then
 * return a durable URL (public when the bucket is public, signed otherwise).
 */
export async function uploadCastMaster(avatarId: string, file: File) {
  const userId = await currentUserId();
  const ext = file.name.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase() ?? "png";
  const path = `${userId}/cast-masters/${avatarId}-${Date.now()}.${ext}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    upsert: true,
    contentType: file.type || "image/png",
  });
  if (error) throw new Error(error.message);

  const publicUrl = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  const reachable = await fetch(publicUrl, { method: "HEAD" })
    .then((response) => response.ok)
    .catch(() => false);
  if (reachable) return { path, url: publicUrl };

  const { data, error: signError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 60 * 60 * 24 * 365);
  if (signError || !data?.signedUrl) throw new Error(signError?.message ?? "Could not link that image.");
  return { path, url: data.signedUrl };
}

/** Run uploads a few at a time so progress stays smooth and requests stay small. */
export async function uploadWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
  onProgress?: (done: number, total: number) => void,
) {
  const results = new Array<R>(items.length);
  let cursor = 0;
  let done = 0;

  async function runNext(): Promise<void> {
    const index = cursor++;
    if (index >= items.length) return;
    results[index] = await worker(items[index], index);
    done += 1;
    onProgress?.(done, items.length);
    await runNext();
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => runNext()));
  return results;
}
