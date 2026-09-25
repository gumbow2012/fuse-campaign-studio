/**
 * Deterministic, non-generative finishing for the Kling O3 source-video-edit
 * route. Rebuilds the provider MP4 so it carries:
 *   - the GENERATED video track, untouched sample data / composition offsets /
 *     edit media_time, with ONLY the final sample held long enough to reach the
 *     source video's media duration (never stretched, never re-encoded);
 *   - the ORIGINAL source audio track, copied verbatim (sample bytes, sample
 *     tables, stsd, edit list media_time) — the provider's re-encoded audio is
 *     dropped.
 * Strict: plain non-fragmented, unencrypted ISO-BMFF only. Anything else
 * throws Mp4FinishError; callers must then keep the provider file and record
 * the rejection instead of claiming exact finishing.
 *
 * Pure (no Deno / network) so it can be executed locally against real files.
 */

export const FINISH_MAX_INPUT_BYTES = 48_000_000;
/** generated + source + finished output must fit well below the 256 MB Edge limit. */
export const FINISH_MEMORY_BUDGET_BYTES = 128_000_000;
const UNIT_RATE = 0x10000;
/** Largest allowed video timeline difference, in source video frames. */
export const FINISH_MAX_FRAME_DIFFERENCE = 2;

export class Mp4FinishError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

const fail = (code: string, message: string): never => {
  throw new Mp4FinishError(code, message);
};

type Node = { type: string; payload?: Uint8Array; children?: Node[] };
const CONTAINERS = new Set(["moov", "trak", "mdia", "minf", "stbl", "edts"]);

function fourcc(buf: Uint8Array, at: number) {
  return String.fromCharCode(buf[at], buf[at + 1], buf[at + 2], buf[at + 3]);
}

function view(u: Uint8Array) {
  return new DataView(u.buffer, u.byteOffset, u.byteLength);
}

type RawBox = { type: string; start: number; contentStart: number; end: number };

function readBoxes(buf: Uint8Array, start: number, end: number): RawBox[] {
  const dv = view(buf);
  const out: RawBox[] = [];
  let at = start;
  let guard = 0;
  while (at < end) {
    if (++guard > 100_000) fail("invalid_box", "Too many boxes");
    if (end - at < 8) fail("invalid_box", `Truncated box header at ${at}`);
    let size = dv.getUint32(at);
    const type = fourcc(buf, at + 4);
    if (!/^[\x20-\x7e]{4}$/.test(type)) fail("invalid_box", `Invalid box type at ${at}`);
    let header = 8;
    if (size === 1) {
      if (end - at < 16) fail("invalid_box", `Truncated large box at ${at}`);
      const big = dv.getBigUint64(at + 8);
      if (big > BigInt(Number.MAX_SAFE_INTEGER)) fail("invalid_box", "Box too large");
      size = Number(big);
      header = 16;
    } else if (size === 0) {
      size = end - at;
    }
    if (size < header || at + size > end) fail("invalid_box", `Box ${type} at ${at} overruns its parent`);
    out.push({ type, start: at, contentStart: at + header, end: at + size });
    at += size;
  }
  return out;
}

function parseTree(buf: Uint8Array, box: RawBox, depth = 0): Node {
  if (depth > 12) fail("invalid_box", "Box nesting too deep");
  if (CONTAINERS.has(box.type)) {
    return {
      type: box.type,
      children: readBoxes(buf, box.contentStart, box.end).map((b) => parseTree(buf, b, depth + 1)),
    };
  }
  return { type: box.type, payload: buf.subarray(box.contentStart, box.end) };
}

function child(node: Node, type: string): Node | undefined {
  return node.children?.find((c) => c.type === type);
}
function need(node: Node | undefined, path: string[], what: string): Node {
  let cur = node;
  for (const t of path) cur = cur ? child(cur, t) : undefined;
  if (!cur) fail("invalid_box", `Missing ${what} (${path.join("/")})`);
  return cur!;
}
function payloadOf(node: Node, what: string) {
  if (!node.payload) fail("invalid_box", `${what} has no payload`);
  return node.payload!;
}
function checkLen(p: Uint8Array, n: number, what: string) {
  if (p.byteLength < n) fail("invalid_box", `${what} is truncated`);
}

