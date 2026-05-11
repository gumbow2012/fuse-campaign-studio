type UploadableImage = {
  dataUrl?: string | null;
  filename?: string | null;
};

type TemplateAssetUploadArgs = {
  admin: any;
  file: UploadableImage;
  templateId: string;
  versionId: string;
  nodeId: string;
  label?: string | null;
  uploadedBy?: string | null;
  source?: string;
};

function parseDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error("Invalid image payload");

  const [, contentType, base64] = match;
  if (!contentType.startsWith("image/")) {
    throw new Error("Reference asset must be an image");
  }

  const extension = contentType.includes("png")
    ? "png"
    : contentType.includes("jpeg") || contentType.includes("jpg")
    ? "jpg"
    : contentType.includes("webp")
    ? "webp"
    : "bin";

  return {
    contentType,
    extension,
    bytes: Uint8Array.from(atob(base64), (char) => char.charCodeAt(0)),
  };
}

function safeStorageName(value: string | null | undefined, fallback: string) {
  return String(value ?? fallback)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 56) || fallback;
}

export async function uploadTemplateReferenceAsset(args: TemplateAssetUploadArgs) {
  const { admin, file, templateId, versionId, nodeId, label, uploadedBy, source = "template-canvas" } = args;
  if (!file?.dataUrl) throw new Error("referenceFile.dataUrl is required");

  const { bytes, contentType, extension } = parseDataUrl(file.dataUrl);
  const safeName = safeStorageName(file.filename ?? label, "reference");
  const storagePath = `system/template-references/${versionId}/${nodeId}-${safeName}.${extension}`;

  const { error: uploadError } = await admin.storage
    .from("fuse-assets")
    .upload(storagePath, bytes, {
      upsert: true,
      contentType,
    });
  if (uploadError) throw new Error(uploadError.message);

  const publicUrl = `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/public/fuse-assets/${storagePath}`;
  const { data: asset, error: assetError } = await admin
    .from("assets")
    .insert({
      supabase_storage_url: publicUrl,
      asset_type: "reference_image",
      metadata: {
        templateId,
        versionId,
        nodeId,
        label: label ?? null,
        originalFilename: file.filename ?? null,
        uploadedBy: uploadedBy ?? null,
        source,
      },
    })
    .select("id, supabase_storage_url, asset_type, metadata")
    .single();

  if (assetError || !asset) throw new Error(assetError?.message ?? "Failed to create reference asset");
  return asset;
}
