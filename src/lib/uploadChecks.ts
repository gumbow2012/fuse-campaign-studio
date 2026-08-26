/**
 * FT3 — Lightweight client-side upload checks.
 *
 * Cheap checks only: can the file decode as an image, is it above a low-res
 * threshold, and does it carry an alpha channel. No blur/crop/ML detection —
 * those are intentionally reported as "not checked".
 */

export const LOW_RESOLUTION_THRESHOLD = 768;

/** Real image transport ceiling — matches direct-to-storage upload limits. */
export const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
/** Real video transport ceiling. */
export const MAX_VIDEO_BYTES = 60 * 1024 * 1024;


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

/** Max time we wait for a local image decode before giving up. */
export const DECODE_TIMEOUT_MS = 9000;

export const DECODE_TIMEOUT_MESSAGE =
  "We couldn't check this image. Try uploading it again.";

type DecodeResult =
  | { kind: "ok"; image: HTMLImageElement; url: string }
  | { kind: "error" }
  | { kind: "timeout" };

function decodeImage(file: File): Promise<DecodeResult> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    let settled = false;
    const finish = (result: DecodeResult) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      // Always release the object URL — success, error and timeout alike.
      // On success the caller still needs the URL, so it revokes after use;
      // here we revoke only when the caller will never see it.
      if (result.kind !== "ok") URL.revokeObjectURL(url);
      resolve(result);
    };
    const timer = window.setTimeout(() => finish({ kind: "timeout" }), DECODE_TIMEOUT_MS);
    const image = new Image();
    image.onload = () => finish({ kind: "ok", image, url });
    image.onerror = () => finish({ kind: "error" });
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

  // Real transport limit (direct-to-storage upload, no base64 inflation).
  if (file.size > MAX_IMAGE_BYTES) {
    return {
      state: "error",
      warnings: [],
      error: "This image is larger than 12 MB — please use a smaller file.",
      notChecked,
    };
  }


  const decoded = await decodeImage(file);
  if (decoded.kind === "timeout") {
    return {
      state: "error",
      warnings: [],
      error: DECODE_TIMEOUT_MESSAGE,
      notChecked,
    };
  }
  if (decoded.kind === "error") {
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
