/**
 * Main-thread audio mixdown for exports that need more than per-clip audio
 * (music track, fades, ducking, speed changes).
 *
 * WebAudio does the mixing offline, then the resulting PCM is handed to the export
 * worker as a single audio track — so preview and export hear the same thing.
 */
import { audioGainAt, timelineDurationMs, type RenderSpec } from "@/services/editorAdjustments";
import {
  musicClipDurationMs,
  musicGainAt,
  musicTimelineDurationMs,
  type MusicTrack,
} from "@/services/editorMusic";

export type MixSegment = {
  url: string;
  trim_start_ms: number;
  trim_end_ms: number;
  muted: boolean;
  volume: number;
  render: RenderSpec;
};

export type MixedAudio = {
  sampleRate: number;
  channels: number;
  /** Interleaved-free: one Float32Array per channel. */
  planes: Float32Array[];
  durationMs: number;
};

const SAMPLE_RATE = 48_000;
const CHANNELS = 2;
const ENVELOPE_STEP_MS = 40;

type OfflineCtor = typeof OfflineAudioContext;

function offlineContext(lengthSeconds: number): OfflineAudioContext | null {
  const Ctor = ((globalThis as unknown as { OfflineAudioContext?: OfflineCtor }).OfflineAudioContext ??
    (globalThis as unknown as { webkitOfflineAudioContext?: OfflineCtor }).webkitOfflineAudioContext) as
    | OfflineCtor
    | undefined;
  if (!Ctor) return null;
  const frames = Math.max(1, Math.ceil(lengthSeconds * SAMPLE_RATE));
  return new Ctor(CHANNELS, frames, SAMPLE_RATE);
}

async function decode(ctx: BaseAudioContext, url: string): Promise<AudioBuffer | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const bytes = await response.arrayBuffer();
    return await ctx.decodeAudioData(bytes);
  } catch {
    return null;
  }
}

/** Writes a stepped envelope so fades/ducking land the same way the preview plays them. */
function writeEnvelope(
  gain: GainNode,
  startMs: number,
  durationMs: number,
  valueAt: (elapsedMs: number) => number,
) {
  const steps = Math.max(1, Math.ceil(durationMs / ENVELOPE_STEP_MS));
  gain.gain.setValueAtTime(valueAt(0), startMs / 1000);
  for (let step = 1; step <= steps; step += 1) {
    const elapsed = Math.min(durationMs, step * ENVELOPE_STEP_MS);
    gain.gain.linearRampToValueAtTime(valueAt(elapsed), (startMs + elapsed) / 1000);
  }
}

/**
 * Returns the full mixed audio track, or null when nothing needs mixing
 * (in that case the worker keeps its faster per-clip audio path).
 */
