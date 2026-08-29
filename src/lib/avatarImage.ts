/**
 * Avatar helpers — client-side square crop + compression so the stored avatar is
 * a tiny inline JPEG (no public bucket required).
 */

export const AVATAR_MAX_BYTES = 120_000;
const AVATAR_SIZE = 256;

/** Initials from a display name or email ("Kim Miles" → "KM", "kim@x.com" → "KI"). */
export function avatarInitials(source: string): string {
  const clean = (source ?? "").trim();
  if (!clean) return "FU";

  const base = clean.includes("@") ? clean.split("@")[0] : clean;
  const words = base.split(/[\s._-]+/).filter(Boolean);

  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return (words[0] ?? base).slice(0, 2).toUpperCase();
}

/** Center-crops to a square and returns a compact JPEG data URL. */
export async function fileToAvatarDataUrl(file: File): Promise<string> {
  const bitmap = await loadImage(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;

  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_SIZE;
  canvas.height = AVATAR_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not process this image.");
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);

  for (const quality of [0.82, 0.7, 0.55, 0.4]) {
    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    if (approxBytes(dataUrl) <= AVATAR_MAX_BYTES) return dataUrl;
  }

  throw new Error("That image is too detailed to use as a photo. Try a simpler crop.");
}

function approxBytes(dataUrl: string) {
  const base64 = dataUrl.split(",")[1] ?? "";
  return Math.floor((base64.length * 3) / 4);
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that image file."));
    };
    img.src = url;
  });
}