/* ------------------------------ field access ------------------------------ */

function readTimescaleDuration(p: Uint8Array, what: string) {
  const dv = view(p);
  checkLen(p, 4, what);
  const version = p[0];
  if (version === 1) {
    checkLen(p, 32, what);
    return { version, timescale: dv.getUint32(20), duration: Number(dv.getBigUint64(24)), durAt: 24 };
  }
  checkLen(p, 20, what);
  return { version, timescale: dv.getUint32(12), duration: dv.getUint32(16), durAt: 16 };
}

function writeDuration(p: Uint8Array, version: number, at: number, value: number, what: string) {
  const dv = view(p);
  if (version === 1) dv.setBigUint64(at, BigInt(value));
  else {
    if (value > 0xffffffff) fail("unsupported", `${what} duration overflows 32 bits`);
    dv.setUint32(at, value);
  }
}

function tkhdInfo(p: Uint8Array) {
  const dv = view(p);
  const version = p[0];
  const idAt = version === 1 ? 20 : 12;
  const durAt = version === 1 ? 28 : 20;
  checkLen(p, version === 1 ? 92 : 80, "tkhd");
  return {
    version,
    idAt,
    durAt,
    trackId: dv.getUint32(idAt),
    width: dv.getUint32(p.byteLength - 8) / 65536,
    height: dv.getUint32(p.byteLength - 4) / 65536,
  };
}

type Edit = { segment: number; mediaTime: number; rate: number };
function readElst(p: Uint8Array): { version: number; entries: Edit[] } {
  const dv = view(p);
  checkLen(p, 8, "elst");
  const version = p[0];
  const count = dv.getUint32(4);
  const size = version === 1 ? 20 : 12;
  checkLen(p, 8 + count * size, "elst");
  const entries: Edit[] = [];
  for (let i = 0; i < count; i++) {
    const at = 8 + i * size;
    entries.push(version === 1
      ? { segment: Number(dv.getBigUint64(at)), mediaTime: Number(dv.getBigInt64(at + 8)), rate: dv.getInt32(at + 16) }
      : { segment: dv.getUint32(at), mediaTime: dv.getInt32(at + 4), rate: dv.getInt32(at + 8) });
  }
  return { version, entries };
}
function writeElst(version: number, entries: Edit[]) {
  const size = version === 1 ? 20 : 12;
  const p = new Uint8Array(8 + entries.length * size);
  const dv = view(p);
  p[0] = version;
  dv.setUint32(4, entries.length);
  entries.forEach((e, i) => {
    const at = 8 + i * size;
    if (version === 1) {
      dv.setBigUint64(at, BigInt(e.segment));
      dv.setBigInt64(at + 8, BigInt(e.mediaTime));
      dv.setInt32(at + 16, e.rate);
    } else {
      if (e.segment > 0xffffffff) fail("unsupported", "Edit segment overflows 32 bits");
      dv.setUint32(at, e.segment);
      dv.setInt32(at + 4, e.mediaTime);
      dv.setInt32(at + 8, e.rate);
    }
  });
  return p;
}

function readStts(p: Uint8Array) {
  const dv = view(p);
  checkLen(p, 8, "stts");
  const n = dv.getUint32(4);
  checkLen(p, 8 + n * 8, "stts");
  const entries: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) entries.push([dv.getUint32(8 + i * 8), dv.getUint32(12 + i * 8)]);
  return entries;
}
function writeStts(entries: Array<[number, number]>) {
  const p = new Uint8Array(8 + entries.length * 8);
  const dv = view(p);
  dv.setUint32(4, entries.length);
  entries.forEach(([c, d], i) => {
    dv.setUint32(8 + i * 8, c);
    dv.setUint32(12 + i * 8, d);
  });
  return p;
}

