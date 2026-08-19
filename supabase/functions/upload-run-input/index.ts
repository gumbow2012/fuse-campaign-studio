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
    const runnerAccess = hasValidRunnerCode(req);
    const user = runnerAccess ? await getOptionalUser(req, admin) : await requireUser(req, admin);
    if (!user && !runnerAccess) throw new Error("Authentication required.");
    const body = await req.json() as UploadRunInputBody;
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
