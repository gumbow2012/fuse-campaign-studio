/// <reference lib="webworker" />
/**
 * FUSE campaign export engine — runs entirely in a Web Worker.
 *
 * Strategy per segment:
 *  1. demux the source mp4 (mp4box)
 *  2. if the trim lands on a keyframe, the resolution matches the target and audio is
 *     untouched → STREAM COPY the encoded samples (no re-encode, near-instant)
 *  3. otherwise re-encode that one segment with WebCodecs (hardware accelerated)
 * Rendered segments are cached in memory keyed by their edit signature, so exporting
 * after a small edit only re-renders what actually changed.
 */
import { createFile, DataStream, MP4BoxBuffer } from "mp4box";
import { ArrayBufferTarget, Muxer } from "mp4-muxer";
import { frameMotionAt, noiseTileBytes, timelineDurationMs, type RenderSpec } from "@/services/editorAdjustments";
import { drawTextLayers } from "@/services/videoExport/drawText";
import {
  segmentCacheKey,
  type MixedAudioPayload,
  type ExportTarget,
  type WorkerRequest,
  type WorkerResponse,
  type WorkerSegment,
} from "@/services/videoExport/types";

/* eslint-disable @typescript-eslint/no-explicit-any */

const g = self as unknown as Record<string, any>;
const post = (message: WorkerResponse, transfer?: Transferable[]) =>
  (self as unknown as Worker).postMessage(message, transfer ?? []);

type Chunk = { data: Uint8Array; key: boolean; ptsUs: number; durUs: number };

type Rendered = {
  key: string;
  mode: "copy" | "encode";
  video: { codec: string; description?: Uint8Array; width: number; height: number; chunks: Chunk[] };
  audio?: { codec: string; description?: Uint8Array; sampleRate: number; channels: number; chunks: Chunk[] };
  durationUs: number;
};

const cache = new Map<string, Rendered>();
const cancelled = new Set<string>();

/* ------------------------------- demuxing ------------------------------- */

type Demuxed = {
  video?: {
    codec: string;
    width: number;
    height: number;
    description?: Uint8Array;
    chunks: Chunk[];
  };
  audio?: {
    codec: string;
    sampleRate: number;
    channels: number;
    description?: Uint8Array;
    chunks: Chunk[];
  };
};

function describe(entry: any): Uint8Array | undefined {
  const box = entry?.avcC ?? entry?.hvcC ?? entry?.vpcC ?? entry?.av1C;
  if (box) {
    const stream = new DataStream(undefined, 0, (DataStream as any).BIG_ENDIAN);
    box.write(stream);
    return new Uint8Array((stream as any).buffer.slice(8));
  }
  const esdsData = entry?.esds?.esd?.descs?.[0]?.descs?.[0]?.data;
  return esdsData ? new Uint8Array(esdsData) : undefined;
}