/** Byte ranges of every chunk of a track, validated against the file. */
function chunkRanges(stbl: Node, file: Uint8Array, what: string, mdats: Array<[number, number]>) {
  const stsz = view(payloadOf(need(stbl, ["stsz"], `${what} stsz`), "stsz"));
  checkLen(new Uint8Array(stsz.buffer, stsz.byteOffset, stsz.byteLength), 12, "stsz");
  const fixed = stsz.getUint32(4);
  const sampleCount = stsz.getUint32(8);
  if (!fixed && stsz.byteLength < 12 + sampleCount * 4) fail("invalid_box", "stsz is truncated");
  const sizeOf = (i: number) => fixed || stsz.getUint32(12 + i * 4);

  const stscP = payloadOf(need(stbl, ["stsc"], `${what} stsc`), "stsc");
  const stsc = view(stscP);
  checkLen(stscP, 8, "stsc");
  const stscN = stsc.getUint32(4);
  checkLen(stscP, 8 + stscN * 12, "stsc");

  const co = child(stbl, "stco") ?? child(stbl, "co64");
  if (!co) fail("invalid_box", `${what} has no chunk offsets`);
  const coP = payloadOf(co!, co!.type);
  const cov = view(coP);
  checkLen(coP, 8, co!.type);
  const chunkCount = cov.getUint32(4);
  const wide = co!.type === "co64";
  checkLen(coP, 8 + chunkCount * (wide ? 8 : 4), co!.type);

  if (sampleCount < 1) fail("invalid_table", `${what} has no samples`);
  const ranges: Array<{ start: number; size: number }> = [];
  let sample = 0;
  for (let e = 0; e < stscN; e++) {
    const first = stsc.getUint32(8 + e * 12);
    const per = stsc.getUint32(12 + e * 12);
    const next = e + 1 < stscN ? stsc.getUint32(8 + (e + 1) * 12) : chunkCount + 1;
    if (first < 1 || next <= first || next > chunkCount + 1) fail("invalid_box", `${what} stsc is inconsistent`);
    if (per < 1) fail("invalid_table", `${what} stsc has zero samples per chunk`);
    if (stsc.getUint32(16 + e * 12) < 1) fail("invalid_table", `${what} stsc has a zero sample description index`);
    for (let c = first; c < next; c++) {
      const start = wide ? Number(cov.getBigUint64(8 + (c - 1) * 8)) : cov.getUint32(8 + (c - 1) * 4);
      let size = 0;
      for (let s = 0; s < per; s++) {
        if (sample >= sampleCount) fail("invalid_box", `${what} chunk table exceeds its samples`);
        size += sizeOf(sample++);
      }
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(size) || start + size > file.byteLength) {
        fail("invalid_box", `${what} chunk points outside the file`);
      }
      if (!mdats.some(([a, b]) => start >= a && start + size <= b)) {
        fail("chunk_outside_mdat", `${what} chunk at ${start} is not inside an mdat payload`);
      }
      ranges.push({ start, size });
    }
  }
  if (ranges.length !== chunkCount || sample !== sampleCount) {
    fail("invalid_box", `${what} sample/chunk tables disagree`);
  }
  return ranges;
}

function handlerOf(trak: Node) {
  const p = payloadOf(need(trak, ["mdia", "hdlr"], "hdlr"), "hdlr");
  checkLen(p, 12, "hdlr");
  return fourcc(p, 8);
}

function sampleEntryType(trak: Node) {
  const p = payloadOf(need(trak, ["mdia", "minf", "stbl", "stsd"], "stsd"), "stsd");
  checkLen(p, 16, "stsd");
  return fourcc(p, 12);
}

/* ------------------------------- file level ------------------------------- */

