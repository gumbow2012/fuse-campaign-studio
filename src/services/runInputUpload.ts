import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, supabase } from "@/integrations/supabase/client";
import { compressImageFile } from "@/lib/imageCompress";

const BUCKET = "fuse-assets";

/** Real transport limits — no base64 inflation now that bytes go straight to Storage. */
export const MAX_IMAGE_UPLOAD_BYTES = 12 * 1024 * 1024;
export const MAX_VIDEO_UPLOAD_BYTES = 60 * 1024 * 1024;

/**
 * fal.ai rejects any ingested image over 10 MB, so images are downscaled and
 * re-encoded client-side to sit comfortably under that ceiling before upload.
 */
const PROVIDER_IMAGE_TARGET_BYTES = 9 * 1024 * 1024;
const PROVIDER_MAX_LONG_EDGE = 2560;
const PROVIDER_QUALITY_STEPS = [0.9, 0.82, 0.72, 0.6];

async function conditionImageForProviders(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  if (file.size <= PROVIDER_IMAGE_TARGET_BYTES) return file;

  let best = file;
  let longEdge = PROVIDER_MAX_LONG_EDGE;
  for (const quality of PROVIDER_QUALITY_STEPS) {
    try {
      const candidate = await compressImageFile(file, longEdge, quality);
      if (candidate.size < best.size) best = candidate;
      if (best.size <= PROVIDER_IMAGE_TARGET_BYTES) return best;
    } catch {
      return best; // unsupported/undecodable image — let the limit check decide
    }
    longEdge = Math.max(1280, Math.round(longEdge * 0.8));
  }
  return best;
}


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

/** Timeouts so a hung upload/authorization can never leave a slot spinning. */
const AUTHORIZE_TIMEOUT_MS = 30_000;
const UPLOAD_TIMEOUT_MS = 90_000;

function withTimeout<T>(promise: Promise<T>, ms: number, message: string) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function fetchWithTimeout(url: string, init: RequestInit, ms: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) throw new Error("Upload timed out — please retry.");
    throw new Error(
      error instanceof Error && error.message
        ? `Upload failed — please retry. (${error.message})`
        : "Upload failed — please retry.",
    );
  } finally {
    clearTimeout(timer);
  }
}


/**
 * Authenticated customer flow — file BYTES go directly to Supabase Storage.
 * The path must start with the user id to satisfy the
 * "authenticated_upload_fuse_assets" RLS policy on the public fuse-assets bucket.
 */
export async function uploadRunInputFile(file: File) {
  const prepared = await conditionImageForProviders(file);
  assertWithinLimit(prepared);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Please sign in to upload.");

  const path = `${user.id}/run-inputs/${crypto.randomUUID()}.${extensionFor(prepared)}`;


  const { error } = await withTimeout(
    supabase.storage.from(BUCKET).upload(path, prepared, {
      contentType: prepared.type || undefined,
      upsert: false,
      cacheControl: "3600",
    }),

    UPLOAD_TIMEOUT_MS,
    "Upload timed out — please retry.",
  );
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

  const response = await fetchWithTimeout(
    `${SUPABASE_URL}/functions/v1/upload-run-input`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPABASE_PUBLISHABLE_KEY },
      body: JSON.stringify({
        action: "sign-anon",
        anonSessionId: getAnonUploadSessionId(),
        filename: file.name,
        contentType: file.type,
        size: file.size,
      }),
    },
    AUTHORIZE_TIMEOUT_MS,
  );
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error ?? "Could not authorize upload.");
  if (!data?.path || !data?.token) throw new Error("Upload authorization did not return a signed URL.");

  const { error } = await withTimeout(
    supabase.storage
      .from(BUCKET)
      .uploadToSignedUrl(String(data.path), String(data.token), file, {
        contentType: file.type || undefined,
      }),
    UPLOAD_TIMEOUT_MS,
    "Upload timed out — please retry.",
  );
  if (error) throw new Error(error.message);


  return String(data.publicUrl ?? publicUrl(String(data.path)));
}

/**
 * Non-authenticated harness flow — authorization goes through the edge function
 * (which mints a signed upload URL); file bytes never pass through it.
 */
export async function uploadRunInputFileWithRunnerCode(file: File, runnerCode: string) {
  assertWithinLimit(file);

  const response = await fetchWithTimeout(
    `${SUPABASE_URL}/functions/v1/upload-run-input`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_PUBLISHABLE_KEY,
        "x-runner-code": runnerCode,
      },
      body: JSON.stringify({ action: "sign", filename: file.name }),
    },
    AUTHORIZE_TIMEOUT_MS,
  );
  const data = await response.json().catch(() => null);

  if (!response.ok) throw new Error(data?.error ?? "Could not authorize upload.");
  if (!data?.path || !data?.token) throw new Error("Upload authorization did not return a signed URL.");

  const { error } = await withTimeout(
    supabase.storage
      .from(BUCKET)
      .uploadToSignedUrl(String(data.path), String(data.token), file, {
        contentType: file.type || undefined,
      }),
    UPLOAD_TIMEOUT_MS,
    "Upload timed out — please retry.",
  );
  if (error) throw new Error(error.message);


  return publicUrl(String(data.path));
}
