/**
 * Results downloads — signed URLs only, nothing is ever made public.
 *
 * Each file is fetched as a blob and saved with a readable name. "Download all"
 * is a real sequential download of every READY output (no zip is faked); if a
 * single file fails, the rest still complete and the caller is told how many
 * landed. A server-side ZIP bundle can replace `downloadAllOutputs` later
 * without touching the UI.
 */
import type { LiveOutputItem } from "@/services/campaignLiveStatus";

const extensionFor = (item: LiveOutputItem) => {
  const clean = item.url.split("?")[0];
  const match = /\.([a-z0-9]{2,4})$/i.exec(clean);
  if (match) return match[1].toLowerCase();
  return item.media_type === "video" ? "mp4" : "png";
};

export function outputFileName(item: LiveOutputItem, index: number) {
  const kind = item.media_type === "video" ? "VIDEO" : "PHOTO";
  const number = String(item.output_number ?? index + 1).padStart(2, "0");
  return `STUDIO_${kind}_${number}.${extensionFor(item)}`;
}

/** Downloads one signed asset. Throws when the signature has expired. */
export async function downloadSignedOutput(item: LiveOutputItem, index: number) {
  const response = await fetch(item.url);
  if (!response.ok) throw new Error("expired");
  const blob = await response.blob();
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = outputFileName(item, index);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  /* Give Safari a beat to start the download before revoking. */
  window.setTimeout(() => URL.revokeObjectURL(href), 4000);
}

export interface DownloadAllResult {
  saved: number;
  failed: number;
}

export async function downloadAllOutputs(
  items: LiveOutputItem[],
  onProgress?: (done: number, total: number) => void,
): Promise<DownloadAllResult> {
  let saved = 0;
  let failed = 0;
  for (let index = 0; index < items.length; index += 1) {
    try {
      await downloadSignedOutput(items[index], index);
      saved += 1;
    } catch {
      failed += 1;
    }
    onProgress?.(index + 1, items.length);
    /* Sequential and paced — browsers drop bursts of simultaneous saves. */
    await new Promise((resolve) => window.setTimeout(resolve, 350));
  }
  return { saved, failed };
}
