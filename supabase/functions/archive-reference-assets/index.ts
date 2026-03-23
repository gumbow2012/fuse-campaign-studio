import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import {
  corsHeaders,
  createAdminClient,
  errorMessage,
  hasValidRunnerCode,
  json,
  requireAdminUser,
} from "../_shared/supabase-admin.ts";

function inferExtension(url: string, contentType: string | null) {
  const match = url.match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
  if (match?.[1]) return match[1].toLowerCase();

  if (contentType?.includes("png")) return "png";
  if (contentType?.includes("jpeg") || contentType?.includes("jpg")) return "jpg";
  if (contentType?.includes("webp")) return "webp";
  if (contentType?.includes("gif")) return "gif";
  return "bin";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const admin = createAdminClient();
  const runnerAccess = hasValidRunnerCode(req);

  try {
    if (!runnerAccess) {
      await requireAdminUser(req, admin);
    }

    const bucket = "fuse-assets";
    const { data: assets, error: assetsError } = await admin
      .from("assets")
      .select("id, supabase_storage_url, metadata")
      .eq("asset_type", "reference_image")
      .like("supabase_storage_url", "https://media.weavy.ai/%");
    if (assetsError) throw new Error(assetsError.message);

    const results = [];

    for (const asset of assets ?? []) {
      const sourceUrl = String(asset.supabase_storage_url ?? "");
      if (!sourceUrl) continue;

      const response = await fetch(sourceUrl);
      if (!response.ok) {
        results.push({ assetId: asset.id, ok: false, error: `Fetch failed: ${response.status}` });
        continue;
      }

      const contentType = response.headers.get("content-type");
      const extension = inferExtension(sourceUrl, contentType);
      const storagePath = `reference-archive/${asset.id}.${extension}`;
      const bytes = new Uint8Array(await response.arrayBuffer());

      const { error: uploadError } = await admin.storage
        .from(bucket)
        .upload(storagePath, bytes, {
          upsert: true,
          contentType: contentType ?? "application/octet-stream",
        });
      if (uploadError) {
        results.push({ assetId: asset.id, ok: false, error: uploadError.message });
        continue;
      }

      const { data: publicData } = admin.storage.from(bucket).getPublicUrl(storagePath);
      const publicUrl = publicData.publicUrl;
      const metadata = {
        ...(asset.metadata ?? {}),
        archived_from: sourceUrl,
        archived_at: new Date().toISOString(),
        storage_path: storagePath,
      };

      const { error: updateError } = await admin
        .from("assets")
        .update({
          supabase_storage_url: publicUrl,
          metadata,
        })
        .eq("id", asset.id);

      if (updateError) {
        results.push({ assetId: asset.id, ok: false, error: updateError.message });
        continue;
      }

      results.push({ assetId: asset.id, ok: true, url: publicUrl, storagePath });
    }

    return json({
      ok: true,
      archived: results.filter((result) => result.ok).length,
      failed: results.filter((result) => !result.ok).length,
      results,
    });
  } catch (error) {
    return json({ error: errorMessage(error) }, 400);
  }
});
