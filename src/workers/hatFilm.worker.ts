/// <reference lib="webworker" />
/**
 * Hat Brand Film assembler — runs in a Web Worker on the same stack as the
 * campaign export engine (mp4box demux, WebCodecs, mp4-muxer).
 *
 * Frame-exact: every output frame k is encoded at k/30 s, each segment
 * contributes exactly its cut-list frame count (645 total), sources must
 * cover their slot (no padding), the original logo is drawn aspect-correct
 * (never regenerated), generated clip audio is discarded, and the template
 * soundtrack (its AAC frames copied, trimmed to 21.5 s) is the only audio. Any missing capability is an error, never a
 * silent fallback.
 */
import { createFile, DataStream, MP4BoxBuffer } from "mp4box";
import { ArrayBufferTarget, Muxer } from "mp4-muxer";
import {
  coverRect, coversSlot, frameDurationUs, frameTimestampUs, HF_FPS, HF_HEIGHT,
  HF_KEYFRAME_INTERVAL, HF_TOTAL_FRAMES, HF_WIDTH, localTargetUs, logoPlacement, validateSegments,
  type HfProbe, type HfSegment,
} from "@/lib/hatFilmFramePlan";

/* eslint-disable @typescript-eslint/no-explicit-any */
const g = self as unknown as Record<string, any>;

export type HatFilmWorkerRequest = {
  type: "assemble";
  jobId: string;
  segments: HfSegment[];
  logoUrl: string;
  /** Template soundtrack (AAC in MP4/M4A). Its AAC frames are copied, never re-encoded. */
  soundtrackUrl: string;
};
export type HatFilmWorkerResponse =
  | { type: "progress"; jobId: string; progress: number; stage: string }
  | { type: "done"; jobId: string; buffer: ArrayBuffer; probe: HfProbe }
  | { type: "error"; jobId: string; message: string };

const post = (m: HatFilmWorkerResponse, t: Transferable[] = []) => (self as unknown as Worker).postMessage(m, t);

type Chunk = { data: Uint8Array; key: boolean; ptsUs: number; durUs: number };

function describe(entry: any): Uint8Array | undefined {
  const box = entry?.avcC ?? entry?.hvcC ?? entry?.vpcC ?? entry?.av1C;
  if (!box) return undefined;
  const stream = new DataStream(undefined, 0, (DataStream as any).BIG_ENDIAN);
  box.write(stream);
  return new Uint8Array((stream as any).buffer.slice(8));
}

