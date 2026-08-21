import { supabase } from "@/integrations/supabase/client";
import { compressImageFile } from "@/lib/imageCompress";
import { uploadToStorage } from "@/services/storageUpload";

/**
 * Kling's image-to-video input cap is 10 MB. Conditioning used to happen in the
 * edge function, where decoding a 4K PNG with pure-JS imagescript blew the
 * worker's memory (HTTP 546) whenever several animate requests ran at once.
 * The browser already has a hardware image pipeline, so the conditioning now
 * happens here and the edge function only ever sees a small image.
 *
 * The original approved 4K frame is never modified — this uploads a separate,
 * temporary animation input alongside it.
 */

/** Mirrors KLING_IMAGE_MAX_BYTES in supabase/functions/jewelry-swap/animateInput.ts. */
const KLING_IMAGE_MAX_BYTES = 9_500_000;
const MAX_LONG_EDGE = 2048;
const JPEG_QUALITY_STEPS = [0.9, 0.8, 0.7, 0.6];

export type ConditionedAnimateInput = {
  /** The url to send as the animate/init image. */
  url: string;
  conditioned: boolean;
  originalUrl: string;
  originalBytes: number | null;
  originalDimensions: string | null;
  conditionedBytes: number | null;
  conditionedDimensions: string | null;
  note?: string;
};

async function measure(file: Blob) {
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<string | null>((resolve) => {
      const image = new Image();
      image.onload = () => resolve(`${image.naturalWidth}x${image.naturalHeight}`);
      image.onerror = () => resolve(null);
      image.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function currentUserId() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user?.id ?? null;
}

/**
 * Returns a url guaranteed to be under Kling's input cap. Any failure falls
 * back to the original url so the animate path never regresses — the
 * server-side fallback still guards the cap.
 */
export async function conditionAnimateInput(imageUrl: string): Promise<ConditionedAnimateInput> {
  const base: ConditionedAnimateInput = {
    url: imageUrl,
    conditioned: false,
    originalUrl: imageUrl,
    originalBytes: null,
    originalDimensions: null,
    conditionedBytes: null,
    conditionedDimensions: null,
  };

  try {
    const response = await fetch(imageUrl);
    if (!response.ok) return { ...base, note: `probe failed ${response.status}` };
    const blob = await response.blob();
    const originalBytes = blob.size;
    const originalDimensions = await measure(blob);

    if (originalBytes <= KLING_IMAGE_MAX_BYTES) {
      return { ...base, originalBytes, originalDimensions, note: "already under cap" };
    }

    const source = new File([blob], "approved-frame.png", {
      type: blob.type || "image/png",
    });

    // Reuse the shared compressor: long edge <= 2048px, JPEG re-encode.
    let conditionedFile: File | null = null;
    for (const quality of JPEG_QUALITY_STEPS) {
      const candidate = await compressImageFile(source, MAX_LONG_EDGE, quality);
      conditionedFile = candidate;
      if (candidate.size <= KLING_IMAGE_MAX_BYTES) break;
    }
    if (!conditionedFile || conditionedFile.size > KLING_IMAGE_MAX_BYTES) {
      return {
        ...base,
        originalBytes,
        originalDimensions,
        note: "could not compress under cap",
      };
    }

    const userId = await currentUserId();
    if (!userId) {
      return { ...base, originalBytes, originalDimensions, note: "no session for upload" };
    }

    const folder = `system/jewelry-swap/animate-input/${userId}`;
    const { url } = await uploadToStorage(folder, conditionedFile, "animate-input.jpg");
    const conditionedDimensions = await measure(conditionedFile);

    return {
      url,
      conditioned: true,
      originalUrl: imageUrl,
      originalBytes,
      originalDimensions,
      conditionedBytes: conditionedFile.size,
      conditionedDimensions,
      note: `${originalBytes} -> ${conditionedFile.size} bytes, long edge <= ${MAX_LONG_EDGE}px, jpeg`,
    };
  } catch (error) {
    return { ...base, note: error instanceof Error ? error.message : String(error) };
  }
}
