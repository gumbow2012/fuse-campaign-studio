// Synthetic, non-fragmented ISO-BMFF builder + reader for finishing tests.
const enc = (s) => [...s].map((c) => c.charCodeAt(0));
export function box(type, ...parts) {
  const body = concat(parts);
  const out = new Uint8Array(8 + body.length);
  new DataView(out.buffer).setUint32(0, out.length);
  out.set(enc(type), 4);
  out.set(body, 8);
  return out;
}
export function concat(parts) {
  const flat = parts.map((p) => (p instanceof Uint8Array ? p : new Uint8Array(p)));
  const out = new Uint8Array(flat.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of flat) { out.set(p, at); at += p.length; }
  return out;
}
function u32(...vals) {
  const out = new Uint8Array(vals.length * 4);
  const dv = new DataView(out.buffer);
  vals.forEach((v, i) => dv.setInt32(i * 4, v | 0) || dv.setUint32(i * 4, v >>> 0));
  return out;
}
const mvhd = (ts, dur, next) => box("mvhd", u32(0, 0, 0, ts, dur, 0x10000), new Uint8Array(76), u32(next));
const tkhd = (id, dur, w, h) => box("tkhd", u32(3, 0, 0, id, 0, dur, 0, 0, 0), new Uint8Array(36), u32(w * 65536, h * 65536));
const elst = (entries) => box("edts", box("elst", u32(0, entries.length), ...entries.map(([seg, mt, rate = 0x10000]) => u32(seg, mt, rate))));
const mdhd = (ts, dur) => box("mdhd", u32(0, 0, 0, ts, dur, 0));
const hdlr = (h) => box("hdlr", u32(0, 0), enc(h), new Uint8Array(12), [0]);
const stsd = (entry) => box("stsd", u32(0, 1), box(entry, new Uint8Array(8)));

/**
 * track: { id, handler, entry, ts, stts:[[count,delta]], sizes:[...], perChunk, edit:[[seg,mt]]|null, fill }
 * Returns trak builder that knows how to emit with given chunk offsets.
 */
function trak(t, movieDur, offsets) {
  const mediaDur = t.stts.reduce((n, [c, d]) => n + c * d, 0);
  const chunks = Math.ceil(t.sizes.length / t.perChunk);
  return box("trak",
    tkhd(t.id, t.edit ? t.edit.reduce((n, e) => n + e[0], 0) : movieDur, t.w ?? 0, t.h ?? 0),
    ...(t.edit ? [elst(t.edit)] : []),
    box("mdia", mdhd(t.ts, t.mdhdDur ?? mediaDur), hdlr(t.handler), box("minf", box("stbl",
      stsd(t.entry),
      box("stts", u32(0, t.stts.length), ...t.stts.map(([c, d]) => u32(c, d))),
      ...(t.ctts ? [box("ctts", u32(0, t.ctts.length), ...t.ctts.map(([c, o]) => u32(c, o)))] : []),
      t.stscRows ? box("stsc", u32(0, t.stscRows.length), ...t.stscRows.map((r) => u32(...r))) : box("stsc", ...(() => {
        const rem = t.sizes.length % t.perChunk;
        const full = Math.floor(t.sizes.length / t.perChunk);
        const rows = [];
        if (full) rows.push([1, t.perChunk, 1]);
        if (rem) rows.push([full + 1, rem, 1]);
        return [u32(0, rows.length), ...rows.map((r) => u32(...r))];
      })()),
      box("stsz", u32(0, 0, t.sizes.length, ...t.sizes)),
      box("stco", u32(0, chunks, ...offsets.map((o) => o + (t.offsetDelta ?? 0)))),
    ))));
}

/** Builds a file; sample bytes of track k are filled with value track.fill. */
export function buildMp4({ movieTs = 1000, movieDur, tracks, extraTop = [] }) {
  const ftyp = box("ftyp", enc("isom"), u32(512), enc("isomiso2mp41"));
  const layout = (offsets) => box("moov", mvhd(movieTs, movieDur, Math.max(...tracks.map((t) => t.id)) + 1),
    ...tracks.map((t, i) => trak(t, movieDur, offsets[i])));
  const zero = tracks.map((t) => new Array(Math.ceil(t.sizes.length / t.perChunk)).fill(0));
  const moovSize = layout(zero).length; // offsets use fixed-width stco, so size is stable
  let at = ftyp.length + moovSize + 8;
  const data = [];
  const offsets = tracks.map((t) => {
    const offs = [];
    for (let c = 0; c < t.sizes.length; c += t.perChunk) {
      offs.push(at);
      const size = t.sizes.slice(c, c + t.perChunk).reduce((n, s) => n + s, 0);
      const chunk = new Uint8Array(size);
      for (let i = 0; i < size; i++) chunk[i] = (t.fill + c + i) & 0xff;
      data.push(chunk);
      at += size;
    }
    return offs;
  });
  const mdat = box("mdat", ...data);
  return concat([ftyp, layout(offsets), mdat, ...extraTop]);
}

/* ------------------------------ reader ------------------------------ */
export function readBoxes(buf, start = 0, end = buf.length) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const out = [];
  while (start < end) {
    const size = dv.getUint32(start);
    const type = String.fromCharCode(...buf.subarray(start + 4, start + 8));
    out.push({ type, start, end: start + size, body: buf.subarray(start + 8, start + size) });
    start += size;
  }
  return out;
}
const CONT = new Set(["moov", "trak", "mdia", "minf", "stbl", "edts"]);
export function find(buf, path) {
  let list = readBoxes(buf);
  let hit;
  for (const t of path) {
    hit = list.find((b) => b.type === t);
    if (!hit) return null;
    if (CONT.has(t)) list = readBoxes(buf, hit.start + 8, hit.end);
  }
  return hit;
}
export function traks(buf) {
  const moov = find(buf, ["moov"]);
  return readBoxes(buf, moov.start + 8, moov.end).filter((b) => b.type === "trak");
}
export function inTrak(buf, trakBox, path) {
  let list = readBoxes(buf, trakBox.start + 8, trakBox.end);
  let hit;
  for (const t of path) {
    hit = list.find((b) => b.type === t);
    if (!hit) return null;
    if (CONT.has(t)) list = readBoxes(buf, hit.start + 8, hit.end);
  }
  return hit;
}
export const dv = (b) => new DataView(b.body.buffer, b.body.byteOffset, b.body.byteLength);