/** stts/ctts must agree with stsz sample count and mdhd duration; no zero/overflow values. */
function validateSampleTables(trak: Node, what: string) {
  const stbl = need(trak, ["mdia", "minf", "stbl"], "stbl");
  const stts = readStts(payloadOf(need(stbl, ["stts"], "stts"), "stts"));
  const stszP = payloadOf(need(stbl, ["stsz"], "stsz"), "stsz");
  checkLen(stszP, 12, "stsz");
  const sampleCount = view(stszP).getUint32(8);
  let samples = 0;
  let duration = 0;
  for (const [count, delta] of stts) {
    if (count < 1 || delta < 1) fail("invalid_table", `${what} stts has a zero count or duration`);
    samples += count;
    duration += count * delta;
    if (!Number.isSafeInteger(duration)) fail("invalid_table", `${what} stts duration overflows`);
  }
  if (samples !== sampleCount) fail("invalid_table", `${what} stts covers ${samples} samples but stsz has ${sampleCount}`);
  const md = readTimescaleDuration(payloadOf(need(trak, ["mdia", "mdhd"], "mdhd"), "mdhd"), "mdhd");
  if (!md.timescale || !Number.isSafeInteger(md.duration)) fail("invalid_table", `${what} mdhd is invalid`);
  if (duration !== md.duration) fail("invalid_table", `${what} stts duration ${duration} ≠ mdhd ${md.duration}`);
  const ctts = child(stbl, "ctts");
  if (ctts) {
    const p = payloadOf(ctts, "ctts");
    checkLen(p, 8, "ctts");
    const n = view(p).getUint32(4);
    checkLen(p, 8 + n * 8, "ctts");
    let covered = 0;
    for (let i = 0; i < n; i++) {
      const c = view(p).getUint32(8 + i * 8);
      if (c < 1) fail("invalid_table", `${what} ctts has a zero count`);
      covered += c;
    }
    if (covered !== sampleCount) fail("invalid_table", `${what} ctts covers ${covered} samples but stsz has ${sampleCount}`);
  }
}

/** Only unit-rate edits; video: exactly one media edit; audio: leading empty edits then one media edit. */
function validateEdits(elst: { entries: Edit[] } | null, what: string, kind: "video" | "audio") {
  if (!elst) return;
  const e = elst.entries;
  if (!e.length) fail("unsupported_edit", `${what} has an empty edit list`);
  for (const x of e) {
    if (x.rate !== UNIT_RATE) fail("unsupported_edit", `${what} edit list uses a non-unit rate`);
    if (!Number.isSafeInteger(x.segment) || x.segment < 1) fail("unsupported_edit", `${what} edit segment is invalid`);
    if (x.mediaTime < -1) fail("unsupported_edit", `${what} edit media_time is invalid`);
  }
  if (kind === "video") {
    if (e.length !== 1 || e[0].mediaTime < 0) fail("unsupported_edit", `${what} edit list must be one media edit`);
    return;
  }
  const media = e.filter((x) => x.mediaTime >= 0);
  if (media.length !== 1 || e[e.length - 1] !== media[0]) fail("unsupported_edit", `${what} edit list must end in exactly one media edit`);
}

type ParsedFile = { bytes: Uint8Array; ftyp: Uint8Array; moov: Node; traks: Node[]; mdats: Array<[number, number]> };

function parseFile(bytes: Uint8Array, label: string): ParsedFile {
  if (bytes.byteLength > FINISH_MAX_INPUT_BYTES) fail("too_large", `${label} exceeds ${FINISH_MAX_INPUT_BYTES} bytes`);
  const top = readBoxes(bytes, 0, bytes.byteLength);
  const types = top.map((b) => b.type);
  if (types[0] !== "ftyp") fail("invalid_box", `${label} does not start with ftyp`);
  if (types.includes("moof") || types.includes("sidx") || types.includes("mfra")) {
    fail("fragmented", `${label} is a fragmented MP4`);
  }
  const moovs = top.filter((b) => b.type === "moov");
  if (moovs.length !== 1) fail("invalid_box", `${label} must contain exactly one moov`);
  if (!types.includes("mdat")) fail("invalid_box", `${label} has no mdat`);
  const moov = parseTree(bytes, moovs[0]);
  if (child(moov, "mvex")) fail("fragmented", `${label} declares movie fragments`);
  const traks = moov.children!.filter((c) => c.type === "trak");
  for (const t of traks) {
    const entry = sampleEntryType(t);
    if (entry === "encv" || entry === "enca" || child(need(t, ["mdia", "minf", "stbl"], "stbl"), "saiz")) {
      fail("encrypted", `${label} contains encrypted media`);
    }
  }
  const ftypBox = top[0];
  const mdats = top.filter((b) => b.type === "mdat").map((b) => [b.contentStart, b.end] as [number, number]);
  for (const t of traks) validateSampleTables(t, `${label} ${handlerOf(t)}`);
  return { bytes, ftyp: bytes.subarray(ftypBox.start, ftypBox.end), moov, traks, mdats };
}

