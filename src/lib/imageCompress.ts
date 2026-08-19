/**
 * Shared client-side image compression — same canvas approach used for video
 * frames, so every uploaded image stays well under the storage size cap.
 */

const DEFAULT_MAX_DIM = 2048;
const DEFAULT_QUALITY = 0.9;
/** Small PNGs keep their transparency; anything bigger gets flattened to JPEG. */
const SMALL_PNG_BYTES = 2 * 1024 * 1024;

function drawToCanvas(
  source: HTMLImageElement | HTMLVideoElement,
  width: number,
  height: number,
  maxDim: number,
  flatten: boolean,
) {
  const scale = Math.min(1, maxDim / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is unavailable in this browser");
  if (flatten) {
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

async function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((result) => resolve(result), type, quality),
  );
  if (!blob) throw new Error("Could not process that image");
  return blob;
}

function loadImage(file: File) {
  return new Promise<{ image: HTMLImageElement; revoke: () => void }>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => resolve({ image, revoke: () => URL.revokeObjectURL(url) });
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that image file"));
    };
    image.src = url;
  });
}

function renameTo(name: string, extension: string) {
  const base = name.replace(/\.[a-z0-9]+$/i, "") || "image";
  return `${base}.${extension}`;
}

/** Downscale to `maxDim` on the long edge and re-encode for upload. */
export async function compressImageFile(
  file: File,
  maxDim = DEFAULT_MAX_DIM,
  quality = DEFAULT_QUALITY,
): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  // Vector and animated formats can't be canvas-flattened safely.
  if (file.type === "image/svg+xml" || file.type === "image/gif") return file;

  const isPng = file.type === "image/png";
  if (isPng && file.size <= SMALL_PNG_BYTES) return file;

  const { image, revoke } = await loadImage(file);
  try {
    const canvas = drawToCanvas(image, image.naturalWidth, image.naturalHeight, maxDim, true);
    const blob = await canvasToBlob(canvas, "image/jpeg", quality);
    if (blob.size >= file.size) return file;
    return new File([blob], renameTo(file.name, "jpg"), { type: "image/jpeg" });
  } finally {
    revoke();
  }
}

/** Draw the current video frame straight to a compressed JPEG file. */
export async function compressVideoFrame(
  video: HTMLVideoElement,
  filename: string,
  maxDim = 1280,
  quality = 0.85,
): Promise<File> {
  const canvas = drawToCanvas(video, video.videoWidth, video.videoHeight, maxDim, false);
  const blob = await canvasToBlob(canvas, "image/jpeg", quality);
  return new File([blob], filename, { type: "image/jpeg" });
}
