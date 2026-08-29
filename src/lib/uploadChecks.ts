/**
 * FT3 — Lightweight client-side upload checks.
 *
 * Cheap checks only: can the file decode as an image, is it above a low-res
 * threshold, and does it carry an alpha channel. No blur/crop/ML detection —
 * those are intentionally reported as "not checked".
 */

export const LOW_RESOLUTION_THRESHOLD = 768;

export type UploadCheckState = "uploading" | "checking" | "ready" | "warning" | "error";

export interface UploadCheckResult {
  state: Exclude<UploadCheckState, "uploading" | "checking">;
  width?: number;
  height?: number;
  hasAlpha?: boolean;
  /** Dismissible warnings. */
  warnings: string[];
  /** Hard failure reason (unusable file). */
  error?: string;
  notChecked: string[];
}

function decodeImage(file: File) {
  return new Promise<{ image: HTMLImageElement; url: string } | null>((resolve) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => resolve({ image, url });
    image.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    image.src = url;
  });
}

function detectAlpha(image: HTMLImageElement) {
  try {
    const size = 64;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return undefined;
    ctx.drawImage(image, 0, 0, size, size);
    const { data } = ctx.getImageData(0, 0, size, size);
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] < 250) return true;
    }
    return false;
  } catch {
    return undefined;
  }
}

export async function runUploadChecks(
  file: File,
  options: { transparencyRecommended?: boolean } = {},
): Promise<UploadCheckResult> {
  const notChecked = ["Sharpness / blur", "Cropping"];

  if (file.type && !file.type.startsWith("image/")) {
    return {
      state: "error",
      warnings: [],
      error: "That file isn't an image. Upload a JPG, PNG or WEBP.",
      notChecked,
    };
  }

  const decoded = await decodeImage(file);
  if (!decoded) {
    return {
      state: "error",
      warnings: [],
      error: "This file couldn't be opened — it may be corrupted or an unsupported format.",
      notChecked,
    };
  }

  const { image, url } = decoded;
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  const hasAlpha = /png|webp|gif|avif/i.test(file.type) ? detectAlpha(image) : false;
  URL.revokeObjectURL(url);

  const warnings: string[] = [];
  const shortSide = Math.min(width, height);
  if (shortSide && shortSide < LOW_RESOLUTION_THRESHOLD) {
    warnings.push(
      `LOW RESOLUTION — ${width}×${height}px. Fine details may be lost.`,
    );
  }
  if (options.transparencyRecommended && hasAlpha === false) {
    warnings.push("This slot works best with a transparent PNG — your file has a solid background.");
  }

  return {
    state: warnings.length ? "warning" : "ready",
    width,
    height,
    hasAlpha,
    warnings,
    notChecked,
  };
}