export async function mixExportAudio(options: {
  segments: MixSegment[];
  music: { url: string; track: MusicTrack } | null;
  loop: boolean;
  removeAudio: boolean;
}): Promise<MixedAudio | null> {
  const { segments, music, loop, removeAudio } = options;
  if (removeAudio) return null;

  const durations = segments.map((segment) =>
    timelineDurationMs(Math.max(0, segment.trim_end_ms - segment.trim_start_ms), segment.render.motion),
  );
  const offsets: number[] = [];
  let cursor = 0;
  for (const duration of durations) {
    offsets.push(cursor);
    cursor += duration;
  }
  const singlePassMs = cursor;
  const totalMs = loop ? singlePassMs * 2 : singlePassMs;
  if (totalMs <= 0) return null;

  const ctx = offlineContext(totalMs / 1000 + 0.25);
  if (!ctx) return null;

  // Clip audio — every pass of the loop gets its own scheduled sources.
  const passes = loop ? [0, singlePassMs] : [0];
  const anyClipAudio = segments.some(
    (segment, index) => !segment.muted && !segment.render.audio.detached && durations[index] > 0,
  );

  if (anyClipAudio) {
    const buffers = await Promise.all(segments.map((segment) => decode(ctx, segment.url)));
    for (const passOffset of passes) {
      segments.forEach((segment, index) => {
        const buffer = buffers[index];
        if (!buffer || segment.muted || segment.render.audio.detached) return;
        const duration = durations[index];
        if (duration <= 0) return;
        const speed = Math.min(4, Math.max(0.25, segment.render.motion.speed || 1));
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.playbackRate.value = speed;

        const gain = ctx.createGain();
        const start = passOffset + offsets[index];
        const audibleMs = Math.min(duration, (segment.trim_end_ms - segment.trim_start_ms) / speed);
        writeEnvelope(gain, start, audibleMs, (elapsed) =>
          audioGainAt(segment.render, segment.volume, elapsed, audibleMs),
        );

        let node: AudioNode = source;
        if (segment.render.audio.noiseReduction > 0 || segment.render.audio.voiceEnhance) {
          const filter = ctx.createBiquadFilter();
          if (segment.render.audio.voiceEnhance) {
            filter.type = "peaking";
            filter.frequency.value = 2400;
            filter.gain.value = 4;
            filter.Q.value = 0.9;
          } else {
            filter.type = "lowpass";
            filter.frequency.value = 16_000 - (segment.render.audio.noiseReduction / 100) * 9_000;
          }
          source.connect(filter);
          node = filter;
        }
        node.connect(gain);
        gain.connect(ctx.destination);
        source.start(start / 1000, segment.trim_start_ms / 1000, audibleMs / 1000);
      });
    }
  }

  // Music bed.
  if (music && !music.track.muted) {
    const buffer = await decode(ctx, music.url);
    if (buffer) {
      const track = music.track;
      const clipMs = Math.min(musicClipDurationMs(track), Math.round(buffer.duration * 1000));
      const playMs = Math.min(
        musicTimelineDurationMs(track, totalMs),
        Math.max(0, totalMs - track.startMs),
      );
      if (clipMs > 0 && playMs > 0) {
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        if (track.mode === "loop") {
          source.loop = true;
          source.loopStart = track.clipStartMs / 1000;
          source.loopEnd = (track.clipStartMs + clipMs) / 1000;
        }

        const duckFactor = (timeMs: number) => {
          const index = durations.findIndex(
            (duration, i) => timeMs >= offsets[i] % singlePassMs && timeMs < (offsets[i] % singlePassMs) + duration,
          );
          const segment = index >= 0 ? segments[index] : null;
          const clipAudible = !!segment && !segment.muted && !segment.render.audio.detached;
          if (!clipAudible) return 1;
          const duck = Math.max(track.duck, segment.render.audio.musicDuck) / 100;
          return Math.max(0.05, 1 - duck);
        };

        const gain = ctx.createGain();
        writeEnvelope(gain, track.startMs, playMs, (elapsed) => {
          const absolute = track.startMs + elapsed;
          return musicGainAt(track, absolute, totalMs) * duckFactor(absolute % Math.max(1, singlePassMs));
        });
        source.connect(gain);
        gain.connect(ctx.destination);
        source.start(
          track.startMs / 1000,
          track.clipStartMs / 1000,
          track.mode === "loop" ? playMs / 1000 : Math.min(playMs, clipMs) / 1000,
        );
      }
    }
  }

  const rendered = await ctx.startRendering();
  const planes: Float32Array[] = [];
  for (let channel = 0; channel < rendered.numberOfChannels; channel += 1) {
    planes.push(new Float32Array(rendered.getChannelData(channel)));
  }
  // Silence-only mixdowns are dropped so the mp4 keeps a clean single-track layout.
  const peak = planes.reduce((max, plane) => {
    let local = 0;
    for (let index = 0; index < plane.length; index += 617) local = Math.max(local, Math.abs(plane[index]));
    return Math.max(max, local);
  }, 0);
  if (peak < 0.0005) return null;

  return {
    sampleRate: rendered.sampleRate,
    channels: planes.length,
    planes,
    durationMs: Math.round((rendered.length / rendered.sampleRate) * 1000),
  };
}