async function demux(url: string): Promise<Demuxed> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not read clip (${response.status})`);
  const buffer = await response.arrayBuffer();

  const file: any = createFile();
  const out: Demuxed = {};
  const collected = new Map<number, Chunk[]>();

  return await new Promise<Demuxed>((resolve, reject) => {
    file.onError = (error: unknown) => reject(new Error(String(error)));

    file.onReady = (info: any) => {
      const videoTrack = info.videoTracks?.[0];
      const audioTrack = info.audioTracks?.[0];

      if (videoTrack) {
        const trak = file.getTrackById(videoTrack.id);
        out.video = {
          codec: videoTrack.codec,
          width: videoTrack.video?.width ?? videoTrack.track_width ?? 0,
          height: videoTrack.video?.height ?? videoTrack.track_height ?? 0,
          description: describe(trak?.mdia?.minf?.stbl?.stsd?.entries?.[0]),
          chunks: [],
        };
        collected.set(videoTrack.id, out.video.chunks);
        file.setExtractionOptions(videoTrack.id, null, { nbSamples: Number.MAX_SAFE_INTEGER });
      }
      if (audioTrack) {
        const trak = file.getTrackById(audioTrack.id);
        out.audio = {
          codec: audioTrack.codec,
          sampleRate: audioTrack.audio?.sample_rate ?? 48000,
          channels: audioTrack.audio?.channel_count ?? 2,
          description: describe(trak?.mdia?.minf?.stbl?.stsd?.entries?.[0]),
          chunks: [],
        };
        collected.set(audioTrack.id, out.audio.chunks);
        file.setExtractionOptions(audioTrack.id, null, { nbSamples: Number.MAX_SAFE_INTEGER });
      }
      file.start();
    };

    file.onSamples = (id: number, _user: unknown, samples: any[]) => {
      const sink = collected.get(id);
      if (!sink) return;
      for (const sample of samples) {
        if (!sample.data) continue;
        sink.push({
          data: new Uint8Array(sample.data),
          key: !!sample.is_sync,
          ptsUs: Math.round((sample.cts / sample.timescale) * 1e6),
          durUs: Math.round((sample.duration / sample.timescale) * 1e6),
        });
      }
      file.releaseUsedSamples(id, samples[samples.length - 1].number + 1);
    };

    try {
      file.appendBuffer(MP4BoxBuffer.fromArrayBuffer(buffer, 0), true);
      file.flush();
      if (!out.video) reject(new Error("This clip has no video track."));
      else resolve(out);
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

/* ------------------------------- rendering ------------------------------ */

const TOLERANCE_US = 60_000;

function textOverlaps(target: ExportTarget, segment: WorkerSegment) {
  if (!target.textLayers.length) return false;
  const start = segment.timelineOffsetMs;
  const end = start + timelineDurationMs(segment.trim_end_ms - segment.trim_start_ms, segment.render.motion);
  return target.textLayers.some(
    (layer) => !layer.hidden && layer.endMs > start && layer.startMs < end,
  );
}

function canStreamCopy(source: Demuxed, segment: WorkerSegment, target: ExportTarget) {
  const video = source.video;
  if (!video) return false;
  if (textOverlaps(target, segment)) return false;
  if (!video.codec.startsWith("avc1")) return false;
  if (video.width !== target.width || video.height !== target.height) return false;
  if (segment.volume !== 1) return false;
  if (!segment.render.identity) return false;
  if (target.codec !== "h264") return false;
  const startUs = segment.trim_start_ms * 1000;
  const anchor = [...video.chunks].reverse().find((chunk) => chunk.key && chunk.ptsUs <= startUs + TOLERANCE_US);
  return !!anchor && Math.abs(anchor.ptsUs - startUs) <= TOLERANCE_US;
}

function sliceCopy(source: Demuxed, segment: WorkerSegment): Rendered["video"] & { durationUs: number } {
  const video = source.video!;
  const startUs = segment.trim_start_ms * 1000;
  const endUs = segment.trim_end_ms * 1000;
  const anchorIndex = video.chunks.reduce(
    (best, chunk, index) => (chunk.key && chunk.ptsUs <= startUs + TOLERANCE_US ? index : best),
    0,
  );
  const base = video.chunks[anchorIndex]?.ptsUs ?? 0;
  const chunks: Chunk[] = [];
  for (let index = anchorIndex; index < video.chunks.length; index += 1) {
    const chunk = video.chunks[index];
    if (chunk.ptsUs >= endUs) break;
    chunks.push({ ...chunk, ptsUs: chunk.ptsUs - base });
  }
  const durationUs = chunks.length
    ? chunks[chunks.length - 1].ptsUs + Math.max(chunks[chunks.length - 1].durUs, 1)
    : endUs - startUs;
  return { ...video, chunks, durationUs };
}

function sliceAudioCopy(source: Demuxed, segment: WorkerSegment, target: ExportTarget) {
  const audio = source.audio;
  if (target.removeAudio) return undefined;
  if (!audio || segment.muted || segment.volume !== 1) return undefined;
  const startUs = segment.trim_start_ms * 1000;
  const endUs = segment.trim_end_ms * 1000;
  const chunks = audio.chunks
    .filter((chunk) => chunk.ptsUs + chunk.durUs > startUs && chunk.ptsUs < endUs)
    .map((chunk) => ({ ...chunk, ptsUs: Math.max(0, chunk.ptsUs - startUs) }));
  return chunks.length ? { ...audio, chunks } : undefined;
}


/* ------------------------- adjustment compositing ------------------------ */

const grainPatterns = new Map<string, CanvasPattern | null>();

function grainPattern(ctx: OffscreenCanvasRenderingContext2D, tile: number, softness: number) {
  const key = `${tile}|${softness.toFixed(2)}`;
  if (grainPatterns.has(key)) return grainPatterns.get(key) ?? null;
  const { bytes, dimension } = noiseTileBytes(tile, softness);
  const canvas = new OffscreenCanvas(dimension, dimension);
  const tileCtx = canvas.getContext("2d");
  let pattern: CanvasPattern | null = null;
  if (tileCtx) {
    tileCtx.putImageData(new ImageData(bytes, dimension, dimension), 0, 0);
    pattern = ctx.createPattern(canvas, "repeat");
  }
  grainPatterns.set(key, pattern);
  return pattern;
}

/** Draws one decoded frame with its framing + colour + grain adjustments applied. */
function paintFrame(
  ctx: OffscreenCanvasRenderingContext2D,
  frame: any,
  target: ExportTarget,
  spec: RenderSpec,
  timing: { elapsedMs: number; durationMs: number; timelineMs: number },
) {
  const { transform, overlays } = spec;
  const motion = frameMotionAt(spec, timing.elapsedMs, timing.durationMs);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, target.width, target.height);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, target.width, target.height);

  // Per-clip aspect box inside the export frame.
  let boxW = target.width;
  let boxH = target.height;
  if (transform.aspect) {
    if (target.width / target.height > transform.aspect) {
      boxH = target.height;
      boxW = Math.round(target.height * transform.aspect);
    } else {
      boxW = target.width;
      boxH = Math.round(target.width / transform.aspect);
    }
  }
  const boxX = (target.width - boxW) / 2;
  const boxY = (target.height - boxH) / 2;

  ctx.beginPath();
  ctx.rect(boxX, boxY, boxW, boxH);
  ctx.clip();

  ctx.filter = spec.filter;
  ctx.translate(
    boxX + boxW / 2 + ((transform.offsetX + motion.offsetX) / 100) * boxW,
    boxY + boxH / 2 + ((transform.offsetY + motion.offsetY) / 100) * boxH,
  );
  ctx.rotate((transform.rotate * Math.PI) / 180);
  const frameScale = transform.scale * motion.scale;
  ctx.scale(frameScale * (transform.flip ? -1 : 1), frameScale);

  const sourceW = frame.displayWidth || frame.codedWidth || boxW;
  const sourceH = frame.displayHeight || frame.codedHeight || boxH;
  const sourceRatio = sourceW / sourceH;
  const boxRatio = boxW / boxH;
  let drawW = boxW;
  let drawH = boxH;
  if (transform.fit === "contain") {
    if (sourceRatio > boxRatio) drawH = boxW / sourceRatio;
    else drawW = boxH * sourceRatio;
  } else if (transform.fit === "cover") {
    if (sourceRatio > boxRatio) drawW = boxH * sourceRatio;
    else drawH = boxW / sourceRatio;
  }
  ctx.drawImage(frame, -drawW / 2, -drawH / 2, drawW, drawH);
  ctx.filter = "none";
  ctx.restore();

  // Overlays share the aspect box and never get the colour filter.
  ctx.save();
  ctx.beginPath();
  ctx.rect(boxX, boxY, boxW, boxH);
  ctx.clip();

  for (const tint of overlays.tints) {
    ctx.globalAlpha = tint.alpha;
    ctx.globalCompositeOperation = tint.blend as GlobalCompositeOperation;
    ctx.fillStyle = `rgb(${tint.color[0]}, ${tint.color[1]}, ${tint.color[2]})`;
    ctx.fillRect(boxX, boxY, boxW, boxH);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";

  if (overlays.vignette > 0) {
    const gradient = ctx.createRadialGradient(
      boxX + boxW / 2,
      boxY + boxH / 2,
      Math.min(boxW, boxH) * 0.32,
      boxX + boxW / 2,
      boxY + boxH / 2,
      Math.max(boxW, boxH) * 0.72,
    );
    gradient.addColorStop(0, "rgba(0,0,0,0)");
    gradient.addColorStop(1, `rgba(0,0,0,${overlays.vignette})`);
    ctx.fillStyle = gradient;
    ctx.fillRect(boxX, boxY, boxW, boxH);
  }

  if (overlays.grain) {
    const pattern = grainPattern(ctx, overlays.grain.tile, overlays.grain.softness);
    if (pattern) {
      ctx.globalAlpha = overlays.grain.alpha;
      ctx.globalCompositeOperation = "overlay";
      ctx.fillStyle = pattern;
      ctx.fillRect(boxX, boxY, boxW, boxH);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    }
  }
  ctx.restore();

  if (target.textLayers.length) {
    drawTextLayers(ctx, target.textLayers, timing.timelineMs, target.width, target.height);
  }

  if (motion.opacity < 0.999) {
    ctx.save();
    ctx.globalAlpha = 1 - motion.opacity;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, target.width, target.height);
    ctx.restore();
  }
}

async function encodeVideo(source: Demuxed, segment: WorkerSegment, target: ExportTarget) {
  const video = source.video!;
  const startUs = segment.trim_start_ms * 1000;
  const endUs = segment.trim_end_ms * 1000;
  const chunks: Chunk[] = [];
  let description: Uint8Array | undefined;

  const canvas = new OffscreenCanvas(target.width, target.height);
  const ctx = canvas.getContext("2d")!;

  const encoder = new g.VideoEncoder({
    output: (chunk: any, meta: any) => {
      if (meta?.decoderConfig?.description && !description) {
        description = new Uint8Array(meta.decoderConfig.description);
      }
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      chunks.push({
        data,
        key: chunk.type === "key",
        ptsUs: chunk.timestamp,
        durUs: chunk.duration ?? Math.round(1e6 / target.fps),
      });
    },
    error: (error: unknown) => {
      throw error instanceof Error ? error : new Error(String(error));
    },
  });
  const encodeCodec = target.codec === "h265" ? "hev1.1.6.L120.B0" : "avc1.640028";
  encoder.configure({
    codec: encodeCodec,
    width: target.width,
    height: target.height,
    framerate: target.fps,
    bitrate: target.videoBitrate || Math.round(target.width * target.height * target.fps * 0.12),
    ...(target.codec === "h265" ? { hevc: { format: "hevc" } } : { avc: { format: "avc" } }),
  });

  const motion = segment.render.motion;
  const speed = Math.min(4, Math.max(0.25, motion.speed || 1));
  const frameDurUs = Math.round(1e6 / target.fps);
  const outDurationMs = timelineDurationMs(segment.trim_end_ms - segment.trim_start_ms, motion);
  const timelineMs = segment.timelineOffsetMs;
  const REVERSE_FRAME_LIMIT = 480;

  /** Paints one source frame at its output position and hands it to the encoder. */
  const emit = (frame: any, outTsUs: number, durUs: number) => {
    paintFrame(ctx, frame, target, segment.render, {
      elapsedMs: outTsUs / 1000,
      durationMs: outDurationMs,
      timelineMs: timelineMs + outTsUs / 1000,
    });
    const rebased = new g.VideoFrame(canvas, { timestamp: Math.max(0, Math.round(outTsUs)), duration: durUs });
    encoder.encode(rebased);
    rebased.close();
  };

  const buffered: any[] = [];
  let lastOutTsUs = 0;

  const decoder = new g.VideoDecoder({
    output: (frame: any) => {
      if (frame.timestamp < startUs || frame.timestamp >= endUs) {
        frame.close();
        return;
      }
      if (motion.reverse) {
        if (buffered.length >= REVERSE_FRAME_LIMIT) {
          frame.close();
          return;
        }
        buffered.push(frame);
        return;
      }
      try {
        const outTsUs = (frame.timestamp - startUs) / speed;
        const durUs = Math.max(1, Math.round((frame.duration ?? frameDurUs) / speed));
        emit(frame, outTsUs, durUs);
        lastOutTsUs = outTsUs + durUs;
      } finally {
        frame.close();
      }
    },
    error: (error: unknown) => {
      throw error instanceof Error ? error : new Error(String(error));
    },
  });
  decoder.configure({
    codec: video.codec,
    codedWidth: video.width,
    codedHeight: video.height,
    description: video.description,
    optimizeForLatency: false,
  });

  for (const chunk of video.chunks) {
    if (chunk.ptsUs >= endUs) break;
    decoder.decode(new g.EncodedVideoChunk({
      type: chunk.key ? "key" : "delta",
      timestamp: chunk.ptsUs,
      duration: chunk.durUs,
      data: chunk.data,
    }));
  }
  await decoder.flush();

  // Reverse plays the buffered frames back to front, evenly spaced.
  if (motion.reverse) {
    const durUs = Math.max(1, Math.round(frameDurUs / speed));
    for (let index = buffered.length - 1; index >= 0; index -= 1) {
      const frame = buffered[index];
      const outTsUs = (buffered.length - 1 - index) * durUs;
      try {
        emit(frame, outTsUs, durUs);
        lastOutTsUs = outTsUs + durUs;
      } finally {
        frame.close();
      }
    }
    buffered.length = 0;
  }

  // Freeze frame: hold the final painted frame for the requested tail.
  if (motion.freezeMs > 0 && lastOutTsUs > 0) {
    const holdUs = motion.freezeMs * 1000;
    for (let elapsed = 0; elapsed < holdUs; elapsed += frameDurUs) {
      const outTsUs = lastOutTsUs + elapsed;
      const held = new g.VideoFrame(canvas, { timestamp: Math.round(outTsUs), duration: frameDurUs });
      encoder.encode(held);
      held.close();
    }
    lastOutTsUs += holdUs;
  }

  await encoder.flush();
  decoder.close();
  encoder.close();

  const durationUs = chunks.length
    ? chunks[chunks.length - 1].ptsUs + Math.max(chunks[chunks.length - 1].durUs, 1)
    : Math.round(outDurationMs * 1000) || endUs - startUs;

  return {
    video: { codec: encodeCodec, description, width: target.width, height: target.height, chunks },
    durationUs,
  };
}


async function encodeAudio(source: Demuxed, segment: WorkerSegment, target: ExportTarget) {
  const audio = source.audio;
  if (target.removeAudio) return undefined;
  if (!audio || segment.muted) return undefined;
  if (!g.AudioDecoder || !g.AudioEncoder) return undefined;

  const startUs = segment.trim_start_ms * 1000;
  const endUs = segment.trim_end_ms * 1000;
  const chunks: Chunk[] = [];
  let description: Uint8Array | undefined;

  const encoder = new g.AudioEncoder({
    output: (chunk: any, meta: any) => {
      if (meta?.decoderConfig?.description && !description) {
        description = new Uint8Array(meta.decoderConfig.description);
      }
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      chunks.push({ data, key: chunk.type === "key", ptsUs: chunk.timestamp, durUs: chunk.duration ?? 0 });
    },
    error: () => undefined,
  });
  encoder.configure({
    codec: "mp4a.40.2",
    sampleRate: audio.sampleRate,
    numberOfChannels: audio.channels,
    bitrate: target.audioBitrate || 128_000,
  });

  const gain = Math.min(2, Math.max(0, segment.volume));
  const decoder = new g.AudioDecoder({
    output: (data: any) => {
      try {
        if (data.timestamp + (data.duration ?? 0) <= startUs || data.timestamp >= endUs) return;
        const frames = data.numberOfFrames;
        const channels = data.numberOfChannels;
        const planar = new Float32Array(frames * channels);
        for (let channel = 0; channel < channels; channel += 1) {
          const view = new Float32Array(frames);
          data.copyTo(view, { planeIndex: channel, format: "f32-planar" });
          for (let index = 0; index < frames; index += 1) view[index] *= gain;
          planar.set(view, channel * frames);
        }
        encoder.encode(new g.AudioData({
          format: "f32-planar",
          sampleRate: data.sampleRate,
          numberOfFrames: frames,
          numberOfChannels: channels,
          timestamp: Math.max(0, data.timestamp - startUs),
          data: planar,
        }));
      } finally {
        data.close();
      }
    },
    error: () => undefined,
  });
  decoder.configure({
    codec: audio.codec,
    sampleRate: audio.sampleRate,
    numberOfChannels: audio.channels,
    description: audio.description,
  });

  for (const chunk of audio.chunks) {
    if (chunk.ptsUs >= endUs) break;
    decoder.decode(new g.EncodedAudioChunk({
      type: "key",
      timestamp: chunk.ptsUs,
      duration: chunk.durUs,
      data: chunk.data,
    }));
  }
  try {
    await decoder.flush();
    await encoder.flush();
  } catch {
    /* audio is best-effort — video still exports */
  }
  decoder.close();
  encoder.close();

  return chunks.length
    ? { codec: "mp4a.40.2", description, sampleRate: audio.sampleRate, channels: audio.channels, chunks }
    : undefined;
}

async function renderSegment(segment: WorkerSegment, target: ExportTarget): Promise<Rendered> {
  const key = segmentCacheKey(segment, target);
  const hit = cache.get(key);
  if (hit) return hit;

  const source = await demux(segment.url);

  let rendered: Rendered;
  if (canStreamCopy(source, segment, target)) {
    const { durationUs, ...video } = sliceCopy(source, segment);
    rendered = {
      key,
      mode: "copy",
      video,
      audio: sliceAudioCopy(source, segment, target),
      durationUs,
    };
  } else {
    const { video, durationUs } = await encodeVideo(source, segment, target);
    rendered = { key, mode: "encode", video, audio: await encodeAudio(source, segment, target), durationUs };
  }

  cache.set(key, rendered);
  post({ type: "cached", keys: [key] });
  return rendered;
}

/* -------------------------------- muxing -------------------------------- */

function sameDescription(a?: Uint8Array, b?: Uint8Array) {
  if (!a || !b) return a === b;
  if (a.byteLength !== b.byteLength) return false;
  for (let index = 0; index < a.byteLength; index += 1) if (a[index] !== b[index]) return false;
  return true;
}

async function runExport(request: Extract<WorkerRequest, { type: "export" }>) {
  const { jobId, segments, target, fileName } = request;
  const rendered: Rendered[] = [];

  for (let index = 0; index < segments.length; index += 1) {
    if (cancelled.has(jobId)) return;
    const cached = cache.has(segmentCacheKey(segments[index], target));
    post({
      type: "export-progress",
      jobId,
      progress: Math.round((index / (segments.length + 1)) * 100),
      stage: cached ? "Reusing cached clip" : "Rendering clip",
    });
    rendered.push(await renderSegment(segments[index], target));
  }
  if (cancelled.has(jobId)) return;

  // Uniform video config is required for a single-track mp4; re-encode anything that differs.
  const reference = rendered[0];
  for (let index = 1; index < rendered.length; index += 1) {
    const candidate = rendered[index];
    const compatible =
      candidate.video.width === reference.video.width &&
      candidate.video.height === reference.video.height &&
      sameDescription(candidate.video.description, reference.video.description);
    if (compatible) continue;
    post({ type: "export-progress", jobId, progress: 80, stage: "Matching clip formats" });
    const source = await demux(segments[index].url);
    const { video, durationUs } = await encodeVideo(source, segments[index], target);
    rendered[index] = { ...candidate, mode: "encode", video, durationUs };
  }

  post({ type: "export-progress", jobId, progress: 88, stage: "Combining clips" });

  const sequence = target.loop ? [...rendered, ...rendered] : rendered;

  const hasAudio = rendered.some((item) => item.audio);
  const audioRef = rendered.find((item) => item.audio)?.audio;

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: {
      codec: target.codec === "h265" ? "hevc" : "avc",
      width: reference.video.width,
      height: reference.video.height,
    },
    audio: hasAudio && audioRef
      ? { codec: "aac", numberOfChannels: audioRef.channels, sampleRate: audioRef.sampleRate }
      : undefined,
    fastStart: "in-memory",
  });

  let offsetUs = 0;
  for (const item of sequence) {
    const videoMeta = {
      decoderConfig: {
        codec: item.video.codec,
        description: item.video.description,
        codedWidth: item.video.width,
        codedHeight: item.video.height,
      },
    } as any;
    for (const chunk of item.video.chunks) {
      muxer.addVideoChunkRaw(
        chunk.data,
        chunk.key ? "key" : "delta",
        offsetUs + chunk.ptsUs,
        Math.max(chunk.durUs, 1),
        videoMeta,
      );
    }
    if (item.audio && audioRef) {
      const audioMeta = {
        decoderConfig: {
          codec: item.audio.codec,
          description: item.audio.description,
          numberOfChannels: item.audio.channels,
          sampleRate: item.audio.sampleRate,
        },
      } as any;
      for (const chunk of item.audio.chunks) {
        muxer.addAudioChunkRaw(
          chunk.data,
          "key",
          offsetUs + chunk.ptsUs,
          Math.max(chunk.durUs, 1),
          audioMeta,
        );
      }
    }
    offsetUs += item.durationUs;
  }

  muxer.finalize();
  if (cancelled.has(jobId)) return;

  const buffer = (muxer.target as ArrayBufferTarget).buffer;
  post(
    { type: "export-done", jobId, buffer, fileName, durationMs: Math.round(offsetUs / 1000) },
    [buffer],
  );
}

/* ------------------------------- dispatch ------------------------------- */

let prerenderChain: Promise<void> = Promise.resolve();

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;

  if (request.type === "invalidate") {
    for (const key of request.keys) cache.delete(key);
    return;
  }

  if (request.type === "keep") {
    const keep = new Set(request.keys);
    for (const key of cache.keys()) if (!keep.has(key)) cache.delete(key);
    return;
  }

  if (request.type === "cancel") {
    cancelled.add(request.jobId);
    return;
  }

  if (request.type === "prerender") {
    prerenderChain = prerenderChain.then(async () => {
      const total = request.segments.length;
      let done = 0;
      for (const segment of request.segments) {
        try {
          await renderSegment(segment, request.target);
        } catch {
          /* pre-render is opportunistic; export will retry and surface real errors */
        }
        done += 1;
        post({ type: "prerender-progress", done, total });
      }
    });
    return;
  }

  if (request.type === "export") {
    prerenderChain = prerenderChain
      .then(() => runExport(request))
      .catch((error: unknown) => {
        post({
          type: "export-error",
          jobId: request.jobId,
          message: error instanceof Error ? error.message : "Export failed in this browser.",
        });
      });
  }
};

post({ type: "ready", supported: !!g.VideoEncoder && !!g.VideoDecoder && !!g.OffscreenCanvas });