function mvhd(moov: Node) {
  const p = payloadOf(need(moov, ["mvhd"], "mvhd"), "mvhd");
  return { p, ...readTimescaleDuration(p, "mvhd") };
}

function trackTimes(trak: Node) {
  const mdhdP = payloadOf(need(trak, ["mdia", "mdhd"], "mdhd"), "mdhd");
  const md = readTimescaleDuration(mdhdP, "mdhd");
  const elstNode = trak.children?.find((c) => c.type === "edts")?.children?.find((c) => c.type === "elst");
  const elst = elstNode ? readElst(payloadOf(elstNode, "elst")) : null;
  return { mdhdP, md, elstNode, elst };
}

function dominantDelta(stts: Array<[number, number]>) {
  let best = stts[0];
  for (const e of stts) if (e[0] > best[0]) best = e;
  return best?.[1] ?? 0;
}

function serialize(node: Node): Uint8Array {
  const body = node.children ? concat(node.children.map(serialize)) : node.payload!;
  const out = new Uint8Array(8 + body.byteLength);
  if (out.byteLength > 0xffffffff) fail("unsupported", "Box too large to serialize");
  view(out).setUint32(0, out.byteLength);
  for (let i = 0; i < 4; i++) out[4 + i] = node.type.charCodeAt(i);
  out.set(body, 8);
  return out;
}
function concat(parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.byteLength, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.byteLength;
  }
  return out;
}

/** Deep-copies only the structural nodes on the edit path; payloads stay views. */
function cloneTree(node: Node): Node {
  return node.children ? { type: node.type, children: node.children.map(cloneTree) } : { ...node };
}
function replaceChild(parent: Node, type: string, next: Node) {
  const i = parent.children!.findIndex((c) => c.type === type || (type === "stco" && c.type === "co64"));
  if (i < 0) fail("invalid_box", `Missing ${type}`);
  parent.children![i] = next;
}

/* --------------------------------- public --------------------------------- */

export type FinishExpectation = { duration?: number | null; width?: number | null; height?: number | null };

export type FinishReport = {
  status: "finished" | "skipped";
  reason?: string;
  method: "mp4_remux_source_audio_v1";
  movieTimescale: number;
  movieDurationSeconds: number;
  videoTrackId: number;
  audioTrackId: number | null;
  sourceAudioTrackIdOriginal: number | null;
  videoHoldTicks: number;
  videoHoldSeconds: number;
  videoTimescale: number;
  generatedVideoSeconds: number;
  finishedVideoSeconds: number;
  sourceVideoSeconds: number;
  sourceAudioSeconds: number | null;
  droppedGeneratedAudioTracks: number;
};

/**
 * @throws Mp4FinishError when the media is unsupported or the timelines
 * differ by more than FINISH_MAX_FRAME_DIFFERENCE source frames.
 */
