/**
 * Burns a logo pixel-exact into one finished video, in the browser (same export
 * engine as the editor). The logo is drawn, never regenerated; original audio kept.
 */
import { buildRenderSpec, DEFAULT_ADJUSTMENTS } from "@/services/editorAdjustments";
import { loadVideo, readMeta } from "@/lib/videoFrames";
import { campaignExport, type ExportStatus } from "./exportClient";
import type { ImageLayer } from "./types";

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

export async function exportVideoWithLogo(args: {
  videoUrl: string;
  logo: ImageLayer;
  name: string;
  onStatus?: (status: ExportStatus) => void;
}): Promise<void> {
  const meta = readMeta(await loadVideo(args.videoUrl));
  if (!meta.duration || !meta.width || !meta.height) throw new Error("Couldn't read the video");
  campaignExport.start(
    [{
      id: `logo-${args.logo.id}-${Date.now()}`,
      url: args.videoUrl,
      trim_start_ms: 0,
      trim_end_ms: Math.round(meta.duration * 1000),
      muted: false,
      volume: 1,
      render: buildRenderSpec(DEFAULT_ADJUSTMENTS),
      timelineOffsetMs: 0,
    }],
    {
      width: even(meta.width),
      height: even(meta.height),
      fps: 30,
      aspectRatio: meta.aspectRatio,
      videoBitrate: 10_000_000,
      audioBitrate: 192_000,
      codec: "h264",
      removeAudio: false,
      loop: false,
      textLayers: [],
      textSignature: "",
      imageLayers: [args.logo],
    },
    args.name,
  );
  await new Promise<void>((resolve, reject) => {
    const unsubscribe = campaignExport.subscribe((status) => {
      args.onStatus?.(status);
      if (status.phase === "done") {
        unsubscribe();
        resolve();
      } else if (status.phase === "error" || status.phase === "unsupported") {
        unsubscribe();
        reject(new Error(status.error ?? "Couldn't render the video"));
      }
    });
  });
}