async function demuxVideo(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Couldn't read a clip (${response.status})`);
  const buffer = await response.arrayBuffer();
  const file: any = createFile();
  return await new Promise<{ codec: string; width: number; height: number; description?: Uint8Array; chunks: Chunk[] }>((resolve, reject) => {
    let out: any = null;
    file.onError = (e: unknown) => reject(new Error(String(e)));
    file.onReady = (info: any) => {
      const track = info.videoTracks?.[0];
      if (!track) return;
      const trak = file.getTrackById(track.id);
      out = { codec: track.codec, width: track.video?.width ?? track.track_width, height: track.video?.height ?? track.track_height, description: describe(trak?.mdia?.minf?.stbl?.stsd?.entries?.[0]), chunks: [] as Chunk[] };
      file.setExtractionOptions(track.id, null, { nbSamples: Number.MAX_SAFE_INTEGER });
      file.start();
    };
    file.onSamples = (id: number, _u: unknown, samples: any[]) => {
      for (const s of samples) {
        if (!s.data) continue;
        out.chunks.push({ data: new Uint8Array(s.data), key: !!s.is_sync, ptsUs: Math.round((s.cts / s.timescale) * 1e6), durUs: Math.round((s.duration / s.timescale) * 1e6) });
      }
      file.releaseUsedSamples(id, samples[samples.length - 1].number + 1);
    };
    try {
      file.appendBuffer(MP4BoxBuffer.fromArrayBuffer(buffer, 0), true);
      file.flush();
      if (!out) reject(new Error("A clip has no video track."));
      else resolve(out);
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
}

async function demuxSoundtrack(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Couldn't read the soundtrack (${response.status})`);
  const buffer = await response.arrayBuffer();
  const file: any = createFile();
  return await new Promise<{ sampleRate: number; channels: number; description?: Uint8Array; chunks: Chunk[] }>((resolve, reject) => {
    let out: any = null;
    file.onError = (e: unknown) => reject(new Error(String(e)));
    file.onReady = (info: any) => {
      const track = info.audioTracks?.[0];
      if (!track) return;
      if (!String(track.codec).startsWith("mp4a.40")) { reject(new Error(`Soundtrack must be AAC (got ${track.codec}).`)); return; }
      const trak = file.getTrackById(track.id);
      const esds = trak?.mdia?.minf?.stbl?.stsd?.entries?.[0]?.esds;
      const asc = esds?.esd?.descs?.[0]?.descs?.[0]?.data;
      out = { sampleRate: track.audio.sample_rate, channels: track.audio.channel_count, description: asc ? new Uint8Array(asc) : undefined, chunks: [] as Chunk[] };
      file.setExtractionOptions(track.id, null, { nbSamples: Number.MAX_SAFE_INTEGER });
      file.start();
    };
    file.onSamples = (id: number, _u: unknown, samples: any[]) => {
      for (const s of samples) out.chunks.push({ data: new Uint8Array(s.data), key: true, ptsUs: Math.round((s.cts / s.timescale) * 1e6), durUs: Math.round((s.duration / s.timescale) * 1e6) });
      file.releaseUsedSamples(id, samples[samples.length - 1].number + 1);
    };
    try {
      file.appendBuffer(MP4BoxBuffer.fromArrayBuffer(buffer, 0), true);
      file.flush();
      if (!out) reject(new Error("The soundtrack has no audio track."));
      else if (!out.description) reject(new Error("The soundtrack's AAC configuration is missing."));
      else resolve(out);
    } catch (e) { reject(e instanceof Error ? e : new Error(String(e))); }
  });
}

async function loadBitmap(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Couldn't read an image (${response.status})`);
  return await createImageBitmap(await response.blob());
}

async function assemble(req: HatFilmWorkerRequest) {
  const { jobId, segments } = req;
  for (const cap of ["VideoEncoder", "VideoDecoder", "VideoFrame", "OffscreenCanvas", "createImageBitmap"]) {
    if (!g[cap]) throw new Error(`This browser can't assemble the film (missing ${cap}). Try desktop Chrome or Edge.`);
  }
  validateSegments(segments);

  const videoConfig = { codec: "avc1.640028", width: HF_WIDTH, height: HF_HEIGHT, framerate: HF_FPS, bitrate: 10_000_000, avc: { format: "avc" } };
  const support = await g.VideoEncoder.isConfigSupported(videoConfig);
  if (!support?.supported) throw new Error("This browser can't encode 1080×1920 H.264.");
  const logo = await loadBitmap(req.logoUrl);
  const canvas = new OffscreenCanvas(HF_WIDTH, HF_HEIGHT);
  const ctx = canvas.getContext("2d")!;

  const videoChunks: Chunk[] = [];
  let videoDescription: Uint8Array | undefined;
  let encoderError: Error | null = null;
  const encoder = new g.VideoEncoder({
    output: (chunk: any, meta: any) => {
      if (meta?.decoderConfig?.description && !videoDescription) videoDescription = new Uint8Array(meta.decoderConfig.description);
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      videoChunks.push({ data, key: chunk.type === "key", ptsUs: chunk.timestamp, durUs: chunk.duration ?? frameDurationUs(0) });
    },
    error: (e: unknown) => { encoderError = e instanceof Error ? e : new Error(String(e)); },
  });
  encoder.configure(videoConfig);

  let k = 0; // global output frame
  const paint = (source: CanvasImageSource, srcW: number, srcH: number, seg: HfSegment, f: number) => {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, HF_WIDTH, HF_HEIGHT);
    const r = coverRect(srcW, srcH);
    ctx.drawImage(source, r.x, r.y, r.w, r.h);
    const place = seg.logo_overlay ? logoPlacement(seg.kind, f, seg.frames, logo.width, logo.height) : null;
    if (place) {
      ctx.save();
      ctx.globalAlpha = place.opacity;
      ctx.drawImage(logo, place.x, place.y, place.w, place.h);
      ctx.restore();
      if (place.sweep !== null) {
        // Light sweep drawn as a soft band over the logo area (logo pixels stay intact underneath).
        const cx = place.x - place.w * 0.3 + place.sweep * place.w * 1.6;
        const grad = ctx.createLinearGradient(cx - 60, 0, cx + 60, 0);
        grad.addColorStop(0, "rgba(255,255,255,0)");
        grad.addColorStop(0.5, "rgba(255,255,255,0.18)");
        grad.addColorStop(1, "rgba(255,255,255,0)");
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = grad;
        ctx.fillRect(place.x, place.y, place.w, place.h);
        ctx.restore();
      }
    }
    const frame = new g.VideoFrame(canvas, { timestamp: frameTimestampUs(k), duration: frameDurationUs(k) });
    encoder.encode(frame, { keyFrame: k % HF_KEYFRAME_INTERVAL === 0 });
    frame.close();
    k += 1;
  };
  const backpressure = async () => { while (encoder.encodeQueueSize > 8) await new Promise((r) => setTimeout(r, 5)); };

  for (let i = 0; i < segments.length; i += 1) {
    const seg = segments[i];
    post({ type: "progress", jobId, progress: Math.round((i / segments.length) * 85), stage: `Assembling shot ${i + 1} of ${segments.length}` });
    if (k !== seg.start_frame) throw new Error(`Frame drift before ${seg.shot_id} (${k} ≠ ${seg.start_frame})`);

    if (seg.source_type === "image") {
      const still = await loadBitmap(seg.source_url);
      for (let f = 0; f < seg.frames; f += 1) { paint(still, still.width, still.height, seg, f); await backpressure(); }
      still.close();
      continue;
    }

    const video = await demuxVideo(seg.source_url);
    const baseUs = video.chunks.reduce((m, c) => Math.min(m, c.ptsUs), Number.POSITIVE_INFINITY);
    let nextOut = 0;
    let current: any = null;
    let lastEndUs = 0;
    let decodeError: Error | null = null;
    const emitUntil = (beforeUs: number) => {
      while (current && nextOut < seg.frames && localTargetUs(nextOut) < beforeUs) {
        paint(current, current.displayWidth, current.displayHeight, seg, nextOut);
        nextOut += 1;
      }
    };
    const decoder = new g.VideoDecoder({
      output: (frame: any) => {
        const rel = frame.timestamp - baseUs;
        if (nextOut >= seg.frames) { frame.close(); return; }
        emitUntil(rel);
        current?.close();
        current = frame;
        lastEndUs = rel + (frame.duration ?? 0);
      },
      error: (e: unknown) => { decodeError = e instanceof Error ? e : new Error(String(e)); },
    });
    decoder.configure({ codec: video.codec, codedWidth: video.width, codedHeight: video.height, description: video.description });
    const neededUs = localTargetUs(seg.frames) + 200_000;
    for (const c of video.chunks) {
      if (c.ptsUs - baseUs > neededUs && c.key) break;
      decoder.decode(new g.EncodedVideoChunk({ type: c.key ? "key" : "delta", timestamp: c.ptsUs, duration: c.durUs, data: c.data }));
      while (decoder.decodeQueueSize > 8) await new Promise((r) => setTimeout(r, 5));
      await backpressure();
    }
    await decoder.flush();
    decoder.close();
    if (decodeError) throw decodeError;
    if (nextOut < seg.frames) {
      if (!coversSlot(lastEndUs, seg.frames)) {
        current?.close();
        throw new Error(`${seg.shot_id} clip is too short for its ${seg.frames}-frame slot (${Math.round(lastEndUs / 1000)} ms).`);
      }
      emitUntil(Number.POSITIVE_INFINITY);
    }
    current?.close();
    if (nextOut !== seg.frames) throw new Error(`${seg.shot_id} produced ${nextOut} of ${seg.frames} frames`);
  }

  await encoder.flush();
  encoder.close();
  if (encoderError) throw encoderError;
  if (k !== HF_TOTAL_FRAMES || videoChunks.length !== HF_TOTAL_FRAMES) throw new Error(`Encoded ${videoChunks.length} frames; expected ${HF_TOTAL_FRAMES}.`);

  post({ type: "progress", jobId, progress: 90, stage: "Adding soundtrack" });
  const track = await demuxSoundtrack(req.soundtrackUrl);
  const filmUs = frameTimestampUs(HF_TOTAL_FRAMES);
  const audioChunks = track.chunks.filter((c) => c.ptsUs < filmUs); // trim to the picture, never longer
  const audioEndUs = audioChunks.length ? audioChunks[audioChunks.length - 1].ptsUs + audioChunks[audioChunks.length - 1].durUs : 0;
  if (audioEndUs < filmUs - 50_000) throw new Error(`The soundtrack is ${(audioEndUs / 1e6).toFixed(2)} s; the film needs 21.5 s.`);
  const audioDescription = track.description;
  const channels = track.channels;
  const sampleRate = track.sampleRate;

  post({ type: "progress", jobId, progress: 95, stage: "Finishing file" });
  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: "avc", width: HF_WIDTH, height: HF_HEIGHT, frameRate: HF_FPS },
    audio: { codec: "aac", numberOfChannels: channels, sampleRate },
    fastStart: "in-memory",
  } as any);
  const vmeta = { decoderConfig: { codec: "avc1.640028", description: videoDescription, codedWidth: HF_WIDTH, codedHeight: HF_HEIGHT } } as any;
  for (const c of videoChunks) muxer.addVideoChunkRaw(c.data, c.key ? "key" : "delta", c.ptsUs, Math.max(1, c.durUs), vmeta);
  const ameta = { decoderConfig: { codec: "mp4a.40.2", description: audioDescription, numberOfChannels: channels, sampleRate } } as any;
  for (const c of audioChunks) {
    muxer.addAudioChunkRaw(c.data, "key", c.ptsUs, Math.max(1, c.durUs), ameta);
  }
  muxer.finalize();
  const buffer = (muxer.target as ArrayBufferTarget).buffer;
  const probe: HfProbe = { width: HF_WIDTH, height: HF_HEIGHT, frames: videoChunks.length, has_audio: audioChunks.length > 0, duration_ms: Math.round((frameTimestampUs(HF_TOTAL_FRAMES)) / 1000) };
  post({ type: "done", jobId, buffer, probe }, [buffer]);
}

self.onmessage = (event: MessageEvent<HatFilmWorkerRequest>) => {
  const req = event.data;
  if (req?.type !== "assemble") return;
  assemble(req).catch((e) => post({ type: "error", jobId: req.jobId, message: e instanceof Error ? e.message : String(e) }));
};
