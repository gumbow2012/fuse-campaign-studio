import { compressVideoFrame } from "@/lib/imageCompress";

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

/** Thrown when the browser cannot actually decode the clip (e.g. iPhone HEVC). */
export class VideoDecodeError extends Error {
  constructor(message = "This clip can't be decoded in the browser") {
    super(message);
    this.name = "VideoDecodeError";
  }
}

/**
 * Load a video far enough to SAFELY draw frames from it: 'loadeddata' must fire
 * (readyState >= 2) and videoWidth must be > 0. An undecodable clip (HEVC on a
 * browser without support) reports 0×0 and would yield solid-black frames, so
 * it throws VideoDecodeError instead.
 */
export async function loadVideoForExtraction(url: string, timeoutMs = 30000) {
  const attempt = () =>
    new Promise<HTMLVideoElement>((resolve, reject) => {
      const video = document.createElement("video");
      video.crossOrigin = "anonymous";
      video.muted = true;
      video.playsInline = true;
      video.preload = "auto";
      video.src = url;

      let settled = false;
      const done = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        video.removeEventListener("loadeddata", onLoadedData);
        video.removeEventListener("error", onError);
        if (error) return reject(error);
        if (!video.videoWidth || !video.videoHeight) return reject(new VideoDecodeError());
        resolve(video);
      };
      const onLoadedData = () => done();
      const onError = () => done(new VideoDecodeError());
      const timer = setTimeout(
        () => done(new VideoDecodeError("Timed out reading that clip")),
        timeoutMs,
      );
      video.addEventListener("loadeddata", onLoadedData);
      video.addEventListener("error", onError);
      if (video.readyState >= 2) done();
    });

  try {
    return await attempt();
  } catch {
    // One clean retry — a fresh element usually succeeds when the first load
    // stalled under concurrent media decoding. If it truly can't decode, this
    // throws VideoDecodeError just like before.
    return await attempt();
  }
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

/** Seek helper shared with the SOURCE-video frame extraction path. */
export const seekVideoTo = seekTo;

/** Draw the current video frame to a JPEG file, downscaled to a sane long edge. */
async function captureFrame(video: HTMLVideoElement, time: number, maxEdge = 1280) {
  return await compressVideoFrame(
    video,
    `frame-${time.toFixed(2).replace(".", "-")}.jpg`,
    maxEdge,
    0.85,
  );
}

/** Seek to `time` and return that single frame as a compressed JPEG file. */
export async function captureFrameAt(video: HTMLVideoElement, time: number, maxEdge = 1280) {
  await seekTo(video, time);
  return await captureFrame(video, time, maxEdge);
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

/* ------------------------------------------------------------------ *
 * Replacement-VIDEO helpers
 * ------------------------------------------------------------------ *
 * Replacement product videos are NEVER reduced to keyframes: the whole clip
 * is stored and analysed directly by Gemini. These helpers only classify an
 * upload and read its metadata for the intake payload / UI label.
 */

export const VIDEO_MIME = /^video\/(mp4|quicktime|x-m4v|webm)$/i;
export const VIDEO_EXTENSION = /\.(mp4|mov|m4v|webm)$/i;

export function isVideoAsset(file: File) {
  return VIDEO_MIME.test(file.type) || VIDEO_EXTENSION.test(file.name);
}

/** "0:07" style duration for the compact VIDEO REFERENCE card. */
export function formatDuration(seconds: number) {
  const whole = Math.max(0, Math.round(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/** Duration + aspect ratio of an uploaded clip, without touching its frames. */
export async function readVideoFileMeta(file: File): Promise<VideoMeta> {
  const url = URL.createObjectURL(file);
  try {
    const video = await loadVideo(url);
    return readMeta(video);
  } finally {
    URL.revokeObjectURL(url);
  }
}
