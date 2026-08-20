import { Image } from "https://esm.sh/imagescript@1.3.0";

/**
 * Kling's image-to-video endpoint rejects input images larger than 10 MB
 * (422 `file_too_large`). Nano Banana Pro returns PNGs that routinely exceed
 * that at 2K/4K, so the approved frame is conditioned before submit:
 * downscale the long edge to <= 2048px and re-encode to JPEG (q~90), stepping
 * quality/size down until it fits. Kling downscales internally anyway, so this
 * is visually lossless for the clip.
 */

/** Provider cap is 10 MB; stay under it with a safety margin. */
export const KLING_IMAGE_MAX_BYTES = 9_500_000;
const MAX_LONG_EDGE = 2048;
const JPEG_QUALITY_STEPS = [90, 80, 70, 60];
const LONG_EDGE_STEPS = [2048, 1536, 1280];

type AdminClient = {
  storage: {
    from: (bucket: string) => {
      upload: (path: string, body: Uint8Array, opts: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
    };
  };
};

function publicUrl(path: string) {
  return `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/public/fuse-assets/${path}`;
}

/**
 * Returns a url whose image is guaranteed under Kling's input cap. When the
 * original already fits (or anything fails), the original url is returned
 * unchanged so the animate path never regresses.
 */
export async function conditionImageForKling(
  admin: AdminClient,
  imageUrl: string,
  userId: string,
): Promise<{ url: string; conditioned: boolean; note?: string }> {
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) return { url: imageUrl, conditioned: false, note: `probe failed ${response.status}` };
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength <= KLING_IMAGE_MAX_BYTES) {
      return { url: imageUrl, conditioned: false };
    }

    const decoded = await Image.decode(bytes);
    let encoded: Uint8Array | null = null;

    outer:
    for (const longEdge of LONG_EDGE_STEPS) {
      const scale = Math.min(1, longEdge / Math.max(decoded.width, decoded.height));
      const frame = scale < 1
        ? decoded.clone().resize(
          Math.max(1, Math.round(decoded.width * scale)),
          Math.max(1, Math.round(decoded.height * scale)),
        )
        : decoded.clone();

      for (const quality of JPEG_QUALITY_STEPS) {
        const candidate = await frame.encodeJPEG(quality);
        if (candidate.byteLength <= KLING_IMAGE_MAX_BYTES) {
          encoded = candidate;
          break outer;
        }
        encoded = candidate;
      }
    }

    if (!encoded || encoded.byteLength > KLING_IMAGE_MAX_BYTES) {
      return { url: imageUrl, conditioned: false, note: "could not compress under cap" };
    }

    const path = `system/jewelry-swap/animate-input/${userId}/${crypto.randomUUID()}.jpg`;
    const { error } = await admin.storage.from("fuse-assets").upload(path, encoded, {
      contentType: "image/jpeg",
      upsert: true,
    });
    if (error) return { url: imageUrl, conditioned: false, note: error.message };

    return {
      url: publicUrl(path),
      conditioned: true,
      note: `${bytes.byteLength} -> ${encoded.byteLength} bytes, long edge <= ${MAX_LONG_EDGE}px, jpeg`,
    };
  } catch (error) {
    return {
      url: imageUrl,
      conditioned: false,
      note: error instanceof Error ? error.message : String(error),
    };
  }
}
