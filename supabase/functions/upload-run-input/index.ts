import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import {
  corsHeaders,
  createAdminClient,
  errorMessage,
  getOptionalUser,
  hasValidRunnerCode,
  json,
  requireUser,
} from "../_shared/supabase-admin.ts";

type UploadRunInputBody = {
  dataUrl?: string;
  filename?: string;
  action?: string;
  anonSessionId?: string;
  contentType?: string;
  size?: number;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ANON_ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};



const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
/** Source videos (Outfit Swap) are allowed a larger budget than reference images. */
const MAX_VIDEO_UPLOAD_BYTES = 60 * 1024 * 1024;
const ALLOWED_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/quicktime",
]);

function parseDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error("Invalid image payload.");

  const [, contentType, base64] = match;
  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    throw new Error("Unsupported file type.");
  }

  const isVideo = contentType.startsWith("video/");
  const extension = contentType.includes("quicktime")
    ? "mov"
    : contentType.includes("mp4")
    ? "mp4"
    : contentType.includes("png")
    ? "png"
    : contentType.includes("webp")
    ? "webp"
    : contentType.includes("gif")
    ? "gif"
    : "jpg";
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));

  const limit = isVideo ? MAX_VIDEO_UPLOAD_BYTES : MAX_UPLOAD_BYTES;
  if (bytes.byteLength > limit) {
    throw new Error(
      isVideo ? "Video is too large. Use a file under 60 MB." : "Image is too large. Use a file under 12 MB.",
    );
  }

  return { bytes, contentType, extension };
}

function sanitizeName(filename: string | undefined) {
  return (filename ?? "input")
    .replace(/\.[a-z0-9]+$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "input";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const admin = createAdminClient();

  try {
    const rawBody = await req.json() as UploadRunInputBody;

    /*
     * ANONYMOUS TEMP UPLOAD (P6a) — logged-out builder assets.
     * The service role signs exactly ONE randomized path under `anon-temp/`,
     * so an anonymous caller can never write anywhere else and no broad
     * anonymous RLS write policy on fuse-assets is needed.
     * ponytail: anon-temp/** assets need a periodic cleanup job (TTL, e.g.
     * delete after 24h unless claimed post-auth). Not built yet.
     */
    if (rawBody.action === "sign-anon") {
      const anonSessionId = String(rawBody.anonSessionId ?? "");
      if (!UUID_RE.test(anonSessionId)) throw new Error("Invalid session id.");

      const contentType = String(rawBody.contentType ?? "").toLowerCase();
      const extension = ANON_ALLOWED_TYPES[contentType];
      if (!extension) throw new Error("Unsupported file type. Use JPG, PNG or WebP.");

      const size = Number(rawBody.size ?? 0);
      if (!Number.isFinite(size) || size <= 0) throw new Error("Invalid file size.");
      if (size > MAX_UPLOAD_BYTES) throw new Error("Image is too large. Use a file under 12 MB.");

      const storagePath = `anon-temp/${anonSessionId}/${crypto.randomUUID()}.${extension}`;
      const { data, error } = await admin.storage
        .from("fuse-assets")
        .createSignedUploadUrl(storagePath);
      if (error || !data) throw new Error(error?.message ?? "Could not authorize upload.");

      return json({
        path: data.path ?? storagePath,
        token: data.token,
        publicUrl:
          `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/public/fuse-assets/${storagePath}`,
      });
    }

    const runnerAccess = hasValidRunnerCode(req);
    const user = runnerAccess ? await getOptionalUser(req, admin) : await requireUser(req, admin);
    if (!user && !runnerAccess) throw new Error("Authentication required.");
    const body = rawBody;


    // Direct-to-storage authorization: mint a signed upload URL. Bytes never
    // pass through this function.
    if (body.action === "sign") {
      const safeName = sanitizeName(body.filename);
      const extension = body.filename?.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase() ?? "png";
      const ownerKey = user?.id ?? "runner";
      const storagePath = `${ownerKey}/run-inputs/${crypto.randomUUID()}/${safeName}.${extension}`;
      const { data, error } = await admin.storage
        .from("fuse-assets")
        .createSignedUploadUrl(storagePath);
      if (error || !data) throw new Error(error?.message ?? "Could not authorize upload.");
      return json({ path: data.path ?? storagePath, token: data.token });
    }

    if (!body.dataUrl) throw new Error("Missing image payload.");


    const { bytes, contentType, extension } = parseDataUrl(body.dataUrl);
    const safeName = sanitizeName(body.filename);
    const ownerKey = user?.id ?? "runner-code";
    const storagePath = `system/run-inputs/${ownerKey}/${crypto.randomUUID()}/${safeName}.${extension}`;

    const { error: uploadError } = await admin.storage
      .from("fuse-assets")
      .upload(storagePath, bytes, {
        upsert: false,
        contentType,
      });
    if (uploadError) throw new Error(uploadError.message);

    const publicUrl = `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/public/fuse-assets/${storagePath}`;
    return json({ url: publicUrl, storagePath });
  } catch (error) {
    return json({ error: errorMessage(error) }, 400);
  }
});