export function finishSourceEditMp4(args: {
  generated: Uint8Array;
  source: Uint8Array;
  expected?: FinishExpectation | null;
}): { bytes: Uint8Array; report: FinishReport } {
  const gen = parseFile(args.generated, "Generated video");
  const src = parseFile(args.source, "Source video");

  const genVideo = gen.traks.filter((t) => handlerOf(t) === "vide");
  const srcVideo = src.traks.filter((t) => handlerOf(t) === "vide");
  const srcAudio = src.traks.filter((t) => handlerOf(t) === "soun");
  if (genVideo.length !== 1) fail("unsupported", "Generated file must have exactly one video track");
  if (srcVideo.length !== 1) fail("unsupported", "Source file must have exactly one video track");
  if (srcAudio.length > 1) fail("unsupported", "Source file has more than one audio track");

  const gv = genVideo[0];
  const sv = srcVideo[0];
  const gTimes = trackTimes(gv);
  const sTimes = trackTimes(sv);
  validateEdits(gTimes.elst, "Generated video", "video");
  validateEdits(sTimes.elst, "Source video", "video");
  const srcMv = mvhd(src.moov);
  const genMv = mvhd(gen.moov);
  if (!gTimes.md.timescale || !sTimes.md.timescale || !srcMv.timescale || !genMv.timescale) {
    fail("invalid_box", "Zero timescale");
  }

  // Source metadata must match what the template declared.
  const sInfo = tkhdInfo(payloadOf(need(sv, ["tkhd"], "tkhd"), "tkhd"));
  const sStts = readStts(payloadOf(need(sv, ["mdia", "minf", "stbl", "stts"], "stts"), "stts"));
  const srcFrame = dominantDelta(sStts);
  if (!srcFrame) fail("invalid_box", "Source video has no samples");
  const srcFrameSec = srcFrame / sTimes.md.timescale;
  const exp = args.expected ?? {};
  if (exp.width && Math.round(sInfo.width) !== Math.round(exp.width)) fail("metadata_mismatch", `Source width ${sInfo.width} ≠ declared ${exp.width}`);
  if (exp.height && Math.round(sInfo.height) !== Math.round(exp.height)) fail("metadata_mismatch", `Source height ${sInfo.height} ≠ declared ${exp.height}`);
  const srcMovieSec = srcMv.duration / srcMv.timescale;
  if (exp.duration && Math.abs(srcMovieSec - exp.duration) > srcFrameSec) {
    fail("metadata_mismatch", `Source duration ${srcMovieSec}s ≠ declared ${exp.duration}s`);
  }

  // Video hold, in generated video media ticks.
  const gStts = readStts(payloadOf(need(gv, ["mdia", "minf", "stbl", "stts"], "stts"), "stts"));
  if (!gStts.length) fail("invalid_box", "Generated video has no samples");
  const gTs = gTimes.md.timescale;
  const srcMediaInGen = Math.round((sTimes.md.duration * gTs) / sTimes.md.timescale);
  const hold = srcMediaInGen - gTimes.md.duration;
  const maxDiff = Math.round((FINISH_MAX_FRAME_DIFFERENCE * srcFrame * gTs) / sTimes.md.timescale);
  if (Math.abs(hold) > maxDiff) {
    fail("timeline_difference", `Video timelines differ by ${(hold / gTs).toFixed(4)}s (> ${FINISH_MAX_FRAME_DIFFERENCE} source frames)`);
  }
  if (hold < 0) fail("timeline_difference", "Generated video is longer than the source; exact finishing would require trimming");

  if (!srcAudio.length) {
    return {
      bytes: args.generated,
      report: {
        status: "skipped", reason: "source_has_no_audio", method: "mp4_remux_source_audio_v1",
        movieTimescale: genMv.timescale, movieDurationSeconds: genMv.duration / genMv.timescale,
        videoTrackId: tkhdInfo(payloadOf(need(gv, ["tkhd"], "tkhd"), "tkhd")).trackId,
        audioTrackId: null, sourceAudioTrackIdOriginal: null, videoHoldTicks: 0, videoHoldSeconds: 0,
        videoTimescale: gTs, generatedVideoSeconds: gTimes.md.duration / gTs,
        finishedVideoSeconds: gTimes.md.duration / gTs, sourceVideoSeconds: sTimes.md.duration / sTimes.md.timescale,
        sourceAudioSeconds: null, droppedGeneratedAudioTracks: 0,
      },
    };
  }
  const sa = srcAudio[0];
  if (child(sa, "tref")) fail("unsupported", "Source audio track has track references");
  const aTimes = trackTimes(sa);
  validateEdits(aTimes.elst, "Source audio", "audio");
  const movieTs = genMv.timescale;
  const toMovie = (v: number, fromTs: number) => Math.round((v * movieTs) / fromTs);

  // ---- video track (generated), final-sample hold only ----
  const video = cloneTree(gv);
  const vStbl = need(video, ["mdia", "minf", "stbl"], "stbl");
  if (hold > 0) {
    const entries = gStts.map((e) => [e[0], e[1]] as [number, number]);
    const last = entries[entries.length - 1];
    if (last[0] > 1) {
      last[0] -= 1;
      entries.push([1, last[1] + hold]);
    } else last[1] += hold;
    replaceChild(vStbl, "stts", { type: "stts", payload: writeStts(entries) });
  }
  const vMdhd = new Uint8Array(gTimes.mdhdP);
  writeDuration(vMdhd, gTimes.md.version, gTimes.md.durAt, gTimes.md.duration + hold, "mdhd");
  need(video, ["mdia"], "mdia").children!.splice(
    need(video, ["mdia"], "mdia").children!.findIndex((c) => c.type === "mdhd"), 1, { type: "mdhd", payload: vMdhd });
  const holdMovie = toMovie(hold, gTs);
  let videoTrackDur: number;
  if (gTimes.elst && gTimes.elst.entries.length) {
    const entries = gTimes.elst.entries.map((e) => ({ ...e }));
    const lastNormal = [...entries].reverse().find((e) => e.mediaTime >= 0);
    if (!lastNormal || entries[entries.length - 1] !== lastNormal) fail("unsupported", "Generated video edit list does not end with a media edit");
    lastNormal!.segment += holdMovie;
    const edts = need(video, ["edts"], "edts");
    edts.children = edts.children!.map((c) => c.type === "elst" ? { type: "elst", payload: writeElst(gTimes.elst!.version, entries) } : c);
    videoTrackDur = entries.reduce((n, e) => n + e.segment, 0);
  } else {
    videoTrackDur = toMovie(gTimes.md.duration + hold, gTs);
  }
  const vTkhdP = new Uint8Array(payloadOf(need(video, ["tkhd"], "tkhd"), "tkhd"));
  const vInfo = tkhdInfo(vTkhdP);
  writeDuration(vTkhdP, vInfo.version, vInfo.durAt, videoTrackDur, "tkhd");
  video.children = video.children!.map((c) => c.type === "tkhd" ? { type: "tkhd", payload: vTkhdP } : c);

  // ---- audio track (source), verbatim except IDs/movie-timescale fields ----
  const audio = cloneTree(sa);
  const aTkhdP = new Uint8Array(payloadOf(need(audio, ["tkhd"], "tkhd"), "tkhd"));
  const aInfo = tkhdInfo(aTkhdP);
  const audioId = aInfo.trackId === vInfo.trackId || aInfo.trackId === 0 ? vInfo.trackId + 1 : aInfo.trackId;
  view(aTkhdP).setUint32(aInfo.idAt, audioId);
  let audioTrackDur: number;
  if (aTimes.elst && aTimes.elst.entries.length) {
    const entries = aTimes.elst.entries.map((e) => ({ ...e, segment: toMovie(e.segment, srcMv.timescale) }));
    const edts = need(audio, ["edts"], "edts");
    edts.children = edts.children!.map((c) => c.type === "elst" ? { type: "elst", payload: writeElst(aTimes.elst!.version, entries) } : c);
    audioTrackDur = entries.reduce((n, e) => n + e.segment, 0);
  } else {
    audioTrackDur = toMovie(aTimes.md.duration, aTimes.md.timescale);
  }
  writeDuration(aTkhdP, aInfo.version, aInfo.durAt, audioTrackDur, "tkhd");
  audio.children = audio.children!.map((c) => c.type === "tkhd" ? { type: "tkhd", payload: aTkhdP } : c);

  // ---- chunk relocation ----
  const vChunks = chunkRanges(vStbl, gen.bytes, "Generated video", gen.mdats);
  const aStbl = need(audio, ["mdia", "minf", "stbl"], "stbl");
  const aChunks = chunkRanges(aStbl, src.bytes, "Source audio", src.mdats);
  const vBytes = vChunks.reduce((n, c) => n + c.size, 0);
  const aBytes = aChunks.reduce((n, c) => n + c.size, 0);
  const stco = (n: number) => ({ type: "stco", payload: new Uint8Array(8 + n * 4) });
  const vStco = stco(vChunks.length);
  const aStco = stco(aChunks.length);
  replaceChild(vStbl, "stco", vStco);
  replaceChild(aStbl, "stco", aStco);

  // ---- movie header ----
  const mvP = new Uint8Array(genMv.p);
  const movieDur = Math.max(videoTrackDur, audioTrackDur);
  writeDuration(mvP, genMv.version, genMv.durAt, movieDur, "mvhd");
  checkLen(mvP, 4, "mvhd");
  view(mvP).setUint32(mvP.byteLength - 4, Math.max(vInfo.trackId, audioId) + 1);

  const others = gen.moov.children!.filter((c) => c.type !== "trak" && c.type !== "mvhd");
  const moov: Node = { type: "moov", children: [{ type: "mvhd", payload: mvP }, video, audio, ...others] };

  const mdatPayload = vBytes + aBytes;
  const peak = gen.bytes.byteLength + src.bytes.byteLength + mdatPayload + 1_000_000;
  if (peak > FINISH_MEMORY_BUDGET_BYTES) {
    fail("too_large", `Finishing would need about ${peak} bytes, over the ${FINISH_MEMORY_BUDGET_BYTES} byte budget`);
  }
  const mdatHeader = mdatPayload + 8 > 0xffffffff ? 16 : 8;
  const moovSize = serialize(moov).byteLength; // sizes are final; offsets filled next
  const dataStart = gen.ftyp.byteLength + moovSize + mdatHeader;
  if (dataStart + mdatPayload > 0xffffffff) fail("unsupported", "Finished file too large for 32-bit offsets");

  let at = dataStart;
  const vDv = view(vStco.payload);
  vDv.setUint32(4, vChunks.length);
  vChunks.forEach((c, i) => { vDv.setUint32(8 + i * 4, at); at += c.size; });
  const aDv = view(aStco.payload);
  aDv.setUint32(4, aChunks.length);
  aChunks.forEach((c, i) => { aDv.setUint32(8 + i * 4, at); at += c.size; });

  const moovBytes = serialize(moov);
  if (moovBytes.byteLength !== moovSize) fail("internal", "moov size changed while writing offsets");
  const out = new Uint8Array(dataStart + mdatPayload);
  out.set(gen.ftyp, 0);
  out.set(moovBytes, gen.ftyp.byteLength);
  const mh = view(out);
  const mdatAt = gen.ftyp.byteLength + moovSize;
  if (mdatHeader === 8) mh.setUint32(mdatAt, mdatPayload + 8);
  else { mh.setUint32(mdatAt, 1); mh.setBigUint64(mdatAt + 8, BigInt(mdatPayload + 16)); }
  out.set([0x6d, 0x64, 0x61, 0x74], mdatAt + 4);
  let w = dataStart;
  for (const c of vChunks) { out.set(gen.bytes.subarray(c.start, c.start + c.size), w); w += c.size; }
  for (const c of aChunks) { out.set(src.bytes.subarray(c.start, c.start + c.size), w); w += c.size; }

  return {
    bytes: out,
    report: {
      status: "finished",
      method: "mp4_remux_source_audio_v1",
      movieTimescale: movieTs,
      movieDurationSeconds: movieDur / movieTs,
      videoTrackId: vInfo.trackId,
      audioTrackId: audioId,
      sourceAudioTrackIdOriginal: aInfo.trackId,
      videoHoldTicks: hold,
      videoHoldSeconds: hold / gTs,
      videoTimescale: gTs,
      generatedVideoSeconds: gTimes.md.duration / gTs,
      finishedVideoSeconds: (gTimes.md.duration + hold) / gTs,
      sourceVideoSeconds: sTimes.md.duration / sTimes.md.timescale,
      sourceAudioSeconds: aTimes.md.duration / aTimes.md.timescale,
      droppedGeneratedAudioTracks: gen.traks.filter((t) => handlerOf(t) === "soun").length,
    },
  };
}

/** Gate: ONLY Kling O3 source-video edit with keep_audio on. */
export function shouldFinishSourceEdit(inputPayload: Record<string, unknown> | null | undefined) {
  const p = inputPayload ?? {};
  return p.source_video_edit === true && p.keep_audio === true && p.video_model === "kling-o3-pro-video-edit";
}
