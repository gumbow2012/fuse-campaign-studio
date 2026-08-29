import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, supabase } from "@/integrations/supabase/client";

const BUCKET = "fuse-assets";

/** Real transport limits — no base64 inflation now that bytes go straight to Storage. */
export const MAX_IMAGE_UPLOAD_BYTES = 12 * 1024 * 1024;
export const MAX_VIDEO_UPLOAD_BYTES = 60 * 1024 * 1024;

function extensionFor(file: File) {
  const fromName = file.name.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
  if (fromName) return fromName;
  const fromMime = file.type.split("/")[1]?.toLowerCase().replace(/[^a-z0-9]/g, "");
  return fromMime || "png";
}

function assertWithinLimit(file: File) {
  const isVideo = file.type.startsWith("video/");
  const limit = isVideo ? MAX_VIDEO_UPLOAD_BYTES : MAX_IMAGE_UPLOAD_BYTES;
  if (file.size > limit) {
    throw new Error(
      isVideo
        ? "This video is larger than 60 MB — please use a smaller file."
        : "This image is larger than 12 MB — please use a smaller file.",
    );
  }
}

function publicUrl(path: string) {
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

/**
 * Authenticated customer flow — file BYTES go directly to Supabase Storage.
 * The path must start with the user id to satisfy the
 * "authenticated_upload_fuse_assets" RLS policy on the public fuse-assets bucket.
 */
export async function uploadRunInputFile(file: File) {
  assertWithinLimit(file);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Please sign in to upload.");

  const path = `${user.id}/run-inputs/${crypto.randomUUID()}.${extensionFor(file)}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || undefined,
    upsert: false,
    cacheControl: "3600",
  });
  if (error) throw new Error(error.message);

  return publicUrl(path);
}

const ANON_SESSION_KEY = "fuse.anonUploadSession";
const ANON_ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/** Stable per-browser anon session id — groups a visitor's temp uploads. */
export function getAnonUploadSessionId() {
  let id = window.localStorage.getItem(ANON_SESSION_KEY);
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    id = crypto.randomUUID();
    window.localStorage.setItem(ANON_SESSION_KEY, id);
  }
  return id;
}

/**
 * P6a — logged-out builder uploads. The edge function signs one randomized
 * `anon-temp/` path; bytes go straight to Storage via the signed URL so the
 * temp URL survives an OAuth redirect. No generation is started here.
 */
export async function uploadAnonymousRunInput(file: File) {
  if (!ANON_ALLOWED_TYPES.has(file.type)) {
    throw new Error("Unsupported file type. Use a JPG, PNG or WebP image.");
  }
  if (file.size > MAX_IMAGE_UPLOAD_BYTES) {
    throw new Error("This image is larger than 12 MB — please use a smaller file.");
  }

  const response = await fetch(`${SUPABASE_URL}/functions/v1/upload-run-input`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_PUBLISHABLE_KEY },
    body: JSON.stringify({
      action: "sign-anon",
      anonSessionId: getAnonUploadSessionId(),
      filename: file.name,
      contentType: file.type,
      size: file.size,
    }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error ?? "Could not authorize upload.");
  if (!data?.path || !data?.token) throw new Error("Upload authorization did not return a signed URL.");

  const { error } = await supabase.storage
    .from(BUCKET)
    .uploadToSignedUrl(String(data.path), String(data.token), file, {
      contentType: file.type || undefined,
    });
  if (error) throw new Error(error.message);

  return String(data.publicUrl ?? publicUrl(String(data.path)));
}

/**
 * Non-authenticated harness flow — authorization goes through the edge function
 * (which mints a signed upload URL); file bytes never pass through it.
 */
export async function uploadRunInputFileWithRunnerCode(file: File, runnerCode: string) {
  assertWithinLimit(file);

  const response = await fetch(`${SUPABASE_URL}/functions/v1/upload-run-input`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_PUBLISHABLE_KEY,
      "x-runner-code": runnerCode,
    },
    body: JSON.stringify({ action: "sign", filename: file.name }),
  });
  const data = await response.json().catch(() => null);

  if (!response.ok) throw new Error(data?.error ?? "Could not authorize upload.");
  if (!data?.path || !data?.token) throw new Error("Upload authorization did not return a signed URL.");

  const { error } = await supabase.storage
    .from(BUCKET)
    .uploadToSignedUrl(String(data.path), String(data.token), file, {
      contentType: file.type || undefined,
    });
  if (error) throw new Error(error.message);

  return publicUrl(String(data.path));
}
