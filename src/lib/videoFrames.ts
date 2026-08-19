/**
 * Client-side frame extraction — no ffmpeg, no server work.
 * Samples roughly one frame per second plus the final frame, so a 10.6s clip
 * yields 0,1,2,…,10,10.6 (~12 frames).
 */

export type VideoMeta = {
  duration: number;
  width: number;
  height: number;
  aspectRatio: string;
};

const ASPECT_CANDIDATES: { ratio: string; value: number }[] = [
  { ratio: "9:16", value: 9 / 16 },
  { ratio: "3:4", value: 3 / 4 },
  { ratio: "4:5", value: 4 / 5 },
  { ratio: "1:1", value: 1 },
  { ratio: "4:3", value: 4 / 3 },
  { ratio: "3:2", value: 3 / 2 },
  { ratio: "16:9", value: 16 / 9 },
  { ratio: "21:9", value: 21 / 9 },
];

export function nearestAspectRatio(width: number, height: number) {
  if (!width || !height) return "9:16";
  const value = width / height;
  return ASPECT_CANDIDATES.reduce((best, candidate) =>
    Math.abs(candidate.value - value) < Math.abs(best.value - value) ? candidate : best
  ).ratio;
}

/** Load a video element far enough to read metadata. */
export async function loadVideo(url: string) {
  const video = document.createElement("video");
  video.src = url;
  video.crossOrigin = "anonymous";
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";

  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error("Could not read that video file"));
  });

  return video;
}

export function readMeta(video: HTMLVideoElement): VideoMeta {
  const duration = Number.isFinite(video.duration) ? Number(video.duration.toFixed(2)) : 0;
  return {
    duration,
    width: video.videoWidth,
    height: video.videoHeight,
    aspectRatio: nearestAspectRatio(video.videoWidth, video.videoHeight),
  };
}

/** Adaptive timestamps: 1/second across the clip plus the true final frame. */
export function frameTimestamps(duration: number) {
  if (!duration || duration <= 0) return [0];
  const times: number[] = [];
  for (let t = 0; t < duration; t += 1) times.push(Number(t.toFixed(2)));
  const last = Number(Math.max(0, duration - 0.05).toFixed(2));
  if (!times.length || last - times[times.length - 1] > 0.15) times.push(last);
  return times;
}

async function seekTo(video: HTMLVideoElement, time: number) {
  await new Promise<void>((resolve, reject) => {
    const onSeeked = () => {
      video.removeEventListener("seeked", onSeeked);
      resolve();
    };
    video.addEventListener("seeked", onSeeked);
    video.onerror = () => reject(new Error("Could not seek the video"));
    video.currentTime = Math.min(time, Math.max(0, video.duration - 0.01));
  });
}

/** Draw the current video frame to a JPEG file, downscaled to a sane long edge. */
async function captureFrame(video: HTMLVideoElement, time: number, maxEdge = 1280) {
  const scale = Math.min(1, maxEdge / Math.max(video.videoWidth, video.videoHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is unavailable in this browser");
  context.drawImage(video, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((result) => resolve(result), "image/jpeg", 0.92)
  );
  if (!blob) throw new Error("Could not export that frame");
  return new File([blob], `frame-${time.toFixed(2).replace(".", "-")}.jpg`, { type: "image/jpeg" });
}

/** Extract one file per timestamp, reporting progress as it goes. */
export async function extractFrames(
  video: HTMLVideoElement,
  times: number[],
  onProgress?: (done: number, total: number) => void,
) {
  const frames: { time: number; file: File }[] = [];
  for (const time of times) {
    await seekTo(video, time);
    frames.push({ time, file: await captureFrame(video, time) });
    onProgress?.(frames.length, times.length);
  }
  return frames;
}
