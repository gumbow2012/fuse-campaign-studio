/**
 * Cuts or joins clips in the browser (same export engine as the editor) and
 * returns the MP4 as a Blob instead of downloading it. Used by MADDEN AI to
 * split long source clips into ≤15s parts and stitch the rendered parts back.
 */
import { buildRenderSpec, DEFAULT_ADJUSTMENTS } from "@/services/editorAdjustments";
import { campaignExport, type ExportStatus } from "./exportClient";

export type ClipPiece = { url: string; startMs: number; endMs: number };

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

/** Renders the pieces back to back into one MP4. One job at a time (the engine is shared). */
export async function renderPiecesToBlob(
  pieces: ClipPiece[],
  size: { width: number; height: number },
  onStatus?: (status: ExportStatus) => void,
): Promise<Blob> {
  const render = buildRenderSpec(DEFAULT_ADJUSTMENTS);
  let offset = 0;
  const segments = pieces.map((piece, i) => {
    const segment = {
      id: `piece-${Date.now()}-${i}`,
      url: piece.url,
      trim_start_ms: Math.round(piece.startMs),
      trim_end_ms: Math.round(piece.endMs),
      muted: false,
      volume: 1,
      render,
      timelineOffsetMs: offset,
    };
    offset += piece.endMs - piece.startMs;
    return segment;
  });
  campaignExport.start(
    segments,
    {
      width: even(size.width),
      height: even(size.height),
      fps: 30,
      aspectRatio: size.width >= size.height ? "16:9" : "9:16",
      videoBitrate: 10_000_000,
      audioBitrate: 192_000,
      codec: "h264",
      removeAudio: false,
      loop: false,
      textLayers: [],
      textSignature: "",
      imageLayers: [],
    },
    "madden-ai",
    null,
    { download: false },
  );
  const url = await new Promise<string>((resolve, reject) => {
    const unsubscribe = campaignExport.subscribe((status) => {
      onStatus?.(status);
      if (status.phase === "done" && status.downloadUrl) {
        unsubscribe();
        resolve(status.downloadUrl);
      } else if (status.phase === "error" || status.phase === "unsupported") {
        unsubscribe();
        reject(new Error(status.error ?? "Couldn't process the video in this browser"));
      }
    });
  });
  return await (await fetch(url)).blob();
}
